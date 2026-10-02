"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { pesanErrorAuth, useAuth } from "@/lib/auth/context";
import { AuthShell, Notice } from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, authEnabled, loginEmail, loginGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function masuk(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginEmail(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(pesanErrorAuth(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await loginGoogle();
      router.replace("/dashboard");
    } catch (err) {
      setError(pesanErrorAuth(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell judul="Masuk ke Zavi" sub="Kelola chatbot WhatsApp bisnis Anda.">
      {!authEnabled && (
        <Notice>
          Firebase Auth belum dikonfigurasi. Aplikasi berjalan dalam mode demo tanpa login.
        </Notice>
      )}
      {error && <Notice nada="bahaya">{error}</Notice>}

      <form onSubmit={masuk} className="space-y-3">
        <div>
          <label className="label">Email</label>
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
          {busy ? "Memproses…" : "Masuk"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4 text-xs text-[var(--muted)]">
        <div className="flex-1 h-px bg-[var(--border)]" />
        atau
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      <button onClick={google} className="btn btn-ghost w-full" disabled={busy || !authEnabled}>
        Masuk dengan Google
      </button>

      <p className="text-sm text-center mt-5 text-[var(--muted)]">
        Belum punya akun?{" "}
        <Link href="/daftar" className="text-[var(--wa-teal)] underline">
          Daftar gratis 3 hari
        </Link>
      </p>
    </AuthShell>
  );
}
