// GET /api/orders?status=baru → daftar pesanan tenant ini.
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status =
      statusParam && ORDER_STATUSES.includes(statusParam as OrderStatus)
        ? (statusParam as OrderStatus)
        : undefined;

    const ctx = await getTenantContext(request);
    const orders = await ctx.store.listOrders(status);
    return Response.json({ orders });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}
