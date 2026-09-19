// ---------------------------------------------------------------------------
// Rule-based replies (Tahap 2 - Bot Logic Inti).
// Fast, deterministic answers for common questions, built from the business
// profile. Everything here is in Bahasa Indonesia.
// ---------------------------------------------------------------------------
import type { BotConfig, Business } from "@/lib/types";
import { isiPlaceholder } from "./templates";

export interface RuleHit {
  intent: string;
  reply: string;
}

/** The quick-reply menu offered to customers (used by simulator + WA list). */
export const MENU_OPTIONS: { id: string; title: string }[] = [
  { id: "jam", title: "Jam buka" },
  { id: "menu", title: "Menu & harga" },
  { id: "order", title: "Cara order" },
  { id: "bayar", title: "Pembayaran" },
  { id: "alamat", title: "Lokasi / alamat" },
  { id: "cs", title: "Bicara dengan admin" },
];

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

/** Formats the catalog as a readable price list. */
export function formatCatalog(business: Business): string {
  if (!business.catalog.length) return "Katalog belum tersedia. Hubungi admin ya.";
  const lines = business.catalog.map((item) => {
    const desc = item.description ? ` — ${item.description}` : "";
    return `• ${item.name}: ${item.price}${desc}`;
  });
  return `Berikut menu & harga *${business.name}*:\n${lines.join("\n")}`;
}

/** The greeting + menu shown to new customers or on "menu"/"halo". */
export function greetingWithMenu(business: Business): string {
  const menu = MENU_OPTIONS.map((o, i) => `${i + 1}. ${o.title}`).join("\n");
  const tag = business.tagline ? `\n_${business.tagline}_` : "";
  return (
    `Halo! Selamat datang di *${business.name}* 👋${tag}\n\n` +
    `Silakan pilih (ketik angka atau kata kunci):\n${menu}\n\n` +
    `Atau langsung tanya apa saja, kami bantu jawab.`
  );
}

/** Keyword groups mapped to intents. */
const KEYWORD_GROUPS: { intent: string; keywords: string[] }[] = [
  { intent: "salam", keywords: ["halo", "hai", "hi", "assalamualaikum", "permisi", "pagi", "siang", "sore", "malam", "mulai", "start", "info"] },
  { intent: "jam buka", keywords: ["jam buka", "jam berapa", "buka jam", "buka gak", "buka ga", "masih buka", "tutup jam", "operasional", "jam", "buka"] },
  { intent: "harga", keywords: ["harga", "berapa harga", "price", "list harga", "daftar harga", "menu", "katalog", "produk", "makanan", "menu apa"] },
  { intent: "cara order", keywords: ["cara order", "cara pesan", "gimana order", "gimana pesan", "cara beli", "mau order gimana", "order gimana"] },
  { intent: "pembayaran", keywords: ["bayar", "pembayaran", "transfer", "qris", "rekening", "cod", "cash", "cara bayar"] },
  { intent: "alamat", keywords: ["alamat", "lokasi", "dimana", "di mana", "maps", "tempat", "gmaps"] },
  { intent: "admin", keywords: ["admin", "manusia", "cs", "customer service", "orang", "operator", "komplain", "keluhan"] },
];

/**
 * Try to match the message to a fixed rule.
 * Returns a RuleHit, or null if nothing confidently matched (→ needs AI).
 */
export function matchRule(text: string, business: Business): RuleHit | null {
  const t = normalize(text);

  // Numeric menu selection (1..N)
  const num = Number(t);
  if (Number.isInteger(num) && num >= 1 && num <= MENU_OPTIONS.length) {
    const chosen = MENU_OPTIONS[num - 1];
    return ruleForMenuId(chosen.id, business);
  }

  // Interactive list/button reply arrives as an id token.
  const byId = MENU_OPTIONS.find((o) => o.id === t);
  if (byId) return ruleForMenuId(byId.id, business);

  for (const group of KEYWORD_GROUPS) {
    if (group.keywords.some((kw) => t.includes(kw))) {
      return replyForIntent(group.intent, business);
    }
  }
  return null;
}

function ruleForMenuId(id: string, business: Business): RuleHit {
  switch (id) {
    case "jam":
      return replyForIntent("jam buka", business);
    case "menu":
      return replyForIntent("harga", business);
    case "order":
      return replyForIntent("cara order", business);
    case "bayar":
      return replyForIntent("pembayaran", business);
    case "alamat":
      return replyForIntent("alamat", business);
    case "cs":
      return replyForIntent("admin", business);
    default:
      return { intent: "salam", reply: greetingWithMenu(business) };
  }
}

// ---------------------------------------------------------------------------
// Pencocokan berbasis BotConfig milik tenant (menggantikan daftar statis di
// atas untuk akun yang sudah punya template sendiri).
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cocokkan satu kata kunci ke teks.
 *
 * Kata tunggal dicocokkan sebagai KATA UTUH, bukan substring. Ini memperbaiki
 * kelas bug lama: "hi" tertangkap di "hitam", "pagi" di "berapa pagi", "jam"
 * di "jamur" — yang membuat pertanyaan harga dibalas sapaan. Frasa (mengandung
 * spasi) tetap dicocokkan sebagai substring karena sudah cukup spesifik.
 */
export function cocokKeyword(text: string, keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return false;
  if (kw.includes(" ")) return text.includes(kw);
  return new RegExp(`\\b${escapeRegex(kw)}\\b`, "i").test(text);
}

const SALAM_KEYWORDS = [
  "halo", "hai", "assalamualaikum", "permisi", "pagi", "siang", "sore",
  "malam", "mulai", "start", "menu utama",
];

/** Petakan id tombol menu ke intent aturan. */
const MENU_ID_KE_INTENT: Record<string, string> = {
  jam: "jam buka",
  menu: "harga",
  order: "cara order",
  bayar: "pembayaran",
  alamat: "alamat",
  cs: "admin",
  kirim: "pengiriman",
  jadwal: "jadwal",
};

export function greetingFromConfig(cfg: BotConfig, business: Business): string {
  if (cfg.greeting?.trim()) {
    return isiPlaceholder(cfg.greeting, business, formatCatalog(business));
  }
  const menu = cfg.menuOptions.map((o, i) => `${i + 1}. ${o.title}`).join("\n");
  const tag = business.tagline ? `\n_${business.tagline}_` : "";
  return (
    `Halo! Selamat datang di *${business.name}* 👋${tag}\n\n` +
    `Silakan pilih (ketik angka atau kata kunci):\n${menu}\n\n` +
    `Atau langsung tanya apa saja, kami bantu jawab.`
  );
}

function hitDariAturan(intent: string, cfg: BotConfig, business: Business): RuleHit | null {
  const rule = cfg.rules.find((r) => r.enabled && r.intent === intent);
  if (!rule) return null;
  return { intent, reply: isiPlaceholder(rule.reply, business, formatCatalog(business)) };
}

/**
 * Cocokkan pesan ke BotConfig tenant. Kembalikan null kalau tidak ada yang
 * cocok (→ diteruskan ke AI).
 */
export function matchFromConfig(
  text: string,
  business: Business,
  cfg: BotConfig,
): RuleHit | null {
  const t = normalize(text);
  if (!t) return null;

  // 1. Pilihan menu lewat angka (1..N)
  const num = Number(t);
  if (Number.isInteger(num) && num >= 1 && num <= cfg.menuOptions.length) {
    const intent = MENU_ID_KE_INTENT[cfg.menuOptions[num - 1].id];
    const hit = intent ? hitDariAturan(intent, cfg, business) : null;
    if (hit) return hit;
  }

  // 2. Balasan tombol/list interaktif WhatsApp datang sebagai id.
  const byId = cfg.menuOptions.find((o) => o.id === t);
  if (byId) {
    const hit = hitDariAturan(MENU_ID_KE_INTENT[byId.id] ?? "", cfg, business);
    if (hit) return hit;
  }

  // 3. Sapaan → tampilkan menu. Dicek sebelum aturan lain, tapi kini dengan
  //    pencocokan kata utuh sehingga tidak lagi menelan pertanyaan lain.
  if (SALAM_KEYWORDS.some((k) => cocokKeyword(t, k))) {
    return { intent: "salam", reply: greetingFromConfig(cfg, business) };
  }

  // 4. Aturan milik tenant, diperiksa berurutan.
  for (const rule of cfg.rules) {
    if (!rule.enabled) continue;
    if (rule.keywords.some((k) => cocokKeyword(t, k))) {
      return {
        intent: rule.intent,
        reply: isiPlaceholder(rule.reply, business, formatCatalog(business)),
      };
    }
  }

  return null;
}

function replyForIntent(intent: string, business: Business): RuleHit {
  switch (intent) {
    case "salam":
      return { intent, reply: greetingWithMenu(business) };
    case "jam buka":
      return { intent, reply: `⏰ *${business.name}* buka:\n${business.hours}` };
    case "harga":
      return { intent, reply: `${formatCatalog(business)}\n\nMau pesan yang mana? Ketik *cara order* untuk langkahnya.` };
    case "cara order":
      return { intent, reply: `🛒 *Cara Order:*\n${business.orderInstructions}` };
    case "pembayaran":
      return { intent, reply: `💳 *Pembayaran:*\n${business.paymentInfo ?? "Hubungi admin untuk info pembayaran."}` };
    case "alamat":
      return { intent, reply: `📍 *Lokasi ${business.name}:*\n${business.address ?? "Hubungi admin untuk alamat lengkap."}` };
    case "admin":
      return { intent, reply: `Baik, kami sambungkan ke admin ya 🙏 Mohon tunggu, admin akan segera membalas. ${business.phone ? `Atau hubungi langsung: ${business.phone}` : ""}`.trim() };
    default:
      return { intent: "salam", reply: greetingWithMenu(business) };
  }
}
