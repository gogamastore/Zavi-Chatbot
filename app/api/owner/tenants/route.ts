// ---------------------------------------------------------------------------
// GET /api/owner/tenants → daftar semua klien beserta status langganannya.
//
// Ini data paling sensitif di seluruh aplikasi: seluruh basis pelanggan dalam
// satu respons. requireOwner() adalah baris pertama, sebelum apa pun dibaca.
// ---------------------------------------------------------------------------
import { authErrorResponse } from "@/lib/auth/server";
import { requireOwner } from "@/lib/auth/owner";
import { computeEntitlement } from "@/lib/billing/entitlement";
import { getPlatformStore } from "@/lib/db/store";
import { getPlan } from "@/lib/billing/plans";
import type { Subscription } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireOwner(request);

    const platform = getPlatformStore();
    const [tenants, subs] = await Promise.all([
      platform.listTenants(),
      platform.listSubscriptions(),
    ]);

    const perTenant = new Map<string, Subscription>();
    for (const s of subs) perTenant.set(s.tenantId, s);

    const now = Date.now();
    const baris = tenants
      .map((t) => {
        const sub = perTenant.get(t.id) ?? null;
        // Entitlement dihitung ulang, tidak dibaca dari database — supaya
        // yang owner lihat sama persis dengan yang dialami pelanggan.
        const ent = sub ? computeEntitlement(sub, now) : null;
        return {
          id: t.id,
          businessName: t.businessName,
          ownerEmail: t.ownerEmail,
          createdAt: t.createdAt,
          // Nomor lengkap bisnis ada di profil (subkoleksi), sengaja tidak
          // diambil di sini: satu query per tenant hanya untuk kolom tampilan.
          whatsappNomor: t.whatsappDisplayNumber ?? null,
          whatsappTersambung: Boolean(t.whatsappPhoneNumberId),
          planId: sub?.planId ?? null,
          planName: sub ? getPlan(sub.planId).name : null,
          status: ent?.status ?? null,
          locked: ent?.locked ?? null,
          berlakuSampai: sub?.currentPeriodEnd ?? sub?.trialEndsAt ?? null,
          aiRepliesUsed: ent?.aiRepliesUsed ?? 0,
          aiRepliesLimit: ent?.aiRepliesLimit ?? 0,
          aiCreditsBalance: ent?.aiCreditsBalance ?? 0,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    // Langganan tanpa tenant (mis. tenant demo) tidak ditampilkan sebagai klien,
    // tapi tetap dihitung supaya angka pemakaian AI platform tidak menyesatkan.
    const idTenant = new Set(tenants.map((t) => t.id));
    const yatim = subs.filter((s) => !idTenant.has(s.tenantId)).map((s) => s.tenantId);

    return Response.json({
      tenants: baris,
      ringkasan: {
        total: baris.length,
        aktif: baris.filter((b) => b.status === "active").length,
        percobaan: baris.filter((b) => b.status === "trial").length,
        terkunci: baris.filter((b) => b.locked === true).length,
        totalPemakaianAI: baris.reduce((n, b) => n + b.aiRepliesUsed, 0),
      },
      langgananTanpaTenant: yatim,
    });
  } catch (err) {
    return (
      authErrorResponse(err) ??
      Response.json({ error: "Gagal memuat daftar klien." }, { status: 500 })
    );
  }
}
