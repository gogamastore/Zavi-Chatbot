"use client";

// ---------------------------------------------------------------------------
// Pembungkus fetch untuk memanggil API Zavi.
//
// Tugasnya dua: memasang ID token Firebase ke setiap request, dan menerjemahkan
// respons "fitur terkunci" (HTTP 402) jadi error yang bisa dikenali UI.
// ---------------------------------------------------------------------------

import { getFreshIdToken } from "@/lib/auth/context";
import type { Entitlement, FeatureKey } from "@/lib/types";

/** Dilempar saat server menolak karena langganan, bukan karena bug. */
export class TerkunciError extends Error {
  constructor(
    message: string,
    readonly feature?: FeatureKey,
    readonly entitlement?: Entitlement,
  ) {
    super(message);
    this.name = "TerkunciError";
  }
}

/** Dilempar saat sesi tidak sah / sudah kedaluwarsa. */
export class SesiError extends Error {
  constructor(message = "Sesi berakhir. Silakan login ulang.") {
    super(message);
    this.name = "SesiError";
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = await getFreshIdToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers, cache: "no-store" });

  // 204 / body kosong.
  const teks = await res.text();
  const data = teks ? safeJson(teks) : null;

  if (res.status === 402) {
    const d = data as { error?: string; feature?: FeatureKey; entitlement?: Entitlement } | null;
    throw new TerkunciError(d?.error ?? "Fitur terkunci.", d?.feature, d?.entitlement);
  }
  if (res.status === 401) {
    throw new SesiError((data as { error?: string } | null)?.error);
  }
  if (!res.ok) {
    const pesan = (data as { error?: string } | null)?.error ?? `Gagal (HTTP ${res.status})`;
    throw new Error(pesan);
  }

  return data as T;
}

function safeJson(teks: string): unknown {
  try {
    return JSON.parse(teks);
  } catch {
    return null;
  }
}
