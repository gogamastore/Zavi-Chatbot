// ---------------------------------------------------------------------------
// GET/PUT /api/bot-config → aturan & menu template bot milik tenant.
// Halaman "Bot Template" di dashboard memakai endpoint ini.
// ---------------------------------------------------------------------------
import { getTemplate } from "@/lib/bot/templates";
import type { BotConfig, BotRule, BotTemplateId } from "@/lib/types";
import { contextErrorResponse, getTenantContext, requireFeature } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext(request);
    let cfg = await ctx.store.getBotConfig();
    if (!cfg) {
      // Akun lama / demo: turunkan dari template tenant supaya UI tidak kosong.
      const t = getTemplate(ctx.tenant.templateId);
      cfg = {
        tenantId: ctx.tenant.id,
        templateId: t.id,
        rules: structuredClone(t.rules),
        menuOptions: structuredClone(t.menuOptions),
        updatedAt: Date.now(),
      };
    }
    return Response.json({ botConfig: cfg });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    let body: Partial<BotConfig> & { resetKeTemplate?: BotTemplateId };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const ctx = await requireFeature(request, "bot_template");

    // Minta preset baru: timpa aturan dengan isi template yang dipilih.
    if (body.resetKeTemplate) {
      const t = getTemplate(body.resetKeTemplate);
      const cfg: BotConfig = {
        tenantId: ctx.tenant.id,
        templateId: t.id,
        rules: structuredClone(t.rules),
        menuOptions: structuredClone(t.menuOptions),
        greeting: undefined,
        updatedAt: Date.now(),
      };
      const saved = await ctx.store.saveBotConfig(cfg);
      return Response.json({ botConfig: saved, direset: true });
    }

    const rules: BotRule[] = Array.isArray(body.rules)
      ? body.rules
          .filter((r) => r && r.intent?.trim() && r.reply?.trim())
          .map((r) => ({
            intent: r.intent.trim(),
            reply: r.reply.trim(),
            keywords: (r.keywords ?? [])
              .map((k) => String(k).toLowerCase().trim())
              .filter(Boolean),
            enabled: r.enabled !== false,
          }))
      : [];

    if (!rules.length) {
      return Response.json({ error: "Minimal satu aturan harus ada." }, { status: 400 });
    }

    const cfg: BotConfig = {
      tenantId: ctx.tenant.id,
      templateId: (body.templateId as BotTemplateId) ?? ctx.tenant.templateId,
      rules,
      menuOptions: Array.isArray(body.menuOptions)
        ? body.menuOptions.filter((m) => m?.id && m?.title)
        : [],
      greeting: body.greeting?.trim() || undefined,
      updatedAt: Date.now(),
    };

    const saved = await ctx.store.saveBotConfig(cfg);
    return Response.json({ botConfig: saved });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}
