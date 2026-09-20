"use client";

// ---------------------------------------------------------------------------
// Kerangka halaman area owner: header, navigasi antar halaman pengelola, dan
// tombol keluar. Sidebar pelanggan sengaja tidak muncul di sini — menunya
// milik satu tenant, sedangkan owner mengurus seluruh platform.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/context";

const NAV = [
  { href: "/owner", label: "Ringkasan" },
  { href: "/owner/mitra", label: "Mitra" },
];

export function OwnerShell({
  children,
  aksi,
}: {
  children: ReactNode;
  /** Tombol tambahan di kanan header, mis. "Muat ulang". */
  aksi?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  async function keluar() {
    await logout();
    router.replace("/owner/login");
  }

  return (
    <div className="min-h-screen">
      <header className="text-white" style={{ background: "var(--wa-teal)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-8 pt-4">
          <div>
            <div className="font-bold">Zavi · Area Owner</div>
            <div className="text-xs text-white/60">{user?.email}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {aksi}
            <Link href="/" className="btn btn-ghost text-white border-white/30">
              Buka aplikasi
            </Link>
            <button onClick={keluar} className="btn btn-ghost text-white border-white/30">
              Keluar
            </button>
          </div>
        </div>
        <nav className="flex gap-1 px-4 md:px-8 pt-3">
          {NAV.map((n) => {
            const aktif = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 text-sm rounded-t-lg ${
                  aktif ? "bg-[var(--bg)] text-[var(--fg)] font-medium" : "text-white/75 hover:bg-white/10"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="p-4 md:p-8 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}

export function KartuAngka({
  label,
  nilai,
  catatan,
  nada,
}: {
  label: string;
  nilai: string;
  catatan?: string;
  nada?: "bahaya" | "perhatian";
}) {
  const warna =
    nada === "bahaya" ? "#991b1b" : nada === "perhatian" ? "#92400e" : undefined;
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="text-2xl font-bold mt-1" style={warna ? { color: warna } : undefined}>
        {nilai}
      </div>
      {catatan && <div className="text-[11px] text-[var(--muted)] mt-0.5">{catatan}</div>}
    </div>
  );
}

export function PesanError({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg px-4 py-2.5 text-sm mb-5 border"
      style={{ background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" }}
    >
      {children}
    </div>
  );
}
