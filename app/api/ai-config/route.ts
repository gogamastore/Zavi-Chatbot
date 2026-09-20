// ---------------------------------------------------------------------------
// GET/PUT /api/ai-config → pengaturan AI milik tenant (halaman Pengaturan AI).
// ---------------------------------------------------------------------------
import { kesehatanAI, saranPerbaikan } from "@/lib/bot/ai-health";
import type { AIConfig, AIProvider } from "@/lib/types";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS: AIProvider[] = ["none", "anthropic", "gemini"];

function bawaan(tenantId: string): AIConfig {
  return {
    tenantId,
    enabled: true,
    provider: "none",
    tone: 'Ramah, sopan, singkat. Panggil pelanggan dengan "Kak".',
    escalateWhenUnsure: true,
    historyLimit: 20,
    updatedAt: Date.now(),
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext(request);
    const [cfg, ai] = await Promise.all([
      ctx.store.getAIConfig().then((c) => c ?? bawaan(ctx.tenant.id)),
      kesehatanAI(),
    ]);
    return Response.json({
      aiConfig: cfg,
      // Kondisi SEBENARNYA penyedia di server, bukan sekadar "key terisi".
      server: { ...ai, saran: saranPerbaikan(ai) },
      quota: {
        used: ctx.entitlement.aiRepliesUsed,
        limit: ctx.entitlement.aiRepliesLimit,
        credits: ctx.entitlement.aiCreditsBalance,
        remaining: ctx.entitlement.aiRepliesRemaining,
        exceeded: ctx.entitlement.aiQuotaExceeded,
      },
    });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    let body: Partial<AIConfig>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const ctx = await getTenantContext(request);
    const provider = PROVIDERS.includes(body.provider as AIProvider)
      ? (body.provider as AIProvider)
      : "none";

    // Batas riwayat dijaga: terlalu besar = biaya token membengkak.
    const historyLimit = Math.min(Math.max(Number(body.historyLimit) || 20, 2), 100);

    const cfg: AIConfig = {
      tenantId: ctx.tenant.id,
      enabled: body.enabled !== false,
      provider,
      model: body.model?.trim() || undefined,
      tone: body.tone?.trim() || undefined,
      customInstructions: body.customInstructions?.trim() || undefined,
      escalateWhenUnsure: body.escalateWhenUnsure !== false,
      historyLimit,
      updatedAt: Date.now(),
    };

    const saved = await ctx.store.saveAIConfig(cfg);
    return Response.json({ aiConfig: saved });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}
