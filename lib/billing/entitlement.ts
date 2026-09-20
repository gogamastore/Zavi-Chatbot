// ---------------------------------------------------------------------------
// Penghitung hak akses (entitlement).
//
// Satu fungsi murni: Subscription + waktu sekarang  →  Entitlement.
// Tidak menyentuh database, tidak async, tidak punya efek samping — supaya
// bisa dites dan dipakai di server maupun client tanpa perbedaan perilaku.
//
// ATURAN PENTING: Entitlement TIDAK PERNAH disimpan ke database. Selalu hitung
// ulang dari Subscription. Kalau disimpan, status bisa basi — akun tetap
// terbuka padahal trial sudah lewat.
// ---------------------------------------------------------------------------
import type {
  Entitlement,
  FeatureKey,
  Subscription,
  SubscriptionStatus,
} from "@/lib/types";
import { ALL_FEATURES } from "@/lib/types";
import {
  FEATURES_LOCKED_WHEN_UNPAID,
  GRACE_DAYS,
  KUOTA_AI_OWNER,
  TRIAL_DAYS,
  getPlan,
} from "./plans";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Langganan awal untuk tenant yang baru mendaftar: trial yang sedang berjalan. */
export function newTrialSubscription(tenantId: string, now = Date.now()): Subscription {
  return {
    tenantId,
    status: "trial",
    planId: "trial",
    trialStartedAt: now,
    trialEndsAt: now + TRIAL_DAYS * DAY_MS,
    aiRepliesUsed: 0,
    usageResetAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Status efektif saat ini. Berbeda dari `sub.status` yang tersimpan, karena
 * waktu berjalan terus: trial bisa sudah lewat walau database masih menulis
 * "trial". Inilah alasan status selalu dihitung ulang, bukan dibaca mentah.
 */
export function effectiveStatus(sub: Subscription, now = Date.now()): SubscriptionStatus {
  // Langganan berbayar menang atas apa pun sisa masa trial.
  if (sub.status === "active") {
    const end = sub.currentPeriodEnd ?? 0;
    if (now <= end) return "active";
    if (now <= end + GRACE_DAYS * DAY_MS) return "past_due";
    return "expired";
  }

  if (sub.status === "past_due") {
    const end = sub.currentPeriodEnd ?? 0;
    return now <= end + GRACE_DAYS * DAY_MS ? "past_due" : "expired";
  }

  // "pending" = Snap dibuka tapi belum dibayar. Akses mengikuti sisa trial,
  // supaya orang yang sedang di tengah proses bayar tidak tiba-tiba terkunci.
  if (sub.status === "trial" || sub.status === "pending") {
    return now < sub.trialEndsAt ? sub.status : "trial_ended";
  }

  return sub.status;
}

function sisaHari(untilMs: number, now: number): number {
  return Math.max(0, Math.ceil((untilMs - now) / DAY_MS));
}

/** Status yang membuka akses penuh ke fitur berbayar. */
function membukaFitur(status: SubscriptionStatus): boolean {
  return status === "trial" || status === "pending" || status === "active" || status === "past_due";
}

function alasan(status: SubscriptionStatus, trialDaysLeft: number): string {
  switch (status) {
    case "trial":
      return trialDaysLeft <= 1
        ? "Masa percobaan berakhir hari ini. Berlangganan agar bot tetap jalan."
        : `Masa percobaan berjalan, sisa ${trialDaysLeft} hari.`;
    case "pending":
      return "Menunggu pembayaran diselesaikan.";
    case "active":
      return "Langganan aktif.";
    case "past_due":
      return "Pembayaran lewat jatuh tempo. Segera perpanjang agar bot tidak berhenti.";
    case "trial_ended":
      return "Masa percobaan sudah habis. Berlangganan untuk membuka kembali semua fitur.";
    case "expired":
      return "Langganan sudah berakhir. Perpanjang untuk mengaktifkan bot lagi.";
  }
}

/** Hitung hak akses sekarang. Inilah sumber kebenaran untuk kunci/buka fitur. */
export function computeEntitlement(sub: Subscription, now = Date.now()): Entitlement {
  const status = effectiveStatus(sub, now);
  const plan = getPlan(sub.planId);
  const terbuka = membukaFitur(status);
  const locked = !terbuka;

  const trialDaysLeft =
    status === "trial" || status === "pending" ? sisaHari(sub.trialEndsAt, now) : 0;

  const aiRepliesLimit = plan.aiRepliesPerMonth;
  const aiRepliesUsed = sub.aiRepliesUsed ?? 0;
  // Kredit top-up menambah sisa balasan, tapi TIDAK menaikkan aiRepliesLimit:
  // limit tetap berarti "jatah bulanan paket" supaya angka di UI dan di
  // konsumsi kuota berbicara tentang hal yang sama.
  const aiCreditsBalance = Math.max(0, sub.aiCreditsBalance ?? 0);
  const sisaKuotaPaket = Math.max(0, aiRepliesLimit - aiRepliesUsed);
  const aiRepliesRemaining = sisaKuotaPaket + aiCreditsBalance;
  const aiQuotaExceeded = aiRepliesRemaining <= 0;

  const features = {} as Record<FeatureKey, boolean>;
  for (const f of ALL_FEATURES) {
    let boleh = plan.features.includes(f);
    // Akun terkunci: matikan fitur berbayar, tapi biarkan pelanggan melihat
    // data miliknya sendiri (chats & orders tidak ada di daftar terkunci).
    //
    // Perhatikan urutannya: penguncian diperiksa SEBELUM kredit. Punya sisa
    // kredit tidak membuka AI kalau langganan mati — kredit itu tambahan kuota,
    // bukan pengganti langganan. Kredit tidak hangus, tetap menunggu sampai
    // langganan diperpanjang.
    if (locked && FEATURES_LOCKED_WHEN_UNPAID.includes(f)) boleh = false;
    // Kuota AI habis hanya mematikan AI, bukan seluruh layanan.
    if (f === "ai_replies" && aiQuotaExceeded) boleh = false;
    features[f] = boleh;
  }

  return {
    status,
    planId: sub.planId,
    locked,
    trialDaysLeft,
    trialEndingSoon: (status === "trial" || status === "pending") && trialDaysLeft <= 1,
    features,
    aiRepliesUsed,
    aiRepliesLimit,
    aiCreditsBalance,
    aiRepliesRemaining,
    aiQuotaExceeded,
    unlimited: false,
    reason: alasan(status, trialDaysLeft),
  };
}

/** Pintasan untuk penjagaan di API route. */
export function canUse(ent: Entitlement, feature: FeatureKey): boolean {
  return ent.features[feature] === true;
}

/**
 * Hak akses untuk akun pengelola Zavi (custom claim `owner`).
 *
 * Owner berada DI LUAR sistem langganan: tidak pernah terkunci, tidak punya
 * masa berlaku, tidak pernah kehabisan kuota, dan tidak pernah ditagih. Dia
 * harus bisa mencoba setiap fitur kapan saja untuk menguji produknya sendiri.
 *
 * Pemakaian AI tetap DIHITUNG dan ditampilkan apa adanya — biayanya nyata,
 * jadi angkanya tidak disembunyikan hanya karena tidak dibatasi.
 */
export function ownerEntitlement(sub: Subscription | null): Entitlement {
  const features = {} as Record<FeatureKey, boolean>;
  for (const f of ALL_FEATURES) features[f] = true;

  const aiRepliesUsed = sub?.aiRepliesUsed ?? 0;
  return {
    status: "active",
    planId: "owner",
    locked: false,
    trialDaysLeft: 0,
    trialEndingSoon: false,
    features,
    aiRepliesUsed,
    aiRepliesLimit: KUOTA_AI_OWNER,
    aiCreditsBalance: Math.max(0, sub?.aiCreditsBalance ?? 0),
    aiRepliesRemaining: Math.max(0, KUOTA_AI_OWNER - aiRepliesUsed),
    aiQuotaExceeded: false,
    unlimited: true,
    reason: "Akun owner — di luar sistem langganan, semua fitur terbuka tanpa batas.",
  };
}

/** Entitlement untuk tenant yang belum punya langganan sama sekali. */
export function lockedEntitlement(reason = "Akun belum aktif."): Entitlement {
  const features = {} as Record<FeatureKey, boolean>;
  for (const f of ALL_FEATURES) features[f] = false;
  return {
    status: "expired",
    planId: "trial",
    locked: true,
    trialDaysLeft: 0,
    trialEndingSoon: false,
    features,
    aiRepliesUsed: 0,
    aiRepliesLimit: 0,
    aiCreditsBalance: 0,
    aiRepliesRemaining: 0,
    aiQuotaExceeded: true,
    unlimited: false,
    reason,
  };
}
