// GET /api/payment/status?orderId=... → status satu pembayaran.
// Dipakai frontend setelah popup Snap ditutup, karena notifikasi server-to-server
// bisa tiba beberapa detik kemudian.
import { getPlatformStore } from "@/lib/db/store";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const orderId = new URL(request.url).searchParams.get("orderId");
    if (!orderId) return Response.json({ error: "orderId wajib diisi" }, { status: 400 });

    const ctx = await getTenantContext(request);
    const payment = await getPlatformStore().getPayment(orderId);

    // Jangan pernah membocorkan pembayaran milik tenant lain.
    if (!payment || payment.tenantId !== ctx.tenant.id) {
      return Response.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 });
    }

    return Response.json({ payment, entitlement: ctx.entitlement });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}
