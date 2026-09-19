// ---------------------------------------------------------------------------
// Intent router (Tahap 2/3). Menentukan apakah sebuah pesan cukup dijawab
// template tetap, atau perlu dilempar ke AI.
// ---------------------------------------------------------------------------
import type { BotConfig, Business } from "@/lib/types";
import { matchFromConfig, matchRule } from "./rules";

export type RouteDecision =
  | { type: "rule"; intent: string; reply: string }
  | { type: "ai" };

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
): RouteDecision {
  const hit = botConfig
    ? matchFromConfig(text, business, botConfig)
    : matchRule(text, business);
  if (hit) return { type: "rule", intent: hit.intent, reply: hit.reply };
  return { type: "ai" };
}
