// ---------------------------------------------------------------------------
// POST /api/payment/notification → webhook Midtrans (jalur cepat).
//
// Tugasnya sempit dan disengaja: verifikasi tanda tangan, lalu serahkan ke
// terapkanStatusPembayaran(). Perhitungan masa aktif TIDAK ada di sini supaya
// tidak pernah berbeda dengan jalur rekonsiliasi.
//
// Frontend tidak pernah dipercaya mengaktifkan langganan — pengguna bisa
// menutup popup lebih awal atau memanggil endpoint kita langsung.
//
// Daftarkan URL ini di Midtrans Dashboard → Settings → Configuration →
// Payment Notification URL.
// ---------------------------------------------------------------------------
import { terapkanStatusPembayaran } from "@/lib/billing/activate";
import {
  hasMidtrans,
  verifySignature,
  type MidtransNotification,
} from "@/lib/billing/midtrans";
import { getPlatformStore } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasMidtrans()) {
    console.error("[payment] notifikasi masuk tapi MIDTRANS_SERVER_KEY kosong.");
    return new Response("Not configured", { status: 503 });
  }

  let n: MidtransNotification;
  try {
    n = (await request.json()) as MidtransNotification;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (!verifySignature(n)) {
    // Bukan sekadar error — ini percobaan pemalsuan atau salah konfigurasi key.
    console.error(`[payment] TANDA TANGAN TIDAK SAH untuk order ${n.order_id} — ditolak.`);
    return new Response("Invalid signature", { status: 403 });
  }

  try {
    const platform = getPlatformStore();
    const payment = await platform.getPayment(n.order_id);
    if (!payment) {
      console.warn(`[payment] order tidak dikenal: ${n.order_id}`);
      // 200 supaya Midtrans tidak mengulang selamanya untuk order asing.
      return new Response("OK", { status: 200 });
    }

    const hasil = await terapkanStatusPembayaran(platform, payment, n);
    const label = hasil.diaktifkan
      ? `AKTIF: ${hasil.catatan}`
      : hasil.kreditDitambah
        ? `KREDIT: ${hasil.catatan}`
        : hasil.catatan;
    console.log(`[payment] ${payment.orderId} → ${hasil.status} | ${label}`);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[payment] gagal memproses notifikasi:", err);
    // 500 supaya Midtrans mencoba lagi — kegagalan kita, bukan kesalahan mereka.
    return new Response("Error", { status: 500 });
  }
}
