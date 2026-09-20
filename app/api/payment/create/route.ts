// ---------------------------------------------------------------------------
// POST /api/payment/create → buat transaksi Midtrans Snap.
// Mengembalikan snapToken yang dipakai frontend membuka popup pembayaran.
//
// Dua jenis pembelian lewat endpoint yang sama:
//   { planId: "basic" }                      → langganan bulanan
//   { kind: "credits", packId: "kredit-250" } → kredit AI tambahan
//
// Harga SELALU diambil dari katalog di server, tidak pernah dari body — kalau
// jumlahnya boleh dikirim klien, siapa pun bisa membeli paket Pro seharga Rp 1.
// ---------------------------------------------------------------------------
import { CREDIT_PACKS, getCreditPack } from "@/lib/billing/credits";
import { getPlan, PURCHASABLE_PLANS } from "@/lib/billing/plans";
import { buatOrderId, createSnapTransaction, hasMidtrans } from "@/lib/billing/midtrans";
import { getPlatformStore } from "@/lib/db/store";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";
import type { Payment, PlanId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!hasMidtrans()) {
      return Response.json(
        { error: "Pembayaran belum dikonfigurasi di server." },
        { status: 503 },
      );
    }

    let body: { planId?: string; kind?: string; packId?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const beliKredit = body.kind === "credits";
    const planId = body.planId as PlanId;
    if (!beliKredit && !PURCHASABLE_PLANS.some((p) => p.id === planId)) {
      return Response.json({ error: "Paket tidak dikenal." }, { status: 400 });
    }

    const pack = beliKredit ? getCreditPack(body.packId ?? "") : null;
    if (beliKredit && !pack) {
      return Response.json(
        {
          error: "Paket kredit tidak dikenal.",
          tersedia: CREDIT_PACKS.map((p) => p.id),
        },
        { status: 400 },
      );
    }

    const ctx = await getTenantContext(request);
    if (ctx.isDemo) {
      return Response.json(
        { error: "Mode demo tidak bisa melakukan pembayaran. Silakan daftar akun." },
        { status: 403 },
      );
    }

    // Owner berada di luar sistem langganan — tidak ada yang perlu dibeli.
    // Membiarkannya membayar berarti menagih diri sendiri lewat Midtrans.
    if (ctx.user?.owner) {
      return Response.json(
        { error: "Akun owner tidak berlangganan — semua fitur sudah terbuka tanpa batas." },
        { status: 403 },
      );
    }

    // Kredit menambah kuota, bukan membuka kunci. Menjual kredit ke akun yang
    // terkunci sama dengan menerima uang untuk sesuatu yang tidak bisa dipakai
    // — tolak di sini, arahkan ke langganan dulu.
    if (beliKredit && ctx.entitlement.locked) {
      return Response.json(
        {
          error:
            "Kredit AI hanya bisa dipakai saat langganan aktif. Perpanjang langganan dulu, baru beli kredit.",
        },
        { status: 403 },
      );
    }

    const now = Date.now();
    let payment: Payment;

    if (pack) {
      const orderId = buatOrderId(ctx.tenant.id, "ZAVIKREDIT");
      const snap = await createSnapTransaction({
        orderId,
        amountIdr: pack.priceIdr,
        namaPaket: pack.name,
        keterangan: `${pack.credits.toLocaleString("id-ID")} balasan AI`,
        pelanggan: { nama: ctx.tenant.businessName, email: ctx.tenant.ownerEmail },
      });
      payment = {
        orderId,
        tenantId: ctx.tenant.id,
        kind: "credits",
        // Jejak audit: paket langganan yang sedang berjalan saat kredit dibeli.
        planId: ctx.subscription.planId,
        creditPackId: pack.id,
        credits: pack.credits,
        amountIdr: pack.priceIdr,
        status: "pending",
        snapToken: snap.token,
        snapRedirectUrl: snap.redirectUrl,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      const plan = getPlan(planId);
      const orderId = buatOrderId(ctx.tenant.id);
      const snap = await createSnapTransaction({
        orderId,
        amountIdr: plan.priceIdr,
        namaPaket: plan.name,
        pelanggan: { nama: ctx.tenant.businessName, email: ctx.tenant.ownerEmail },
      });
      payment = {
        orderId,
        tenantId: ctx.tenant.id,
        kind: "subscription",
        planId,
        amountIdr: plan.priceIdr,
        status: "pending",
        snapToken: snap.token,
        snapRedirectUrl: snap.redirectUrl,
        createdAt: now,
        updatedAt: now,
      };
    }

    const platform = getPlatformStore();
    await platform.createPayment(payment);

    // Hanya pembelian langganan yang menyentuh dokumen langganan. Beli kredit
    // tidak boleh mengubah status jadi "pending" — status itu milik alur
    // langganan, dan mengubahnya bisa mengacaukan masa aktif yang berjalan.
    if (payment.kind === "subscription") {
      await platform.saveSubscription({
        ...ctx.subscription,
        status: ctx.subscription.status === "active" ? "active" : "pending",
        lastOrderId: payment.orderId,
        updatedAt: now,
      });
    }

    return Response.json({
      orderId: payment.orderId,
      snapToken: payment.snapToken,
      redirectUrl: payment.snapRedirectUrl,
    });
  } catch (err) {
    const r = contextErrorResponse(err);
    if (r) return r;
    console.error("[payment/create]", err);
    return Response.json(
      { error: (err as Error).message || "Gagal membuat transaksi." },
      { status: 500 },
    );
  }
}
