// ---------------------------------------------------------------------------
// Endpoint simulator — menjalankan mesin bot yang SAMA dengan webhook WhatsApp,
// tapi mengembalikan balasan sebagai JSON untuk simulator di browser.
// ---------------------------------------------------------------------------
import { handleIncoming } from "@/lib/bot/engine";
import { getPlatformStore } from "@/lib/db/store";
import { contextErrorResponse, requireFeature } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let body: { phone?: string; name?: string; text?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const text = (body.text ?? "").trim();
    if (!text) return Response.json({ error: "text wajib diisi" }, { status: 400 });

    const ctx = await requireFeature(request, "simulator");
    const platform = getPlatformStore();

    const result = await handleIncoming(
      {
        phone: body.phone?.trim() || "6280000000001",
        name: body.name?.trim() || "Pengunjung",
        text,
      },
      {
        store: ctx.store,
        entitlement: ctx.entitlement,
        onAiUsed: async () => {
          await platform.konsumsiKuotaAI(ctx.tenant.id, ctx.entitlement.aiRepliesLimit);
        },
      },
    );

    return Response.json({
      reply: result.reply,
      source: result.source,
      intent: result.intent,
      needsHuman: result.needsHuman,
      orderCreated: result.orderCreated,
      aiSkipped: result.aiSkipped,
      at: result.outgoing.createdAt,
    });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memproses" }, { status: 500 });
  }
}
