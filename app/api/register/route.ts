// ---------------------------------------------------------------------------
// POST /api/register → selesaikan onboarding: buat tenant + trial 3 hari.
// Wajib sudah login (ID token Firebase di header Authorization).
// ---------------------------------------------------------------------------
import { authErrorResponse, requireUser } from "@/lib/auth/server";
import { provisionTenant } from "@/lib/tenant/provision";
import { BOT_TEMPLATES } from "@/lib/bot/templates";
import type { BotTemplateId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    let body: Record<string, string | undefined>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const businessName = (body.businessName ?? "").trim();
    if (!businessName) {
      return Response.json({ error: "Nama bisnis wajib diisi." }, { status: 400 });
    }

    const templateId = (body.templateId ?? "custom") as BotTemplateId;
    if (!BOT_TEMPLATES[templateId]) {
      return Response.json({ error: "Template tidak dikenal." }, { status: 400 });
    }

    const { tenant, baru } = await provisionTenant(
      user,
      {
        businessName,
        businessType: body.businessType,
        templateId,
        phone: body.phone,
        address: body.address,
        hours: body.hours,
      },
      // Ruang kerja owner ditandai supaya tidak ikut terhitung sebagai mitra
      // di dasbor owner. Penandanya diambil dari claim pada token, bukan body.
      { platformOwner: user.owner === true },
    );

    return Response.json({ tenant, baru }, { status: baru ? 201 : 200 });
  } catch (err) {
    const r = authErrorResponse(err);
    if (r) return r;
    console.error("[register]", err);
    return Response.json({ error: "Gagal mendaftar." }, { status: 500 });
  }
}
