// ---------------------------------------------------------------------------
// Firebase Auth di sisi browser.
//
// Hanya Auth yang dipakai dari klien — data tetap lewat API route kita sendiri,
// supaya aturan langganan (entitlement) tidak bisa dilewati dari browser.
//
// Nilai NEXT_PUBLIC_* memang terlihat publik. Itu wajar dan aman: keamanan
// ditegakkan di server lewat verifikasi ID token, bukan dengan menyembunyikan
// konfigurasi ini.
// ---------------------------------------------------------------------------
"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
};

/** True kalau konfigurasi Firebase Auth lengkap. */
export function hasAuthConfig(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** Auth instance, atau null kalau belum dikonfigurasi (mode demo). */
export function getFirebaseAuth(): Auth | null {
  if (!hasAuthConfig()) return null;
  if (auth) return auth;
  app ??= getApps()[0] ?? initializeApp(config);
  auth = getAuth(app);
  // Sesi bertahan setelah tab ditutup — pemilik UMKM tidak mau login terus.
  void setPersistence(auth, browserLocalPersistence);
  return auth;
}

export const googleProvider = new GoogleAuthProvider();
