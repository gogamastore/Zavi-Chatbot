// ---------------------------------------------------------------------------
// Impor katalog dari Excel / CSV.
//
// Sasarannya pemilik UMKM, bukan operator teknis. Karena itu penguraiannya
// sengaja PEMAAF:
//   - Nama kolom bebas urutan, bebas huruf besar/kecil, dan mengenali beberapa
//     padanan Indonesia maupun Inggris ("Nama Produk", "Menu", "Item", ...).
//   - Harga boleh angka polos (18000) atau teks apa adanya ("Rp 18.000 / porsi").
//     Angka polos diformat otomatis jadi Rupiah.
//   - Baris kosong dilewati diam-diam; baris tanpa nama dilaporkan, bukan
//     membuat seluruh berkas ditolak.
//
// Yang TIDAK pemaaf: batas ukuran dan jumlah baris. Berkas yang diunggah
// pengguna adalah masukan tidak tepercaya.
// ---------------------------------------------------------------------------
import type { CatalogItem } from "@/lib/types";

/** Batas ukuran berkas unggahan. */
export const MAKS_UKURAN_BYTE = 2 * 1024 * 1024; // 2 MB
/** Batas jumlah produk sekali impor. */
export const MAKS_BARIS = 500;

export interface HasilUrai {
  items: CatalogItem[];
  /** Hal yang perlu diketahui pengguna, tapi tidak menggagalkan impor. */
  peringatan: string[];
  /** Jumlah baris data yang dibaca (termasuk yang dilewati). */
  barisDibaca: number;
}

// --- Pencocokan kolom --------------------------------------------------------

const KOLOM_NAMA = ["nama produk", "nama menu", "nama barang", "nama", "produk", "menu", "barang", "item", "layanan", "jasa", "name", "product"];
const KOLOM_HARGA = ["harga jual", "harga", "tarif", "biaya", "price", "cost"];
const KOLOM_DESKRIPSI = ["deskripsi", "keterangan", "catatan", "detail", "description", "desc", "notes"];

function normalkan(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Cari indeks kolom dari daftar padanan. -1 kalau tidak ketemu. */
function cariKolom(header: string[], padanan: string[]): number {
  const h = header.map(normalkan);
  // Cocok persis lebih dulu, baru cocok sebagian.
  for (const p of padanan) {
    const i = h.indexOf(p);
    if (i >= 0) return i;
  }
  for (const p of padanan) {
    const i = h.findIndex((x) => x.includes(p));
    if (i >= 0) return i;
  }
  return -1;
}

// --- Harga -------------------------------------------------------------------

/**
 * Rapikan nilai harga.
 *
 * Angka polos diformat jadi Rupiah karena itu yang paling sering diketik
 * pemilik UMKM di Excel. Teks yang sudah berformat dibiarkan apa adanya —
 * mereka mungkin menulis "Rp 15.000 / porsi" dan itu memang disengaja.
 */
export function rapikanHarga(nilai: unknown): string {
  if (nilai == null) return "";
  if (typeof nilai === "number" && Number.isFinite(nilai)) {
    return "Rp " + Math.round(nilai).toLocaleString("id-ID");
  }
  const teks = String(nilai).trim();
  if (!teks) return "";
  // Angka murni yang terbaca sebagai teks, mis. "18000" atau "18.000".
  if (/^\d{1,3}(\.\d{3})+$/.test(teks) || /^\d+$/.test(teks)) {
    const angka = Number(teks.replace(/\./g, ""));
    if (Number.isFinite(angka) && angka > 0) {
      return "Rp " + angka.toLocaleString("id-ID");
    }
  }
  return teks;
}

// --- CSV ---------------------------------------------------------------------

/** Pengurai CSV yang menangani tanda kutip dan koma di dalam sel. */
export function uraiCsv(teks: string): string[][] {
  // Buang BOM kalau ada — Excel selalu menambahkannya saat menyimpan CSV UTF-8.
  const isi = teks.replace(/^﻿/, "");
  // Deteksi pemisah: Excel versi Indonesia sering memakai titik koma.
  const barisPertama = isi.split(/\r?\n/)[0] ?? "";
  const pemisah = (barisPertama.match(/;/g)?.length ?? 0) > (barisPertama.match(/,/g)?.length ?? 0) ? ";" : ",";

  const baris: string[][] = [];
  let sel = "";
  let kolom: string[] = [];
  let dalamKutip = false;

  for (let i = 0; i < isi.length; i++) {
    const c = isi[i];
    if (dalamKutip) {
      if (c === '"') {
        if (isi[i + 1] === '"') {
          sel += '"';
          i++;
        } else dalamKutip = false;
      } else sel += c;
      continue;
    }
    if (c === '"') dalamKutip = true;
    else if (c === pemisah) {
      kolom.push(sel);
      sel = "";
    } else if (c === "\n") {
      kolom.push(sel);
      baris.push(kolom);
      kolom = [];
      sel = "";
    } else if (c !== "\r") sel += c;
  }
  if (sel || kolom.length) {
    kolom.push(sel);
    baris.push(kolom);
  }
  return baris.filter((r) => r.some((x) => x.trim()));
}

// --- Pintu masuk -------------------------------------------------------------

/** Ubah kisi sel mentah jadi daftar produk. */
function dariKisi(kisi: (string | number | null)[][]): HasilUrai {
  const peringatan: string[] = [];
  if (!kisi.length) {
    return { items: [], peringatan: ["Berkas kosong atau tidak terbaca."], barisDibaca: 0 };
  }

  const header = (kisi[0] ?? []).map((x) => String(x ?? ""));
  const iNama = cariKolom(header, KOLOM_NAMA);
  const iHarga = cariKolom(header, KOLOM_HARGA);
  const iDesc = cariKolom(header, KOLOM_DESKRIPSI);

  if (iNama < 0) {
    return {
      items: [],
      peringatan: [
        `Kolom nama produk tidak ditemukan. Judul kolom yang terbaca: ${header.filter(Boolean).join(", ") || "(kosong)"}. ` +
          `Pakai salah satu nama kolom ini: ${KOLOM_NAMA.slice(0, 5).join(", ")}.`,
      ],
      barisDibaca: 0,
    };
  }
  if (iHarga < 0) {
    peringatan.push("Kolom harga tidak ditemukan — semua produk diimpor tanpa harga.");
  }

  const items: CatalogItem[] = [];
  const terlihat = new Set<string>();
  let dilewati = 0;
  const isiBaris = kisi.slice(1);

  for (const r of isiBaris) {
    if (items.length >= MAKS_BARIS) {
      peringatan.push(`Hanya ${MAKS_BARIS} produk pertama yang diimpor; sisanya diabaikan.`);
      break;
    }
    const nama = String(r[iNama] ?? "").trim();
    if (!nama) {
      dilewati++;
      continue;
    }
    const kunci = nama.toLowerCase();
    if (terlihat.has(kunci)) {
      dilewati++;
      continue;
    }
    terlihat.add(kunci);

    const deskripsi = iDesc >= 0 ? String(r[iDesc] ?? "").trim() : "";
    items.push({
      name: nama.slice(0, 120),
      price: iHarga >= 0 ? rapikanHarga(r[iHarga]).slice(0, 60) : "",
      description: deskripsi ? deskripsi.slice(0, 300) : undefined,
    });
  }

  if (dilewati > 0) {
    peringatan.push(`${dilewati} baris dilewati karena nama produknya kosong atau kembar.`);
  }
  if (!items.length) {
    peringatan.push("Tidak ada produk yang bisa dibaca dari berkas ini.");
  }

  return { items, peringatan, barisDibaca: isiBaris.length };
}

/** Urai berkas katalog (.xlsx atau .csv) jadi daftar produk. */
export async function uraiKatalog(buf: Buffer, namaBerkas: string): Promise<HasilUrai> {
  const nama = namaBerkas.toLowerCase();

  if (nama.endsWith(".csv") || nama.endsWith(".txt")) {
    return dariKisi(uraiCsv(buf.toString("utf8")));
  }

  // Impor dinamis: exceljs berat dan hanya dibutuhkan di jalur ini.
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const ws = wb.worksheets[0];
  if (!ws) return { items: [], peringatan: ["Berkas Excel tidak punya lembar kerja."], barisDibaca: 0 };

  const kisi: (string | number | null)[][] = [];
  ws.eachRow((row) => {
    const nilai = row.values as unknown[];
    // exceljs memberi indeks mulai dari 1; buang elemen pertama.
    kisi.push(
      nilai.slice(1).map((v) => {
        if (v == null) return null;
        if (typeof v === "number") return v;
        // Sel rumus dan rich text datang sebagai objek.
        if (typeof v === "object") {
          const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
          if (o.richText) return o.richText.map((t) => t.text).join("");
          if (o.text != null) return String(o.text);
          if (o.result != null) return String(o.result);
          return "";
        }
        return String(v);
      }),
    );
  });

  return dariKisi(kisi);
}

// --- Template ----------------------------------------------------------------

/** Buat berkas Excel contoh yang tinggal diisi pengguna. */
export async function buatTemplate(namaBisnis: string): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zavi — WA Assistant";
  wb.created = new Date();

  const ws = wb.addWorksheet("Katalog");
  ws.columns = [
    { header: "Nama Produk", key: "nama", width: 34 },
    { header: "Harga", key: "harga", width: 18 },
    { header: "Deskripsi", key: "deskripsi", width: 48 },
  ];

  const kepala = ws.getRow(1);
  kepala.font = { bold: true, color: { argb: "FFFFFFFF" } };
  kepala.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075E54" } };
  kepala.alignment = { vertical: "middle" };
  kepala.height = 22;

  const contoh = [
    ["Ayam Geprek Sambal Bawang", 18000, "Ayam crispy + sambal bawang + nasi"],
    ["Nasi Goreng Kampung", 20000, "Telur, ayam suwir, kerupuk"],
    ["Es Teh Manis", 5000, ""],
  ];
  for (const c of contoh) {
    const r = ws.addRow(c);
    r.font = { italic: true, color: { argb: "FF888888" } };
  }

  ws.getRow(1).alignment = { vertical: "middle", horizontal: "left" };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Petunjuk sengaja di LEMBAR TERPISAH.
  //
  // Sebelumnya petunjuk ditulis di bawah data pada lembar yang sama, dan
  // pengurai membacanya sebagai produk: template mentah menghasilkan 11 produk
  // alih-alih 3, dengan nama seperti "Cara pakai:". Pengguna yang lupa
  // menghapusnya akan mengimpor sampah ke katalognya. Pengurai hanya membaca
  // lembar pertama, jadi memisahkan petunjuk menyelesaikannya sepenuhnya.
  const wsBantuan = wb.addWorksheet("Petunjuk");
  wsBantuan.columns = [{ width: 100 }];
  const bantuan: [string, boolean][] = [
    ["Cara mengisi katalog Zavi", true],
    ["", false],
    ["1. Buka lembar \"Katalog\" (tab di bawah).", false],
    ["2. Hapus 3 baris contoh berwarna abu-abu, lalu isi produk Anda sendiri.", false],
    ["3. Satu produk per baris. Kolom Nama Produk wajib diisi.", false],
    ["4. Harga boleh ditulis angka saja, misalnya 18000 — nanti otomatis jadi Rp 18.000.", false],
    ["   Boleh juga bebas: \"Rp 15.000 / porsi\", atau \"Hubungi admin\".", false],
    ["5. Deskripsi boleh dikosongkan.", false],
    ["6. Simpan berkas, lalu unggah di Pengaturan → Profil Bisnis → Impor katalog.", false],
    ["", false],
    ["Catatan:", true],
    [`• Maksimal ${MAKS_BARIS} produk per unggahan, ukuran berkas maksimal 2 MB.`, false],
    ["• Urutan kolom boleh ditukar — Zavi mengenalinya dari judul kolom.", false],
    ["• Judul kolom boleh diganti, misalnya \"Nama Menu\" atau \"Nama Barang\".", false],
    ["• Produk dengan nama sama hanya diambil satu.", false],
    ["• Hasil bacaan ditampilkan dulu sebelum disimpan, jadi aman dicoba.", false],
  ];
  for (const [teks, tebal] of bantuan) {
    const r = wsBantuan.addRow([teks]);
    r.font = tebal
      ? { bold: true, size: 12, color: { argb: "FF075E54" } }
      : { color: { argb: "FF444444" }, size: 11 };
  }

  const namaAman = (namaBisnis || "Zavi").slice(0, 40);
  ws.headerFooter.oddHeader = `&L${namaAman} — Katalog Produk`;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
