// ---------------------------------------------------------------------------
// Embedded Signup — "Hubungkan WhatsApp lewat login Facebook".
//
// Model Tech Provider: mitra menekan satu tombol, login akun Facebook mereka,
// dan nomor WhatsApp-nya tersambung ke App ID Meta milik Zavi. Mitra tidak
// membuat app Meta sendiri, tidak menyalin token, tidak mengisi id apa pun.
//
// ====================== BACA INI SEBELUM MENGUBAH ==========================
// Browser mengirimkan waba_id dan phone_number_id dari event Embedded Signup.
// NILAI ITU TIDAK BOLEH DIPERCAYA. Keduanya cuma angka yang bisa diketik
// siapa saja, sementara phone_number_id adalah kunci yang dipakai webhook
// untuk menentukan pesan masuk milik tenant yang mana.
//
// Kalau dipercaya mentah, satu mitra bisa mengklaim nomor mitra lain dan
// membajak seluruh chat pelanggannya.
//
// Karena itu urutannya:
//   1. Tukar kode jadi token bisnis (hanya bisa dilakukan server, pakai
//      app secret).
//   2. Tanya Meta lewat debug_token: WABA mana saja yang SEBENARNYA diberikan
//      izin oleh token itu. Klaim di luar daftar itu ditolak.
//   3. Ambil daftar nomor milik WABA tersebut dari Meta, bukan dari browser.
//   4. Tolak kalau nomornya sudah diklaim tenant lain.
// ===========================================================================
import { env } from "@/lib/config";

export class SignupError extends Error {
  constructor(
    message: string,
    readonly salahPengguna = true,
  ) {
    super(message);
    this.name = "SignupError";
  }
}

function graph(path: string): string {
  return `https://graph.facebook.com/${env.graphApiVersion}/${path}`;
}

/** Embedded Signup baru bisa dipakai kalau ketiganya ada di server. */
export function hasEmbeddedSignup(): boolean {
  return Boolean(env.metaAppId && env.metaAppSecret && env.metaConfigId);
}

/** Apa saja yang masih kurang — ditampilkan apa adanya ke pengelola. */
export function kekuranganEmbeddedSignup(): string[] {
  const kurang: string[] = [];
  if (!env.metaAppId) kurang.push("META_APP_ID");
  if (!env.metaAppSecret) kurang.push("META_APP_SECRET");
  if (!env.metaConfigId) kurang.push("META_CONFIG_ID");
  return kurang;
}

async function graphJson(
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.error) {
    const e = (json.error ?? {}) as { message?: string; code?: number };
    // Pesan asli Meta diteruskan: menebak-nebak terjemahannya hanya membuat
    // pengelola menebak juga saat harus memperbaiki konfigurasi.
    throw new SignupError(
      `Meta menolak (${e.code ?? res.status}): ${e.message ?? "tidak ada keterangan"}`,
      false,
    );
  }
  return json;
}

/**
 * Tukar authorization code jadi token bisnis milik klien.
 *
 * Kode ini kedaluwarsa 30 detik setelah dibuat, jadi penukarannya harus
 * langsung. Penukaran WAJIB di server: butuh app secret.
 */
export async function tukarKode(code: string): Promise<string> {
  const url =
    graph("oauth/access_token") +
    `?client_id=${encodeURIComponent(env.metaAppId)}` +
    `&client_secret=${encodeURIComponent(env.metaAppSecret)}` +
    `&code=${encodeURIComponent(code)}`;
  const json = await graphJson(url);
  const token = String(json.access_token ?? "");
  if (!token) {
    throw new SignupError(
      "Meta tidak mengembalikan token. Kode mungkin sudah kedaluwarsa (berlaku 30 detik) — coba hubungkan ulang.",
    );
  }
  return token;
}

/**
 * WABA mana saja yang benar-benar diberikan izin oleh token ini.
 *
 * Inilah pemeriksaan yang mencegah satu mitra mengklaim WABA mitra lain:
 * yang menentukan bukan angka yang dikirim browser, melainkan apa yang
 * sebenarnya tertulis di dalam token menurut Meta sendiri.
 */
export async function wabaYangDiizinkan(token: string): Promise<string[]> {
  const url =
    graph("debug_token") +
    `?input_token=${encodeURIComponent(token)}` +
    `&access_token=${encodeURIComponent(`${env.metaAppId}|${env.metaAppSecret}`)}`;
  const json = await graphJson(url);
  const data = (json.data ?? {}) as {
    granular_scopes?: { scope: string; target_ids?: string[] }[];
  };

  const ids = new Set<string>();
  for (const g of data.granular_scopes ?? []) {
    if (g.scope?.startsWith("whatsapp_business")) {
      for (const id of g.target_ids ?? []) ids.add(String(id));
    }
  }
  return [...ids];
}

export interface NomorWaba {
  id: string;
  displayPhoneNumber: string;
  verifiedName?: string;
  /** Status verifikasi dari Meta, ditampilkan apa adanya. */
  status?: string;
}

/** Daftar nomor milik satu WABA — diambil dari Meta, bukan dari browser. */
export async function nomorMilikWaba(wabaId: string, token: string): Promise<NomorWaba[]> {
  const url =
    graph(`${encodeURIComponent(wabaId)}/phone_numbers`) +
    `?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating` +
    `&access_token=${encodeURIComponent(token)}`;
  const json = await graphJson(url);
  const data = (json.data ?? []) as Record<string, unknown>[];
  return data.map((n) => ({
    id: String(n.id ?? ""),
    displayPhoneNumber: String(n.display_phone_number ?? ""),
    verifiedName: n.verified_name ? String(n.verified_name) : undefined,
    status: n.code_verification_status ? String(n.code_verification_status) : undefined,
  }));
}

/**
 * Langgankan app Zavi ke WABA klien supaya pesan masuk terkirim ke webhook.
 *
 * Tanpa langkah ini nomornya tersambung tapi bot tidak pernah menerima apa
 * pun — gejala yang membingungkan karena semuanya terlihat "terhubung".
 */
export async function langgananWebhook(wabaId: string, token: string): Promise<void> {
  await graphJson(graph(`${encodeURIComponent(wabaId)}/subscribed_apps`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Daftarkan nomor ke Cloud API dengan PIN verifikasi dua langkah.
 *
 * Dipisah dan boleh gagal sendiri: nomor yang sudah pernah terdaftar akan
 * ditolak Meta, dan itu bukan alasan menggagalkan seluruh penyambungan.
 */
export async function daftarkanNomor(
  phoneNumberId: string,
  pin: string,
  token: string,
): Promise<void> {
  await graphJson(graph(`${encodeURIComponent(phoneNumberId)}/register`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}
