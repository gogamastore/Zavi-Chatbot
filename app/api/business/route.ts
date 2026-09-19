// GET/PUT /api/business → baca atau ubah profil bisnis tenant ini.
import type { Business } from "@/lib/types";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext(request);
    const business = await ctx.store.getBusiness();
    return Response.json({ business });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    let body: Business;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }
    if (!body?.name || !body?.type) {
      return Response.json({ error: "Nama dan jenis bisnis wajib diisi" }, { status: 400 });
    }
    body.catalog = Array.isArray(body.catalog)
      ? body.catalog
          .filter((i) => i && i.name)
          .map((i) => ({ name: i.name, price: i.price ?? "", description: i.description || undefined }))
      : [];

    const ctx = await getTenantContext(request);
    const saved = await ctx.store.saveBusiness(body);
    return Response.json({ business: saved });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}
