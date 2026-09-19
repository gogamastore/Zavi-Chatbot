// ---------------------------------------------------------------------------
// Penanganan AI (Tahap 3 — Integrasi AI).
//
// Menjawab pertanyaan bebas yang tidak tertangani aturan template, berdasarkan
// profil bisnis + dokumen pengetahuan milik tenant.
//
// Provider-agnostic: Claude (Anthropic) dan Gemini (Google) berada di balik
// satu antarmuka yang sama. Penyedia dipilih dari env — mana pun yang
// kredensialnya tersedia. Sisa kode Zavi tidak perlu tahu yang mana dipakai.
// ---------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";
import { env, resolveAIProvider } from "@/lib/config";
import { catatBerhasil, catatGagal } from "./ai-health";
import type { AIConfig, Business, ChatMessage, KnowledgeDoc } from "@/lib/types";

/** Penanda yang dipancarkan model saat tidak sanggup menjawab dengan aman. */
const ESCALATE_MARKER = "[[ESCALATE]]";

export interface AIResult {
  reply: string;
  needsHuman: boolean;
  /** True kalau panggilan AI sungguhan terjadi (dihitung ke kuota). */
  consumed: boolean;
}

/** Bentuk netral-provider dari satu giliran percakapan. */
interface Turn {
  role: "user" | "assistant";
  text: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  business: Business,
  knowledge: KnowledgeDoc[],
  cfg?: AIConfig | null,
): string {
  const catalog = business.catalog
    .map((i) => `- ${i.name}: ${i.price}${i.description ? ` (${i.description})` : ""}`)
    .join("\n");

  const knowledgeBlock = knowledge.length
    ? knowledge
        .map((k) => `### ${k.title}${k.url ? ` (${k.url})` : ""}\n${k.content}`)
        .join("\n\n")
    : "(Belum ada dokumen tambahan.)";

  const gaya =
    cfg?.tone?.trim() ||
    'Ramah, sopan, dan singkat (maksimal 2-4 kalimat). Panggil pelanggan dengan "Kak".';

  const tambahan = cfg?.customInstructions?.trim()
    ? `\nINSTRUKSI KHUSUS DARI PEMILIK BISNIS:\n${cfg.customInstructions.trim()}\n`
    : "";

  const aturanEskalasi =
    cfg?.escalateWhenUnsure === false
      ? `2. Kalau informasinya tidak ada di atas, katakan terus terang bahwa kamu belum punya datanya dan sarankan menghubungi admin.`
      : `2. Jika ditanya sesuatu yang tidak ada di informasi di atas (harga produk yang tidak terdaftar, ketersediaan stok real-time, komplain, refund, atau hal sensitif), JANGAN menebak. Balas dengan menyertakan penanda "${ESCALATE_MARKER}" di akhir, lalu arahkan pelanggan menunggu admin.`;

  return `Kamu adalah asisten customer service WhatsApp untuk "${business.name}", sebuah ${business.type}.

GAYA BICARA:
- ${gaya}
- Gunakan Bahasa Indonesia yang santai tapi profesional. Boleh pakai emoji secukupnya.
- Jangan bertele-tele. Jawab langsung ke pertanyaannya.
${tambahan}
INFORMASI BISNIS:
- Nama: ${business.name}
- Jenis: ${business.type}
- Jam buka: ${business.hours}
- Alamat: ${business.address ?? "-"}
- Kontak: ${business.phone ?? "-"}
- Cara order: ${business.orderInstructions}
- Pembayaran: ${business.paymentInfo ?? "-"}
- Info lain: ${business.extraInfo ?? "-"}

MENU / KATALOG:
${catalog || "(Belum ada katalog.)"}

DOKUMEN PENGETAHUAN TAMBAHAN:
${knowledgeBlock}

ATURAN PENTING:
1. HANYA gunakan informasi di atas. JANGAN mengarang harga, stok, promo, atau janji yang tidak tercantum.
${aturanEskalasi}
3. Jika pelanggan ingin memesan, bantu konfirmasi pesanannya (menu, jumlah) dan minta nama, alamat, serta jam antar sesuai cara order.
4. Jangan pernah menampilkan penanda "${ESCALATE_MARKER}" jika kamu bisa menjawab dengan yakin dari informasi di atas.`;
}

function toTurns(history: ChatMessage[], latest: string): Turn[] {
  const turns: Turn[] = history.map((c) => ({
    role: c.direction === "in" ? ("user" as const) : ("assistant" as const),
    text: c.text,
  }));
  turns.push({ role: "user", text: latest });
  // Giliran pertama harus dari user.
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

// ---------------------------------------------------------------------------
// Adapter: Anthropic (Claude)
// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

async function callAnthropic(system: string, turns: Turn[], model: string): Promise<string> {
  anthropicClient ??= new Anthropic({ apiKey: env.anthropicApiKey });
  const response = await anthropicClient.messages.create({
    model,
    max_tokens: 600,
    // Chat CS sederhana: utamakan cepat + murah.
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system,
    messages: turns.map((t) => ({ role: t.role, content: t.text })),
  });
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Adapter: Google Gemini
// ---------------------------------------------------------------------------

async function callGemini(system: string, turns: Turn[], model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": env.geminiApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      // Gemini memakai "model" untuk peran asisten.
      contents: turns.map((t) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [{ text: t.text }],
      })),
      generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
    }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new Error(`Gemini ${res.status} ${e.status ?? ""}: ${e.message ?? "gagal"}`);
  }
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

// ---------------------------------------------------------------------------
// Pintu masuk
// ---------------------------------------------------------------------------

/**
 * Minta AI menjawab. `history` adalah percakapan sebelumnya dengan pelanggan
 * ini (kronologis, tidak termasuk pesan terakhir yang dikirim terpisah).
 */
export async function askAI(
  latest: string,
  history: ChatMessage[],
  business: Business,
  knowledge: KnowledgeDoc[],
  aiConfig?: AIConfig | null,
): Promise<AIResult> {
  const provider = resolveAIProvider();

  if (provider === "none") {
    return {
      reply:
        "Maaf, fitur AI belum aktif. Untuk pertanyaan ini, admin kami akan segera membantu ya 🙏",
      needsHuman: true,
      consumed: false,
    };
  }

  const system = buildSystemPrompt(business, knowledge, aiConfig);
  const turns = toTurns(history, latest);

  try {
    const model =
      aiConfig?.model?.trim() ||
      (provider === "anthropic" ? env.anthropicModel : env.geminiModel);

    const raw =
      provider === "anthropic"
        ? await callAnthropic(system, turns, model)
        : await callGemini(system, turns, model);

    const text = raw.trim();
    const needsHuman = text.includes(ESCALATE_MARKER);
    const reply =
      text.replace(ESCALATE_MARKER, "").trim() ||
      "Baik Kak, mohon tunggu sebentar ya, admin kami akan segera membantu 🙏";

    // Bukti terkuat bahwa AI benar-benar berfungsi: panggilan pelanggan sungguhan.
    catatBerhasil();
    return { reply, needsHuman, consumed: true };
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    console.error(`[ai:${provider}] gagal:`, pesan);
    // Dicatat supaya dashboard menampilkan alasannya, bukan lampu hijau palsu.
    catatGagal(pesan);
    return {
      reply:
        "Maaf Kak, sistem kami sedang sibuk. Admin akan segera membantu pertanyaan Kakak 🙏",
      needsHuman: true,
      // Panggilan gagal tidak boleh memotong kuota pelanggan.
      consumed: false,
    };
  }
}
