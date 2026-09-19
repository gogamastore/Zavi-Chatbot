"use client";

// ---------------------------------------------------------------------------
// Konteks autentikasi di browser.
//
// Menyediakan user Firebase yang sedang login, fungsi login/daftar/logout, dan
// pengambil ID token untuk dipasang ke setiap panggilan API.
//
// Saat Firebase Auth belum dikonfigurasi, provider ini tetap berfungsi dengan
// user = null (mode demo) sehingga aplikasi tidak mati.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider, hasAuthConfig } from "@/lib/firebase/client";

interface AuthState {
  user: User | null;
  /** True selama status login pertama kali masih ditentukan. */
  loading: boolean;
  /** False kalau Firebase Auth belum dikonfigurasi (mode demo). */
  authEnabled: boolean;
  loginEmail(email: string, password: string): Promise<void>;
  daftarEmail(email: string, password: string, nama?: string): Promise<void>;
  loginGoogle(): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** Token terakhir, dibagi ke apiFetch() tanpa perlu melewati React. */
let tokenTerakhir: string | null = null;

/** Dipakai lib/api/client.ts — di luar React, jadi tidak bisa pakai hook. */
export function getIdTokenSync(): string | null {
  return tokenTerakhir;
}

/** Ambil token segar (memicu refresh bila sudah dekat kedaluwarsa). */
export async function getFreshIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  const u = auth?.currentUser;
  if (!u) return null;
  try {
    const t = await u.getIdToken();
    tokenTerakhir = t;
    return t;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const authEnabled = hasAuthConfig();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(authEnabled);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    // onIdTokenChanged (bukan onAuthStateChanged) supaya token yang di-refresh
    // otomatis ikut tersimpan — kalau tidak, request bisa gagal 401 diam-diam
    // setelah satu jam.
    return onIdTokenChanged(auth, async (u) => {
      setUser(u);
      tokenTerakhir = u ? await u.getIdToken() : null;
      setLoading(false);
    });
  }, []);

  const loginEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth belum dikonfigurasi.");
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const daftarEmail = useCallback(
    async (email: string, password: string, nama?: string) => {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error("Firebase Auth belum dikonfigurasi.");
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (nama?.trim()) await updateProfile(cred.user, { displayName: nama.trim() });
    },
    [],
  );

  const loginGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth belum dikonfigurasi.");
    await signInWithPopup(auth, googleProvider);
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
    tokenTerakhir = null;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, authEnabled, loginEmail, daftarEmail, loginGoogle, logout }),
    [user, loading, authEnabled, loginEmail, daftarEmail, loginGoogle, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth harus dipakai di dalam <AuthProvider>.");
  return v;
}

/** Pesan error Firebase Auth dalam Bahasa Indonesia. */
export function pesanErrorAuth(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-email":
      return "Format email tidak valid.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email atau kata sandi salah.";
    case "auth/email-already-in-use":
      return "Email ini sudah terdaftar. Silakan login.";
    case "auth/weak-password":
      return "Kata sandi terlalu lemah (minimal 6 karakter).";
    case "auth/popup-closed-by-user":
      return "Jendela login Google ditutup sebelum selesai.";
    case "auth/operation-not-allowed":
      return "Metode login ini belum diaktifkan di Firebase Console.";
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan. Coba lagi beberapa saat.";
    case "auth/network-request-failed":
      return "Gagal terhubung ke server. Periksa koneksi internet.";
    default:
      return (err as Error)?.message || "Terjadi kesalahan. Coba lagi.";
  }
}
