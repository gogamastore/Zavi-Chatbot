// ---------------------------------------------------------------------------
// Zavi - WhatsApp Assistant :: shared data models
// These types are the single source of truth for the whole app (backend + UI)
// and are meant to map 1:1 to the Flutter models when we mirror the project.
// ---------------------------------------------------------------------------

/** Where an outgoing reply came from. */
export type ReplySource = "rule" | "ai" | "menu" | "system" | "human";

/** Direction of a chat message relative to the business. */
export type ChatDirection = "in" | "out";

/** A single chat message (masuk atau balasan). Firestore collection: "chats". */
export interface ChatMessage {
  id: string;
  /** Customer WhatsApp number (wa_id), e.g. "6281234567890". */
  phone: string;
  /** Customer display name if known. */
  name?: string;
  direction: ChatDirection;
  text: string;
  /** For outgoing messages: which subsystem produced it. */
  source?: ReplySource;
  /** Detected intent keyword for incoming messages (e.g. "harga"). */
  intent?: string;
  /** True when the bot could not answer and flagged it for a human admin. */
  needsHuman?: boolean;
  /** Epoch milliseconds. */
  createdAt: number;
}

/** Status pesanan. */
export type OrderStatus = "baru" | "diproses" | "selesai" | "batal";

export const ORDER_STATUSES: OrderStatus[] = [
  "baru",
  "diproses",
  "selesai",
  "batal",
];

/** A recorded order. Firestore collection: "orders". */
export interface Order {
  id: string;
  phone: string;
  name?: string;
  /** Free-text summary of what the customer wants. */
  summary: string;
  /** Raw customer message that triggered the order. */
  rawText: string;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}

/** One item in the business catalog. */
export interface CatalogItem {
  name: string;
  price: string; // kept as string so businesses can write "Rp 15.000 / porsi"
  description?: string;
}

/** Business profile that shapes every reply. Firestore: config/business. */
export interface Business {
  name: string;
  /** e.g. "Kedai Kopi", "Restoran", "Klinik", "Toko Online". */
  type: string;
  tagline?: string;
  hours: string;
  address?: string;
  phone?: string;
  orderInstructions: string;
  paymentInfo?: string;
  catalog: CatalogItem[];
  /** Extra free-text facts the AI may use. */
  extraInfo?: string;
}

/** Knowledge document the AI can reference. Firestore: "knowledge". */
export interface KnowledgeDoc {
  id: string;
  title: string;
  /** "text" (pasted) or "url" (fetched page) or "file" (uploaded content). */
  kind: "text" | "url" | "file";
  /** For url kind, the source URL. */
  url?: string;
  /** The actual content passed to the AI. */
  content: string;
  /**
   * Epoch ms saat isi URL terakhir berhasil diambil.
   *
   * Isi halaman web berubah. Tanpa cap waktu ini, pemilik bisnis tidak punya
   * cara tahu bahwa yang dipakai AI adalah harga tiga bulan lalu.
   */
  fetchedAt?: number;
  /** Pesan kegagalan pengambilan terakhir. Ditampilkan apa adanya ke pemilik. */
  fetchError?: string;
  /** True kalau isi halaman dipotong karena melebihi batas. */
  truncated?: boolean;
  createdAt: number;
}

/** A grouped conversation (derived from chats), one per phone number. */
export interface Conversation {
  phone: string;
  name?: string;
  lastText: string;
  lastAt: number;
  messageCount: number;
  needsHuman: boolean;
}

/** Dashboard summary numbers. */
export interface Stats {
  totalChats: number;
  totalConversations: number;
  ordersByStatus: Record<OrderStatus, number>;
  totalOrders: number;
  needsHuman: number;
  aiReplies: number;
  ruleReplies: number;
}

// ===========================================================================
// SaaS layer — tenant, langganan, dan penguncian fitur.
//
// Zavi dijual ke banyak UMKM. Setiap UMKM = satu "tenant" dengan datanya
// sendiri (chats, orders, business, knowledge). Semua tipe di bawah ini juga
// dicerminkan ke Dart untuk app Flutter — lihat FLUTTER_MIRROR.md.
// ===========================================================================

/** Satu pelanggan Zavi (satu UMKM). Firestore: "tenants/{id}". */
export interface Tenant {
  id: string;
  /** Firebase Auth uid pemilik akun. */
  ownerUid: string;
  /** Email pemilik, disalin dari Auth untuk memudahkan pencarian admin. */
  ownerEmail: string;
  /** Nama bisnis saat mendaftar (profil lengkap ada di Business). */
  businessName: string;
  /** Template bot yang dipilih saat onboarding. */
  templateId: BotTemplateId;
  /**
   * Ruang kerja milik pengelola Zavi sendiri, bukan mitra pelanggan.
   *
   * Dipakai supaya akun owner yang sedang mencoba fitur tidak ikut terhitung
   * sebagai klien di dasbor owner — angka "total mitra" harus jujur.
   */
  platformOwner?: boolean;
  /**
   * phone_number_id dari Meta, milik nomor WhatsApp tenant ini. Dipakai webhook
   * untuk menentukan pesan masuk ini milik tenant yang mana, DAN sebagai nomor
   * pengirim balasan. Kosong = belum menghubungkan WhatsApp (simulator saja).
   */
  whatsappPhoneNumberId?: string;
  /** WABA id milik klien (model Tech Provider). Untuk rujukan & dukungan. */
  whatsappWabaId?: string;
  /**
   * Token akses khusus tenant ini. Kosong = pakai token Pengguna Sistem
   * platform, yang pada model Mitra berlaku untuk semua WABA klien yang
   * dikelola. Diisi hanya kalau tenant memakai app Meta sendiri.
   *
   * RAHASIA — jangan pernah dikirim ke browser.
   */
  whatsappToken?: string;
  /** Nomor tampilan, mis. "+62 812-3456-7890". Hanya untuk ditampilkan. */
  whatsappDisplayNumber?: string;
  createdAt: number;
  updatedAt: number;
}

// --- Paket langganan -------------------------------------------------------

/**
 * "owner" bukan paket yang dijual — itu penanda akun pengelola Zavi yang
 * berada DI LUAR sistem langganan sama sekali. Sengaja dijadikan PlanId
 * tersendiri, bukan dipinjamkan dari "pro", supaya akun internal tidak pernah
 * terbaca sebagai pelanggan Pro yang membayar di laporan mana pun.
 */
export type PlanId = "trial" | "basic" | "pro" | "owner";

/** Paket kredit AI tambahan (top-up), dibeli terpisah dari langganan. */
export type CreditPackId = "kredit-250" | "kredit-1000" | "kredit-3000";

export interface CreditPack {
  id: CreditPackId;
  name: string;
  /** Jumlah balasan AI tambahan yang didapat. */
  credits: number;
  priceIdr: number;
  /** Label kecil di kartu, mis. "Paling laris". */
  badge?: string;
}

/** Fitur yang bisa dikunci/dibuka per paket. */
export type FeatureKey =
  | "simulator"        // uji bot di browser
  | "chats"            // riwayat chat
  | "orders"           // manajemen pesanan
  | "ai_replies"       // jawaban AI (bukan cuma rule)
  | "knowledge_base"   // dokumen pengetahuan AI
  | "bot_template"     // ganti/atur template bot
  | "whatsapp_connect" // hubungkan nomor WhatsApp asli
  | "export";          // ekspor data

export const ALL_FEATURES: FeatureKey[] = [
  "simulator",
  "chats",
  "orders",
  "ai_replies",
  "knowledge_base",
  "bot_template",
  "whatsapp_connect",
  "export",
];

export interface Plan {
  id: PlanId;
  name: string;
  /** Harga per bulan dalam Rupiah. 0 = gratis (trial). */
  priceIdr: number;
  /** Kuota balasan AI per bulan. Penting: biaya AI ditanggung platform. */
  aiRepliesPerMonth: number;
  maxKnowledgeDocs: number;
  /** Jumlah nomor WhatsApp yang boleh dihubungkan. */
  maxWhatsappNumbers: number;
  features: FeatureKey[];
  /** Ditampilkan di halaman harga. */
  highlights: string[];
}

// --- Status langganan ------------------------------------------------------

export type SubscriptionStatus =
  /** Masa percobaan 3 hari, semua fitur terbuka. */
  | "trial"
  /** Percobaan habis, belum bayar → fitur terkunci. */
  | "trial_ended"
  /** Menunggu pembayaran diselesaikan di Midtrans. */
  | "pending"
  /** Langganan aktif dan sudah dibayar. */
  | "active"
  /** Lewat jatuh tempo tapi masih dalam masa tenggang. */
  | "past_due"
  /** Dibatalkan atau kedaluwarsa → fitur terkunci. */
  | "expired";

/** Status langganan satu tenant. Firestore: "subscriptions/{tenantId}". */
export interface Subscription {
  tenantId: string;
  status: SubscriptionStatus;
  planId: PlanId;
  trialStartedAt: number;
  /** Epoch ms saat percobaan berakhir. */
  trialEndsAt: number;
  /** Epoch ms akhir periode berbayar berjalan. */
  currentPeriodEnd?: number;
  /** Pemakaian AI periode berjalan, untuk menegakkan kuota. */
  aiRepliesUsed: number;
  /**
   * Sisa kredit AI hasil pembelian top-up.
   *
   * Sengaja TIDAK di-reset saat periode baru dimulai: kredit ini sudah dibayar
   * terpisah, jadi menghanguskannya tiap bulan sama saja dengan mengambil
   * barang yang sudah dibeli pelanggan.
   */
  aiCreditsBalance?: number;
  /** Total kredit yang pernah dibeli. Hanya untuk audit/laporan. */
  aiCreditsPurchased?: number;
  /** Epoch ms saat penghitung kuota terakhir di-reset. */
  usageResetAt: number;
  /** order_id Midtrans dari transaksi terakhir. */
  lastOrderId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Hasil perhitungan hak akses — inilah yang dibaca UI dan API untuk memutuskan
 * boleh/tidaknya suatu aksi. Selalu diturunkan dari Subscription, jangan pernah
 * disimpan, supaya tidak pernah basi.
 */
export interface Entitlement {
  status: SubscriptionStatus;
  planId: PlanId;
  /** True = semua fitur berbayar terkunci, arahkan ke halaman pembayaran. */
  locked: boolean;
  /** Sisa hari percobaan (0 kalau bukan/sudah lewat masa trial). */
  trialDaysLeft: number;
  /**
   * Sisa hari periode BERBAYAR (0 kalau belum pernah berlangganan).
   *
   * Dihitung di server, bukan di browser, supaya halaman tidak perlu
   * memanggil Date.now() saat render — render yang tidak murni itu sumber bug
   * yang sulit dilacak, dan lint proyek ini memang menolaknya.
   */
  periodDaysLeft: number;
  /** True saat trial tinggal <= 1 hari — UI menampilkan peringatan. */
  trialEndingSoon: boolean;
  /** Peta fitur → boleh dipakai atau tidak. */
  features: Record<FeatureKey, boolean>;
  aiRepliesUsed: number;
  aiRepliesLimit: number;
  /** Sisa kredit top-up, di luar kuota bulanan paket. */
  aiCreditsBalance: number;
  /** Sisa balasan AI seluruhnya = sisa kuota paket + kredit top-up. */
  aiRepliesRemaining: number;
  /** True kalau kuota paket DAN kredit sama-sama habis (fitur lain tetap jalan). */
  aiQuotaExceeded: boolean;
  /**
   * Akun di luar sistem langganan (owner/pengelola): tanpa batas kuota, tanpa
   * masa berlaku, tanpa tagihan. UI menampilkan "Tanpa batas", bukan angka.
   */
  unlimited: boolean;
  /** Alasan singkat dalam Bahasa Indonesia untuk ditampilkan ke pengguna. */
  reason: string;
}

// --- Pembayaran ------------------------------------------------------------

export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "refunded";

/** Yang dibeli: perpanjangan langganan, atau kredit AI tambahan. */
export type PaymentKind = "subscription" | "credits";

/** Penyedia pembayaran yang memproses transaksi. */
export type PaymentProvider = "midtrans" | "lynkid";

/** Satu percobaan pembayaran. Firestore: "payments/{orderId}". */
export interface Payment {
  /** order_id/id transaksi; juga id dokumen. */
  orderId: string;
  tenantId: string;
  /**
   * Penyedia yang memproses transaksi ini. Kosong = data lama (Midtrans),
   * supaya riwayat sebelum Lynk.id ada tetap terbaca benar.
   */
  provider?: PaymentProvider;
  /**
   * Jenis pembelian. Pembayaran lama tidak punya field ini — kosong berarti
   * "subscription", jadi riwayat sebelum fitur kredit ada tetap terbaca benar.
   */
  kind?: PaymentKind;
  /**
   * Paket langganan. Untuk pembelian kredit, diisi paket yang sedang dipakai
   * tenant saat membeli — sekadar jejak audit, tidak dipakai mengaktifkan apa pun.
   */
  planId: PlanId;
  /** Hanya untuk kind "credits". */
  creditPackId?: CreditPackId;
  /** Jumlah kredit yang dibeli. Hanya untuk kind "credits". */
  credits?: number;
  amountIdr: number;
  status: PaymentStatus;
  /** Token Snap dari Midtrans, dipakai frontend membuka popup bayar. */
  snapToken?: string;
  snapRedirectUrl?: string;
  /** URL checkout Lynk.id (pengganti snapToken pada alur Lynk.id). */
  checkoutUrl?: string;
  /** Cara bayar yang dipakai pelanggan (qris, bank_transfer, gopay, …). */
  paymentType?: string;
  /** Status mentah dari penyedia (transaction_status Midtrans / status Lynk.id), untuk audit. */
  providerStatus?: string;
  /** @deprecated dipakai data lama; penulisan baru memakai providerStatus. */
  midtransStatus?: string;
  paidAt?: number;
  createdAt: number;
  updatedAt: number;
}

// --- Template bot ----------------------------------------------------------

/**
 * Template bot per jenis usaha (Roadmap Tahap 2: "Mode Template yang dapat
 * dipilih Calon Pengguna, sesuai kebutuhan bisnis Mereka").
 */
export type BotTemplateId = "resto" | "toko" | "klinik" | "jasa" | "custom";

/** Satu aturan balasan template yang bisa diedit tenant. */
export interface BotRule {
  /** Nama intent, mis. "jam buka". */
  intent: string;
  /** Kata kunci pemicu. */
  keywords: string[];
  /**
   * Isi balasan. Mendukung placeholder yang diisi dari profil bisnis:
   * {nama}, {jam}, {alamat}, {telepon}, {katalog}, {cara_order}, {pembayaran}
   */
  reply: string;
  /** False = aturan dimatikan tanpa dihapus. */
  enabled: boolean;
}

/** Preset siap pakai per jenis usaha. */
export interface BotTemplate {
  id: BotTemplateId;
  name: string;
  description: string;
  /** Lambang di kartu galeri. Emoji, bukan berkas — tidak ada aset yang perlu dimuat. */
  icon: string;
  /**
   * Warna khas template, dipakai di kartu galeri.
   *
   * Warna solid hanya untuk lambang dan garis tepi; latar memakai warna yang
   * sama dengan alpha rendah. Dengan begitu teks tetap dibaca di atas
   * permukaan biasa dan tidak ada pasangan warna yang kontrasnya meragukan.
   */
  accent: string;
  /** Contoh jenis bisnis yang cocok, untuk membantu pengguna memilih. */
  suitableFor: string[];
  menuOptions: { id: string; title: string }[];
  rules: BotRule[];
}

/** Konfigurasi bot milik satu tenant. Firestore: "botConfigs/{tenantId}". */
export interface BotConfig {
  tenantId: string;
  templateId: BotTemplateId;
  /** Aturan efektif — mulai dari preset template, boleh diedit tenant. */
  rules: BotRule[];
  menuOptions: { id: string; title: string }[];
  /** Sapaan pembuka. Kosong = pakai bawaan template. */
  greeting?: string;
  updatedAt: number;
}

// --- Pengaturan AI per tenant ---------------------------------------------

/** Penyedia AI yang didukung. Dipilih per tenant atau global. */
export type AIProvider = "anthropic" | "gemini" | "none";

/**
 * Satu "tindakan" terstruktur: kalau <when>, lakukan <then>.
 *
 * Menggantikan peran satu kotak teks bebas. Aturan yang ditambahkan satu per
 * satu bisa dimatikan sendiri-sendiri, dibaca ulang pemiliknya, dan diuji
 * satu-satu — paragraf panjang tidak bisa.
 */
export interface AIAction {
  id: string;
  /** Pemicunya, mis. "pelanggan menanyakan harga grosir". */
  when: string;
  /** Yang harus dilakukan bot, mis. "tawarkan paket isi 5 lalu minta jumlahnya". */
  then: string;
  /** Aturan yang dimatikan tetap tersimpan, tapi tidak dikirim ke AI. */
  enabled: boolean;
  createdAt: number;
}

/** Pengaturan AI satu tenant. Firestore: "aiConfigs/{tenantId}". */
export interface AIConfig {
  tenantId: string;
  /** False = semua pertanyaan bebas langsung dieskalasi ke admin. */
  enabled: boolean;
  provider: AIProvider;
  /** Kosong = pakai model bawaan provider. */
  model?: string;
  /** Gaya bicara tambahan yang disisipkan ke system prompt. */
  tone?: string;
  /**
   * Instruksi umum yang selalu berlaku (bukan bersyarat).
   *
   * Dipertahankan demi data lama dan karena memang ada instruksi yang berlaku
   * setiap saat. Aturan BERSYARAT tempatnya di `actions`.
   */
  customInstructions?: string;
  /** Tindakan bersyarat, ditambahkan satu per satu oleh pemilik bisnis. */
  actions?: AIAction[];
  /**
   * Serahkan pertanyaan produk/harga ke AI, bukan dibalas daftar katalog
   * otomatis oleh aturan template. Default: ya (undefined dianggap true).
   *
   * Dengan katalog yang diimpor dari Excel, AI bisa menjawab "ada baju hitam
   * ukuran L?" dengan tepat; aturan template hanya bisa menyiram seluruh
   * daftar. Tetap ada cadangannya: kalau AI mati/terkunci/kuota habis,
   * aturan katalog otomatis mengambil alih lagi.
   */
  productQuestionsToAI?: boolean;
  /** Eskalasi ke admin saat AI ragu. */
  escalateWhenUnsure: boolean;
  /** Batas pesan riwayat yang dikirim ke AI (menahan biaya token). */
  historyLimit: number;
  updatedAt: number;
}
