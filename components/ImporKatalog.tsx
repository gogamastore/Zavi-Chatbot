"use client";

// ---------------------------------------------------------------------------
// Impor katalog produk dari Excel/CSV.
//
// Tempatnya di Pengaturan AI -> tab Sumber, bukan di Profil Bisnis. Alasannya
// bukan tata letak: katalog adalah SUMBER FAKTA yang dibaca AI saat menjawab
// pertanyaan produk. Menaruhnya bersama sumber pengetahuan lain membuat
// hubungan itu terlihat, dan sejalan dengan pertanyaan produk yang kini
// dijawab AI, bukan disiram daftar oleh aturan template.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import { getFreshIdToken } from "@/lib/auth/context";
import type { CatalogItem } from "@/lib/types";

/**
 * Impor katalog dari Excel/CSV.
 *
 * Alurnya tiga langkah dan disengaja: unggah → LIHAT hasil bacaan → baru
 * terapkan. Langsung menimpa katalog orang begitu berkas diunggah adalah
 * kerusakan yang sulit dibatalkan, apalagi kalau nama kolomnya salah terbaca.
 */
export default function ImporKatalog({
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
