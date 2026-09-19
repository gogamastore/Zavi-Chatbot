// ---------------------------------------------------------------------------
// Kesehatan AI yang jujur.
//
// Masalah yang diperbaiki file ini: dashboard sempat menampilkan "AI aktif"
// hanya karena API key TERISI — padahal setiap panggilan gagal (saldo habis).
// Indikator yang berbohong lebih berbahaya daripada tidak ada indikator, karena
// membuat orang mencari masalah di tempat yang salah.
//
// Dua sumber kebenaran digabung di sini:
//   1. Pasif  — hasil setiap panggilan AI sungguhan dicatat.
//   2. Aktif  — uji koneksi ringan (1 token) saat status belum diketahui,
//               hasilnya di-cache agar tidak membanjiri penyedia.
// ---------------------------------------------------------------------------
import { env, resolveAIProvider } from "@/lib/config";

export type AIStatus =
  /** Tidak ada API key sama sekali. */
  | "belum-dikonfigurasi"
  /** Key ada tapi belum pernah dipakai/diuji sejak server hidup. */
  | "belum-diperiksa"
  /** Panggilan terakhir berhasil. */
  | "berfungsi"
  /** Key ada tapi panggilan gagal (saldo habis, key salah, model ditutup…). */
  | "gagal";

export interface AIHealth {
  status: AIStatus;
  provider: "anthropic" | "gemini" | "none";
  model: string;
  /** Pesan apa adanya dari penyedia, supaya penyebabnya jelas. */
  lastError?: string;
  /** Epoch ms saat status ini ditetapkan. */
  checkedAt?: number;
  /** Dari panggilan pelanggan sungguhan, atau dari uji koneksi. */
  sumber?: "panggilan-nyata" | "uji-koneksi";
}

interface HealthState {
  status: AIStatus;
  lastError?: string;
  checkedAt?: number;
  sumber?: "panggilan-nyata" | "uji-koneksi";
}

/** Dipin ke globalThis supaya bertahan melewati hot-reload Next.js. */
function state(): HealthState {
  const g = globalThis as unknown as { __zaviAIHealth?: HealthState };
  g.__zaviAIHealth ??= { status: "belum-diperiksa" };
  return g.__zaviAIHealth;
}

/** Dicatat dari panggilan AI sungguhan — bukti terkuat bahwa AI berfungsi. */
export function catatBerhasil(): void {
  const s = state();
  s.status = "berfungsi";
  s.lastError = undefined;
  s.checkedAt = Date.now();
  s.sumber = "panggilan-nyata";
}

/** Dicatat saat panggilan AI sungguhan gagal. */
export function catatGagal(pesan: string): void {
  const s = state();
  s.status = "gagal";
  s.lastError = ringkas(pesan);
  s.checkedAt = Date.now();
  s.sumber = "panggilan-nyata";
}

function ringkas(pesan: string): string {
  return pesan.replace(/\s+/g, " ").trim().slice(0, 240);
}

/** Terjemahkan penyebab teknis jadi kalimat yang berguna bagi pemilik bisnis. */
export function saranPerbaikan(h: AIHealth): string | undefined {
  if (h.status !== "gagal") return undefined;
  const e = (h.lastError ?? "").toLowerCase();
  if (e.includes("resource_exhausted") || e.includes("credits are depleted")) {
    return "Saldo penyedia AI habis. Isi ulang untuk mengaktifkan kembali.";
  }
  if (e.includes("quota")) return "Kuota penyedia AI terlampaui.";
  if (e.includes("api key") || e.includes("unauthorized") || e.includes("401") || e.includes("permission")) {
    return "API key ditolak. Periksa kembali nilainya.";
  }
  if (e.includes("not_found") || e.includes("no longer available")) {
    return "Model tidak tersedia. Ganti nama model di Pengaturan AI.";
  }
  return "Panggilan ke penyedia AI gagal. Lihat pesan aslinya di bawah.";
}

/**
 * Uji koneksi ringan: minta 1 token. Cukup untuk membuktikan key DAN saldo,
 * tapi biayanya dapat diabaikan.
 */
export async function ujiKoneksi(): Promise<AIHealth> {
  const provider = resolveAIProvider();
  if (provider === "none") {
    const s = state();
    s.status = "belum-dikonfigurasi";
    s.lastError = undefined;
    s.checkedAt = Date.now();
    s.sumber = "uji-koneksi";
    return bacaKesehatan();
  }

  try {
    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "x-goog-api-key": env.geminiApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) {
        throw new Error(`${j.error?.status ?? r.status}: ${j.error?.message ?? "gagal"}`);
      }
    } else {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: env.anthropicApiKey });
      await client.messages.create({
        model: env.anthropicModel,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
    }
    const s = state();
    s.status = "berfungsi";
    s.lastError = undefined;
    s.checkedAt = Date.now();
    s.sumber = "uji-koneksi";
  } catch (err) {
    const s = state();
    s.status = "gagal";
    s.lastError = ringkas(err instanceof Error ? err.message : String(err));
    s.checkedAt = Date.now();
    s.sumber = "uji-koneksi";
  }
  return bacaKesehatan();
}

/** Berapa lama hasil uji dianggap masih berlaku sebelum diperiksa ulang. */
const UMUR_CACHE_MS = 5 * 60_000;

/**
 * Kesehatan AI saat ini. Kalau belum pernah diketahui — atau hasilnya sudah
 * basi — lakukan uji koneksi sekali, lalu simpan.
 */
export async function kesehatanAI(): Promise<AIHealth> {
  const provider = resolveAIProvider();
  const s = state();

  if (provider === "none") {
    s.status = "belum-dikonfigurasi";
    return bacaKesehatan();
  }
  // Status "belum-dikonfigurasi" yang tertinggal dari sebelum key diisi.
  if (s.status === "belum-dikonfigurasi") s.status = "belum-diperiksa";

  const basi = !s.checkedAt || Date.now() - s.checkedAt > UMUR_CACHE_MS;
  if (s.status === "belum-diperiksa" || basi) {
    return ujiKoneksi();
  }
  return bacaKesehatan();
}

/** Baca status tersimpan tanpa memicu uji koneksi. */
export function bacaKesehatan(): AIHealth {
  const s = state();
  return {
    status: resolveAIProvider() === "none" ? "belum-dikonfigurasi" : s.status,
    provider: resolveAIProvider(),
    model:
      resolveAIProvider() === "anthropic"
        ? env.anthropicModel
        : resolveAIProvider() === "gemini"
          ? env.geminiModel
          : "-",
    lastError: s.lastError,
    checkedAt: s.checkedAt,
    sumber: s.sumber,
  };
}
