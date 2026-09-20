"use client";

// ---------------------------------------------------------------------------
// Dasbor owner: daftar seluruh klien Zavi + status langganannya.
//
// Penjagaan sesungguhnya ada di /api/owner/tenants (requireOwner). Kalau API
// menolak, halaman ini tidak punya apa pun untuk ditampilkan dan memulangkan
// pengunjung ke /owner/login. Jadi mematikan JavaScript atau membuka URL ini
// langsung tidak membocorkan apa-apa.
// ---------------------------------------------------------------------------

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { apiFetch } from "@/lib/api/client";
import { formatIdr } from "@/lib/billing/plans";
import { formatDateTime } from "@/lib/format";

interface BarisKlien {
  id: string;
  businessName: string;
  ownerEmail: string;
  createdAt: number;
  whatsappNomor: string | null;
  whatsappTersambung: boolean;
  planId: string | null;
  planName: string | null;
  status: string | null;
  locked: boolean | null;
  berlakuSampai: number | null;
  aiRepliesUsed: number;
  aiRepliesLimit: number;
  aiCreditsBalance: number;
}

interface Jawaban {
  tenants: BarisKlien[];
  ringkasan: {
    total: number;
    aktif: number;
    percobaan: number;
    terkunci: number;
    totalPemakaianAI: number;
  };
  langgananTanpaTenant: string[];
}

const LABEL_STATUS: Record<string, string> = {
  trial: "Percobaan",
  trial_ended: "Percobaan habis",
  pending: "Menunggu bayar",
  active: "Aktif",
  past_due: "Jatuh tempo",
  expired: "Berakhir",
};

export default function OwnerPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<Jawaban | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    try {
      setError(null);
      setData(await apiFetch<Jawaban>("/api/owner/tenants"));
    } catch (err) {
      const pesan = (err as Error).message;
      // 401/403 → bukan owner (atau sesi habis). Pulangkan ke login owner.
      if (/tidak punya akses|Belum login|Sesi/i.test(pesan)) {
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

  async function keluar() {
    await logout();
    router.replace("/owner/login");
  }

  if (authLoading || memuat) {
    return <div className="p-8 text-sm text-[var(--muted)]">Memuat…</div>;
  }

  return (
    <div className="min-h-screen">
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-8 py-4 text-white"
        style={{ background: "var(--wa-teal)" }}
      >
        <div>
          <div className="font-bold">Zavi · Area Owner</div>
          <div className="text-xs text-white/60">{user?.email}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={muat} className="btn btn-ghost text-white border-white/30">
            Muat ulang
          </button>
          <button onClick={keluar} className="btn btn-ghost text-white border-white/30">
            Keluar
          </button>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-6xl mx-auto">
        {error && (
          <div
            className="rounded-lg px-4 py-2.5 text-sm mb-5 border"
            style={{ background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" }}
          >
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <Kartu label="Total klien" nilai={String(data.ringkasan.total)} />
              <Kartu label="Langganan aktif" nilai={String(data.ringkasan.aktif)} />
              <Kartu label="Masa percobaan" nilai={String(data.ringkasan.percobaan)} />
              <Kartu label="Terkunci" nilai={String(data.ringkasan.terkunci)} />
              <Kartu
                label="Pemakaian AI"
                nilai={data.ringkasan.totalPemakaianAI.toLocaleString("id-ID")}
                catatan="biaya platform"
              />
            </div>

            <h2 className="font-semibold text-lg mb-3">Klien</h2>
            {data.tenants.length === 0 ? (
              <div className="card p-5 text-sm text-[var(--muted)]">
                Belum ada klien yang mendaftar.
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                      <Th>Bisnis</Th>
                      <Th>Paket</Th>
                      <Th>Status</Th>
                      <Th>Berlaku sampai</Th>
                      <Th>Pemakaian AI</Th>
                      <Th>WhatsApp</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tenants.map((t) => (
                      <tr key={t.id} className="border-b border-[var(--border)] last:border-0">
                        <Td>
                          <div className="font-medium">{t.businessName}</div>
                          <div className="text-xs text-[var(--muted)]">{t.ownerEmail}</div>
                        </Td>
                        <Td>{t.planName ?? "—"}</Td>
                        <Td>
                          <span
                            className="inline-flex items-center gap-1.5"
                            style={{ color: t.locked ? "#991b1b" : "#166534" }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: t.locked ? "#f87171" : "var(--wa-green)" }}
                            />
                            {t.status ? (LABEL_STATUS[t.status] ?? t.status) : "—"}
                          </span>
                        </Td>
                        <Td>{t.berlakuSampai ? formatDateTime(t.berlakuSampai) : "—"}</Td>
                        <Td>
                          {t.aiRepliesUsed.toLocaleString("id-ID")} /{" "}
                          {t.aiRepliesLimit.toLocaleString("id-ID")}
                          {t.aiCreditsBalance > 0 && (
                            <div className="text-xs text-[var(--muted)]">
                              +{t.aiCreditsBalance.toLocaleString("id-ID")} kredit
                            </div>
                          )}
                        </Td>
                        <Td>
                          {t.whatsappTersambung ? (
                            <>
                              Tersambung
                              {t.whatsappNomor && (
                                <div className="text-xs text-[var(--muted)]">
                                  {t.whatsappNomor}
                                </div>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.langgananTanpaTenant.length > 0 && (
              <p className="text-xs text-[var(--muted)] mt-3">
                Ada {data.langgananTanpaTenant.length} dokumen langganan tanpa tenant
                ({data.langgananTanpaTenant.join(", ")}) — biasanya sisa data demo.
              </p>
            )}

            <p className="text-xs text-[var(--muted)] mt-6">
              Halaman ini masih baca-saja. Perpanjangan manual dan pengelolaan
              langganan menyusul. Pendapatan belum ditampilkan di sini karena
              angkanya harus diambil dari Midtrans, bukan dihitung ulang sendiri
              — nilai {formatIdr(0)} palsu lebih berbahaya daripada kolom kosong.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Kartu({ label, nilai, catatan }: { label: string; nilai: string; catatan?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="text-2xl font-bold mt-1">{nilai}</div>
      {catatan && <div className="text-[11px] text-[var(--muted)] mt-0.5">{catatan}</div>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="font-medium px-4 py-2.5 whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
