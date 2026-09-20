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
    // Ruang kerja pengelola Zavi sendiri bukan mitra. Dipisahkan supaya angka
    // "total mitra" tidak pernah menghitung akun internal.
    const mitra = tenants.filter((t) => !t.platformOwner);
    const ruangInternal = tenants.filter((t) => t.platformOwner).map((t) => t.id);

    const baris = mitra
      .map((t) => {
        const sub = perTenant.get(t.id) ?? null;
        const berlakuSampai = sub?.currentPeriodEnd ?? sub?.trialEndsAt ?? null;
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
          berlakuSampai,
          // "Segera habis" dihitung di SERVER supaya ada satu definisi saja,
          // dan supaya halaman tidak perlu memanggil Date.now() saat render.
          akanHabis:
            ent?.locked === false &&
            berlakuSampai !== null &&
            berlakuSampai - now < 7 * 86_400_000,
          aiRepliesUsed: ent?.aiRepliesUsed ?? 0,
          aiRepliesLimit: ent?.aiRepliesLimit ?? 0,
          aiCreditsBalance: ent?.aiCreditsBalance ?? 0,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    // Langganan tanpa tenant (mis. tenant demo) tidak ditampilkan sebagai mitra.
    const idTenant = new Set(tenants.map((t) => t.id));
    const yatim = subs.filter((s) => !idTenant.has(s.tenantId)).map((s) => s.tenantId);

    const hitung = (f: (b: (typeof baris)[number]) => boolean) => baris.filter(f).length;

    return Response.json({
      tenants: baris,
      ringkasan: {
        total: baris.length,
        aktif: hitung((b) => b.status === "active"),
        percobaan: hitung((b) => b.status === "trial" || b.status === "pending"),
        terkunci: hitung((b) => b.locked === true),
        akanHabis7Hari: hitung((b) => b.akanHabis),
        totalPemakaianAI: baris.reduce((n, b) => n + b.aiRepliesUsed, 0),
      },
      ruangInternal,
      langgananTanpaTenant: yatim,
    });
  } catch (err) {
    return (
      authErrorResponse(err) ??
      Response.json({ error: "Gagal memuat daftar klien." }, { status: 500 })
    );
  }
}
