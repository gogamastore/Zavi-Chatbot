"use client";

// Halaman Profil Bisnis — dulu tergabung di /settings, kini berdiri sendiri.

import { useEffect, useRef, useState } from "react";
import { PageHeader, Empty } from "@/components/ui";
import { TrialBanner } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";
import { getFreshIdToken } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import type { Business, CatalogItem } from "@/lib/types";

export default function ProfilBisnisPage() {
  const [b, setB] = useState<Business | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ business: Business }>("/api/business")
      .then((d) => setB(d.business))
      .catch((e) => setError(e.message));
  }, []);

  function set<K extends keyof Business>(key: K, value: Business[K]) {
    setB((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  function setItem(i: number, patch: Partial<CatalogItem>) {
    setB((prev) => {
      if (!prev) return prev;
      const catalog = [...prev.catalog];
      catalog[i] = { ...catalog[i], ...patch };
      return { ...prev, catalog };
    });
  }
  function addItem() {
    setB((prev) => (prev ? { ...prev, catalog: [...prev.catalog, { name: "", price: "" }] } : prev));
  }
  function removeItem(i: number) {
    setB((prev) => (prev ? { ...prev, catalog: prev.catalog.filter((_, idx) => idx !== i) } : prev));
  }

  async function save() {
    if (!b) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/business", { method: "PUT", body: JSON.stringify(b) });
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
        title="Profil Bisnis"
        subtitle="Data di sini dipakai bot untuk menjawab pelanggan. Isi selengkap mungkin."
      />

      {error && <div className="card p-3 mb-4 text-sm" style={{ color: "#991b1b" }}>{error}</div>}

      {!b ? (
        <div className="card p-5 text-sm text-[var(--muted)]">Memuat profil…</div>
      ) : (
        <section className="card p-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nama bisnis"><input className="input" value={b.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Jenis bisnis"><input className="input" value={b.type} onChange={(e) => set("type", e.target.value)} /></Field>
            <Field label="Tagline" full><input className="input" value={b.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} /></Field>
            <Field label="Jam buka"><input className="input" value={b.hours} onChange={(e) => set("hours", e.target.value)} /></Field>
            <Field label="Nomor kontak"><input className="input" value={b.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Alamat" full><input className="input" value={b.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label="Cara order" full><textarea className="textarea" rows={2} value={b.orderInstructions} onChange={(e) => set("orderInstructions", e.target.value)} /></Field>
            <Field label="Info pembayaran" full><textarea className="textarea" rows={2} value={b.paymentInfo ?? ""} onChange={(e) => set("paymentInfo", e.target.value)} /></Field>
            <Field label="Info tambahan (dibaca AI)" full><textarea className="textarea" rows={2} value={b.extraInfo ?? ""} onChange={(e) => set("extraInfo", e.target.value)} /></Field>
          </div>

          <ImporKatalog
            jumlahSekarang={b.catalog.length}
            onTerapkan={(items, mode) =>
              setB((prev) =>
                prev
                  ? { ...prev, catalog: mode === "ganti" ? items : [...prev.catalog, ...items] }
                  : prev,
              )
            }
          />

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="label !mb-0">Menu / Katalog</span>
              <button className="btn btn-ghost text-xs" onClick={addItem}>+ Tambah item</button>
            </div>
            <div className="space-y-2">
              {b.catalog.map((item, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <input className="input flex-1 min-w-[140px]" placeholder="Nama" value={item.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                  <input className="input w-28" placeholder="Harga" value={item.price} onChange={(e) => setItem(i, { price: e.target.value })} />
                  <input className="input flex-1 min-w-[140px]" placeholder="Deskripsi (opsional)" value={item.description ?? ""} onChange={(e) => setItem(i, { description: e.target.value })} />
                  <button className="btn btn-ghost text-xs" onClick={() => removeItem(i)}>✕</button>
                </div>
              ))}
              {b.catalog.length === 0 && <Empty text="Belum ada item. Tambahkan menu atau produk." />}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Menyimpan…" : "💾 Simpan profil"}
            </button>
            {savedAt && (
              <span className="text-xs text-[var(--wa-green-dark)]">
                Tersimpan {formatDateTime(savedAt)}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Impor katalog dari Excel/CSV.
 *
 * Alurnya tiga langkah dan disengaja: unggah → LIHAT hasil bacaan → baru
 * terapkan. Langsung menimpa katalog orang begitu berkas diunggah adalah
 * kerusakan yang sulit dibatalkan, apalagi kalau nama kolomnya salah terbaca.
 */
function ImporKatalog({
  jumlahSekarang,
  onTerapkan,
}: {
  jumlahSekarang: number;
  onTerapkan(items: CatalogItem[], mode: "ganti" | "tambah"): void;
}) {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pratinjau, setPratinjau] = useState<{
    items: CatalogItem[];
    peringatan: string[];
    namaBerkas: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function unduhTemplate() {
    setError(null);
    try {
      const token = await getFreshIdToken();
      const res = await fetch("/api/catalog/template", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Gagal mengunduh template");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "template-katalog-zavi.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pilihBerkas(f: File) {
    setSibuk(true);
    setError(null);
    setPratinjau(null);
    try {
      const token = await getFreshIdToken();
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/catalog/import", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membaca berkas");
      setPratinjau({
        items: data.items ?? [],
        peringatan: data.peringatan ?? [],
        namaBerkas: data.namaBerkas ?? f.name,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSibuk(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function terapkan(mode: "ganti" | "tambah") {
    if (!pratinjau?.items.length) return;
    if (mode === "ganti" && jumlahSekarang > 0) {
      if (!confirm(`Ganti ${jumlahSekarang} produk yang ada dengan ${pratinjau.items.length} produk dari berkas?`)) return;
    }
    onTerapkan(pratinjau.items, mode);
    setPratinjau(null);
    setBuka(false);
  }

  return (
    <div className="mt-6 rounded-lg border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-sm">📗 Impor katalog dari Excel</div>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Punya daftar produk di Excel? Unggah saja, tidak perlu ketik ulang satu per satu.
          </p>
        </div>
        <button className="btn btn-ghost text-xs" onClick={() => setBuka((v) => !v)}>
          {buka ? "Tutup" : "Buka"}
        </button>
      </div>

      {buka && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost text-xs" onClick={unduhTemplate}>
              ⬇ Unduh template
            </button>
            <button
              className="btn btn-ghost text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={sibuk}
            >
              {sibuk ? "Membaca…" : "⬆ Pilih berkas (.xlsx / .csv)"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,.txt"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pilihBerkas(f);
              }}
            />
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">
            Baru pertama kali? Unduh template dulu — sudah ada contoh isian dan
            urutan kolomnya. Maksimal 500 produk, berkas 2 MB.
          </p>

          {error && (
            <div className="mt-3 rounded-md px-3 py-2 text-xs" style={{ background: "#fef2f2", color: "#991b1b" }}>
              {error}
            </div>
          )}

          {pratinjau && (
            <div className="mt-4">
              {pratinjau.peringatan.map((p, i) => (
                <div
                  key={i}
                  className="mb-2 rounded-md px-3 py-2 text-xs"
                  style={{ background: "#fffbeb", color: "#92400e" }}
                >
                  {p}
                </div>
              ))}

              {pratinjau.items.length > 0 && (
                <>
                  <div className="text-sm font-medium mb-2">
                    {pratinjau.items.length} produk terbaca dari{" "}
                    <span className="text-[var(--muted)]">{pratinjau.namaBerkas}</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-md border border-[var(--border)]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[var(--surface-2)]">
                        <tr className="text-left text-[var(--muted)]">
                          <th className="px-2.5 py-1.5 font-medium">Nama</th>
                          <th className="px-2.5 py-1.5 font-medium">Harga</th>
                          <th className="px-2.5 py-1.5 font-medium">Deskripsi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pratinjau.items.slice(0, 50).map((it, i) => (
                          <tr key={i} className="border-t border-[var(--border)]">
                            <td className="px-2.5 py-1.5">{it.name}</td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">{it.price || "—"}</td>
                            <td className="px-2.5 py-1.5 text-[var(--muted)]">{it.description || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pratinjau.items.length > 50 && (
                    <p className="text-xs text-[var(--muted)] mt-1">
                      Menampilkan 50 pertama dari {pratinjau.items.length}.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    <button className="btn btn-primary text-xs" onClick={() => terapkan("ganti")}>
                      Ganti katalog ({jumlahSekarang} → {pratinjau.items.length})
                    </button>
                    <button className="btn btn-ghost text-xs" onClick={() => terapkan("tambah")}>
                      Tambahkan ke yang ada
                    </button>
                    <button className="btn btn-ghost text-xs" onClick={() => setPratinjau(null)}>
                      Batal
                    </button>
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-2">
                    Belum tersimpan — tekan <b>Simpan profil</b> di bawah setelah memeriksa hasilnya.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
