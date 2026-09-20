"use client";

// ---------------------------------------------------------------------------
// Daftar mitra (klien) Zavi — halaman khusus owner.
//
// Isinya data paling sensitif di aplikasi: seluruh basis pelanggan. Yang
// menjaganya adalah requireOwner() di /api/owner/tenants, bukan halaman ini.
// Pencarian dan penyaringan dikerjakan di browser karena jumlah mitra masih
// kecil; kalau nanti ribuan, pindahkan ke query server.
// ---------------------------------------------------------------------------

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OwnerShell, PesanError } from "@/components/OwnerShell";
import { useAuth } from "@/lib/auth/context";
import {
  labelStatusMitra,
  muatDataOwner,
  perluLoginUlang,
  type DataOwner,
  type Mitra,
} from "@/lib/owner/api";
import { formatDateTime } from "@/lib/format";

type Saringan = "semua" | "aktif" | "percobaan" | "terkunci";

const SARINGAN: { id: Saringan; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "aktif", label: "Aktif" },
  { id: "percobaan", label: "Percobaan" },
  { id: "terkunci", label: "Terkunci" },
];

function cocokSaringan(m: Mitra, s: Saringan): boolean {
  if (s === "semua") return true;
  if (s === "aktif") return m.status === "active";
  if (s === "percobaan") return m.status === "trial" || m.status === "pending";
  return m.locked === true;
}

export default function OwnerMitraPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DataOwner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [cari, setCari] = useState("");
  const [saringan, setSaringan] = useState<Saringan>("semua");

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

  const terlihat = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (data?.tenants ?? []).filter(
      (m) =>
        cocokSaringan(m, saringan) &&
        (!q ||
          m.businessName.toLowerCase().includes(q) ||
          m.ownerEmail.toLowerCase().includes(q) ||
          (m.whatsappNomor ?? "").toLowerCase().includes(q)),
    );
  }, [data, cari, saringan]);

  if (authLoading || memuat) {
    return <div className="p-8 text-sm text-[var(--muted)]">Memuat…</div>;
  }

  return (
    <OwnerShell
      aksi={
        <button onClick={muat} className="btn btn-ghost text-white border-white/30">
          Muat ulang
        </button>
      }
    >
      {error && <PesanError>{error}</PesanError>}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          className="input flex-1 min-w-[220px]"
          placeholder="Cari nama bisnis, email, atau nomor…"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
        <div className="flex gap-1">
          {SARINGAN.map((s) => (
            <button
              key={s.id}
              onClick={() => setSaringan(s.id)}
              className={`btn ${saringan === s.id ? "btn-primary" : "btn-ghost"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--muted)] mb-3">
        Menampilkan {terlihat.length} dari {data?.tenants.length ?? 0} mitra.
      </p>

      {terlihat.length === 0 ? (
        <div className="card p-5 text-sm text-[var(--muted)]">
          {(data?.tenants.length ?? 0) === 0
            ? "Belum ada mitra yang mendaftar."
            : "Tidak ada mitra yang cocok dengan pencarian ini."}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <Th>Mitra</Th>
                <Th>Paket</Th>
                <Th>Status</Th>
                <Th>Berlaku sampai</Th>
                <Th>Pemakaian AI</Th>
                <Th>WhatsApp</Th>
                <Th>Bergabung</Th>
              </tr>
            </thead>
            <tbody>
              {terlihat.map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                  <Td>
                    <div className="font-medium">{m.businessName}</div>
                    <div className="text-xs text-[var(--muted)]">{m.ownerEmail}</div>
                  </Td>
                  <Td>{m.planName ?? "—"}</Td>
                  <Td>
                    <span
                      className="inline-flex items-center gap-1.5 whitespace-nowrap"
                      style={{ color: m.locked ? "#991b1b" : "#166534" }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: m.locked ? "#f87171" : "var(--wa-green)" }}
                      />
                      {labelStatusMitra(m.status)}
                    </span>
                  </Td>
                  <Td>{m.berlakuSampai ? formatDateTime(m.berlakuSampai) : "—"}</Td>
                  <Td>
                    {m.aiRepliesUsed.toLocaleString("id-ID")} /{" "}
                    {m.aiRepliesLimit.toLocaleString("id-ID")}
                    {m.aiCreditsBalance > 0 && (
                      <div className="text-xs text-[var(--muted)]">
                        +{m.aiCreditsBalance.toLocaleString("id-ID")} kredit
                      </div>
                    )}
                  </Td>
                  <Td>
                    {m.whatsappTersambung ? (
                      <>
                        Tersambung
                        {m.whatsappNomor && (
                          <div className="text-xs text-[var(--muted)]">{m.whatsappNomor}</div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>{formatDateTime(m.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--muted)] mt-4">
        Halaman ini masih baca-saja. Perpanjangan langganan manual dan pemberian
        kredit menyusul.
      </p>
    </OwnerShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="font-medium px-4 py-2.5 whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
