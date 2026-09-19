"use client";

// ---------------------------------------------------------------------------
// Komponen penguncian fitur: spanduk masa percobaan + pembungkus fitur
// terkunci. Dipakai halaman-halaman dashboard agar pesan langganan konsisten.
// ---------------------------------------------------------------------------

import Link from "next/link";
import type { ReactNode } from "react";
import type { FeatureKey } from "@/lib/types";
import { useSubscription } from "@/lib/hooks/useSubscription";

/** Spanduk status langganan. Menghilang sendiri saat langganan aman. */
export function TrialBanner() {
  const { entitlement, loading, isDemo } = useSubscription();
  if (loading || !entitlement || isDemo) return null;

  const { status, locked, trialEndingSoon } = entitlement;
  // Tidak perlu mengganggu pengguna yang langganannya sehat.
  if (status === "active" && !trialEndingSoon) return null;
  if (status === "trial" && !trialEndingSoon) {
    return (
      <Banner nada="info">
        {entitlement.reason}{" "}
        <Link href="/langganan" className="underline font-medium">
          Lihat paket
        </Link>
      </Banner>
    );
  }

  return (
    <Banner nada={locked ? "bahaya" : "peringatan"}>
      {entitlement.reason}{" "}
      <Link href="/langganan" className="underline font-medium">
        {locked ? "Berlangganan sekarang" : "Perpanjang"}
      </Link>
    </Banner>
  );
}

function Banner({ nada, children }: { nada: "info" | "peringatan" | "bahaya"; children: ReactNode }) {
  const gaya = {
    info: { background: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    peringatan: { background: "#fffbeb", color: "#92400e", border: "#fde68a" },
    bahaya: { background: "#fef2f2", color: "#991b1b", border: "#fecaca" },
  }[nada];

  return (
    <div
      className="rounded-lg px-4 py-2.5 text-sm mb-5 border"
      style={{ background: gaya.background, color: gaya.color, borderColor: gaya.border }}
      role="status"
    >
      {children}
    </div>
  );
}

/**
 * Bungkus konten yang butuh satu fitur tertentu. Kalau terkunci, tampilkan
 * ajakan berlangganan alih-alih kontennya.
 */
export function FeatureGate({
  feature,
  judul,
  children,
}: {
  feature: FeatureKey;
  judul?: string;
  children: ReactNode;
}) {
  const { can, loading, entitlement } = useSubscription();

  if (loading) {
    return <div className="text-sm text-[var(--muted)] py-8 text-center">Memuat…</div>;
  }
  if (can(feature)) return <>{children}</>;

  return (
    <div className="card p-8 text-center">
      <div className="text-4xl mb-3">🔒</div>
      <h2 className="font-semibold text-lg mb-1">{judul ?? "Fitur terkunci"}</h2>
      <p className="text-sm text-[var(--muted)] max-w-md mx-auto mb-5">
        {entitlement?.reason ?? "Fitur ini tersedia untuk pelanggan berlangganan."}
      </p>
      <Link href="/langganan" className="btn btn-primary">
        Lihat paket langganan
      </Link>
    </div>
  );
}
