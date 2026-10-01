// ---------------------------------------------------------------------------
// POST /api/payment/lynkid/create → mulai pembelian langganan via Lynk.id.
//
// Lynk.id tidak punya API pembuatan invoice, jadi endpoint ini hanya:
//   1. mencatat pembayaran "pending" milik tenant (paket sudah pasti benar),
//   2. menandai langganan "pending",
//   3. mengembalikan link checkout Lynk.id untuk paket tersebut.
//
// Pengaktifan sebenarnya terjadi belakangan lewat webhook /api/payment/lynkid.
// ---------------------------------------------------------------------------
import { getPlan, PURCHASABLE_PLANS } from "@/lib/billing/plans";
import { buatOrderId } from "@/lib/billing/midtrans";
import { hasLynkid, lynkidLinkFor } from "@/lib/config";
import { getPlatformStore } from "@/lib/db/store";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";
import type { Payment, PlanId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sisipkan ref sebagai query param, kalau-kalau Lynk.id meneruskannya ke webhook. */
function linkDenganRef(link: string, ref: string): string {
  try {
    const u = new URL(link);
    u.searchParams.set("ref", ref);
    return u.toString();
  } catch {
    return link;
  }
}

export async function POST(request: Request) {
  try {
    if (!hasLynkid()) {
      return Response.json(
        { error: "Pembayaran Lynk.id belum dikonfigurasi di server." },
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

    const link = lynkidLinkFor(planId);
    if (!link) {
      return Response.json(
        {
          error: `Link pembayaran Lynk.id untuk paket ${planId} belum diatur (LYNKID_LINK_${planId.toUpperCase()}).`,
        },
        { status: 503 },
      );
    }

    const ctx = await getTenantContext(request);
    if (ctx.isDemo) {
      return Response.json(
        { error: "Mode demo tidak bisa melakukan pembayaran. Silakan daftar akun." },
        { status: 403 },
      );
    }
    if (ctx.user?.owner) {
      return Response.json(
        { error: "Akun owner tidak berlangganan — semua fitur sudah terbuka." },
        { status: 403 },
      );
    }

    const plan = getPlan(planId);
    const orderId = buatOrderId(ctx.tenant.id, "ZAVILYNK");
    const now = Date.now();
    const checkoutUrl = linkDenganRef(link, orderId);

    const payment: Payment = {
      orderId,
      tenantId: ctx.tenant.id,
      provider: "lynkid",
      kind: "subscription",
      planId,
      amountIdr: plan.priceIdr,
      status: "pending",
      checkoutUrl,
      createdAt: now,
      updatedAt: now,
    };

    const platform = getPlatformStore();
    await platform.createPayment(payment);
    await platform.saveSubscription({
      ...ctx.subscription,
      status: ctx.subscription.status === "active" ? "active" : "pending",
      lastOrderId: orderId,
      updatedAt: now,
    });

    return Response.json({ orderId, checkoutUrl });
  } catch (err) {
    const r = contextErrorResponse(err);
    if (r) return r;
    console.error("[payment/lynkid/create]", err);
    return Response.json(
      { error: (err as Error).message || "Gagal memulai pembayaran." },
      { status: 500 },
    );
  }
}
