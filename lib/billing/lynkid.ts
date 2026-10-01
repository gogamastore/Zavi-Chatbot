// ---------------------------------------------------------------------------
// Penyedia pembayaran Lynk.id (khusus webhook).
//
// Lynk.id hanya menyediakan integrasi webhook — tidak ada API untuk membuat
// invoice dinamis. Alur: pelanggan membayar lewat link checkout Lynk.id, lalu
// Lynk.id memanggil webhook kita dengan event "payment.received".
//
// Format & keamanan mengikuti dokumentasi resmi Lynk.id:
//   - Header  : X-Lynk-Signature
//   - Rumus   : SHA256( grandTotal + refId + message_id + merchantKey )
//   - Payload : { event, data: { message_action, message_id,
//                 message_data: { customer, items, refId, totals, ... } } }
//
// `LYNKID_WEBHOOK_SECRET` menyimpan MERCHANT KEY dari dashboard Lynk.id
// (muncul setelah URL webhook disimpan).
// ---------------------------------------------------------------------------
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config";
import { PURCHASABLE_PLANS } from "./plans";
import type { HasilPembayaran } from "./midtrans";
import type { PlanId } from "@/lib/types";

// --- Util pembaca payload --------------------------------------------------

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

/** payload.data */
function dataDari(payload: unknown): Record<string, unknown> | undefined {
  return obj(obj(payload)?.data);
}

/** payload.data.message_data */
function messageDataDari(payload: unknown): Record<string, unknown> | undefined {
  return obj(dataDari(payload)?.message_data);
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// --- Keamanan: verifikasi X-Lynk-Signature ---------------------------------

function samaAman(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verifikasi tanda tangan webhook Lynk.id.
 *
 * Rumus Lynk.id: SHA256(grandTotal + refId + message_id + merchantKey).
 * `grandTotal` dipakai APA ADANYA dari payload (sama seperti kode contoh
 * Lynk.id yang merangkai `amount + ref_id + message_id + secretKey`).
 *
 * Tanpa merchant key (LYNKID_WEBHOOK_SECRET) atau tanpa header signature,
 * permintaan ditolak.
 */
export function verifikasiTandaTanganLynkid(
  payload: unknown,
  signature: string | null,
): boolean {
  const secret = env.lynkidWebhookSecret;
  if (!secret || !signature) return false;

  const md = messageDataDari(payload);
  const grandTotal = obj(md?.totals)?.grandTotal;
  const refId = asString(md?.refId);
  const messageId = asString(dataDari(payload)?.message_id);
  if (grandTotal === undefined || grandTotal === null || !refId || !messageId) {
    return false;
  }

  const signatureString = `${grandTotal}${refId}${messageId}${secret}`;
  const calc = createHash("sha256").update(signatureString).digest("hex");
  return samaAman(calc, signature.trim().toLowerCase());
}

// --- Pembacaan payload -----------------------------------------------------

/** Satu peristiwa pembayaran Lynk.id yang sudah dinormalkan. */
export interface LynkidEvent {
  event?: string;
  /** refId — id transaksi, dipakai sebagai kunci idempotensi. */
  txnId: string;
  messageId?: string;
  hasil: HasilPembayaran;
  /** message_action mentah ("SUCCESS", …), untuk audit. */
  providerStatus?: string;
  /** Email pembeli di akun Lynk.id. */
  buyerEmail?: string;
  /**
   * Email yang diisi pembeli di pertanyaan tambahan (mis. "Email akun Zavi").
   * Diprioritaskan untuk mencocokkan tenant kalau email Lynk.id-nya berbeda.
   */
  accountEmail?: string;
  productTitle?: string;
  /** Harga produk kotor (totals.totalPrice) — dipakai mencocokkan paket. */
  grossIdr?: number;
  /** Jumlah bersih yang diterima penjual (totals.grandTotal) — untuk audit. */
  grandTotalIdr?: number;
}

/** Terjemahkan status Lynk.id ke status internal kita. */
export function tafsirkanStatusLynkid(messageAction: string, event: string): HasilPembayaran {
  const a = messageAction.toUpperCase();
  // Webhook payment.received menandai pembayaran sukses.
  if (event === "payment.received" || a === "SUCCESS" || a.includes("SUCCESS")) return "paid";
  if (a.includes("EXPIRE")) return "expired";
  if (a.includes("REFUND") || a.includes("CHARGEBACK")) return "refunded";
  if (["FAIL", "CANCEL", "DENY", "VOID", "REJECT"].some((x) => a.includes(x))) return "failed";
  return "pending";
}

/** Cari email pada jawaban pertanyaan tambahan (items[].questions). */
function emailDariPertanyaan(items: unknown): string | undefined {
  if (!Array.isArray(items)) return undefined;
  const rxEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const it of items) {
    const q = obj(it)?.questions;
    if (typeof q !== "string" || !q.trim().startsWith("{")) continue;
    try {
      const jawaban = JSON.parse(q) as Record<string, unknown>;
      for (const v of Object.values(jawaban)) {
        if (typeof v === "string" && rxEmail.test(v.trim())) return v.trim().toLowerCase();
      }
    } catch {
      // abaikan jawaban yang bukan JSON valid
    }
  }
  return undefined;
}

/** Baca payload webhook Lynk.id menjadi bentuk yang seragam. */
export function bacaEventLynkid(payload: unknown): LynkidEvent {
  const data = dataDari(payload);
  const md = messageDataDari(payload);
  const totals = obj(md?.totals);
  const items = md?.items;
  const item0 = Array.isArray(items) ? obj(items[0]) : undefined;

  const event = asString(obj(payload)?.event);
  const messageAction = asString(data?.message_action) ?? "";

  return {
    event,
    txnId:
      asString(md?.refId) ??
      asString(data?.message_id) ??
      `LYNK-${Date.now().toString(36).toUpperCase()}`,
    messageId: asString(data?.message_id),
    hasil: tafsirkanStatusLynkid(messageAction, event ?? ""),
    providerStatus: messageAction || undefined,
    buyerEmail: asString(obj(md?.customer)?.email)?.toLowerCase(),
    accountEmail: emailDariPertanyaan(items),
    productTitle: asString(item0?.title),
    grossIdr: asNumber(totals?.totalPrice) ?? asNumber(item0?.price),
    grandTotalIdr: asNumber(totals?.grandTotal),
  };
}

/**
 * Tebak paket langganan dari peristiwa: dari judul produk yang memuat
 * "pro"/"basic", lalu dari HARGA KOTOR produk (totals.totalPrice) yang cocok
 * dengan harga paket — bukan grandTotal, karena grandTotal sudah dipotong
 * biaya layanan Lynk.id. Kembalikan null kalau tidak yakin.
 */
export function tebakPlan(ev: LynkidEvent): PlanId | null {
  const judul = (ev.productTitle ?? "").toLowerCase();
  if (judul.includes("pro")) return "pro";
  if (judul.includes("basic")) return "basic";
  if (ev.grossIdr != null) {
    const cocok = PURCHASABLE_PLANS.find((p) => p.priceIdr === ev.grossIdr);
    if (cocok) return cocok.id;
  }
  return null;
}

/** Email untuk mencocokkan tenant: prioritaskan jawaban pertanyaan, lalu email pembeli. */
export function emailUntukCocok(ev: LynkidEvent): string | undefined {
  return ev.accountEmail ?? ev.buyerEmail;
}
