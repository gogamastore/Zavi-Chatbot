"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { TrialBanner } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";
import type { Stats } from "@/lib/types";

interface AIHealthInfo {
  status: "belum-dikonfigurasi" | "belum-diperiksa" | "berfungsi" | "gagal";
  provider: string;
  model: string;
  lastError?: string;
  checkedAt?: number;
  sumber?: string;
  saran?: string;
}

interface SystemInfo {
  storage: "firestore" | "memory";
  ai: AIHealthInfo;
  whatsapp: boolean;
  firestore: boolean;
  demo: boolean;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch<{ stats: Stats; system: SystemInfo }>("/api/stats");
      setStats(data.stats);
      setSystem(data.system);
    } catch {
      // Belum login / terkunci — banner dan halaman login yang menanganinya.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <TrialBanner />
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan aktivitas bot Zavi. Diperbarui otomatis."
      >
        <Link href="/simulator" className="btn btn-primary">
          💬 Coba Simulator
        </Link>
      </PageHeader>

      {loading && !stats ? (
        <div className="text-sm text-[var(--muted)]">Memuat…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Chat" value={stats?.totalChats ?? 0} icon="💬" />
            <StatCard label="Percakapan" value={stats?.totalConversations ?? 0} icon="👥" />
            <StatCard label="Total Pesanan" value={stats?.totalOrders ?? 0} icon="🛒" />
            <StatCard
              label="Perlu Admin"
              value={stats?.needsHuman ?? 0}
              icon="🙋"
              highlight={(stats?.needsHuman ?? 0) > 0}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Orders breakdown */}
            <div className="card p-5">
              <h2 className="font-semibold mb-4">Pesanan per Status</h2>
              <div className="space-y-3">
                <StatusRow label="Baru" value={stats?.ordersByStatus.baru ?? 0} color="#1d4ed8" total={stats?.totalOrders ?? 0} />
                <StatusRow label="Diproses" value={stats?.ordersByStatus.diproses ?? 0} color="#b45309" total={stats?.totalOrders ?? 0} />
                <StatusRow label="Selesai" value={stats?.ordersByStatus.selesai ?? 0} color="#1a7f37" total={stats?.totalOrders ?? 0} />
                <StatusRow label="Batal" value={stats?.ordersByStatus.batal ?? 0} color="#6b7280" total={stats?.totalOrders ?? 0} />
              </div>
              <Link href="/orders" className="btn btn-ghost w-full mt-4 text-sm">
                Kelola pesanan →
              </Link>
            </div>

            {/* Reply mix + system */}
            <div className="space-y-6">
              <div className="card p-5">
                <h2 className="font-semibold mb-4">Sumber Balasan</h2>
                <div className="flex gap-4">
                  <MiniStat label="Rule / Menu" value={stats?.ruleReplies ?? 0} sub="template cepat" />
                  <MiniStat label="AI (Claude)" value={stats?.aiReplies ?? 0} sub="jawaban fleksibel" />
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold mb-4">Status Sistem</h2>
                {system && (
                  <div className="space-y-2 text-sm">
                    <SystemRow
                      label="Penyimpanan"
                      ok={system.storage === "firestore"}
                      value={system.storage === "firestore" ? "Firestore" : "Memory (demo)"}
                      warnOnFalse
                    />
                    <AIRow ai={system.ai} />
                    <SystemRow label="WhatsApp Cloud API" ok={system.whatsapp} value={system.whatsapp ? "terhubung" : "belum diatur"} />
                  </div>
                )}
                <Link href="/settings" className="btn btn-ghost w-full mt-4 text-sm">
                  Buka pengaturan →
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {highlight && <span className="badge src-human">!</span>}
      </div>
      <div className="text-3xl font-bold mt-2">{value}</div>
      <div className="text-xs text-[var(--muted)] mt-1">{label}</div>
    </div>
  );
}

function StatusRow({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="flex-1 rounded-lg bg-[var(--surface-2)] p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-1">{label}</div>
      <div className="text-[11px] text-[var(--muted)]">{sub}</div>
    </div>
  );
}

/**
 * Baris status AI — sengaja menampilkan kondisi SEBENARNYA.
 *
 * Sebelumnya baris ini hijau begitu API key terisi, padahal setiap panggilan
 * gagal karena saldo habis. Indikator yang berbohong membuat orang mencari
 * masalah di tempat yang salah, jadi di sini alasan kegagalan ikut ditampilkan.
 */
function AIRow({ ai }: { ai: AIHealthInfo }) {
  const tampilan = {
    "berfungsi": { warna: "var(--wa-green)", teks: `${ai.provider} · ${ai.model}` },
    "gagal": { warna: "#dc2626", teks: "bermasalah" },
    "belum-dikonfigurasi": { warna: "#cbd5e1", teks: "belum diatur" },
    "belum-diperiksa": { warna: "#f59e0b", teks: "belum diperiksa" },
  }[ai.status];

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--muted)]">AI</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: tampilan.warna }} />
          {tampilan.teks}
        </span>
      </div>
      {ai.status === "gagal" && (
        <div className="mt-1.5 rounded-md px-2.5 py-1.5 text-xs" style={{ background: "#fef2f2", color: "#991b1b" }}>
          <div className="font-medium">{ai.saran ?? "Panggilan ke penyedia AI gagal."}</div>
          {ai.lastError && (
            <div className="mt-0.5 opacity-80 break-words">{ai.lastError}</div>
          )}
          <Link href="/settings/ai" className="underline mt-1 inline-block">
            Buka Pengaturan AI →
          </Link>
        </div>
      )}
    </div>
  );
}

function SystemRow({ label, ok, value, warnOnFalse }: { label: string; ok: boolean; value: string; warnOnFalse?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: ok ? "var(--wa-green)" : warnOnFalse ? "#f59e0b" : "#cbd5e1" }}
        />
        {value}
      </span>
    </div>
  );
}
