// ---------------------------------------------------------------------------
// Klien Midtrans Snap.
//
// Dua tanggung jawab:
//   1. Membuat transaksi Snap dan mengembalikan token untuk popup pembayaran.
//   2. Memverifikasi tanda tangan notifikasi yang dikirim balik Midtrans.
//
// Verifikasi tanda tangan itu WAJIB, bukan opsional. Tanpanya siapa pun yang
// tahu URL webhook bisa mengirim notifikasi palsu "sudah bayar" dan membuka
// semua fitur secara cuma-cuma.
// ---------------------------------------------------------------------------
import { createHash } from "node:crypto";
import { paymentProvider } from "@/lib/config";

export const midtrans = {
  merchantId: process.env.MIDTRANS_MERCHANT_ID ?? "",
  clientKey: process.env.MIDTRANS_CLIENT_KEY ?? "",
  serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
};

/**
 * Sandbox atau produksi — HARUS dinyatakan eksplisit lewat
 * MIDTRANS_IS_PRODUCTION. Default: sandbox.
 *
 * Jangan tergoda menebak dari awalan key. Dulu key sandbox Midtrans berawalan
 * "SB-", tapi sekarang TIDAK LAGI: key sandbox dan produksi sama-sama berbentuk
 * "Mid-server-…" dan tidak bisa dibedakan. Menebak berarti suatu saat kode ini
 * akan menyimpulkan "produksi" untuk key sandbox — atau lebih buruk, memproses
 * uang sungguhan saat dikira sedang menguji.
 *
 * Kalau ragu, sandbox adalah kegagalan yang aman.
 */
export function isProduction(): boolean {
  return (process.env.MIDTRANS_IS_PRODUCTION ?? "").trim().toLowerCase() === "true";
}

export function hasMidtrans(): boolean {
  // Sakelar penyedia: kalau PAYMENT_PROVIDER bukan "midtrans", Midtrans dianggap
  // nonaktif walau key-nya masih ada. Ini yang mematikan seluruh rute Midtrans
  // (create / notification / reconcile) tanpa menghapus kodenya.
  if (paymentProvider() !== "midtrans") return false;
  return Boolean(midtrans.serverKey && midtrans.clientKey);
}

function snapBaseUrl(): string {
  return isProduction()
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
}

/** URL skrip snap.js yang dimuat halaman pembayaran. */
export function snapScriptUrl(): string {
  return isProduction()
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";
}

function authHeader(): string {
  // Midtrans memakai Basic auth: base64(serverKey + ":")
  return "Basic " + Buffer.from(midtrans.serverKey + ":").toString("base64");
}

export interface SnapRequest {
  orderId: string;
  amountIdr: number;
  namaPaket: string;
  /**
   * Keterangan singkat pada rincian item di halaman Midtrans, mis. "1 bulan"
   * atau "1.000 balasan". Pelanggan membacanya sebelum membayar, jadi ini yang
   * membedakan tagihan langganan dari tagihan kredit.
   */
  keterangan?: string;
  pelanggan: { nama: string; email: string; telepon?: string };
}

export interface SnapResult {
  token: string;
  redirectUrl: string;
}

/** Buat transaksi Snap. Melempar Error dengan pesan dari Midtrans bila gagal. */
export async function createSnapTransaction(req: SnapRequest): Promise<SnapResult> {
  const res = await fetch(snapBaseUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: req.orderId,
        // Midtrans menolak pecahan; Rupiah memang bilangan bulat.
        gross_amount: Math.round(req.amountIdr),
      },
      item_details: [
        {
          id: req.namaPaket,
          price: Math.round(req.amountIdr),
          quantity: 1,
          name: `Zavi ${req.namaPaket} — ${req.keterangan ?? "1 bulan"}`.slice(0, 50),
        },
      ],
      customer_details: {
        first_name: req.pelanggan.nama.slice(0, 20),
        email: req.pelanggan.email,
        phone: req.pelanggan.telepon?.slice(0, 20),
      },
      credit_card: { secure: true },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.token) {
    const pesan =
      (Array.isArray(json.error_messages) && json.error_messages.join("; ")) ||
      json.status_message ||
      `HTTP ${res.status}`;
    throw new Error(`Midtrans menolak transaksi: ${pesan}`);
  }
  return { token: json.token, redirectUrl: json.redirect_url ?? "" };
}

// ---------------------------------------------------------------------------
// Notifikasi
// ---------------------------------------------------------------------------

export interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
  transaction_time?: string;
}

/**
 * Verifikasi tanda tangan notifikasi.
 * Rumus Midtrans: SHA512(order_id + status_code + gross_amount + serverKey)
 */
export function verifySignature(n: MidtransNotification): boolean {
  if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) return false;
  const expected = createHash("sha512")
    .update(n.order_id + n.status_code + n.gross_amount + midtrans.serverKey)
    .digest("hex");
  // Panjang hex selalu sama, jadi perbandingan biasa sudah cukup aman di sini.
  return expected === n.signature_key.toLowerCase();
}

export type HasilPembayaran = "paid" | "pending" | "failed" | "expired" | "refunded";

/** Terjemahkan transaction_status Midtrans jadi status internal kita. */
export function tafsirkanStatus(n: MidtransNotification): HasilPembayaran {
  switch (n.transaction_status) {
    case "capture":
      // Kartu kredit: hanya sah kalau lolos pemeriksaan fraud.
      return n.fraud_status === "accept" ? "paid" : "pending";
    case "settlement":
      return "paid";
    case "pending":
      return "pending";
    case "deny":
    case "cancel":
      return "failed";
    case "expire":
      return "expired";
    case "refund":
    case "partial_refund":
      return "refunded";
    default:
      return "pending";
  }
}

// ---------------------------------------------------------------------------
// Status API — menanyakan keadaan transaksi langsung ke Midtrans.
//
// Dipakai pekerjaan rekonsiliasi: notifikasi bisa hilang (server sedang mati,
// salah konfigurasi URL, gangguan jaringan). Bertanya langsung adalah jaring
// pengaman supaya pelanggan yang sudah membayar tidak tertinggal terkunci.
// ---------------------------------------------------------------------------

function apiBaseUrl(): string {
  return isProduction() ? "https://api.midtrans.com/v2" : "https://api.sandbox.midtrans.com/v2";
}

/**
 * Tanyakan status satu transaksi. Mengembalikan null kalau Midtrans tidak
 * mengenal order tersebut (mis. transaksi tidak pernah benar-benar dibuat).
 */
export async function getTransactionStatus(
  orderId: string,
): Promise<MidtransNotification | null> {
  const res = await fetch(`${apiBaseUrl()}/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: "application/json", Authorization: authHeader() },
  });
  const json = await res.json().catch(() => null);
  if (!json) return null;
  // 404 / 401 → status_code "404"/"401" di body.
  if (res.status === 404 || json.status_code === "404") return null;
  if (!res.ok && !json.transaction_status) {
    throw new Error(`Midtrans status ${res.status}: ${json.status_message ?? ""}`);
  }
  return json as MidtransNotification;
}

/**
 * order_id unik namun mudah ditelusuri: <awalan>-<tenant>-<waktu>.
 *
 * Awalan berbeda untuk kredit supaya di dashboard Midtrans langsung kelihatan
 * mana tagihan langganan dan mana top-up, tanpa perlu membuka database kita.
 */
export function buatOrderId(tenantId: string, awalan = "ZAVI"): string {
  const ringkas = tenantId.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
  return `${awalan}-${ringkas}-${Date.now().toString(36).toUpperCase()}`;
}
