/**
 * Cloud Functions untuk Zavi.
 *
 * PRINSIP YANG DIPEGANG DI SINI: function ini sengaja TIPIS.
 *
 * Seluruh logika langganan — kapan akun aktif, berapa lama diperpanjang,
 * bagaimana kuota di-reset — tinggal di satu tempat: `lib/billing/activate.ts`
 * pada aplikasi Next.js. Function ini hanya PEMICU terjadwal yang memanggil
 * endpoint di sana.
 *
 * Kenapa bukan memindahkan logikanya ke sini? Karena dua salinan aturan
 * langganan pasti akan menyimpang seiring waktu, dan akibatnya adalah bug
 * termahal di model bisnis berlangganan: pelanggan sudah membayar tapi
 * fiturnya terkunci. Satu sumber kebenaran lebih berharga daripada
 * menghemat satu lompatan jaringan.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions";
import * as logger from "firebase-functions/logger";

// Batas instance untuk menjaga biaya tetap terduga.
setGlobalOptions({ maxInstances: 10, region: "asia-southeast2" });

/** URL aplikasi Next.js, mis. https://zavi.app (tanpa garis miring akhir). */
const APP_URL = defineString("ZAVI_APP_URL");

/**
 * Rahasia bersama dengan CRON_SECRET di .env.local aplikasi.
 * Set dengan: firebase functions:secrets:set ZAVI_CRON_SECRET
 */
const CRON_SECRET = defineSecret("ZAVI_CRON_SECRET");

/**
 * Jaring pengaman pembayaran.
 *
 * Notifikasi Midtrans bisa hilang — server sedang redeploy, URL salah, atau
 * jaringan terganggu. Akibatnya pelanggan sudah membayar tapi akunnya tetap
 * terkunci. Pekerjaan ini menanyakan ulang status setiap pembayaran yang masih
 * tertunda, lalu mengaktifkan yang ternyata sudah lunas.
 *
 * Aman dijalankan berkali-kali: seluruh jalurnya idempoten.
 */
export const rekonsiliasiPembayaran = onSchedule(
  {
    // Tiap 30 menit. Cukup sering agar pelanggan tidak menunggu lama,
    // cukup jarang agar biaya dan kuota Midtrans tetap kecil.
    schedule: "*/30 * * * *",
    timeZone: "Asia/Jakarta",
    secrets: [CRON_SECRET],
    retryCount: 2,
  },
  async () => {
    const base = APP_URL.value().replace(/\/+$/, "");
    if (!base) {
      logger.error("ZAVI_APP_URL belum diisi — rekonsiliasi dilewati.");
      return;
    }

    const url = `${base}/api/payment/reconcile`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "X-Cron-Secret": CRON_SECRET.value(),
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      // Aplikasi sedang tidak bisa dihubungi. Bukan masalah besar: jadwal
      // berikutnya akan mencoba lagi, dan Midtrans juga masih mengulang
      // notifikasinya sendiri.
      logger.error("Gagal menghubungi aplikasi", { url, err: String(err) });
      throw err; // biarkan retry bawaan penjadwal bekerja
    }

    const teks = await res.text();
    if (!res.ok) {
      logger.error("Endpoint rekonsiliasi menolak", { status: res.status, teks: teks.slice(0, 300) });
      throw new Error(`Rekonsiliasi gagal: HTTP ${res.status}`);
    }

    let hasil: { diperiksa?: number; diaktifkan?: number } = {};
    try {
      hasil = JSON.parse(teks);
    } catch {
      logger.warn("Jawaban bukan JSON", { teks: teks.slice(0, 200) });
      return;
    }

    const diaktifkan = hasil.diaktifkan ?? 0;
    if (diaktifkan > 0) {
      // Layak dicatat keras: ini pembayaran yang nyaris tertinggal.
      logger.info(`MENYELAMATKAN ${diaktifkan} pembayaran yang notifikasinya hilang.`, hasil);
    } else {
      logger.debug("Rekonsiliasi selesai, tidak ada yang tertinggal.", hasil);
    }
  },
);
