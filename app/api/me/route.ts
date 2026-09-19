// ---------------------------------------------------------------------------
// GET /api/me → siapa saya, bisnis saya, dan status langganan saya.
//
// Dipanggil oleh hook useSubscription() di setiap halaman. Sengaja TIDAK
// melempar error saat akun belum punya bisnis — sebaliknya mengembalikan
// needsRegistration:true supaya UI bisa mengarahkan ke onboarding.
// ---------------------------------------------------------------------------
import { getOptionalUser } from "@/lib/auth/server";
import { computeEntitlement, newTrialSubscription } from "@/lib/billing/entitlement";
import { PURCHASABLE_PLANS, TRIAL_DAYS, getPlan } from "@/lib/billing/plans";
import { hasFirestore } from "@/lib/config";
import { getPlatformStore } from "@/lib/db/store";
import { getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const paket = { plans: PURCHASABLE_PLANS, trialDays: TRIAL_DAYS };

  // Mode demo (tanpa Firestore / tanpa login yang diizinkan).
  const punyaHeader = Boolean(request.headers.get("authorization"));
  if (!hasFirestore() || !punyaHeader) {
    try {
      const ctx = await getTenantContext(request);
      return Response.json({
        authenticated: false,
        demo: ctx.isDemo,
        needsRegistration: false,
        tenant: ctx.tenant,
        subscription: ctx.subscription,
        entitlement: ctx.entitlement,
        plan: getPlan(ctx.subscription.planId),
        ...paket,
      });
    } catch {
      return Response.json({
        authenticated: false,
        demo: false,
        needsRegistration: false,
        needsLogin: true,
        ...paket,
      });
    }
  }

  const user = await getOptionalUser(request);
  if (!user) {
    return Response.json(
      { authenticated: false, needsLogin: true, ...paket },
      { status: 401 },
    );
  }

  const platform = getPlatformStore();
  const tenant = await platform.getTenantByUid(user.uid);
  if (!tenant) {
    // Sudah login, tapi belum menyelesaikan onboarding.
    return Response.json({
      authenticated: true,
      user,
      needsRegistration: true,
      ...paket,
    });
  }

  let sub = await platform.getSubscription(tenant.id);
  sub ??= await platform.saveSubscription(newTrialSubscription(tenant.id));

  return Response.json({
    authenticated: true,
    demo: false,
    needsRegistration: false,
    user,
    tenant,
    subscription: sub,
    entitlement: computeEntitlement(sub),
    plan: getPlan(sub.planId),
    ...paket,
  });
}
