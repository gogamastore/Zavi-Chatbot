"use client";

import type { ReactNode } from "react";

/** Kerangka halaman login/daftar — tampil penuh tanpa sidebar. */
export function AuthShell({
  judul,
  sub,
  children,
}: {
  judul: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span
            className="inline-grid place-items-center w-12 h-12 rounded-2xl text-xl font-bold mb-3"
            style={{ background: "var(--wa-green)", color: "#053d36" }}
          >
            Z
          </span>
          <h1 className="text-2xl font-bold">{judul}</h1>
          <p className="text-sm text-[var(--muted)] mt-1">{sub}</p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}

export function Notice({
  children,
  nada = "info",
}: {
  children: ReactNode;
  nada?: "info" | "bahaya";
}) {
  const g =
    nada === "bahaya"
      ? { background: "#fef2f2", color: "#991b1b", border: "#fecaca" }
      : { background: "#eff6ff", color: "#1e40af", border: "#bfdbfe" };
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm mb-4 border"
      style={{ background: g.background, color: g.color, borderColor: g.border }}
    >
      {children}
    </div>
  );
}
