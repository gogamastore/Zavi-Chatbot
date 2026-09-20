"use client";

// ---------------------------------------------------------------------------
// Login owner / pengembang — terpisah dari login pelanggan.
//
// Halaman ini sengaja TIDAK punya tautan "daftar" dan tidak menawarkan login
// Google: satu-satunya jalan masuk adalah akun yang sudah diberi custom claim
// `owner` lewat `scripts/owner.mjs`.
//
// Setelah login berhasil, akses diperiksa ke SERVER (/api/owner/me), bukan
// dengan membaca claim di browser. Kalau ternyata bukan owner, sesinya
// langsung ditutup lagi — akun pelanggan biasa tidak boleh berakhir dalam
// keadaan "sudah login" di area ini.
// ---------------------------------------------------------------------------

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell, Notice } from "@/components/AuthShell";
import { paksaTokenBaru, pesanErrorAuth, useAuth } from "@/lib/auth/context";

export default function OwnerLoginPage() {
  const router = useRouter();
  const { authEnabled, loginEmail, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function masuk(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginEmail(email.trim(), password);

      // Custom claim hanya ikut pada token yang baru dicetak.
      const token = await paksaTokenBaru();
      const res = await fetch("/api/owner/me", {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });

      if (!res.ok) {
        await logout();
        setError(
          res.status === 403
            ? "Akun ini bukan owner. Gunakan halaman login pelanggan."
            : "Gagal memeriksa akses owner. Coba lagi.",
        );
        return;
      }

      router.replace("/owner");
    } catch (err) {
      setError(pesanErrorAuth(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell judul="Masuk sebagai Owner" sub="Area pengelola platform Zavi.">
      {!authEnabled && (
        <Notice nada="bahaya">
          Firebase Auth belum dikonfigurasi di server, area owner tidak bisa dipakai.
        </Notice>
      )}
      {error && <Notice nada="bahaya">{error}</Notice>}

      <form onSubmit={masuk} className="space-y-3">
        <div>
          <label className="label">Email owner</label>
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Kata sandi</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-primary w-full" disabled={busy || !authEnabled}>
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
      </form>

      <p className="text-xs text-center mt-5 text-[var(--muted)]">
        Halaman ini khusus pengelola Zavi. Akun pelanggan tidak bisa masuk dari sini.
      </p>
    </AuthShell>
  );
}
