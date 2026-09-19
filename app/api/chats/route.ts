// GET /api/chats → daftar percakapan (dikelompokkan per nomor) milik tenant ini.
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext(request);
    const conversations = await ctx.store.listConversations();
    return Response.json({ conversations });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}
