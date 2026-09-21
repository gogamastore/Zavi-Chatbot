"use client";

// Halaman Bot Template — Roadmap Tahap 2: "Mode Template yang dapat dipilih
// Calon Pengguna, sesuai kebutuhan bisnis Mereka."

import { useEffect, useState } from "react";
import { PageHeader, Empty } from "@/components/ui";
import { TrialBanner, FeatureGate } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import GaleriTemplate, { type TemplateKartu } from "@/components/GaleriTemplate";
import type { BotConfig, BotRule, BotTemplateId } from "@/lib/types";



export default function BotTemplatePage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <TrialBanner />
      <PageHeader
        title="Bot Template"
        subtitle="Pilih template sesuai jenis usaha, lalu sesuaikan kata kunci dan isi balasannya."
      />
      <FeatureGate feature="bot_template" judul="Pengaturan template terkunci">
        <EditorBot />
      </FeatureGate>
    </div>
  );
}

function EditorBot() {
  const [templates, setTemplates] = useState<TemplateKartu[]>([]);
  const [cfg, setCfg] = useState<BotConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [t, c] = await Promise.all([
          apiFetch<{ templates: TemplateKartu[] }>("/api/templates"),
          apiFetch<{ botConfig: BotConfig }>("/api/bot-config"),
        ]);
        setTemplates(t.templates);
        setCfg(c.botConfig);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  async function gantiTemplate(id: BotTemplateId) {
    if (
      !confirm(
        "Ganti template akan MENIMPA semua aturan yang sudah Anda ubah dengan preset baru. Lanjutkan?",
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch<{ botConfig: BotConfig }>("/api/bot-config", {
        method: "PUT",
        body: JSON.stringify({ resetKeTemplate: id }),
      });
      setCfg(r.botConfig);
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function ubahAturan(i: number, patch: Partial<BotRule>) {
    setCfg((c) => {
      if (!c) return c;
      const rules = [...c.rules];
      rules[i] = { ...rules[i], ...patch };
      return { ...c, rules };
    });
  }
  function hapusAturan(i: number) {
    setCfg((c) => (c ? { ...c, rules: c.rules.filter((_, idx) => idx !== i) } : c));
  }
  function tambahAturan() {
    setCfg((c) =>
      c
        ? { ...c, rules: [...c.rules, { intent: "", keywords: [], reply: "", enabled: true }] }
        : c,
    );
  }

  async function simpan() {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch<{ botConfig: BotConfig }>("/api/bot-config", {
        method: "PUT",
        body: JSON.stringify(cfg),
      });
      setCfg(r.botConfig);
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="card p-4 text-sm" style={{ color: "#991b1b" }}>{error}</div>;
  if (!cfg) return <div className="card p-5 text-sm text-[var(--muted)]">Memuat…</div>;

  return (
    <>
      <section className="card p-5 mb-6">
        <h2 className="font-semibold text-lg mb-1">Template jenis usaha</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Template hanya titik awal — setelah dipilih, semua aturannya bebas Anda ubah.
        </p>
        <GaleriTemplate
          templates={templates}
          dipilih={cfg.templateId}
          nonaktif={saving}
          onPilih={(id) => id !== cfg.templateId && gantiTemplate(id)}
        />
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-lg">Aturan balasan</h2>
          <button className="btn btn-ghost text-xs" onClick={tambahAturan}>+ Tambah aturan</button>
        </div>
        <p className="text-sm text-[var(--muted)] mb-2">
          Bot memeriksa aturan dari atas ke bawah dan memakai yang pertama cocok.
        </p>
        <p className="text-xs text-[var(--muted)] mb-4">
          Placeholder yang bisa dipakai di isi balasan:{" "}
          <code>{"{nama} {jam} {alamat} {telepon} {katalog} {cara_order} {pembayaran}"}</code>
        </p>

        <div className="space-y-3">
          {cfg.rules.length === 0 && <Empty text="Belum ada aturan." />}
          {cfg.rules.map((r, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <input
                  className="input flex-1 min-w-[140px]"
                  placeholder="Nama intent (mis. jam buka)"
                  value={r.intent}
                  onChange={(e) => ubahAturan(i, { intent: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => ubahAturan(i, { enabled: e.target.checked })}
                  />
                  Aktif
                </label>
                <button className="btn btn-ghost text-xs" onClick={() => hapusAturan(i)}>✕</button>
              </div>
              <label className="label">Kata kunci (pisahkan dengan koma)</label>
              <input
                className="input mb-2"
                placeholder="jam buka, jam berapa, masih buka"
                value={r.keywords.join(", ")}
                onChange={(e) =>
                  ubahAturan(i, {
                    keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                  })
                }
              />
              <label className="label">Isi balasan</label>
              <textarea
                className="textarea"
                rows={2}
                value={r.reply}
                onChange={(e) => ubahAturan(i, { reply: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button className="btn btn-primary" onClick={simpan} disabled={saving}>
            {saving ? "Menyimpan…" : "💾 Simpan aturan"}
          </button>
          {savedAt && (
            <span className="text-xs text-[var(--wa-green-dark)]">
              Tersimpan {formatDateTime(savedAt)}
            </span>
          )}
        </div>
      </section>
    </>
  );
}
