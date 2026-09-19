// PATCH /api/orders/[id] → ubah status pesanan.
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctxParam: RouteContext<"/api/orders/[id]">) {
  try {
    const { id } = await ctxParam.params;
    let body: { status?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const status = body.status as OrderStatus;
    if (!status || !ORDER_STATUSES.includes(status)) {
      return Response.json(
        { error: `status harus salah satu dari: ${ORDER_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const ctx = await getTenantContext(request);
    const updated = await ctx.store.updateOrderStatus(id, status);
    if (!updated) return Response.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    return Response.json({ order: updated });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}
