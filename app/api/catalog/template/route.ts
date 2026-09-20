// GET /api/catalog/template → unduh berkas Excel contoh untuk diisi pengguna.
import { buatTemplate } from "@/lib/catalog/excel";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext(request);
    const buf = await buatTemplate(ctx.tenant.businessName);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="template-katalog-zavi.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal membuat template" }, { status: 500 });
  }
}
