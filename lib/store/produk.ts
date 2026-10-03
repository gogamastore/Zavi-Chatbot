// ---------------------------------------------------------------------------
// Produk toko — pengubahan bentuk dan aturan yang dipakai bersama.
//
// Dua tugas yang disengaja ada di satu tempat:
//
//   1. Menurunkan katalog tampilan (CatalogItem) dari produk. Bot WhatsApp dan
//      prompt AI membaca CatalogItem, dan keduanya TIDAK BOLEH ikut berubah
//      hanya karena sumber datanya pindah. Satu fungsi di sini yang
//      menjembataninya.
//
//   2. Memilih produk mana yang masuk prompt AI. Katalog ikut dikirim SETIAP
//      KALI AI menjawab, dan biaya tokennya ditanggung platform. Mitra dengan
//      500 produk tidak boleh membuat setiap pesan pelanggan jadi mahal.
// ---------------------------------------------------------------------------
import type { CatalogItem, Product } from "@/lib/types";

/** Batas produk per tenant. Toko gratis itu ada biayanya — lihat catatan di bawah. */
export const MAKS_PRODUK = 500;

/**
 * Di atas jumlah ini, prompt AI tidak lagi memuat seluruh katalog melainkan
 * hanya produk yang relevan dengan pertanyaan pelanggan.
 *
 * Angkanya kompromi: cukup besar supaya warung dan toko kecil (mayoritas
 * mitra) tetap mendapat katalog penuh — yang selalu lebih akurat daripada
 * hasil pencarian — tapi cukup kecil supaya toko besar tidak membengkakkan
 * biaya setiap balasan.
 */
export const BATAS_KATALOG_PENUH = 60;

/** Berapa produk relevan yang dikirim saat katalog terlalu besar. */
export const PRODUK_RELEVAN = 25;

export function formatRupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

/** Harga + satuan untuk ditampilkan, mis. "Rp 15.000 / porsi". */
export function hargaTampil(p: Product): string {
  const harga = formatRupiah(p.price);
  return p.unit?.trim() ? `${harga} / ${p.unit.trim()}` : harga;
}

/**
 * Ubah satu produk jadi baris katalog yang dibaca bot & AI.
 *
 * Keterangan stok sengaja memakai kata, bukan hanya angka:
 *   - stok tidak dilacak  → tidak disebut sama sekali
 *   - stok 0              → "HABIS", supaya AI tidak menawarkan barang kosong
 *   - stok ada            → "sisa N", disertai aturan di prompt bahwa angka
 *                           ini indikasi dan wajib dikonfirmasi
 *
 * `purchasePrice` TIDAK PERNAH ikut. Itu harga beli — kalau bocor ke prompt,
 * AI bisa menyebut margin pemilik ke pelanggannya sendiri.
 */
export function produkKeKatalog(p: Product): CatalogItem {
  const bagian: string[] = [];
  if (p.description?.trim()) bagian.push(p.description.trim());
  if (p.stock === 0) bagian.push("HABIS");
  else if (typeof p.stock === "number" && p.stock > 0) bagian.push(`sisa ${p.stock}`);

  return {
    name: p.name,
    price: hargaTampil(p),
    description: bagian.length ? bagian.join(" · ") : undefined,
  };
}

/** Hanya produk aktif, diurutkan: yang ada stok dulu, lalu nama. */
export function produkTampil(produk: Product[]): Product[] {
  return produk
    .filter((p) => p.active)
    .sort((a, b) => {
      const habisA = a.stock === 0 ? 1 : 0;
      const habisB = b.stock === 0 ? 1 : 0;
      if (habisA !== habisB) return habisA - habisB;
      return a.name.localeCompare(b.name, "id");
    });
}

// ---------------------------------------------------------------------------
// Pemilihan produk untuk prompt AI
// ---------------------------------------------------------------------------

function kataKunci(teks: string): string[] {
  return teks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    // Kata sangat pendek ("di", "ya", "ga") mencocokkan terlalu banyak hal.
    .filter((k) => k.length >= 3);
}

/**
 * Skor kecocokan satu produk dengan pertanyaan pelanggan.
 *
 * Sengaja sederhana — pencocokan kata, bukan embedding. Alasannya: embedding
 * berarti satu panggilan AI tambahan untuk SETIAP pesan masuk, yang justru
 * biaya yang sedang kita hindari. Pencocokan kata gratis dan untuk katalog
 * UMKM ("baju hitam", "sambal ijo") sudah cukup tepat.
 */
function skor(p: Product, kunci: string[]): number {
  if (!kunci.length) return 0;
  const nama = p.name.toLowerCase();
  const lain = `${p.sku ?? ""} ${p.description ?? ""}`.toLowerCase();
  let n = 0;
  for (const k of kunci) {
    if (nama.includes(k)) n += 3; // nama produk paling menentukan
    else if (lain.includes(k)) n += 1;
  }
  return n;
}

/**
 * Pilih produk yang dikirim ke prompt AI untuk satu pesan pelanggan.
 *
 * Katalog kecil dikirim UTUH — itu selalu lebih akurat daripada hasil
 * pencarian, dan murah. Hanya katalog besar yang disaring.
 */
export function produkUntukPrompt(
  produk: Product[],
  pesanPelanggan: string,
): { dipakai: Product[]; disaring: boolean; totalAktif: number } {
  const aktif = produkTampil(produk);
  if (aktif.length <= BATAS_KATALOG_PENUH) {
    return { dipakai: aktif, disaring: false, totalAktif: aktif.length };
  }

  const kunci = kataKunci(pesanPelanggan);
  const berskor = aktif
    .map((p) => ({ p, s: skor(p, kunci) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, PRODUK_RELEVAN)
    .map((x) => x.p);

  // Tidak ada yang cocok → kirim sebagian saja sebagai contoh, dan prompt
  // memberi tahu AI bahwa katalognya tidak lengkap supaya ia mengarahkan
  // pelanggan bertanya lebih spesifik, bukan menyimpulkan barangnya tidak ada.
  const dipakai = berskor.length ? berskor : aktif.slice(0, PRODUK_RELEVAN);
  return { dipakai, disaring: true, totalAktif: aktif.length };
}

// ---------------------------------------------------------------------------
// Migrasi dari katalog lama
// ---------------------------------------------------------------------------

/**
 * Baca angka Rupiah dari teks harga katalog lama.
 *
 * "Rp 18.000" → 18000, "25rb" → 25000, "Rp 1.250.000" → 1250000.
 * Kembalikan null kalau tidak ada angka yang bisa dipercaya — mis.
 * "Hubungi admin". Produk seperti itu tetap dibuat dengan harga 0 dan
 * ditandai, bukan dibuang: membuang produk orang saat migrasi jauh lebih
 * buruk daripada menyisakan satu angka untuk dibetulkan.
 */
export function uraiHarga(teks: string): number | null {
  const t = teks.toLowerCase().replace(/\s/g, "");
  // Bentuk ringkas "25rb" / "25k" / "1,5jt"
  const ringkas = t.match(/([\d.,]+)(rb|k|jt|juta)\b/);
  if (ringkas) {
    const angka = Number(ringkas[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(angka)) {
      const kali = ringkas[2] === "jt" || ringkas[2] === "juta" ? 1_000_000 : 1_000;
      return Math.round(angka * kali);
    }
  }
  // Bentuk biasa: ambil rentetan angka terpanjang, buang pemisah ribuan.
  const semua = t.match(/\d[\d.]*/g);
  if (!semua?.length) return null;
  const terpanjang = semua.sort((a, b) => b.length - a.length)[0];
  const angka = Number(terpanjang.replace(/\./g, ""));
  return Number.isFinite(angka) && angka > 0 ? angka : null;
}

/** Pisahkan satuan dari teks harga lama: "Rp 15.000 / porsi" → "porsi". */
export function uraiSatuan(teks: string): string | undefined {
  const m = teks.match(/\/\s*([A-Za-z][A-Za-z\s]{0,14})$/);
  return m ? m[1].trim() : undefined;
}

export interface HasilMigrasi {
  produk: Omit<Product, "id" | "createdAt" | "updatedAt">[];
  /** Nama produk yang harganya tidak terbaca dan perlu diperiksa pemilik. */
  perluDiperiksa: string[];
}

/** Ubah katalog lama (harga teks) jadi produk (harga angka). */
export function migrasiKatalog(katalog: CatalogItem[]): HasilMigrasi {
  const produk: HasilMigrasi["produk"] = [];
  const perluDiperiksa: string[] = [];

  for (const k of katalog) {
    const nama = k.name?.trim();
    if (!nama) continue;
    const harga = uraiHarga(k.price ?? "");
    if (harga === null) perluDiperiksa.push(nama);
    produk.push({
      name: nama,
      price: harga ?? 0,
      unit: uraiSatuan(k.price ?? ""),
      // Stok tidak dilacak: katalog lama tidak punya datanya, dan menebak 0
      // akan membuat AI mengabarkan semua produk habis.
      stock: null,
      description: k.description?.trim() || undefined,
      active: true,
    });
  }
  return { produk, perluDiperiksa };
}
