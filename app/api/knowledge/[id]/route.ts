// DELETE /api/knowledge/[id] → hapus satu dokumen pengetahuan.
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, ctxParam: RouteContext<"/api/knowledge/[id]">) {
  try {
    const { id } = await ctxParam.params;
    const ctx = await getTenantContext(request);
    await ctx.store.deleteKnowledge(id);
    return Response.json({ ok: true });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menghapus" }, { status: 500 });
  }
}
