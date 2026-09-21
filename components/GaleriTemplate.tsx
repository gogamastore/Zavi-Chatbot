"use client";

// ---------------------------------------------------------------------------
// Galeri template bot.
//
// Dipakai dua tempat dengan tampilan yang sama: saat mendaftar (/daftar) dan
// saat mengganti template (/settings/bot). Sengaja satu komponen — kalau
// keduanya punya galeri sendiri, cepat atau lambat calon mitra melihat
// pilihan yang berbeda dari yang dia lihat setelah masuk.
//
// Soal warna: warna khas tiap template hanya dipakai untuk lambang, garis
// tepi, dan latar ber-alpha rendah. Teks tetap memakai warna teks biasa di
// atas permukaan biasa, jadi tidak ada pasangan warna yang kontrasnya
// meragukan — kartu tetap berwarna tanpa mengorbankan keterbacaan.
// ---------------------------------------------------------------------------

import type { BotTemplateId } from "@/lib/types";

export interface TemplateKartu {
  id: BotTemplateId;
  name: string;
  description: string;
  icon: string;
  accent: string;
  suitableFor: string[];
  jumlahAturan: number;
  menuOptions?: { id: string; title: string }[];
}

export default function GaleriTemplate({
  templates,
  dipilih,
  onPilih,
  nonaktif = false,
  /** Tampilkan pratinjau tombol menu yang akan dilihat pelanggan. */
  tampilkanMenu = true,
}: {
  templates: TemplateKartu[];
  dipilih?: BotTemplateId;
  onPilih(id: BotTemplateId): void;
  nonaktif?: boolean;
  tampilkanMenu?: boolean;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {templates.map((t) => {
        const aktif = t.id === dipilih;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPilih(t.id)}
            disabled={nonaktif}
            aria-pressed={aktif}
            className="text-left rounded-xl border p-4 transition-all disabled:opacity-60 hover:shadow-sm"
            style={{
              // Garis tepi berwarna hanya saat terpilih; yang lain tetap
              // netral supaya galerinya tidak jadi pelangi yang bising.
              borderColor: aktif ? t.accent : "var(--border)",
              borderWidth: aktif ? 2 : 1,
              background: aktif ? `${t.accent}0d` : "transparent",
              padding: aktif ? "15px" : "16px",
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="grid place-items-center w-10 h-10 rounded-xl text-xl shrink-0"
                style={{ background: `${t.accent}1a` }}
                aria-hidden="true"
              >
                {t.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm" style={{ color: t.accent }}>
                    {t.name}
                  </span>
                  {aktif && (
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: t.accent, color: "#fff" }}
                    >
                      Dipakai
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">{t.description}</p>
              </div>
            </div>

            {tampilkanMenu && t.menuOptions && t.menuOptions.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Tombol yang dilihat pelanggan
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.menuOptions.map((m) => (
                    <span
                      key={m.id}
                      className="text-[11px] px-2 py-0.5 rounded-md border"
                      style={{ borderColor: `${t.accent}33`, background: `${t.accent}0a` }}
                    >
                      {m.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3 text-[11px] text-[var(--muted)]">
              <span>{t.suitableFor.join(" · ")}</span>
              <span aria-hidden="true">•</span>
              <span>{t.jumlahAturan} aturan siap pakai</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
