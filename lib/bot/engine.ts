// ---------------------------------------------------------------------------
// Mesin bot — jantung Zavi.
//
// Satu pintu masuk, handleIncoming(), dipakai BERSAMA oleh webhook WhatsApp
// dan simulator browser. Alurnya:
//   1. simpan pesan masuk
//   2. route: template aturan ATAU AI
//   3. deteksi & catat pesanan bila pelanggan ingin membeli
//   4. simpan balasan
//   5. kembalikan balasan supaya pemanggil bisa mengirimkannya
//
// Sejak jadi multi-tenant, mesin ini tidak lagi mencari store sendiri. Store,
// hak akses (entitlement), dan pencatat pemakaian AI disuntikkan lewat
// BotRuntime — supaya mesin tetap murni dan bisa diuji tanpa auth.
// ---------------------------------------------------------------------------
import type { Store } from "@/lib/db/store";
import type { ChatMessage, Entitlement, ReplySource } from "@/lib/types";
import { route } from "./router";
import { askAI } from "./ai";
import { isOrderIntent, summarizeOrder } from "./orders";

export interface IncomingMessage {
  phone: string;
  name?: string;
  text: string;
  /** Epoch ms opsional (bawaan: sekarang). */
  at?: number;
}

export interface BotRuntime {
  store: Store;
  entitlement: Entitlement;
  /** Dipanggil setiap satu balasan AI benar-benar terpakai (untuk kuota). */
  onAiUsed?: () => Promise<void>;
}

export interface EngineResult {
  reply: string;
  source: ReplySource;
  intent?: string;
  needsHuman: boolean;
  orderCreated: boolean;
  /** True kalau AI dilewati karena terkunci/kuota habis. */
  aiSkipped: boolean;
  incoming: ChatMessage;
  outgoing: ChatMessage;
}

/** Balasan saat AI tidak tersedia karena langganan, bukan karena error teknis. */
const PESAN_AI_TERKUNCI =
  "Terima kasih Kak 🙏 Pertanyaan ini akan dibantu admin kami ya, mohon tunggu sebentar.";

export async function handleIncoming(
  msg: IncomingMessage,
  runtime: BotRuntime,
): Promise<EngineResult> {
  const { store, entitlement } = runtime;
  const text = (msg.text ?? "").trim();

  const [business, botConfig, aiConfig] = await Promise.all([
    store.getBusiness(),
    store.getBotConfig(),
    store.getAIConfig(),
  ]);

  // Riwayat SEBELUM pesan baru ditambahkan, untuk konteks AI.
  const history = await store.getChatsByPhone(msg.phone, aiConfig?.historyLimit ?? 20);

  // 1. simpan pesan masuk
  const incoming = await store.addChat({
    phone: msg.phone,
    name: msg.name,
    direction: "in",
    text,
    createdAt: msg.at,
  });

  // 2. route
  const decision = route(text, business, botConfig);
  let reply: string;
  let source: ReplySource;
  let intent: string | undefined;
  let needsHuman = false;
  let aiSkipped = false;

  if (decision.type === "rule") {
    reply = decision.reply;
    source = decision.intent === "salam" ? "menu" : "rule";
    intent = decision.intent;
    if (decision.intent === "admin") needsHuman = true;
  } else if (!entitlement.features.ai_replies || aiConfig?.enabled === false) {
    // Langganan habis, kuota AI habis, atau AI sengaja dimatikan tenant.
    // Bot tetap menjawab — dieskalasi ke admin, bukan dibiarkan bisu.
    reply = PESAN_AI_TERKUNCI;
    source = "system";
    intent = "ai_terkunci";
    needsHuman = true;
    aiSkipped = true;
  } else {
    const knowledge = await store.listKnowledge();
    const ai = await askAI(text, history, business, knowledge, aiConfig);
    reply = ai.reply;
    source = "ai";
    needsHuman = ai.needsHuman;
    intent = "ai";
    // Hanya hitung pemakaian saat AI sungguhan dipanggil.
    if (ai.consumed) await runtime.onAiUsed?.();
  }

  // 3. deteksi pesanan
  let orderCreated = false;
  if (isOrderIntent(text)) {
    await store.addOrder({
      phone: msg.phone,
      name: msg.name,
      summary: summarizeOrder(text, business),
      rawText: text,
      status: "baru",
    });
    orderCreated = true;
    if (intent !== "admin") intent = intent === "ai" ? "ai+order" : "order";
  }

  // 4. simpan balasan
  const outgoing = await store.addChat({
    phone: msg.phone,
    name: msg.name,
    direction: "out",
    text: reply,
    source,
    intent,
    needsHuman,
  });

  return { reply, source, intent, needsHuman, orderCreated, aiSkipped, incoming, outgoing };
}
