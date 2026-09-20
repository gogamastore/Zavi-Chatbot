"use client";

// ---------------------------------------------------------------------------
// useSubscription() — hook penguncian fitur.
//
// Inilah pintu yang dipakai seluruh UI untuk bertanya "fitur ini boleh dipakai
// atau tidak". Begitu pembayaran masuk dan langganan jadi aktif, hook ini
// otomatis melihat status baru dan semua fitur terbuka sendiri — tidak ada
// yang perlu diubah di tiap halaman.
//
// PENTING: hook ini hanya mengatur TAMPILAN. Penegakan sesungguhnya ada di
// server (requireFeature di API route). Jangan pernah jadikan hook ini
// satu-satunya penjaga — pengguna bisa memanggil API langsung.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import type {
  Entitlement,
  FeatureKey,
  Plan,
  Subscription,
  Tenant,
} from "@/lib/types";

interface MeResponse {
  authenticated: boolean;
  demo?: boolean;
  owner?: boolean;
  needsLogin?: boolean;
  needsRegistration?: boolean;
  tenant?: Tenant;
  subscription?: Subscription;
  entitlement?: Entitlement;
  plan?: Plan;
  plans: Plan[];
  trialDays: number;
}

export interface UseSubscription {
  loading: boolean;
  error: string | null;

  tenant: Tenant | null;
  subscription: Subscription | null;
  entitlement: Entitlement | null;
  plan: Plan | null;
  /** Paket yang bisa dibeli, untuk halaman harga. */
  plans: Plan[];

  /** Sudah login tapi belum menyelesaikan onboarding bisnis. */
  needsRegistration: boolean;
  /** Belum login sama sekali. */
  needsLogin: boolean;
  /** Berjalan tanpa login (demo lokal). */
  isDemo: boolean;
  /** Akun pengelola Zavi: di luar sistem langganan, akses tanpa batas. */
  isOwner: boolean;

  /** Semua fitur berbayar terkunci. */
  locked: boolean;
  trialDaysLeft: number;
  trialEndingSoon: boolean;

  /** Tanya satu fitur: boleh dipakai? */
  can(feature: FeatureKey): boolean;
  /** Muat ulang status — panggil setelah pembayaran selesai. */
  refresh(): Promise<void>;
}

export function useSubscription(): UseSubscription {
  const { user, loading: authLoading, authEnabled } = useAuth();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch<MeResponse>("/api/me");
      setData(res);
    } catch (err) {
      // 401 bukan kesalahan sistem — artinya memang belum login.
      if ((err as Error).name === "SesiError") {
        setData({ authenticated: false, needsLogin: true, plans: [], trialDays: 3 });
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Tunggu status login selesai ditentukan, supaya tidak memanggil /api/me
    // tanpa token lalu keliru menyimpulkan "belum login".
    if (authEnabled && authLoading) return;
    void load();
  }, [authEnabled, authLoading, user?.uid, load]);

  const ent = data?.entitlement ?? null;

  const can = useCallback(
    (feature: FeatureKey) => ent?.features?.[feature] === true,
    [ent],
  );

  return {
    loading: loading || (authEnabled && authLoading),
    error,
    tenant: data?.tenant ?? null,
    subscription: data?.subscription ?? null,
    entitlement: ent,
    plan: data?.plan ?? null,
    plans: data?.plans ?? [],
    needsRegistration: Boolean(data?.needsRegistration),
    needsLogin: Boolean(data?.needsLogin),
    isDemo: Boolean(data?.demo),
    isOwner: Boolean(data?.owner),
    locked: ent?.locked ?? false,
    trialDaysLeft: ent?.trialDaysLeft ?? 0,
    trialEndingSoon: ent?.trialEndingSoon ?? false,
    can,
    refresh: load,
  };
}
