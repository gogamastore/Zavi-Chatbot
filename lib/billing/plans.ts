// ---------------------------------------------------------------------------
// Katalog paket langganan Zavi.
//
// Angka kuota AI di sini bukan hiasan: biaya API AI ditanggung platform, jadi
// kuota inilah yang menjaga margin. Kalau harga/kuota diubah, ubah di sini saja
// — seluruh app (UI harga, penguncian fitur, Midtrans) membaca dari file ini.
// ---------------------------------------------------------------------------
import type { FeatureKey, Plan, PlanId } from "@/lib/types";
import { ALL_FEATURES } from "@/lib/types";

/** Lama masa percobaan gratis, dalam hari. */
export const TRIAL_DAYS = 3;

/**
 * Masa tenggang setelah langganan jatuh tempo sebelum fitur benar-benar
 * dikunci. Memberi ruang kalau pembayaran telat masuk / bank lambat.
 */
export const GRACE_DAYS = 3;

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Percobaan Gratis",
    priceIdr: 0,
    // Cukup untuk mencoba, tidak cukup untuk dipakai produksi gratis.
    aiRepliesPerMonth: 100,
    maxKnowledgeDocs: 5,
    maxWhatsappNumbers: 1,
    features: [...ALL_FEATURES],
    highlights: [
      `Semua fitur terbuka ${TRIAL_DAYS} hari`,
      "100 balasan AI",
      "Tanpa kartu kredit",
    ],
  },
  basic: {
    id: "basic",
    name: "Basic",
    priceIdr: 99_000,
    aiRepliesPerMonth: 500,
    maxKnowledgeDocs: 20,
    maxWhatsappNumbers: 1,
    features: [
      "simulator",
      "chats",
      "orders",
      "ai_replies",
      "knowledge_base",
      "bot_template",
      "whatsapp_connect",
    ],
    highlights: [
      "1 nomor WhatsApp",
      "500 balasan AI / bulan",
      "20 dokumen pengetahuan",
      "Template bot & katalog",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceIdr: 249_000,
    aiRepliesPerMonth: 3_000,
    maxKnowledgeDocs: 200,
    maxWhatsappNumbers: 3,
    features: [...ALL_FEATURES],
    highlights: [
      "3 nomor WhatsApp",
      "3.000 balasan AI / bulan",
      "200 dokumen pengetahuan",
      "Ekspor data chat & pesanan",
    ],
  },
};

/** Paket yang bisa dibeli (trial tidak dijual). */
export const PURCHASABLE_PLANS: Plan[] = [PLANS.basic, PLANS.pro];

export function getPlan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.trial;
}

/**
 * Fitur yang dimatikan begitu akun terkunci (trial habis / langganan mati).
 *
 * Catatan sengaja: "chats" dan "orders" TIDAK ada di daftar ini. Pelanggan
 * tetap boleh melihat datanya sendiri walau belum bayar — yang dijual adalah
 * botnya yang bekerja, bukan sandera data. Ini juga menghindari sengketa.
 */
export const FEATURES_LOCKED_WHEN_UNPAID: FeatureKey[] = [
  "simulator",
  "ai_replies",
  "knowledge_base",
  "bot_template",
  "whatsapp_connect",
  "export",
];

/** Format harga ke Rupiah, mis. 99000 → "Rp 99.000". */
export function formatIdr(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}
