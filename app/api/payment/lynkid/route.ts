// ---------------------------------------------------------------------------
// POST /api/payment/lynkid → webhook pembayaran Lynk.id (event payment.received).
//
// Lynk.id hanya menyediakan webhook. Tugas endpoint ini: verifikasi tanda
// tangan X-Lynk-Signature (SHA256 grandTotal+refId+message_id+merchantKey),
// kenali pembayaran itu milik tenant & paket mana, lalu serahkan ke
// terapkanKeadaanPembayaran() — SATU-SATUNYA tempat langganan diaktifkan
// (dipakai bersama Midtrans, supaya perhitungan masa aktif tidak pernah beda).
//
// Aktivasi: subscription tenant → "active", tanggal berakhir = tanggal mulai +
// 30 hari (mulai = sisa masa aktif kalau ada, kalau tidak, hari ini). Lihat
// lib/billing/activate.ts.
//
// Daftarkan URL ini (tanpa query apa pun) di Lynk.id → Integrasi → Webhook:
//   https://<domain>/api/payment/lynkid
// lalu simpan merchant key yang muncul ke LYNKID_WEBHOOK_SECRET.
// ---------------------------------------------------------------------------
import { terapkanKeadaanPembayaran } from "@/lib/billing/activate";
import {
  bacaEventLynkid,
  emailUntukCocok,
  tebakPlan,
  periksaTandaTanganLynkid,
} from "@/lib/billing/lynkid";
import { getPlan } from "@/lib/billing/plans";
import { hasLynkid } from "@/lib/config";
import { getPlatformStore } from "@/lib/db/store";
import type { Payment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Jadikan refId aman sebagai id dokumen Firestore. */
function orderIdDari(txnId: string): string {
  return "LYNKID-" + txnId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

export async function POST(request: Request) {
  if (!hasLynkid()) {
    console.error("[lynkid] webhook masuk tapi Lynk.id belum aktif / LYNKID_WEBHOOK_SECRET kosong.");
    return new Response("Not configured", { status: 503 });
  }

  const raw = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Verifikasi tanda tangan SEBELUM memproses apa pun.
  const signature = request.headers.get("x-lynk-signature");
  const periksa = periksaTandaTanganLynkid(payload, signature);
  if (!periksa.sah) {
    // Alasannya ikut dicetak: tanpa itu "kunci salah", "bentuk payload beda",
    // dan "header tidak terkirim" menghasilkan log yang sama persis.
    console.error(`[lynkid] X-Lynk-Signature TIDAK SAH — ditolak. ${periksa.alasan}`);
    return new Response("Invalid signature", { status: 403 });
  }

  try {
    const ev = bacaEventLynkid(payload);
    const platform = getPlatformStore();
    const orderId = orderIdDari(ev.txnId);

    // Idempotensi: kalau pembayaran ini sudah lunas, cukup akui.
    const existing = await platform.getPayment(orderId);
    if (existing?.status === "paid") {
      console.log(`[lynkid] ${orderId} sudah lunas sebelumnya (idempoten).`);
      return new Response("OK", { status: 200 });
    }

    // --- Kenali pembayaran ini milik siapa & paket apa --------------------
    let payment: Payment | null = existing ?? null;
    const email = emailUntukCocok(ev);

    if (!payment && email) {
      const tenant = await platform.getTenantByEmail(email);
      if (tenant) {
        // a) Pakai pembayaran pending terakhir tenant (paket sudah pasti benar).
        const sub = await platform.getSubscription(tenant.id);
        const pending = sub?.lastOrderId ? await platform.getPayment(sub.lastOrderId) : null;
        if (pending && pending.tenantId === tenant.id && pending.status !== "paid") {
          payment = pending;
        } else {
          // b) Buat catatan pembayaran baru; tebak paket dari judul/harga produk.
          const planId = tebakPlan(ev);
          if (!planId) {
            console.warn(
              `[lynkid] tenant ${tenant.id} ketemu tapi paket tak dikenal ` +
                `(produk="${ev.productTitle ?? ""}", harga=${ev.grossIdr ?? "?"}). ` +
                `Namai produk Lynk.id mengandung "basic"/"pro" atau samakan harganya dengan paket.`,
            );
            return new Response("OK", { status: 200 });
          }
          const now = Date.now();
          payment = {
            orderId,
            tenantId: tenant.id,
            provider: "lynkid",
            kind: "subscription",
            planId,
            amountIdr: ev.grossIdr ?? getPlan(planId).priceIdr,
            status: "pending",
            createdAt: now,
            updatedAt: now,
          };
          await platform.createPayment(payment);
        }
      }
    }

    if (!payment) {
      // Tidak bisa dikaitkan ke tenant. 200 supaya Lynk.id tidak mengulang
      // selamanya; catat keras supaya bisa direkonsiliasi manual.
      console.warn(
        `[lynkid] pembayaran ${ev.txnId} (${ev.hasil}) tidak bisa dikaitkan ke tenant ` +
          `(email="${email ?? "-"}").`,
      );
      return new Response("OK", { status: 200 });
    }

    // Pastikan penyedia tercatat (untuk pembayaran yang dibuat lewat create).
    if (payment.provider !== "lynkid") {
      await platform.updatePayment(payment.orderId, { provider: "lynkid" });
      payment = { ...payment, provider: "lynkid" };
    }

    const hasil = await terapkanKeadaanPembayaran(platform, payment, {
      hasil: ev.hasil,
      providerStatus: ev.providerStatus,
      paymentType: "lynkid",
    });

    console.log(
      `[lynkid] ${payment.orderId} → ${hasil.status} | ` +
        (hasil.diaktifkan ? `AKTIF: ${hasil.catatan}` : hasil.catatan),
    );
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[lynkid] gagal memproses webhook:", err);
    // 500 supaya Lynk.id mencoba lagi — kegagalan di sisi kita.
    return new Response("Error", { status: 500 });
  }
}
