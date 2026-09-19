// ---------------------------------------------------------------------------
// Lightweight order detection (Tahap 4 - Manajemen Pesanan).
// Heuristic: detect order intent from the message and build a short summary.
// A real deployment can upgrade this to a structured AI extraction step.
// ---------------------------------------------------------------------------
import type { Business } from "@/lib/types";

const ORDER_KEYWORDS = [
  "mau pesan",
  "mau order",
  "pesan",
  "order",
  "beli",
  "mau beli",
  "checkout",
  "booking",
  "reservasi",
  "dm order",
  "gojek",
  "gofood",
  "diantar",
  "delivery",
];

/** True when the message looks like a purchase intent. */
export function isOrderIntent(text: string): boolean {
  const t = text.toLowerCase();
  // Avoid firing on "cara order" / "gimana pesan" (those are questions).
  if (/(cara|gimana|bagaimana|cara nya|caranya)\s+(order|pesan|beli)/.test(t)) {
    return false;
  }
  return ORDER_KEYWORDS.some((kw) => t.includes(kw));
}

/**
 * Builds a human-readable order summary, trying to match catalog item names
 * and quantities that appear in the message.
 */
export function summarizeOrder(text: string, business: Business): string {
  const t = text.toLowerCase();
  const matched: string[] = [];
  for (const item of business.catalog) {
    const name = item.name.toLowerCase();
    // Match by full name or first significant word of the item name.
    const firstWord = name.split(" ")[0];
    if (name && (t.includes(name) || (firstWord.length > 3 && t.includes(firstWord)))) {
      const qty = findQuantityNear(t, firstWord);
      matched.push(qty ? `${qty}x ${item.name}` : item.name);
    }
  }
  if (matched.length) return matched.join(", ");
  // Fallback: use a trimmed version of the raw message.
  return text.trim().slice(0, 140);
}

/** Finds a number appearing near a keyword, e.g. "ayam 2" or "2 ayam". */
function findQuantityNear(text: string, keyword: string): number | null {
  const idx = text.indexOf(keyword);
  if (idx === -1) return null;
  const window = text.slice(Math.max(0, idx - 12), idx + keyword.length + 12);
  const m = window.match(/(\d+)\s*(porsi|pcs|buah|botol|x|kotak|bungkus)?/);
  if (m) {
    const n = Number(m[1]);
    if (n > 0 && n < 1000) return n;
  }
  return null;
}
