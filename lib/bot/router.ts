// ---------------------------------------------------------------------------
// Intent router (Tahap 2/3). Menentukan apakah sebuah pesan cukup dijawab
// template tetap, atau perlu dilempar ke AI.
// ---------------------------------------------------------------------------
import type { BotConfig, Business } from "@/lib/types";
import { INTENT_PRODUK, matchFromConfig, matchRule } from "./rules";

export type RouteDecision =
  | { type: "rule"; intent: string; reply: string }
  | { type: "ai" };

export interface OpsiRoute {
  /**
   * Serahkan pertanyaan produk ke AI, bukan dibalas guyuran katalog.
   *
   * Pemanggil WAJIB menyetel ini false kalau AI sedang tidak bisa dipakai
   * (langganan terkunci, kuota habis, AI dimatikan). Kalau tidak, pertanyaan
   * produk — pertanyaan yang paling sering datang — akan berakhir dieskalasi
   * ke admin padahal katalognya ada dan bisa langsung dikirim.
   */
  produkKeAI?: boolean;
}

/**
 * Route satu pesan pelanggan.
 *
 * Kalau tenant sudah punya BotConfig (template yang dipilih saat mendaftar,
 * boleh diedit), aturan itulah yang dipakai. Tanpa BotConfig — akun lama atau
 * mode demo — jatuh ke aturan bawaan agar bot tetap menjawab.
 */
export function route(
  text: string,
  business: Business,
  botConfig?: BotConfig | null,
  opsi: OpsiRoute = {},
): RouteDecision {
  const hit = botConfig
    ? matchFromConfig(text, business, botConfig)
    : matchRule(text, business);
  if (!hit) return { type: "ai" };

  // Pertanyaan produk diserahkan ke AI — kecuali pelanggan memang MEMILIH
  // menu katalog (menekan tombol / mengetik nomornya). Permintaan eksplisit
  // tetap dijawab daftar, karena itu persis yang dimintanya.
  if (opsi.produkKeAI && INTENT_PRODUK.has(hit.intent) && !hit.eksplisit) {
    return { type: "ai" };
  }

  return { type: "rule", intent: hit.intent, reply: hit.reply };
}
