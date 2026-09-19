// GET /api/chats/[phone] → semua pesan untuk satu pelanggan.
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctxParam: RouteContext<"/api/chats/[phone]">) {
  try {
    const { phone } = await ctxParam.params;
    const ctx = await getTenantContext(request);
    // Batas besar: ini tampilan riwayat lengkap untuk admin, bukan konteks AI.
    const messages = await ctx.store.getChatsByPhone(decodeURIComponent(phone), 500);
    return Response.json({ messages });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}
