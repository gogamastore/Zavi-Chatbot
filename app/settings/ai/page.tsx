"use client";

// ---------------------------------------------------------------------------
// Halaman Pengaturan AI, dibagi tiga tab:
//
//   Perilaku  — penyedia, gaya bicara, kuota, eskalasi
//   Sumber    — dari mana AI boleh mengambil fakta (teks / URL / isi file)
//   Tindakan  — aturan bersyarat "kalau X, lakukan Y", ditambah satu per satu
//
// PENTING: konfigurasi AI dimuat SATU KALI di halaman ini dan dibagikan ke tab
// Perilaku maupun Tindakan. Kalau tiap tab memuat dan menyimpannya sendiri,
// menyimpan dari satu tab akan mengirim konfigurasi tanpa data tab lain — dan
// menghapus tindakan yang baru saja dibuat. Satu sumber, satu tombol simpan.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Empty } from "@/components/ui";
import { TrialBanner, FeatureGate } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";
import ImporKatalog from "@/components/ImporKatalog";
import { formatDateTime } from "@/lib/format";
import type {
  AIAction,
  AIConfig,
  AIProvider,
  Business,
  CatalogItem,
  KnowledgeDoc,
} from "@/lib/types";

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
  quota: { used: number; limit: number; credits?: number; remaining?: number; exceeded: boolean };
}

type Tab = "perilaku" | "sumber" | "tindakan";

const TABS: { id: Tab; label: string; ikon: string }[] = [
  { id: "perilaku", label: "Perilaku", ikon: "⚙️" },
  { id: "sumber", label: "Sumber", ikon: "📚" },
  { id: "tindakan", label: "Tindakan", ikon: "⚡" },
];

export default function PengaturanAIPage() {
  const [tab, setTab] = useState<Tab>("perilaku");
  const [data, setData] = useState<AIResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AIResponse>("/api/ai-config")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  const set = useCallback(<K extends keyof AIConfig>(key: K, value: AIConfig[K]) => {
    setData((d) => (d ? { ...d, aiConfig: { ...d.aiConfig, [key]: value } } : d));
  }, []);

  // Sengaja BUKAN useCallback: fungsi ini harus selalu melihat `data` terbaru.
  // Menyimpannya dengan dependensi kosong akan mengirim konfigurasi basi.
  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      // Seluruh konfigurasi dikirim dari satu state bersama, jadi menyimpan
      // dari tab mana pun tidak pernah menghapus isi tab lain.
      await apiFetch("/api/ai-config", {
        method: "PUT",
        body: JSON.stringify(data.aiConfig),
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <TrialBanner />
      <PageHeader
        title="Pengaturan AI"
        subtitle="Atur cara AI menjawab, dari mana faktanya, dan apa yang harus dilakukannya."
      />

      <div className="flex gap-1 mb-5 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={
              tab === t.id
                ? { borderColor: "var(--wa-teal)", color: "var(--wa-teal)" }
                : { borderColor: "transparent", color: "var(--muted)" }
            }
          >
            <span className="mr-1.5">{t.ikon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card p-4 text-sm mb-4" style={{ color: "#991b1b" }}>
          {error}
        </div>
      )}

      {!data ? (
        <div className="card p-5 text-sm text-[var(--muted)]">Memuat…</div>
      ) : tab === "perilaku" ? (
        <TabPerilaku
          data={data}
          set={set}
          save={save}
          saving={saving}
          savedAt={savedAt}
          onServer={(baru) => setData((d) => (d ? { ...d, server: baru } : d))}
        />
      ) : tab === "sumber" ? (
        <FeatureGate feature="knowledge_base" judul="Sumber pengetahuan terkunci">
          <TabSumber />
        </FeatureGate>
      ) : (
        <TabTindakan
          config={data.aiConfig}
          set={set}
          save={save}
          saving={saving}
          savedAt={savedAt}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Tab 1 — Perilaku
// ===========================================================================

interface PropsSimpan {
  set<K extends keyof AIConfig>(key: K, value: AIConfig[K]): void;
  save(): Promise<void>;
  saving: boolean;
  savedAt: number | null;
}

function TombolSimpan({ save, saving, savedAt }: Omit<PropsSimpan, "set">) {
  return (
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
  );
}

function TabPerilaku({
  data,
  set,
  save,
  saving,
  savedAt,
  onServer,
}: PropsSimpan & { data: AIResponse; onServer(baru: AIHealthInfo): void }) {
  const c = data.aiConfig;
  const pakaiKuota =
    data.quota.limit > 0 ? Math.round((data.quota.used / data.quota.limit) * 100) : 0;

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-lg mb-1">Perilaku AI</h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        AI dipakai hanya saat pertanyaan pelanggan tidak cocok dengan aturan template.
      </p>

      <StatusPenyedia ai={data.server} onDiuji={onServer} />

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
            Kalau dimatikan, pertanyaan bebas langsung dialihkan ke admin.
          </span>
        </span>
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Penyedia</label>
          <select
            className="select"
            value={c.provider}
            onChange={(e) => set("provider", e.target.value as AIProvider)}
          >
            <option value="none">Ikuti server</option>
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
          <label className="label">Instruksi umum (opsional)</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Berlaku setiap saat. Contoh: Jangan pernah menjanjikan pengiriman hari yang sama."
            value={c.customInstructions ?? ""}
            onChange={(e) => set("customInstructions", e.target.value)}
          />
          <p className="text-xs text-[var(--muted)] mt-1">
            Untuk aturan <b>bersyarat</b> (&quot;kalau ditanya X, lakukan Y&quot;), pakai
            tab <b>Tindakan</b> — lebih mudah diatur dan bisa dimatikan satu per satu.
          </p>
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
            {(data.quota.credits ?? 0) > 0 && ` · +${data.quota.credits} kredit`}
            {data.quota.exceeded && " — kuota habis, AI dialihkan ke admin."}
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 mt-4 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={c.productQuestionsToAI !== false}
          onChange={(e) => set("productQuestionsToAI", e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-medium">AI yang menjawab pertanyaan produk</span>
          <br />
          <span className="text-[var(--muted)]">
            Aktif: &quot;ada baju hitam ukuran L?&quot; dijawab AI berdasarkan katalog —
            tepat sasaran. Mati: bot mengirim seluruh daftar katalog apa pun
            pertanyaannya. Pelanggan yang menekan tombol{" "}
            <b>Menu &amp; harga</b> tetap menerima daftar lengkap, karena itu
            yang dia minta. Kalau AI mati atau kuota habis, daftar katalog
            otomatis mengambil alih lagi.
          </span>
        </span>
      </label>

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

      <TombolSimpan save={save} saving={saving} savedAt={savedAt} />
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

// ===========================================================================
// Tab 2 — Sumber
// ===========================================================================

function TabSumber() {
  return (
    <div className="space-y-6">
      <KatalogProduk />
      <SumberPengetahuan />
    </div>
  );
}

/**
 * Katalog produk — sumber fakta utama untuk pertanyaan pelanggan.
 *
 * Ada di sini, bukan di Profil Bisnis, karena inilah yang dibaca AI saat
 * ditanya soal produk. Disimpan langsung ke profil bisnis (satu tempat
 * penyimpanan, supaya tidak ada dua katalog yang bisa berbeda isinya).
 */
function KatalogProduk() {
  const [b, setB] = useState<Business | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [tersimpanPada, setTersimpanPada] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [belumDisimpan, setBelumDisimpan] = useState(false);

  const muat = useCallback(async () => {
    try {
      const r = await apiFetch<{ business: Business }>("/api/business");
      setB(r.business);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  async function simpan() {
    if (!b) return;
    setMenyimpan(true);
    setError(null);
    try {
      await apiFetch("/api/business", { method: "PUT", body: JSON.stringify(b) });
      setTersimpanPada(Date.now());
      setBelumDisimpan(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMenyimpan(false);
    }
  }

  function terapkan(items: CatalogItem[], mode: "ganti" | "tambah") {
    setB((p) =>
      p ? { ...p, catalog: mode === "ganti" ? items : [...p.catalog, ...items] } : p,
    );
    setBelumDisimpan(true);
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-lg mb-1">Katalog produk</h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        Daftar produk dan harga yang dibaca AI saat pelanggan bertanya. Unggah
        dari Excel/CSV, atau edit satu per satu di{" "}
        <a href="/settings/bisnis" className="text-[var(--wa-teal)] underline">
          Profil Bisnis
        </a>
        .
      </p>

      {error && (
        <div className="text-sm mb-3" style={{ color: "#991b1b" }}>
          {error}
        </div>
      )}

      {!b ? (
        <div className="text-sm text-[var(--muted)]">Memuat katalog…</div>
      ) : (
        <>
          <ImporKatalog jumlahSekarang={b.catalog.length} onTerapkan={terapkan} />
          <KatalogDariUrl jumlahSekarang={b.catalog.length} onTerapkan={terapkan} />

          {belumDisimpan && (
            <div
              className="rounded-lg px-4 py-2.5 text-sm mt-4 border"
              style={{ background: "#fffbeb", color: "#92400e", borderColor: "#fde68a" }}
            >
              Katalog berubah jadi <b>{b.catalog.length} produk</b> tapi{" "}
              <b>belum disimpan</b>. Tekan tombol di bawah.
            </div>
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              className="btn btn-primary"
              onClick={simpan}
              disabled={menyimpan || !belumDisimpan}
            >
              {menyimpan ? "Menyimpan…" : "💾 Simpan katalog"}
            </button>
            <span className="text-xs text-[var(--muted)]">
              {b.catalog.length} produk tersimpan
              {tersimpanPada && ` · ${formatDateTime(tersimpanPada)}`}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Susun katalog dari halaman web.
 *
 * Sama seperti impor Excel, alurnya tiga langkah: pindai → LIHAT hasilnya →
 * baru terapkan. Bedanya di sini hasil bacaannya datang dari AI atas halaman
 * orang, jadi justru lebih wajib diperiksa: yang keliru bukan kolom yang
 * tertukar, melainkan harga yang salah baca dan akan dijanjikan ke pelanggan.
 */
function KatalogDariUrl({
  jumlahSekarang,
  onTerapkan,
}: {
  jumlahSekarang: number;
  onTerapkan(items: CatalogItem[], mode: "ganti" | "tambah"): void;
}) {
  const [buka, setBuka] = useState(false);
  const [url, setUrl] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{
    items: CatalogItem[];
    peringatan: string[];
    urlAkhir: string;
    judulHalaman?: string;
    panjangTeks: number;
  } | null>(null);

  async function pindai() {
    if (!url.trim()) return;
    setSibuk(true);
    setError(null);
    setHasil(null);
    try {
      setHasil(
        await apiFetch("/api/catalog/from-url", {
          method: "POST",
          body: JSON.stringify({ url: url.trim() }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSibuk(false);
    }
  }

  function terapkan(mode: "ganti" | "tambah") {
    if (!hasil?.items.length) return;
    onTerapkan(hasil.items, mode);
    setHasil(null);
    setUrl("");
    setBuka(false);
  }

  if (!buka) {
    return (
      <button className="btn btn-ghost text-sm mt-3" onClick={() => setBuka(true)}>
        🌐 Susun katalog dari halaman web
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-medium text-sm">Susun katalog dari halaman web</div>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            AI membaca halaman produk Anda lalu mengusulkan daftarnya. Terhitung{" "}
            <b>1 balasan AI</b> dari kuota.
          </p>
        </div>
        <button className="btn btn-ghost text-xs" onClick={() => setBuka(false)}>
          Tutup
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="input flex-1 min-w-[220px]"
          placeholder="https://tokosaya.com/produk"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn btn-primary" onClick={pindai} disabled={sibuk || !url.trim()}>
          {sibuk ? "Membaca halaman…" : "Pindai"}
        </button>
      </div>

      <p className="text-xs text-[var(--muted)] mt-2">
        Halaman yang memuat produknya lewat JavaScript — katalog Instagram,
        lapak marketplace, sebagian toko modern — biasanya terbaca kosong.
        Untuk itu pakai unggah Excel atau salin-tempel manual.
      </p>

      {error && (
        <div className="text-sm mt-3" style={{ color: "#991b1b" }}>
          {error}
        </div>
      )}

      {hasil && (
        <div className="mt-4">
          <div className="text-sm font-medium mb-1">
            Terbaca {hasil.items.length} produk
            {hasil.judulHalaman && ` dari "${hasil.judulHalaman}"`}
          </div>
          {hasil.peringatan.length > 0 && (
            <ul className="text-xs mb-2 space-y-0.5" style={{ color: "#92400e" }}>
              {hasil.peringatan.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}

          {hasil.items.length > 0 && (
            <>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                      <th className="px-3 py-2 font-medium">Nama</th>
                      <th className="px-3 py-2 font-medium">Harga</th>
                      <th className="px-3 py-2 font-medium">Deskripsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasil.items.map((it, i) => (
                      <tr key={i} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-1.5">{it.name}</td>
                        <td className="px-3 py-1.5">
                          {it.price || <span style={{ color: "#991b1b" }}>(kosong)</span>}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--muted)]">{it.description ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                <button className="btn btn-primary text-sm" onClick={() => terapkan("ganti")}>
                  Ganti katalog ({jumlahSekarang} → {hasil.items.length})
                </button>
                <button className="btn btn-ghost text-sm" onClick={() => terapkan("tambah")}>
                  Tambahkan ke yang ada ({jumlahSekarang + hasil.items.length})
                </button>
              </div>
              <p className="text-xs text-[var(--muted)] mt-2">
                Belum tersimpan — tekan <b>Simpan katalog</b> setelah memilih.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SumberPengetahuan() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<KnowledgeDoc["kind"]>("text");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [menyegarkan, setMenyegarkan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ docs: KnowledgeDoc[] }>("/api/knowledge");
      setDocs(d.docs ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const urlSaja = kind === "url";
  const bolehTambah = urlSaja ? Boolean(url.trim()) : Boolean(title.trim() && content.trim());

  async function add() {
    if (!bolehTambah) return;
    setBusy(true);
    setError(null);
    setPesan(null);
    try {
      const r = await apiFetch<{ doc: KnowledgeDoc }>("/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ title, content, kind, url: url || undefined }),
      });
      setTitle("");
      setContent("");
      setUrl("");
      setKind("text");
      if (r.doc.kind === "url") {
        setPesan(
          `Isi halaman berhasil diambil (${r.doc.content.length.toLocaleString("id-ID")} karakter)${r.doc.truncated ? ", dipotong karena terlalu panjang" : ""}.`,
        );
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function segarkan(id: string) {
    setMenyegarkan(id);
    setError(null);
    setPesan(null);
    try {
      await apiFetch(`/api/knowledge/${id}/refresh`, { method: "POST" });
      setPesan("Isi sumber diperbarui dari situs.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMenyegarkan(null);
      await load();
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
      <h2 className="font-semibold text-lg mb-1">Sumber pengetahuan</h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        Fakta yang boleh dipakai AI: ketentuan layanan, FAQ, detail produk, atau
        halaman website Anda. AI hanya boleh menjawab dari sini dan dari profil
        bisnis — di luar itu dialihkan ke admin.
      </p>

      {error && (
        <div className="text-sm mb-3" style={{ color: "#991b1b" }}>
          {error}
        </div>
      )}
      {pesan && (
        <div className="text-sm mb-3" style={{ color: "#166534" }}>
          {pesan}
        </div>
      )}

      <div className="grid sm:grid-cols-[1fr_150px] gap-3">
        <input
          className="input"
          placeholder={urlSaja ? "Judul (kosongkan = pakai judul halaman)" : "Judul dokumen"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="select"
          value={kind}
          onChange={(e) => setKind(e.target.value as KnowledgeDoc["kind"])}
        >
          <option value="text">Teks</option>
          <option value="url">Halaman web</option>
          <option value="file">Isi file</option>
        </select>
      </div>

      {urlSaja ? (
        <>
          <input
            className="input mt-3"
            placeholder="https://tokosaya.com/produk"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="text-xs text-[var(--muted)] mt-1.5">
            Isi halaman diambil otomatis oleh server. Halaman yang memuat isinya
            lewat JavaScript (mis. katalog Instagram) biasanya terbaca kosong —
            untuk itu salin-tempel teksnya sebagai jenis <b>Teks</b>.
          </p>
          <textarea
            className="textarea mt-3"
            rows={2}
            placeholder="Catatan tambahan (opsional) — ditaruh di atas isi halaman."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </>
      ) : (
        <textarea
          className="textarea mt-3"
          rows={4}
          placeholder="Isi pengetahuan (FAQ, ketentuan, detail produk)…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}

      <button className="btn btn-primary mt-3" onClick={add} disabled={busy || !bolehTambah}>
        {busy ? (urlSaja ? "Mengambil isi halaman…" : "Menambahkan…") : "+ Tambah sumber"}
      </button>

      <div className="mt-5 space-y-2">
        {docs.length === 0 ? (
          <Empty text="Belum ada sumber pengetahuan." />
        ) : (
          docs.map((d) => (
            <div
              key={d.id}
              className="flex items-start justify-between gap-3 rounded-lg bg-[var(--surface-2)] p-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                  {d.title}
                  <span className="badge src-rule">{d.kind === "url" ? "web" : d.kind}</span>
                  {d.truncated && (
                    <span className="badge src-rule" title="Halaman dipotong karena terlalu panjang">
                      dipotong
                    </span>
                  )}
                </div>
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--wa-teal)] underline break-all"
                  >
                    {d.url}
                  </a>
                )}
                {/* Keadaan sebenarnya, bukan asumsi: kapan terakhir diambil,
                    dan kalau gagal, alasannya apa. */}
                {d.kind === "url" && (
                  <div className="text-[11px] mt-1">
                    {d.fetchError ? (
                      <span style={{ color: "#991b1b" }}>
                        ⚠️ Gagal disegarkan: {d.fetchError}
                        {d.fetchedAt &&
                          ` — AI masih memakai isi dari ${formatDateTime(d.fetchedAt)}.`}
                      </span>
                    ) : d.fetchedAt ? (
                      <span className="text-[var(--muted)]">
                        Diambil {formatDateTime(d.fetchedAt)}
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">Belum pernah diambil.</span>
                    )}
                  </div>
                )}
                <div className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{d.content}</div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {d.kind === "url" && (
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => segarkan(d.id)}
                    disabled={menyegarkan !== null}
                  >
                    {menyegarkan === d.id ? "Mengambil…" : "↻ Segarkan"}
                  </button>
                )}
                <button className="btn btn-ghost text-xs" onClick={() => remove(d.id)}>
                  Hapus
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ===========================================================================
// Tab 3 — Tindakan
// ===========================================================================

const CONTOH_TINDAKAN: { when: string; then: string }[] = [
  {
    when: "pelanggan menanyakan harga grosir atau beli banyak",
    then: "tawarkan harga grosir mulai 12 pcs dan minta jumlah yang diinginkan",
  },
  {
    when: "pelanggan menyebut komplain, barang rusak, atau minta refund",
    then: "minta maaf, minta foto barang dan nomor pesanan, lalu alihkan ke admin",
  },
  {
    when: "pelanggan menanyakan pengiriman ke luar kota",
    then: "sebutkan kami kirim lewat JNE dan JNT, ongkir dihitung saat checkout",
  },
];

function TabTindakan({
  config,
  set,
  save,
  saving,
  savedAt,
}: PropsSimpan & { config: AIConfig }) {
  const actions = config.actions ?? [];
  const [when, setWhen] = useState("");
  const [then, setThen] = useState("");

  function tulis(baru: AIAction[]) {
    set("actions", baru);
  }

  function tambah(w = when, t = then) {
    const ww = w.trim();
    const tt = t.trim();
    if (!ww || !tt) return;
    tulis([
      ...actions,
      {
        id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())).slice(0, 8),
        when: ww,
        then: tt,
        enabled: true,
        createdAt: Date.now(),
      },
    ]);
    setWhen("");
    setThen("");
  }

  function ubah(id: string, patch: Partial<AIAction>) {
    tulis(actions.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function hapus(id: string) {
    tulis(actions.filter((a) => a.id !== id));
  }

  function pindah(i: number, arah: -1 | 1) {
    const j = i + arah;
    if (j < 0 || j >= actions.length) return;
    const salin = [...actions];
    [salin[i], salin[j]] = [salin[j], salin[i]];
    tulis(salin);
  }

  const aktif = actions.filter((a) => a.enabled).length;

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-lg mb-1">Tindakan</h2>
      <p className="text-sm text-[var(--muted)] mb-4">
        Aturan bersyarat: <b>kalau</b> pelanggan melakukan sesuatu, <b>maka</b> bot
        melakukan ini. Ditambahkan satu per satu supaya bisa dimatikan dan diuji
        sendiri-sendiri. Hanya aturan yang aktif yang dikirim ke AI.
      </p>

      <div className="rounded-lg bg-[var(--surface-2)] p-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">KALAU…</label>
            <textarea
              className="textarea"
              rows={2}
              placeholder="pelanggan menanyakan harga grosir"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          <div>
            <label className="label">MAKA bot…</label>
            <textarea
              className="textarea"
              rows={2}
              placeholder="tawarkan paket isi 12 lalu minta jumlahnya"
              value={then}
              onChange={(e) => setThen(e.target.value)}
            />
          </div>
        </div>
        <button
          className="btn btn-primary mt-3"
          onClick={() => tambah()}
          disabled={!when.trim() || !then.trim()}
        >
          + Tambah tindakan
        </button>
      </div>

      {actions.length === 0 && (
        <div className="mt-4">
          <p className="text-xs text-[var(--muted)] mb-2">Contoh yang sering dipakai:</p>
          <div className="space-y-1.5">
            {CONTOH_TINDAKAN.map((c) => (
              <button
                key={c.when}
                onClick={() => tambah(c.when, c.then)}
                className="w-full text-left text-xs rounded-lg border border-dashed border-[var(--border)] p-2.5 hover:bg-[var(--surface-2)]"
              >
                <span className="font-medium">KALAU</span> {c.when}{" "}
                <span className="font-medium">MAKA</span> {c.then}
                <span className="text-[var(--wa-teal)]"> — pakai ini</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-5 mb-2">
            <span className="text-xs text-[var(--muted)]">
              {aktif} dari {actions.length} tindakan aktif
            </span>
          </div>
          <div className="space-y-2">
            {actions.map((a, i) => (
              <div
                key={a.id}
                className="rounded-lg border border-[var(--border)] p-3"
                style={a.enabled ? undefined : { opacity: 0.55 }}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1.5"
                    checked={a.enabled}
                    onChange={(e) => ubah(a.id, { enabled: e.target.checked })}
                    title={a.enabled ? "Matikan tindakan ini" : "Aktifkan tindakan ini"}
                  />
                  <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                        Kalau
                      </div>
                      <textarea
                        className="textarea text-sm"
                        rows={2}
                        value={a.when}
                        onChange={(e) => ubah(a.id, { when: e.target.value })}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                        Maka bot
                      </div>
                      <textarea
                        className="textarea text-sm"
                        rows={2}
                        value={a.then}
                        onChange={(e) => ubah(a.id, { then: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      className="btn btn-ghost text-xs px-2"
                      onClick={() => pindah(i, -1)}
                      disabled={i === 0}
                      title="Naikkan"
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-ghost text-xs px-2"
                      onClick={() => pindah(i, 1)}
                      disabled={i === actions.length - 1}
                      title="Turunkan"
                    >
                      ↓
                    </button>
                    <button
                      className="btn btn-ghost text-xs px-2"
                      onClick={() => hapus(a.id)}
                      title="Hapus"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <TombolSimpan save={save} saving={saving} savedAt={savedAt} />

      <p className="text-xs text-[var(--muted)] mt-3">
        Tindakan adalah arahan untuk AI, bukan program. AI tetap tunduk pada aturan
        utama: tidak boleh mengarang harga atau stok yang tidak ada di Sumber.
      </p>
    </section>
  );
}
