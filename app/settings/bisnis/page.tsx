"use client";

// Halaman Profil Bisnis — dulu tergabung di /settings, kini berdiri sendiri.

import { useEffect, useState } from "react";
import { PageHeader, Empty } from "@/components/ui";
import { TrialBanner } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
