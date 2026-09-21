// ---------------------------------------------------------------------------
// Environment + default business configuration.
// Server-only. Never import this from a "use client" component.
// ---------------------------------------------------------------------------
import type { Business } from "./types";

export const env = {
  // --- Claude / Anthropic ---
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Default to current-gen Sonnet: fast + cost-effective for high-volume CS chat.
  // Switch to "claude-opus-5" for higher quality answers.
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",

  // --- Google Gemini (penyedia AI alternatif) ---
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  /** Paksa penyedia tertentu: "anthropic" | "gemini". Kosong = deteksi otomatis. */
  aiProvider: process.env.ZAVI_AI_PROVIDER ?? "",

  // --- WhatsApp Cloud API (Meta) ---
  whatsappToken: process.env.WHATSAPP_TOKEN ?? "",
  verifyToken: process.env.VERIFY_TOKEN ?? "zavi-verify-token",
  /**
   * App Secret dari Meta (App Settings → Basic). Dipakai memverifikasi
   * tanda tangan webhook. Tanpa ini, webhook tidak bisa membedakan Meta dari
   * pengirim palsu.
   */
  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  /**
   * Id konfigurasi Embedded Signup, dibuat di Meta App Dashboard →
   * WhatsApp → Embedded Signup. Bukan App ID. Tanpa ini tombol "Hubungkan
   * lewat Facebook" tidak punya alur untuk dibuka.
   */
  metaConfigId: process.env.META_CONFIG_ID ?? "",
  phoneNumberId: process.env.PHONE_NUMBER_ID ?? "",
  graphApiVersion: process.env.GRAPH_API_VERSION ?? "v21.0",

  // --- Firestore (Firebase Admin) ---
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  // Private key may contain literal "\n" when stored in a single-line env var.
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(
    /\\n/g,
    "\n",
  ),
  // Optional: path to a service-account JSON file instead of inline vars.
  googleAppCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",
  // Firestore database id. Empty = the conventional "(default)" database.
  // Set this when the project uses a *named* database instead (this project's
  // database is literally named "default", which is NOT the same as "(default)").
  firebaseDatabaseId: process.env.FIREBASE_DATABASE_ID ?? "",
  /**
   * Paksa memakai Application Default Credentials (tanpa key sama sekali).
   * Berguna di lingkungan Google Cloud yang service account-nya sudah melekat.
   */
  firebaseUseAdc: (process.env.FIREBASE_USE_ADC ?? "").toLowerCase() === "true",
};

/**
 * True saat berjalan di dalam Google Cloud Run / App Hosting.
 *
 * Cloud Run selalu menyetel K_SERVICE. Di lingkungan itu service account sudah
 * melekat pada container, sehingga Firebase Admin bisa memakai Application
 * Default Credentials tanpa satu pun key di env.
 */
function diCloudRun(): boolean {
  return Boolean(process.env.K_SERVICE);
}

/** Penyedia AI yang benar-benar bisa dipakai saat ini. */
export function resolveAIProvider(): "anthropic" | "gemini" | "none" {
  const paksa = env.aiProvider.toLowerCase();
  if (paksa === "anthropic") return env.anthropicApiKey ? "anthropic" : "none";
  if (paksa === "gemini") return env.geminiApiKey ? "gemini" : "none";
  // Deteksi otomatis: pakai key mana pun yang tersedia.
  if (env.anthropicApiKey) return "anthropic";
  if (env.geminiApiKey) return "gemini";
  return "none";
}

/** True when an AI provider is usable. */
export function hasAI(): boolean {
  return resolveAIProvider() !== "none";
}

/** Nama model yang dipakai penyedia aktif (untuk ditampilkan di dashboard). */
export function activeAIModel(): string {
  switch (resolveAIProvider()) {
    case "anthropic":
      return env.anthropicModel;
    case "gemini":
      return env.geminiModel;
    default:
      return "-";
  }
}

/** True when the WhatsApp Cloud API is configured to send real messages. */
export function hasWhatsApp(): boolean {
  return Boolean(env.whatsappToken && env.phoneNumberId);
}

/** True when Firestore credentials are present. */
export function hasFirestore(): boolean {
  return Boolean(
    // Kredensial inline (pengembangan lokal).
    (env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey) ||
      // Berkas service account lewat GOOGLE_APPLICATION_CREDENTIALS.
      env.googleAppCredentials ||
      // Application Default Credentials: otomatis di Cloud Run / App Hosting,
      // atau dipaksa lewat FIREBASE_USE_ADC.
      //
      // Tanpa cabang ini, app yang di-deploy ke App Hosting akan DIAM-DIAM
      // jatuh ke penyimpanan memori dan kehilangan seluruh data tiap restart —
      // tanpa satu pun pesan error. Persis kelas kegagalan senyap yang paling
      // mahal: semuanya tampak jalan sampai pelanggan bertanya ke mana
      // pesanannya hilang.
      env.firebaseUseAdc ||
      diCloudRun(),
  );
}

/**
 * Seed business used when Firestore has no config yet, so the bot works
 * out-of-the-box for the demo. Editable from the Settings page.
 * Example UMKM: a small Indonesian food business.
 */
export const DEFAULT_BUSINESS: Business = {
  name: "Sambal Nyonya",
  type: "Kedai Makan (UMKM)",
  tagline: "Masakan rumahan pedas nikmat, siap antar.",
  hours: "Setiap hari, 09.00 - 21.00 WIB",
  address: "Jl. Melati No. 12, Bandung",
  phone: "0812-3456-7890",
  orderInstructions:
    "Untuk order: sebutkan menu, jumlah, nama, alamat, dan jam antar. Pembayaran via transfer/QRIS atau bayar di tempat (COD area Bandung).",
  paymentInfo: "Transfer BCA 1234567890 a.n. Nyonya Sari, atau QRIS, atau COD.",
  catalog: [
    {
      name: "Ayam Geprek Sambal Bawang",
      price: "Rp 18.000",
      description: "Ayam crispy + sambal bawang + nasi",
    },
    {
      name: "Nasi Goreng Kampung",
      price: "Rp 20.000",
      description: "Nasi goreng dengan telur, ayam suwir, dan kerupuk",
    },
    {
      name: "Sambal Nyonya (botol)",
      price: "Rp 25.000",
      description: "Sambal andalan kemasan botol 200ml",
    },
    {
      name: "Es Teh Manis",
      price: "Rp 5.000",
    },
  ],
  extraInfo:
    "Gratis ongkir untuk area radius 3 km. Bisa pesan untuk acara/catering minimal H-1.",
};
