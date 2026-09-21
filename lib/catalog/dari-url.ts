// ---------------------------------------------------------------------------
// Susun katalog dari halaman web.
//
// Alurnya: ambil halaman (pengambil ber-penjagaan SSRF yang sama dengan
// knowledge base) → serahkan teksnya ke AI → minta daftar produk terstruktur.
//
// DUA HAL YANG DISENGAJA, jangan diubah tanpa memikirkannya ulang:
//
// 1. Hasilnya SELALU pratinjau, tidak pernah langsung menimpa katalog.
//    Ini pembacaan mesin atas halaman orang; salah baca itu wajar, dan
//    menimpa katalog pemilik tanpa dia lihat dulu adalah kerusakan yang
//    sulit dibatalkan. Sama persis dengan aturan impor Excel.
//
// 2. AI dilarang mengarang. Halaman katalog sering memuat teks promosi,
//    menu navigasi, dan artikel blog. Model yang "membantu" bisa menyulap
//    itu jadi produk beserta harga yang tidak pernah ada — dan harga karangan
//    di WhatsApp adalah janji ke pelanggan yang harus ditepati pemiliknya.
// ---------------------------------------------------------------------------
import { panggilAISekali } from "@/lib/bot/ai";
import { ambilHalaman, type HasilAmbil } from "@/lib/knowledge/ambil";
import type { CatalogItem } from "@/lib/types";

/** Batas produk sekali pindai — sama dengan impor Excel. */
export const MAKS_PRODUK_URL = 200;

const SYSTEM = `Kamu adalah pengekstrak data katalog. Tugasmu HANYA membaca teks halaman web dan menuliskan kembali produk yang BENAR-BENAR tercantum di sana.

ATURAN MUTLAK:
1. JANGAN PERNAH mengarang produk, harga, atau deskripsi. Kalau harga tidak tertulis, isi dengan string kosong.
2. Abaikan menu navigasi, tombol, teks promosi umum, artikel blog, testimoni, dan formulir.
3. Salin nama produk apa adanya seperti tertulis di halaman. Jangan diterjemahkan, jangan dirapikan, jangan disingkat.
4. Salin harga apa adanya termasuk mata uangnya (mis. "Rp 25.000", "25rb", "mulai 100k").
5. Kalau halaman ini jelas BUKAN halaman katalog/produk, kembalikan daftar kosong.

Jawab HANYA dengan JSON valid, tanpa penjelasan apa pun, tanpa blok kode. Bentuknya:
{"products":[{"name":"...","price":"...","description":"..."}]}

"description" opsional, isi string kosong kalau tidak ada.`;

export interface HasilPindaiUrl {
  items: CatalogItem[];
  /** Hal yang perlu diketahui pemilik sebelum menerapkan. */
  peringatan: string[];
  urlAkhir: string;
  judulHalaman?: string;
  /** Jumlah karakter halaman yang dibaca AI. */
  panjangTeks: number;
}

export class PindaiError extends Error {
  constructor(
    message: string,
    readonly salahPengguna = true,
  ) {
    super(message);
    this.name = "PindaiError";
  }
}

/** Ambil isi JSON dari jawaban model, tahan terhadap pembungkus tak diminta. */
function uraiJson(mentah: string): { products?: unknown } | null {
  const teks = mentah.trim();
  // Model kadang membungkus dengan ```json walau diminta tidak.
  const tanpaPagar = teks.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const mulai = tanpaPagar.indexOf("{");
  const akhir = tanpaPagar.lastIndexOf("}");
  if (mulai < 0 || akhir <= mulai) return null;
  try {
    return JSON.parse(tanpaPagar.slice(mulai, akhir + 1));
  } catch {
    return null;
  }
}

/**
 * Bersihkan hasil model jadi CatalogItem yang layak disimpan.
 *
 * Model bisa mengembalikan apa saja — angka, null, objek bersarang, nama
 * sepanjang satu paragraf. Semua dibatasi di sini, karena isinya nanti masuk
 * ke katalog yang dibaca AI pada SETIAP balasan ke pelanggan.
 */
function bersihkan(mentah: unknown): { items: CatalogItem[]; dibuang: number } {
  if (!Array.isArray(mentah)) return { items: [], dibuang: 0 };
  const items: CatalogItem[] = [];
  const terlihat = new Set<string>();
  let dibuang = 0;

  for (const m of mentah) {
    if (!m || typeof m !== "object") {
      dibuang++;
      continue;
    }
    const p = m as Record<string, unknown>;
    const name = String(p.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!name) {
      dibuang++;
      continue;
    }
    const kunci = name.toLowerCase();
    if (terlihat.has(kunci)) {
      dibuang++;
      continue;
    }
    terlihat.add(kunci);

    items.push({
      name,
      price: String(p.price ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
      description:
        String(p.description ?? "").trim().replace(/\s+/g, " ").slice(0, 200) || undefined,
    });
    if (items.length >= MAKS_PRODUK_URL) break;
  }
  return { items, dibuang };
}

/** Pindai satu halaman dan usulkan katalognya. Selalu pratinjau, tidak menyimpan. */
export async function pindaiKatalogDariUrl(url: string): Promise<HasilPindaiUrl> {
  let halaman: HasilAmbil;
  try {
    halaman = await ambilHalaman(url);
  } catch (e) {
    // Pesan dari pengambil sudah ditulis untuk pemilik bisnis, teruskan apa adanya.
    throw new PindaiError((e as Error).message, true);
  }

  let jawaban: string;
  try {
    jawaban = await panggilAISekali(
      SYSTEM,
      `Halaman: ${halaman.urlAkhir}\nJudul: ${halaman.judul ?? "-"}\n\nIsi halaman:\n${halaman.teks}`,
      { maxTokens: 4_000 },
    );
  } catch (e) {
    throw new PindaiError(
      `AI gagal membaca halaman: ${(e as Error).message}`,
      false,
    );
  }

  const json = uraiJson(jawaban);
  if (!json) {
    throw new PindaiError(
      "AI tidak mengembalikan data yang bisa dibaca. Coba lagi, atau salin-tempel daftar produknya secara manual.",
      false,
    );
  }

  const { items, dibuang } = bersihkan(json.products);

  const peringatan: string[] = [];
  if (!items.length) {
    peringatan.push(
      "Tidak ada produk yang terbaca. Halaman ini mungkin bukan halaman katalog, atau daftarnya dimuat lewat JavaScript sehingga tidak terbaca server.",
    );
  }
  if (dibuang > 0) {
    peringatan.push(`${dibuang} baris dilewati karena tanpa nama atau ganda.`);
  }
  if (halaman.terpotong) {
    peringatan.push(
      "Halaman terlalu panjang dan dipotong — produk di bagian bawah mungkin tidak ikut terbaca.",
    );
  }
  const tanpaHarga = items.filter((i) => !i.price).length;
  if (tanpaHarga > 0) {
    peringatan.push(
      `${tanpaHarga} produk tidak punya harga di halaman. Lengkapi sendiri sebelum bot memakainya.`,
    );
  }
  peringatan.push(
    "Hasil ini dibaca mesin dari halaman web — periksa dulu sebelum diterapkan.",
  );

  return {
    items,
    peringatan,
    urlAkhir: halaman.urlAkhir,
    judulHalaman: halaman.judul,
    panjangTeks: halaman.teks.length,
  };
}
