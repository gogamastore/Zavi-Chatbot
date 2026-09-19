// GET /api/stats → ringkasan dashboard + status sistem + hak akses.
//
// Status AI di sini adalah kondisi SEBENARNYA (hasil panggilan/uji koneksi
// terakhir), bukan sekadar "API key terisi". Lihat lib/bot/ai-health.ts.
import { hasFirestore, hasWhatsApp } from "@/lib/config";
import { kesehatanAI, saranPerbaikan } from "@/lib/bot/ai-health";
import { storeKind } from "@/lib/db/store";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext(request);
    const [stats, ai] = await Promise.all([ctx.store.getStats(), kesehatanAI()]);

    return Response.json({
      stats,
      tenant: { id: ctx.tenant.id, businessName: ctx.tenant.businessName },
      entitlement: ctx.entitlement,
      system: {
        storage: storeKind(),
        firestore: hasFirestore(),
        whatsapp: hasWhatsApp(),
        demo: ctx.isDemo,
        ai: {
          ...ai,
          saran: saranPerbaikan(ai),
        },
      },
    });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}
