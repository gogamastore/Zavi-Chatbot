// ---------------------------------------------------------------------------
// Preset template bot per jenis usaha.
//
// Roadmap Tahap 2: "Buat Mode Template yang dapat dipilih Calon Pengguna,
// sesuai kebutuhan bisnis Mereka."
//
// Saat mendaftar, tenant memilih salah satu template ini. Isinya disalin jadi
// BotConfig miliknya sendiri, lalu boleh diedit bebas — mengubah preset di sini
// TIDAK mengubah bot tenant yang sudah terlanjur dibuat.
//
// Placeholder yang tersedia di teks balasan (diisi dari profil bisnis):
//   {nama} {jam} {alamat} {telepon} {katalog} {cara_order} {pembayaran}
// ---------------------------------------------------------------------------
import type { BotRule, BotTemplate, BotTemplateId, Business } from "@/lib/types";

/** Balasan yang sama di hampir semua jenis usaha. */
function aturanUmum(): BotRule[] {
  return [
    {
      intent: "jam buka",
      keywords: ["jam buka", "jam berapa", "buka jam", "masih buka", "tutup jam", "operasional"],
      reply: "⏰ *{nama}* buka:\n{jam}",
      enabled: true,
    },
    {
      intent: "alamat",
      keywords: ["alamat", "lokasi", "dimana", "di mana", "maps", "gmaps", "tempatnya"],
      reply: "📍 *Lokasi {nama}:*\n{alamat}",
      enabled: true,
    },
    {
      intent: "pembayaran",
      keywords: ["bayar", "pembayaran", "transfer", "qris", "rekening", "cod", "cara bayar"],
      reply: "💳 *Pembayaran:*\n{pembayaran}",
      enabled: true,
    },
    {
      intent: "admin",
      keywords: ["admin", "manusia", "cs", "customer service", "operator", "komplain", "keluhan"],
      reply:
        "Baik Kak, kami sambungkan ke admin ya 🙏 Mohon tunggu sebentar.\nAtau hubungi langsung: {telepon}",
      enabled: true,
    },
  ];
}

const MENU_UMUM = [
  { id: "jam", title: "Jam buka" },
  { id: "alamat", title: "Lokasi / alamat" },
  { id: "bayar", title: "Pembayaran" },
  { id: "cs", title: "Bicara dengan admin" },
];

export const BOT_TEMPLATES: Record<BotTemplateId, BotTemplate> = {
  resto: {
    id: "resto",
    name: "Resto & Kedai Makan",
    description:
      "Untuk usaha makanan: menampilkan daftar menu, harga, dan alur pesan-antar.",
    suitableFor: ["Warung makan", "Kedai kopi", "Catering", "Kue & snack"],
    menuOptions: [
      { id: "menu", title: "Menu & harga" },
      { id: "order", title: "Cara pesan" },
      ...MENU_UMUM,
    ],
    rules: [
      {
        intent: "harga",
        keywords: ["menu", "harga", "daftar harga", "katalog", "makanan", "minuman", "paket"],
        reply:
          "{katalog}\n\nMau pesan yang mana, Kak? Ketik *cara pesan* untuk langkahnya.",
        enabled: true,
      },
      {
        intent: "cara order",
        keywords: ["cara pesan", "cara order", "gimana pesan", "gimana order", "cara beli"],
        reply: "🛒 *Cara Pesan:*\n{cara_order}",
        enabled: true,
      },
      {
        intent: "pengantaran",
        keywords: ["antar", "delivery", "ongkir", "gofood", "grabfood", "diantar"],
        reply:
          "Kami melayani pesan-antar, Kak 🛵 Sebutkan alamat dan jam antarnya ya, nanti kami infokan ongkirnya.",
        enabled: true,
      },
      ...aturanUmum(),
    ],
  },

  toko: {
    id: "toko",
    name: "Toko / Online Shop",
    description:
      "Untuk penjualan barang: katalog produk, stok, ongkir, dan pengiriman.",
    suitableFor: ["Toko baju", "Olshop", "Toko kelontong", "Reseller"],
    menuOptions: [
      { id: "menu", title: "Katalog & harga" },
      { id: "order", title: "Cara order" },
      { id: "kirim", title: "Pengiriman" },
      ...MENU_UMUM,
    ],
    rules: [
      {
        intent: "harga",
        keywords: ["katalog", "harga", "produk", "barang", "daftar harga", "list", "stok"],
        reply: "{katalog}\n\nMau yang mana, Kak? Ketik *cara order* untuk langkahnya.",
        enabled: true,
      },
      {
        intent: "cara order",
        keywords: ["cara order", "cara beli", "gimana order", "checkout", "cara pesan"],
        reply: "🛒 *Cara Order:*\n{cara_order}",
        enabled: true,
      },
      {
        intent: "pengiriman",
        keywords: ["kirim", "ongkir", "ekspedisi", "jne", "j&t", "sicepat", "resi", "berapa hari"],
        reply:
          "📦 Pengiriman lewat ekspedisi, Kak. Kirim alamat lengkap + kecamatan ya, nanti kami hitung ongkirnya. Resi dikirim setelah paket berangkat.",
        enabled: true,
      },
      ...aturanUmum(),
    ],
  },

  klinik: {
    id: "klinik",
    name: "Klinik & Praktik Kesehatan",
    description:
      "Untuk layanan kesehatan: jadwal praktik, pendaftaran, dan janji temu.",
    suitableFor: ["Klinik", "Praktik dokter", "Bidan", "Klinik gigi"],
    menuOptions: [
      { id: "menu", title: "Layanan & tarif" },
      { id: "order", title: "Buat janji" },
      { id: "jadwal", title: "Jadwal dokter" },
      ...MENU_UMUM,
    ],
    rules: [
      {
        intent: "harga",
        keywords: ["layanan", "tarif", "biaya", "harga", "periksa", "konsultasi"],
        reply:
          "{katalog}\n\nUntuk info lebih detail atau keluhan khusus, admin kami bantu ya Kak.",
        enabled: true,
      },
      {
        intent: "cara order",
        keywords: ["janji", "daftar", "booking", "reservasi", "antri", "antrian"],
        reply: "🗓️ *Cara Buat Janji:*\n{cara_order}",
        enabled: true,
      },
      {
        intent: "jadwal",
        keywords: ["jadwal", "dokter", "praktik", "shift"],
        reply: "🗓️ Jadwal praktik *{nama}*:\n{jam}\n\nUntuk jadwal dokter tertentu, admin kami infokan ya Kak.",
        enabled: true,
      },
      ...aturanUmum(),
    ],
  },

  jasa: {
    id: "jasa",
    name: "Jasa & Layanan",
    description:
      "Untuk penyedia jasa: daftar layanan, tarif, dan penjadwalan pekerjaan.",
    suitableFor: ["Servis AC", "Laundry", "Salon", "Fotografi", "Bengkel"],
    menuOptions: [
      { id: "menu", title: "Layanan & tarif" },
      { id: "order", title: "Cara pesan jasa" },
      ...MENU_UMUM,
    ],
    rules: [
      {
        intent: "harga",
        keywords: ["layanan", "jasa", "tarif", "harga", "biaya", "paket", "daftar harga"],
        reply: "{katalog}\n\nMau pakai layanan yang mana, Kak?",
        enabled: true,
      },
      {
        intent: "cara order",
        keywords: ["cara pesan", "cara order", "booking", "jadwalkan", "pesan jasa", "panggil"],
        reply: "🗓️ *Cara Pesan Layanan:*\n{cara_order}",
        enabled: true,
      },
      ...aturanUmum(),
    ],
  },

  custom: {
    id: "custom",
    name: "Kosong (atur sendiri)",
    description:
      "Mulai dari aturan paling dasar saja, lalu susun sendiri dari nol.",
    suitableFor: ["Jenis usaha lain"],
    menuOptions: MENU_UMUM,
    rules: aturanUmum(),
  },
};

export const TEMPLATE_LIST: BotTemplate[] = [
  BOT_TEMPLATES.resto,
  BOT_TEMPLATES.toko,
  BOT_TEMPLATES.klinik,
  BOT_TEMPLATES.jasa,
  BOT_TEMPLATES.custom,
];

export function getTemplate(id: BotTemplateId): BotTemplate {
  return BOT_TEMPLATES[id] ?? BOT_TEMPLATES.custom;
}

/** Katalog contoh per template, membantu tenant baru mengisi profilnya. */
export function contohKatalog(id: BotTemplateId): Business["catalog"] {
  switch (id) {
    case "resto":
      return [
        { name: "Menu Andalan", price: "Rp 20.000", description: "Ganti dengan menu utama Anda" },
        { name: "Minuman", price: "Rp 5.000" },
      ];
    case "toko":
      return [{ name: "Produk Contoh", price: "Rp 50.000", description: "Ganti dengan produk Anda" }];
    case "klinik":
      return [
        { name: "Konsultasi Umum", price: "Rp 50.000" },
        { name: "Pemeriksaan Lanjutan", price: "Hubungi admin" },
      ];
    case "jasa":
      return [{ name: "Layanan Dasar", price: "Rp 100.000", description: "Ganti dengan layanan Anda" }];
    default:
      return [];
  }
}

/** Isi placeholder di teks balasan dengan data profil bisnis. */
export function isiPlaceholder(reply: string, business: Business, katalog: string): string {
  return reply
    .replaceAll("{nama}", business.name)
    .replaceAll("{jam}", business.hours || "-")
    .replaceAll("{alamat}", business.address || "Hubungi admin untuk alamat lengkap.")
    .replaceAll("{telepon}", business.phone || "-")
    .replaceAll("{katalog}", katalog)
    .replaceAll("{cara_order}", business.orderInstructions || "-")
    .replaceAll("{pembayaran}", business.paymentInfo || "Hubungi admin untuk info pembayaran.")
    .trim();
}
