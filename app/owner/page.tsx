"use client";

// ---------------------------------------------------------------------------
// Ringkasan area owner.
//
// Penjagaan sesungguhnya ada di /api/owner/tenants (requireOwner). Kalau API
// menolak, halaman ini tidak punya apa pun untuk ditampilkan dan memulangkan
// pengunjung ke /owner/login — membuka URL ini langsung tidak membocorkan apa pun.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { KartuAngka, OwnerShell, PesanError } from "@/components/OwnerShell";
import { useAuth } from "@/lib/auth/context";
import {
  labelStatusMitra,
  muatDataOwner,
  perluLoginUlang,
  type DataOwner,
} from "@/lib/owner/api";
import { formatDateTime } from "@/lib/format";

export default function OwnerRingkasanPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DataOwner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    try {
      setError(null);
      setData(await muatDataOwner());
    } catch (err) {
      const pesan = (err as Error).message;
      if (perluLoginUlang(pesan)) {
        router.replace("/owner/login");
        return;
      }
      setError(pesan);
    } finally {
      setMemuat(false);
    }
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/owner/login");
      return;
    }
    void muat();
  }, [authLoading, user, muat, router]);

  if (authLoading || memuat) {
    return <div className="p-8 text-sm text-[var(--muted)]">Memuat…</div>;
  }

  const r = data?.ringkasan;
  // Mitra yang paling perlu diperhatikan: sudah terkunci, atau segera habis.
  const perluPerhatian = (data?.tenants ?? [])
    .filter((t) => t.locked === true || t.akanHabis)
    .slice(0, 5);

  return (
    <OwnerShell
      aksi={
        <button onClick={muat} className="btn btn-ghost text-white border-white/30">
          Muat ulang
        </button>
      }
    >
      {error && <PesanError>{error}</PesanError>}

      {r && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KartuAngka label="Total mitra" nilai={String(r.total)} />
            <KartuAngka label="Langganan aktif" nilai={String(r.aktif)} />
            <KartuAngka label="Masa percobaan" nilai={String(r.percobaan)} />
            <KartuAngka
              label="Terkunci"
              nilai={String(r.terkunci)}
              nada={r.terkunci > 0 ? "bahaya" : undefined}
            />
            <KartuAngka
              label="Pemakaian AI"
              nilai={r.totalPemakaianAI.toLocaleString("id-ID")}
              catatan="biaya platform"
            />
          </div>

          <section className="card p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-semibold">Perlu perhatian</h2>
              <Link href="/owner/mitra" className="text-sm text-[var(--wa-teal)] underline">
                Lihat semua mitra →
              </Link>
            </div>
            {perluPerhatian.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Tidak ada mitra yang terkunci atau mendekati jatuh tempo.
              </p>
            ) : (
              <ul className="text-sm divide-y divide-[var(--border)]">
                {perluPerhatian.map((t) => (
                  <li key={t.id} className="py-2.5 flex flex-wrap justify-between gap-2">
                    <div>
                      <div className="font-medium">{t.businessName}</div>
                      <div className="text-xs text-[var(--muted)]">{t.ownerEmail}</div>
                    </div>
                    <div className="text-right">
                      <div style={{ color: t.locked ? "#991b1b" : "#92400e" }}>
                        {labelStatusMitra(t.status)}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {t.berlakuSampai ? formatDateTime(t.berlakuSampai) : "—"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data && data.ruangInternal.length > 0 && (
            <p className="text-xs text-[var(--muted)]">
              {data.ruangInternal.length} ruang kerja internal pengelola tidak
              dihitung sebagai mitra ({data.ruangInternal.join(", ")}).
            </p>
          )}
          {data && data.langgananTanpaTenant.length > 0 && (
            <p className="text-xs text-[var(--muted)] mt-1">
              {data.langgananTanpaTenant.length} dokumen langganan tanpa tenant
              ({data.langgananTanpaTenant.join(", ")}) — biasanya sisa data demo.
            </p>
          )}

          <p className="text-xs text-[var(--muted)] mt-6">
            Angka pendapatan belum ditampilkan di sini: sumbernya harus Midtrans,
            bukan hitungan ulang sendiri. Kolom kosong lebih jujur daripada angka
            yang keliru.
          </p>
        </>
      )}
    </OwnerShell>
  );
}
