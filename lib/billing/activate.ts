// ---------------------------------------------------------------------------
// Aktivasi langganan — SATU-SATUNYA tempat yang boleh mengubah langganan
// menjadi "active", dan satu-satunya tempat kredit AI hasil pembelian
// ditambahkan ke saldo tenant.
//
// Dipakai oleh dua pemanggil:
//   - webhook notifikasi Midtrans (jalur cepat, sedetik setelah bayar)
//   - pekerjaan rekonsiliasi terjadwal (jaring pengaman, kalau notifikasi hilang)
//
// Keduanya WAJIB memakai fungsi ini, bukan menyalin logikanya. Kalau kedua
// jalur punya perhitungan sendiri, suatu saat keduanya akan menyimpang dan
// pelanggan yang sudah bayar bisa berakhir terkunci — bug yang paling mahal
// di model bisnis langganan.
// ---------------------------------------------------------------------------
import type { PlatformStore } from "@/lib/db/store";
import type { Payment, PaymentStatus } from "@/lib/types";
import { getPlan } from "./plans";
import { tafsirkanStatus, type HasilPembayaran, type MidtransNotification } from "./midtrans";

const HARI = 86_400_000;
export const PERIODE_HARI = 30;

export interface HasilAktivasi {
  /** True kalau langganan baru saja diaktifkan oleh pemanggilan ini. */
  diaktifkan: boolean;
  status: PaymentStatus;
  /** Kredit AI yang baru ditambahkan (pembelian top-up). */
  kreditDitambah?: number;
  /** Alasan singkat untuk log. */
  catatan: string;
}

/**
 * Satu keadaan pembayaran yang sudah dinormalkan, lepas dari penyedia mana pun.
 * Midtrans dan Lynk.id sama-sama menerjemahkan payload mereka ke bentuk ini,
 * lalu memanggil `terapkanKeadaanPembayaran` — supaya perhitungan masa aktif
 * hanya ada di SATU tempat dan tidak pernah menyimpang antar penyedia.
 */
export interface KeadaanPembayaran {
  hasil: HasilPembayaran;
  /** Status mentah dari penyedia, untuk audit (opsional). */
  providerStatus?: string;
  /** Cara bayar (qris, bank_transfer, …), kalau penyedia mengirimkannya. */
  paymentType?: string;
}

/**
 * Terapkan satu keadaan transaksi Midtrans ke pembayaran + langganan.
 * Pembungkus tipis di atas terapkanKeadaanPembayaran untuk jalur Midtrans.
 */
export async function terapkanStatusPembayaran(
  platform: PlatformStore,
  payment: Payment,
  notif: MidtransNotification,
): Promise<HasilAktivasi> {
  return terapkanKeadaanPembayaran(platform, payment, {
    hasil: tafsirkanStatus(notif),
    providerStatus: notif.transaction_status,
    paymentType: notif.payment_type,
  });
}

/**
 * Inti aktivasi — SATU-SATUNYA tempat langganan berubah jadi "active" dan kredit
 * ditambahkan, lepas dari penyedia pembayaran.
 *
 * Idempoten: aman dipanggil berkali-kali untuk order yang sama. Aktivasi hanya
 * terjadi pada transisi pertama menuju "paid".
 */
export async function terapkanKeadaanPembayaran(
  platform: PlatformStore,
  payment: Payment,
  keadaan: KeadaanPembayaran,
): Promise<HasilAktivasi> {
  const hasil = keadaan.hasil;
  const sudahLunas = payment.status === "paid";

  await platform.updatePayment(payment.orderId, {
    status: hasil as PaymentStatus,
    providerStatus: keadaan.providerStatus,
    paymentType: keadaan.paymentType,
    paidAt: hasil === "paid" ? (payment.paidAt ?? Date.now()) : payment.paidAt,
  });

  if (hasil === "paid" && !sudahLunas) {
    const sub = await platform.getSubscription(payment.tenantId);
    if (!sub) {
      return { diaktifkan: false, status: hasil, catatan: "langganan tenant tidak ditemukan" };
    }
    const now = Date.now();

    // Beli kredit: HANYA menambah saldo kredit.
    //
    // Sengaja tidak menyentuh status, currentPeriodEnd, maupun aiRepliesUsed.
    // Membeli kredit bukan membayar langganan — kalau di sini masa aktif ikut
    // diperpanjang, pelanggan bisa memperpanjang layanan dengan harga top-up
    // dan tidak pernah berlangganan lagi.
    if (payment.kind === "credits") {
      const jumlah = Math.max(0, Math.trunc(payment.credits ?? 0));
      if (jumlah > 0) await platform.tambahKreditAI(payment.tenantId, jumlah);
      return {
        diaktifkan: false,
        status: hasil,
        kreditDitambah: jumlah,
        catatan: `+${jumlah} kredit AI`,
      };
    }

    // Perpanjang dari sisa masa aktif, bukan dari hari ini — pelanggan yang
    // membayar lebih awal tidak kehilangan hari yang sudah dibayar.
    const mulai = Math.max(sub.currentPeriodEnd ?? 0, now);
    const berakhir = mulai + PERIODE_HARI * HARI;

    await platform.saveSubscription({
      ...sub,
      status: "active",
      planId: payment.planId,
      currentPeriodEnd: berakhir,
      // Periode baru → kuota AI mulai dari nol.
      aiRepliesUsed: 0,
      usageResetAt: now,
      lastOrderId: payment.orderId,
      updatedAt: now,
    });

    return {
      diaktifkan: true,
      status: hasil,
      catatan: `paket ${getPlan(payment.planId).name}, berlaku s/d ${new Date(berakhir).toISOString().slice(0, 10)}`,
    };
  }

  // Gagal/kedaluwarsa: JANGAN mencabut akses di sini. computeEntitlement yang
  // memutuskan dari tanggal — pelanggan mungkin masih punya sisa trial atau
  // periode berbayar yang sah.
  // Pembelian kredit yang gagal tidak boleh menyentuh status langganan sama
  // sekali — status "pending" di sana milik transaksi langganan yang lain.
  if ((hasil === "failed" || hasil === "expired") && !sudahLunas && payment.kind !== "credits") {
    const sub = await platform.getSubscription(payment.tenantId);
    if (sub && sub.status === "pending") {
      await platform.saveSubscription({ ...sub, status: "trial", updatedAt: Date.now() });
    }
  }

  return {
    diaktifkan: false,
    status: hasil,
    catatan: sudahLunas ? "sudah lunas sebelumnya (idempoten)" : `status ${hasil}`,
  };
}
