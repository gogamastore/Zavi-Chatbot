"use client";

// Halaman Pengaturan AI — perilaku AI + dokumen pengetahuan yang dibacanya.

import { useEffect, useState } from "react";
import { PageHeader, Empty } from "@/components/ui";
import { TrialBanner, FeatureGate } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import type { AIConfig, AIProvider, KnowledgeDoc } from "@/lib/types";

interface AIHealthInfo {
  status: "belum-dikonfigurasi" | "belum-diperiksa" | "berfungsi" | "gagal";
  provider: string;
  model: string;
  lastError?: string;
  checkedAt?: number;
  sumber?: string;
  saran?: string;
}

interface AIResponse {
  aiConfig: AIConfig;
  /** Kondisi sebenarnya penyedia AI di server. */
  server: AIHealthInfo;
  quota: { used: number; limit: number; exceeded: boolean };
}

export default function PengaturanAIPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <TrialBanner />
      <PageHeader
        title="Pengaturan AI"
        subtitle="Atur bagaimana AI menjawab pertanyaan bebas, dan apa saja yang boleh dijadikan rujukan."
      />
      <FormAI />
      <div className="h-8" />
      <FeatureGate feature="knowledge_base" judul="Knowledge Base terkunci">
        <KnowledgeManager />
      </FeatureGate>
    </div>
  );
}

function FormAI() {
  const [data, setData] = useState<AIResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AIResponse>("/api/ai-config")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  function set<K extends keyof AIConfig>(key: K, value: AIConfig[K]) {
    setData((d) => (d ? { ...d, aiConfig: { ...d.aiConfig, [key]: value } } : d));
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/ai-config", { method: "PUT", body: JSON.stringify(data.aiConfig) });
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="card p-4 text-sm" style={{ color: "#991b1b" }}>{error}</div>;
  if (!data) return <div className="card p-5 text-sm text-[var(--muted)]">Memuat…</div>;

  const c = data.aiConfig;
  const pakaiKuota = data.quota.limit > 0 ? Math.round((data.quota.used / data.quota.limit) * 100) : 0;

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-lg mb-1">Perilaku AI</h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        AI dipakai hanya saat pertanyaan pelanggan tidak cocok dengan aturan template.
      </p>

      <StatusPenyedia
        ai={data.server}
        onDiuji={(baru) => setData((d) => (d ? { ...d, server: baru } : d))}
      />

      <label className="flex items-start gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={c.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-medium">Aktifkan jawaban AI</span>
          <br />
          <span className="text-[var(--muted)]">
            Kalau dimatikan, semua pertanyaan di luar template langsung dialihkan ke admin.
          </span>
        </span>
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Penyedia AI</label>
          <select
            className="select"
            value={c.provider}
            onChange={(e) => set("provider", e.target.value as AIProvider)}
          >
            <option value="none">Ikuti pengaturan server ({data.server.provider})</option>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="gemini">Gemini (Google)</option>
          </select>
        </div>
        <div>
          <label className="label">Model (opsional)</label>
          <input
            className="input"
            placeholder={data.server.model}
            value={c.model ?? ""}
            onChange={(e) => set("model", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Gaya bicara</label>
          <textarea
            className="textarea"
            rows={2}
            value={c.tone ?? ""}
            onChange={(e) => set("tone", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Instruksi khusus (opsional)</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Contoh: Selalu tawarkan paket hemat kalau pelanggan menanyakan harga."
            value={c.customInstructions ?? ""}
            onChange={(e) => set("customInstructions", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Batas riwayat percakapan</label>
          <input
            className="input"
            type="number"
            min={2}
            max={100}
            value={c.historyLimit}
            onChange={(e) => set("historyLimit", Number(e.target.value))}
          />
          <p className="text-xs text-[var(--muted)] mt-1">
            Jumlah pesan terakhir yang dikirim ke AI. Makin besar makin paham konteks,
            tapi makin mahal.
          </p>
        </div>
        <div>
          <label className="label">Kuota AI bulan ini</label>
          <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden mt-2">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(pakaiKuota, 100)}%`,
                background: data.quota.exceeded ? "#dc2626" : "var(--wa-green)",
              }}
            />
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">
            {data.quota.used} / {data.quota.limit} balasan
            {data.quota.exceeded && " — kuota habis, AI dialihkan ke admin."}
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 mt-4 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={c.escalateWhenUnsure}
          onChange={(e) => set("escalateWhenUnsure", e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-medium">Alihkan ke admin saat AI ragu</span>
          <br />
          <span className="text-[var(--muted)]">
            Sangat disarankan — mencegah AI mengarang harga atau stok.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3 mt-6">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Menyimpan…" : "💾 Simpan pengaturan AI"}
        </button>
        {savedAt && (
          <span className="text-xs text-[var(--wa-green-dark)]">
            Tersimpan {formatDateTime(savedAt)}
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * Kartu status penyedia AI.
 *
 * Menampilkan hasil panggilan/uji koneksi terakhir — bukan sekadar "API key
 * terisi". Kalau gagal, alasan aslinya dari penyedia ikut ditampilkan supaya
 * pemilik bisnis tahu harus berbuat apa, bukan menebak.
 */
function StatusPenyedia({
  ai,
  onDiuji,
}: {
  ai: AIHealthInfo;
  onDiuji(baru: AIHealthInfo): void;
}) {
  const [menguji, setMenguji] = useState(false);

  const gaya = {
    "berfungsi": { bg: "#f0fdf4", fg: "#166534", bd: "#bbf7d0", ikon: "✅", judul: "AI berfungsi" },
    "gagal": { bg: "#fef2f2", fg: "#991b1b", bd: "#fecaca", ikon: "⚠️", judul: "AI bermasalah" },
    "belum-dikonfigurasi": { bg: "#f8fafc", fg: "#475569", bd: "#e2e8f0", ikon: "○", judul: "AI belum diatur" },
    "belum-diperiksa": { bg: "#fffbeb", fg: "#92400e", bd: "#fde68a", ikon: "…", judul: "Belum diperiksa" },
  }[ai.status];

  async function uji() {
    setMenguji(true);
    try {
      const r = await apiFetch<{ ai: AIHealthInfo }>("/api/ai-config/test", { method: "POST" });
      onDiuji(r.ai);
    } catch (e) {
      onDiuji({ ...ai, status: "gagal", lastError: (e as Error).message });
    } finally {
      setMenguji(false);
    }
  }

  return (
    <div
      className="rounded-lg px-4 py-3 text-sm mb-4 border"
      style={{ background: gaya.bg, color: gaya.fg, borderColor: gaya.bd }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">
            {gaya.ikon} {gaya.judul}
          </div>
          <div className="text-xs mt-0.5 opacity-90">
            {ai.status === "belum-dikonfigurasi"
              ? "Belum ada API key penyedia AI di server."
              : `Penyedia: ${ai.provider} · model: ${ai.model}`}
          </div>
          {ai.saran && <div className="text-xs mt-1.5 font-medium">{ai.saran}</div>}
          {ai.lastError && (
            <div className="text-xs mt-1 opacity-80 break-words">
              Pesan asli: {ai.lastError}
            </div>
          )}
          {ai.checkedAt && (
            <div className="text-[11px] mt-1 opacity-70">
              Diperiksa {formatDateTime(ai.checkedAt)}
              {ai.sumber === "panggilan-nyata" ? " (dari chat pelanggan)" : " (uji koneksi)"}
            </div>
          )}
        </div>
        <button className="btn btn-ghost text-xs shrink-0" onClick={uji} disabled={menguji}>
          {menguji ? "Menguji…" : "↻ Uji koneksi"}
        </button>
      </div>

      {ai.status !== "berfungsi" && ai.status !== "belum-diperiksa" && (
        <div className="text-xs mt-2 pt-2 border-t" style={{ borderColor: gaya.bd }}>
          Bot tetap melayani lewat aturan template. Hanya pertanyaan bebas yang
          dialihkan ke admin.
        </div>
      )}
    </div>
  );
}

function KnowledgeManager() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<KnowledgeDoc["kind"]>("text");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const d = await apiFetch<{ docs: KnowledgeDoc[] }>("/api/knowledge");
      setDocs(d.docs ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ title, content, kind, url: url || undefined }),
      });
      setTitle("");
      setContent("");
      setUrl("");
      setKind("text");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/knowledge/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-lg mb-1">Pengetahuan AI (Knowledge Base)</h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        Tambahkan info yang perlu diketahui AI: ketentuan layanan, FAQ, detail katalog,
        atau ringkasan isi website.
      </p>

      {error && <div className="text-sm mb-3" style={{ color: "#991b1b" }}>{error}</div>}

      <div className="grid sm:grid-cols-[1fr_140px] gap-3">
        <input className="input" placeholder="Judul dokumen" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as KnowledgeDoc["kind"])}>
          <option value="text">Teks</option>
          <option value="url">Referensi URL</option>
          <option value="file">Isi file</option>
        </select>
      </div>
      {kind === "url" && (
        <input className="input mt-3" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      )}
      <textarea
        className="textarea mt-3"
        rows={4}
        placeholder={kind === "url" ? "Ringkasan/isi dari URL tersebut…" : "Isi pengetahuan (FAQ, ketentuan, detail produk)…"}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button className="btn btn-primary mt-3" onClick={add} disabled={busy || !title.trim() || !content.trim()}>
        {busy ? "Menambahkan…" : "+ Tambah pengetahuan"}
      </button>

      <div className="mt-5 space-y-2">
        {docs.length === 0 ? (
          <Empty text="Belum ada dokumen pengetahuan." />
        ) : (
          docs.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-3 rounded-lg bg-[var(--surface-2)] p-3">
              <div className="min-w-0">
                <div className="font-medium text-sm flex items-center gap-2">
                  {d.title}
                  <span className="badge src-rule">{d.kind}</span>
                </div>
                {d.url && (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--wa-teal)] underline break-all">
                    {d.url}
                  </a>
                )}
                <div className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{d.content}</div>
              </div>
              <button className="btn btn-ghost text-xs shrink-0" onClick={() => remove(d.id)}>
                Hapus
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
