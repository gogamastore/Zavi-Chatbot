// ---------------------------------------------------------------------------
// POST /api/payment/create → buat transaksi Midtrans Snap untuk satu paket.
// Mengembalikan snapToken yang dipakai frontend membuka popup pembayaran.
// ---------------------------------------------------------------------------
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

    let body: { planId?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const planId = body.planId as PlanId;
    if (!PURCHASABLE_PLANS.some((p) => p.id === planId)) {
      return Response.json({ error: "Paket tidak dikenal." }, { status: 400 });
    }

    const ctx = await getTenantContext(request);
    if (ctx.isDemo) {
      return Response.json(
        { error: "Mode demo tidak bisa melakukan pembayaran. Silakan daftar akun." },
        { status: 403 },
      );
    }

    const plan = getPlan(planId);
    const orderId = buatOrderId(ctx.tenant.id);

    const snap = await createSnapTransaction({
      orderId,
      amountIdr: plan.priceIdr,
      namaPaket: plan.name,
      pelanggan: {
        nama: ctx.tenant.businessName,
        email: ctx.tenant.ownerEmail,
      },
    });

    const now = Date.now();
    const payment: Payment = {
      orderId,
      tenantId: ctx.tenant.id,
      planId,
      amountIdr: plan.priceIdr,
      status: "pending",
      snapToken: snap.token,
      snapRedirectUrl: snap.redirectUrl,
      createdAt: now,
      updatedAt: now,
    };

    const platform = getPlatformStore();
    await platform.createPayment(payment);

    // Tandai langganan sedang menunggu pembayaran. Akses TIDAK berubah di sini
    // — hanya webhook notifikasi yang boleh membuka fitur.
    await platform.saveSubscription({
      ...ctx.subscription,
      status: ctx.subscription.status === "active" ? "active" : "pending",
      lastOrderId: orderId,
      updatedAt: now,
    });

    return Response.json({ orderId, snapToken: snap.token, redirectUrl: snap.redirectUrl });
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
