// ---------------------------------------------------------------------------
// GET/PUT /api/ai-config → pengaturan AI milik tenant (halaman Pengaturan AI).
// ---------------------------------------------------------------------------
import { kesehatanAI, saranPerbaikan } from "@/lib/bot/ai-health";
import type { AIAction, AIConfig, AIProvider } from "@/lib/types";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS: AIProvider[] = ["none", "anthropic", "gemini"];

function bawaan(tenantId: string): AIConfig {
  return {
    tenantId,
    enabled: true,
    provider: "none",
    tone: 'Ramah, sopan, singkat. Panggil pelanggan dengan "Kak".',
    escalateWhenUnsure: true,
    historyLimit: 20,
    updatedAt: Date.now(),
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext(request);
    const [cfg, ai] = await Promise.all([
      ctx.store.getAIConfig().then((c) => c ?? bawaan(ctx.tenant.id)),
      kesehatanAI(),
    ]);
    return Response.json({
      aiConfig: cfg,
      // Kondisi SEBENARNYA penyedia di server, bukan sekadar "key terisi".
      server: { ...ai, saran: saranPerbaikan(ai) },
      quota: {
        used: ctx.entitlement.aiRepliesUsed,
        limit: ctx.entitlement.aiRepliesLimit,
        credits: ctx.entitlement.aiCreditsBalance,
        remaining: ctx.entitlement.aiRepliesRemaining,
        exceeded: ctx.entitlement.aiQuotaExceeded,
      },
    });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}

/** Batas tindakan per tenant — menahan prompt (dan biayanya) tetap masuk akal. */
export const MAKS_TINDAKAN = 30;
const MAKS_PANJANG_TINDAKAN = 300;

/**
 * Bersihkan daftar tindakan dari klien.
 *
 * Isi tindakan masuk langsung ke system prompt AI, jadi panjangnya dibatasi
 * dan barisnya dipangkas: satu tenant tidak boleh bisa membengkakkan biaya
 * token (yang ditanggung platform) hanya dengan menempel novel ke satu kolom.
 */
function bersihkanTindakan(masuk: unknown): AIAction[] {
  if (!Array.isArray(masuk)) return [];
  const hasil: AIAction[] = [];
  for (const m of masuk.slice(0, MAKS_TINDAKAN)) {
    if (!m || typeof m !== "object") continue;
    const a = m as Partial<AIAction>;
    const when = String(a.when ?? "").trim().replace(/\s+/g, " ").slice(0, MAKS_PANJANG_TINDAKAN);
    const then = String(a.then ?? "").trim().replace(/\s+/g, " ").slice(0, MAKS_PANJANG_TINDAKAN);
    if (!when || !then) continue;
    hasil.push({
      // id dari klien dipakai apa adanya kalau bentuknya wajar, supaya urutan
      // dan status aktif tidak berubah tiap kali disimpan.
      id: typeof a.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(a.id) ? a.id : newId(),
      when,
      then,
      enabled: a.enabled !== false,
      createdAt: typeof a.createdAt === "number" ? a.createdAt : Date.now(),
    });
  }
  return hasil;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
}

export async function PUT(request: Request) {
  try {
    let body: Partial<AIConfig>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const ctx = await getTenantContext(request);
    const provider = PROVIDERS.includes(body.provider as AIProvider)
      ? (body.provider as AIProvider)
      : "none";

    // Batas riwayat dijaga: terlalu besar = biaya token membengkak.
    const historyLimit = Math.min(Math.max(Number(body.historyLimit) || 20, 2), 100);

    const cfg: AIConfig = {
      tenantId: ctx.tenant.id,
      enabled: body.enabled !== false,
      provider,
      model: body.model?.trim() || undefined,
      tone: body.tone?.trim() || undefined,
      customInstructions: body.customInstructions?.trim() || undefined,
      actions: bersihkanTindakan(body.actions),
      productQuestionsToAI: body.productQuestionsToAI !== false,
      escalateWhenUnsure: body.escalateWhenUnsure !== false,
      historyLimit,
      updatedAt: Date.now(),
    };

    const saved = await ctx.store.saveAIConfig(cfg);
    return Response.json({ aiConfig: saved });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}
