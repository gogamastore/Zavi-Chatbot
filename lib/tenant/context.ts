// ---------------------------------------------------------------------------
// Konteks tenant per request.
//
// Satu pintu masuk untuk API route: dari sebuah Request, hasilkan siapa
// penggunanya, tenant miliknya, status langganannya, dan store yang sudah
// ter-scope. Semua penjagaan akses bertumpu pada fungsi di file ini.
//
// tenantId SELALU diturunkan dari ID token, tidak pernah dari body/query.
// ---------------------------------------------------------------------------
import { AuthError, requireUser, type AuthUser } from "@/lib/auth/server";
import {
  computeEntitlement,
  newTrialSubscription,
  ownerEntitlement,
} from "@/lib/billing/entitlement";
import { pastikanRuangKerjaOwner } from "@/lib/tenant/provision";
import { hasFirestore } from "@/lib/config";
import {
  DEMO_TENANT_ID,
  getPlatformStore,
  getStore,
  type Store,
} from "@/lib/db/store";
import type { Entitlement, FeatureKey, Subscription, Tenant } from "@/lib/types";

export interface TenantContext {
  user: AuthUser | null;
  tenant: Tenant;
  subscription: Subscription;
  entitlement: Entitlement;
  store: Store;
  /** True saat berjalan tanpa login (mode demo lokal). */
  isDemo: boolean;
}

/**
 * Mode demo: aplikasi jalan tanpa login, memakai satu tenant "demo".
 *
 * Sengaja dijaga dua lapis — hanya aktif di luar produksi DAN hanya kalau
 * ALLOW_DEMO_TENANT diset. Kalau tidak, satu salah konfigurasi bisa membuka
 * dashboard semua orang tanpa login.
 */
function demoDiizinkan(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEMO_TENANT === "true"
  );
}

function demoTenant(): Tenant {
  const now = Date.now();
  return {
    id: DEMO_TENANT_ID,
    ownerUid: "demo",
    ownerEmail: "demo@zavi.local",
    businessName: "Demo",
    templateId: "resto",
    createdAt: now,
    updatedAt: now,
  };
}

async function demoContext(): Promise<TenantContext> {
  const platform = getPlatformStore();
  let sub = await platform.getSubscription(DEMO_TENANT_ID);
  if (!sub) {
    // Demo selalu dianggap berlangganan aktif supaya fitur tidak terkunci
    // saat sedang dipamerkan ke calon klien.
    const base = newTrialSubscription(DEMO_TENANT_ID);
    sub = await platform.saveSubscription({
      ...base,
      status: "active",
      planId: "pro",
      currentPeriodEnd: Date.now() + 365 * 86_400_000,
    });
  }
  return {
    user: null,
    tenant: demoTenant(),
    subscription: sub,
    entitlement: computeEntitlement(sub),
    store: getStore(DEMO_TENANT_ID),
    isDemo: true,
  };
}

/**
 * Konteks tenant untuk request ini. Melempar AuthError kalau belum login atau
 * akunnya belum punya bisnis terdaftar.
 */
export async function getTenantContext(request: Request): Promise<TenantContext> {
  // Tanpa Firestore tidak ada tempat menyimpan tenant → mode demo.
  if (!hasFirestore()) return demoContext();

  // Firestore aktif tapi belum login: izinkan demo hanya bila sengaja dinyalakan.
  const authHeader = request.headers.get("authorization");
  if (!authHeader && demoDiizinkan()) return demoContext();

  const user = await requireUser(request);
  const platform = getPlatformStore();

  // Owner tidak melewati onboarding pelanggan: ruang kerjanya dibuatkan sekali
  // saat pertama dipakai, supaya semua fitur bisa langsung dicoba.
  const tenant = user.owner
    ? await pastikanRuangKerjaOwner(user)
    : await platform.getTenantByUid(user.uid);

  if (!tenant) {
    throw new AuthError(
      "Akun ini belum punya bisnis terdaftar. Selesaikan pendaftaran dulu.",
      403,
    );
  }

  let sub = await platform.getSubscription(tenant.id);
  if (!sub) {
    // Jaring pengaman: tenant ada tapi langganannya hilang → mulai trial baru.
    sub = await platform.saveSubscription(newTrialSubscription(tenant.id));
  }

  return {
    user,
    tenant,
    subscription: sub,
    // Owner tidak pernah terkunci dan tidak pernah kehabisan kuota — kalau
    // tidak, pengelola bisa terhalang menguji produknya sendiri.
    entitlement: user.owner ? ownerEntitlement(sub) : computeEntitlement(sub),
    store: getStore(tenant.id),
    isDemo: false,
  };
}

/** Dilempar saat fitur terkunci karena langganan. */
export class FeatureLockedError extends Error {
  constructor(
    readonly feature: FeatureKey,
    readonly entitlement: Entitlement,
  ) {
    super(entitlement.reason);
    this.name = "FeatureLockedError";
  }
}

/** Konteks tenant + pastikan satu fitur boleh dipakai. */
export async function requireFeature(
  request: Request,
  feature: FeatureKey,
): Promise<TenantContext> {
  const ctx = await getTenantContext(request);
  if (!ctx.entitlement.features[feature]) {
    throw new FeatureLockedError(feature, ctx.entitlement);
  }
  return ctx;
}

/**
 * Ubah error yang dikenal jadi Response JSON. Kembalikan null kalau errornya
 * bukan urusan auth/langganan, supaya caller bisa melemparnya lagi.
 */
export function contextErrorResponse(err: unknown): Response | null {
  if (err instanceof FeatureLockedError) {
    return Response.json(
      {
        error: err.message,
        locked: true,
        feature: err.feature,
        entitlement: err.entitlement,
      },
      { status: 402 }, // 402 Payment Required — tepat untuk kasus ini.
    );
  }
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
