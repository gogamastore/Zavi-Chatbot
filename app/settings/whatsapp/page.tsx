"use client";

// Halaman sambungan WhatsApp — tempat tenant menghubungkan nomornya sendiri.
// Selama Embedded Signup belum tersedia (menunggu verifikasi bisnis Meta),
// nilai-nilai ini diisi manual dari Meta Developers → WhatsApp → API Setup.

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { TrialBanner, FeatureGate } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";

interface WAInfo {
  phoneNumberId: string;
  wabaId: string;
  displayNumber: string;
  punyaTokenSendiri: boolean;
  terhubung: boolean;
}

interface PlatformInfo {
  punyaTokenPlatform: boolean;
  verifyTokenDiatur: boolean;
  appSecretDiatur: boolean;
}

export default function WhatsAppPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <TrialBanner />
      <PageHeader
        title="Sambungan WhatsApp"
        subtitle="Hubungkan nomor WhatsApp Business Anda agar bot melayani pelanggan sungguhan."
      />
      <FeatureGate feature="whatsapp_connect" judul="Sambungan WhatsApp terkunci">
        <FormWhatsApp />
      </FeatureGate>
    </div>
  );
}

function FormWhatsApp() {
  const [wa, setWa] = useState<WAInfo | null>(null);
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ whatsapp: WAInfo; platform: PlatformInfo }>("/api/whatsapp")
      .then((d) => {
        setWa(d.whatsapp);
        setPlatform(d.platform);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  function set<K extends keyof WAInfo>(k: K, v: WAInfo[K]) {
    setWa((p) => (p ? { ...p, [k]: v } : p));
  }

  async function simpan() {
    if (!wa) return;
    setSaving(true);
    setError(null);
    setPesan(null);
    try {
      const r = await apiFetch<{ whatsapp: WAInfo }>("/api/whatsapp", {
        method: "PUT",
        body: JSON.stringify({
          phoneNumberId: wa.phoneNumberId,
          wabaId: wa.wabaId,
          displayNumber: wa.displayNumber,
          // Kirim token hanya kalau diisi, supaya tidak menimpa yang ada.
          ...(token ? { token } : {}),
        }),
      });
      setWa(r.whatsapp);
      setToken("");
      setPesan("Tersimpan. Pastikan webhook di Meta sudah menunjuk ke server ini.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !wa) return <div className="card p-4 text-sm" style={{ color: "#991b1b" }}>{error}</div>;
  if (!wa || !platform) return <div className="card p-5 text-sm text-[var(--muted)]">Memuat…</div>;

  const siapKirim = wa.terhubung && (wa.punyaTokenSendiri || platform.punyaTokenPlatform);

  return (
    <>
      <div
        className="rounded-lg px-4 py-3 text-sm mb-5 border"
        style={
          siapKirim
            ? { background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" }
            : { background: "#fffbeb", color: "#92400e", borderColor: "#fde68a" }
        }
      >
        <div className="font-semibold">
          {siapKirim ? "✅ Nomor terhubung" : "○ Belum terhubung"}
        </div>
        <div className="text-xs mt-1">
          {siapKirim
            ? "Bot akan membalas pelanggan dari nomor ini."
            : "Bot masih hanya bisa diuji lewat Simulator. Isi Phone number ID di bawah."}
        </div>
      </div>

      {!platform.appSecretDiatur && (
        <div
          className="rounded-lg px-4 py-3 text-sm mb-5 border"
          style={{ background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" }}
        >
          <div className="font-semibold">⚠️ App Secret belum diatur di server</div>
          <div className="text-xs mt-1">
            Tanpa <code>META_APP_SECRET</code>, webhook tidak bisa memastikan pesan
            benar-benar dari Meta — dan akan menolak semua permintaan di produksi.
          </div>
        </div>
      )}

      {pesan && (
        <div className="rounded-lg px-4 py-2.5 text-sm mb-5 border" style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}>
          {pesan}
        </div>
      )}
      {error && (
        <div className="rounded-lg px-4 py-2.5 text-sm mb-5 border" style={{ background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" }}>
          {error}
        </div>
      )}

      <section className="card p-5">
        <h2 className="font-semibold text-lg mb-1">Data dari Meta</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Ambil dari Meta Developers → aplikasi Anda → WhatsApp → API Setup.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Phone number ID</label>
            <input
              className="input"
              inputMode="numeric"
              placeholder="mis. 123456789012345"
              value={wa.phoneNumberId}
              onChange={(e) => set("phoneNumberId", e.target.value)}
            />
            <p className="text-xs text-[var(--muted)] mt-1">
              Angka saja — <b>bukan</b> nomor telepon. Inilah yang dipakai sistem
              mengenali pesan masuk milik bisnis Anda.
            </p>
          </div>
          <div>
            <label className="label">WABA ID (opsional)</label>
            <input className="input" value={wa.wabaId} onChange={(e) => set("wabaId", e.target.value)} />
          </div>
          <div>
            <label className="label">Nomor tampilan (opsional)</label>
            <input
              className="input"
              placeholder="+62 812-3456-7890"
              value={wa.displayNumber}
              onChange={(e) => set("displayNumber", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">
              Access token khusus {wa.punyaTokenSendiri && <span className="badge src-rule">tersimpan</span>}
            </label>
            <input
              className="input"
              type="password"
              placeholder={
                wa.punyaTokenSendiri
                  ? "(sudah tersimpan — isi untuk mengganti)"
                  : platform.punyaTokenPlatform
                    ? "(kosongkan — memakai token platform)"
                    : "Diperlukan: token belum ada di platform maupun di sini"
              }
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="text-xs text-[var(--muted)] mt-1">
              Biarkan kosong kalau nomor Anda dikelola lewat akun mitra kami. Isi
              hanya bila Anda memakai aplikasi Meta sendiri.
            </p>
          </div>
        </div>

        <button className="btn btn-primary mt-5" onClick={simpan} disabled={saving}>
          {saving ? "Menyimpan…" : "💾 Simpan sambungan"}
        </button>
      </section>

      <section className="card p-5 mt-6">
        <h2 className="font-semibold mb-2">Pengaturan webhook di Meta</h2>
        <p className="text-sm text-[var(--muted)] mb-3">
          Satu URL ini melayani semua nomor yang terhubung — tidak perlu berbeda
          per bisnis.
        </p>
        <Baris label="Callback URL" nilai={`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhook`} />
        <Baris label="Verify token" nilai={platform.verifyTokenDiatur ? "sudah diatur di server" : "belum diatur"} />
        <Baris label="Field langganan" nilai="messages" />
        <p className="text-xs text-[var(--muted)] mt-3">
          Untuk pengujian lokal, jalankan <code>npx ngrok http 3000</code> lalu pakai
          domain ngrok-nya sebagai Callback URL.
        </p>
      </section>
    </>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <code className="text-xs break-all">{nilai}</code>
    </div>
  );
}
