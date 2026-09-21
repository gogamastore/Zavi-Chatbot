"use client";

// Pendaftaran dua langkah: buat akun → isi profil bisnis + pilih template.
// Langkah 2 juga tampil untuk pengguna yang sudah login tapi belum punya bisnis.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell, Notice } from "@/components/AuthShell";
import { apiFetch } from "@/lib/api/client";
import GaleriTemplate, { type TemplateKartu } from "@/components/GaleriTemplate";
import { pesanErrorAuth, useAuth } from "@/lib/auth/context";
import type { BotTemplateId } from "@/lib/types";



export default function DaftarPage() {
  const router = useRouter();
  const { user, loading, authEnabled, daftarEmail, loginGoogle } = useAuth();
  const [langkah, setLangkah] = useState<1 | 2>(1);

  useEffect(() => {
    if (!loading && user) setLangkah(2);
  }, [loading, user]);

  return (
    <AuthShell
      judul={langkah === 1 ? "Daftar Zavi" : "Data bisnis Anda"}
      sub={
        langkah === 1
          ? "Gratis 3 hari, tanpa kartu kredit."
          : "Satu langkah lagi — bot Anda langsung bisa dicoba."
      }
    >
      {!authEnabled && (
        <Notice>
          Firebase Auth belum dikonfigurasi. Aktifkan provider Email/Password dan Google
          di Firebase Console agar pendaftaran bisa dipakai.
        </Notice>
      )}

      {langkah === 1 ? (
        <LangkahAkun
          daftarEmail={daftarEmail}
          loginGoogle={loginGoogle}
          authEnabled={authEnabled}
          onSelesai={() => setLangkah(2)}
        />
      ) : (
        <LangkahBisnis onSelesai={() => router.replace("/")} />
      )}
    </AuthShell>
  );
}

function LangkahAkun({
  daftarEmail,
  loginGoogle,
  authEnabled,
  onSelesai,
}: {
  daftarEmail(email: string, password: string, nama?: string): Promise<void>;
  loginGoogle(): Promise<void>;
  authEnabled: boolean;
  onSelesai(): void;
}) {
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await daftarEmail(email.trim(), password, nama);
      onSelesai();
    } catch (err) {
      setError(pesanErrorAuth(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Notice nada="bahaya">{error}</Notice>}
      <form onSubmit={kirim} className="space-y-3">
        <div>
          <label className="label">Nama Anda</label>
          <input className="input" value={nama} onChange={(e) => setNama(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Kata sandi</label>
          <input className="input" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-[var(--muted)] mt-1">Minimal 6 karakter.</p>
        </div>
        <button className="btn btn-primary w-full" disabled={busy || !authEnabled}>
          {busy ? "Memproses…" : "Lanjut"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4 text-xs text-[var(--muted)]">
        <div className="flex-1 h-px bg-[var(--border)]" />
        atau
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      <button
        className="btn btn-ghost w-full"
        disabled={busy || !authEnabled}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await loginGoogle();
            onSelesai();
          } catch (err) {
            setError(pesanErrorAuth(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Daftar dengan Google
      </button>

      <p className="text-sm text-center mt-5 text-[var(--muted)]">
        Sudah punya akun?{" "}
        <Link href="/login" className="text-[var(--wa-teal)] underline">Masuk</Link>
      </p>
    </>
  );
}

function LangkahBisnis({ onSelesai }: { onSelesai(): void }) {
  const [templates, setTemplates] = useState<TemplateKartu[]>([]);
  const [templateId, setTemplateId] = useState<BotTemplateId>("resto");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ templates: TemplateKartu[] }>("/api/templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => {});
  }, []);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/register", {
        method: "POST",
        body: JSON.stringify({ businessName, templateId, phone }),
      });
      onSelesai();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Notice nada="bahaya">{error}</Notice>}
      <form onSubmit={kirim} className="space-y-3">
        <div>
          <label className="label">Nama bisnis</label>
          <input
            className="input"
            required
            placeholder="mis. Sambal Nyonya"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Nomor WhatsApp bisnis (opsional)</label>
          <input className="input" placeholder="0812xxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div>
          <label className="label">Jenis usaha</label>
          {/* Galeri yang sama persis dengan yang dilihat setelah masuk —
              satu komponen, supaya pilihan tidak pernah berbeda. Pratinjau
              tombol menu dimatikan di sini agar formulir daftar tetap ringkas. */}
          <GaleriTemplate
            templates={templates}
            dipilih={templateId}
            onPilih={setTemplateId}
            tampilkanMenu={false}
          />
          <p className="text-xs text-[var(--muted)] mt-2">
            Bisa diganti kapan saja di Pengaturan → Bot Template.
          </p>
        </div>

        <button className="btn btn-primary w-full" disabled={busy || !businessName.trim()}>
          {busy ? "Menyiapkan…" : "Mulai percobaan 3 hari"}
        </button>
      </form>
    </>
  );
}
