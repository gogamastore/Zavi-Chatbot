// ---------------------------------------------------------------------------
// Pengambil isi halaman web untuk knowledge base.
//
// ====================== BACA INI SEBELUM MENGUBAH ==========================
// Fungsi di sini mengambil URL yang DIKETIK PELANGGAN, dari dalam server kita.
// Itu adalah pintu SSRF (Server-Side Request Forgery): kalau tidak dijaga,
// pelanggan bisa menyuruh server kita mengambil alamat internal yang tidak
// bisa mereka jangkau sendiri — yang paling berbahaya:
//
//   http://169.254.169.254/computeMetadata/v1/   → token service account
//                                                  Google Cloud kita
//
// Sekali token itu bocor, seluruh Firestore semua tenant ikut bocor. Jadi
// penjagaannya bukan "kalau sempat", tapi syarat fitur ini boleh ada.
//
// Cara menjaganya di sini:
//   1. Hanya http/https. Tolak file:, gopher:, data:, dsb.
//   2. Resolusi DNS dilakukan SENDIRI, lalu SEMUA alamat hasilnya diperiksa
//      harus publik. Satu saja privat → tolak.
//   3. Koneksi dibuka ke ALAMAT IP yang sudah diperiksa itu (bukan ke nama
//      host lagi), dengan header Host + SNI aslinya. Ini menutup celah DNS
//      rebinding: tidak ada jeda antara "memeriksa" dan "menyambung" yang
//      bisa dipakai mengubah jawaban DNS.
//   4. Pengalihan (redirect) diikuti manual, maksimal 3 kali, dan setiap
//      tujuan baru diperiksa ulang dari awal.
//   5. Ada batas waktu, batas ukuran, dan pemeriksaan tipe konten.
// ===========================================================================
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/** Batas aman: halaman lebih besar dari ini dipotong, bukan ditolak. */
export const MAKS_UNDUH_BYTE = 512 * 1024;
/** Teks hasil ekstraksi dipotong di sini supaya prompt AI tidak membengkak. */
export const MAKS_TEKS = 8_000;
export const BATAS_WAKTU_MS = 10_000;
const MAKS_REDIRECT = 3;

export class AmbilError extends Error {
  constructor(
    message: string,
    /** True = salah pengguna (URL tidak sah), bukan kegagalan sistem. */
    readonly salahPengguna = true,
  ) {
    super(message);
    this.name = "AmbilError";
  }
}

// ---------------------------------------------------------------------------
// Pemeriksaan alamat
// ---------------------------------------------------------------------------

/**
 * Alamat yang TIDAK boleh dihubungi: semua yang tidak benar-benar publik.
 *
 * Daftar ini sengaja longgar ke arah menolak. Salah menolak satu situs publik
 * hanya merepotkan satu pelanggan; salah mengizinkan satu alamat internal bisa
 * membocorkan kredensial seluruh platform.
 */
export function alamatPrivat(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const b = ip.split(".").map(Number);
    if (b.length !== 4 || b.some((n) => Number.isNaN(n))) return true;
    const [a, c] = b;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // privat
    if (a === 127) return true; // loopback
    if (a === 169 && c === 254) return true; // link-local + metadata cloud
    if (a === 172 && c >= 16 && c <= 31) return true; // privat
    if (a === 192 && c === 168) return true; // privat
    if (a === 192 && c === 0) return true; // IETF protocol assignments
    if (a === 198 && (c === 18 || c === 19)) return true; // benchmarking
    if (a === 100 && c >= 64 && c <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (s === "::" || s === "::1") return true;
    // IPv4 yang dibungkus IPv6 (::ffff:169.254.169.254) — periksa sebagai IPv4.
    const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return alamatPrivat(m[1]);
    if (s.startsWith("fe80")) return true; // link-local
    if (/^f[cd]/.test(s)) return true; // unique local
    if (s.startsWith("ff")) return true; // multicast
    if (s.startsWith("64:ff9b")) return true; // NAT64
    if (s.startsWith("2002:")) return true; // 6to4
    return false;
  }
  // Bukan IP yang dikenali → jangan hubungi.
  return true;
}

interface Tujuan {
  url: URL;
  /** Alamat IP yang sudah diperiksa; koneksi dibuka ke sini. */
  ip: string;
  keluarga: 4 | 6;
}

/** Periksa satu URL sampai tuntas dan kembalikan alamat yang aman dihubungi. */
async function periksaTujuan(mentah: string): Promise<Tujuan> {
  let url: URL;
  try {
    url = new URL(mentah);
  } catch {
    throw new AmbilError("URL tidak valid. Contoh yang benar: https://tokosaya.com/produk");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AmbilError(`Hanya alamat http:// dan https:// yang bisa diambil.`);
  }
  if (url.username || url.password) {
    throw new AmbilError("URL dengan nama pengguna/kata sandi tidak diizinkan.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  // Kalau host-nya sudah berupa IP, periksa langsung — tanpa DNS.
  if (net.isIP(host)) {
    if (alamatPrivat(host)) {
      throw new AmbilError("Alamat itu ada di jaringan internal, tidak bisa diambil.");
    }
    return { url, ip: host, keluarga: net.isIP(host) === 6 ? 6 : 4 };
  }

  let hasil: { address: string; family: number }[];
  try {
    hasil = await dns.lookup(host, { all: true });
  } catch {
    throw new AmbilError(`Nama domain "${host}" tidak ditemukan.`);
  }
  if (!hasil.length) throw new AmbilError(`Nama domain "${host}" tidak ditemukan.`);

  // SEMUA hasil harus publik. Kalau satu saja privat, domain ini tidak dipercaya
  // — domain yang mengarah ke dalam dan ke luar sekaligus adalah pola serangan.
  for (const h of hasil) {
    if (alamatPrivat(h.address)) {
      throw new AmbilError("Domain itu mengarah ke jaringan internal, tidak bisa diambil.");
    }
  }

  const pilih = hasil[0];
  return { url, ip: pilih.address, keluarga: pilih.family === 6 ? 6 : 4 };
}

// ---------------------------------------------------------------------------
// Permintaan HTTP
// ---------------------------------------------------------------------------

interface Respons {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  terpotong: boolean;
}

function mintaSekali(t: Tujuan): Promise<Respons> {
  return new Promise((resolve, reject) => {
    const aman = t.url.protocol === "https:";
    const mod = aman ? https : http;

    const req = mod.request(
      {
        // Menyambung ke IP yang SUDAH diperiksa, bukan ke nama host lagi.
        host: t.ip,
        family: t.keluarga,
        port: t.url.port || (aman ? 443 : 80),
        path: t.url.pathname + t.url.search,
        method: "GET",
        // Host + SNI tetap nama aslinya supaya virtual host & sertifikat cocok.
        headers: {
          Host: t.url.host,
          "User-Agent": "ZaviBot/1.0 (+https://zavi.id; pengambil katalog)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
        },
        servername: aman ? t.url.hostname : undefined,
        timeout: BATAS_WAKTU_MS,
      },
      (res) => {
        const potongan: Buffer[] = [];
        let ukuran = 0;
        let terpotong = false;

        res.on("data", (c: Buffer) => {
          if (terpotong) return;
          ukuran += c.length;
          if (ukuran > MAKS_UNDUH_BYTE) {
            terpotong = true;
            potongan.push(c.subarray(0, c.length - (ukuran - MAKS_UNDUH_BYTE)));
            res.destroy();
            return;
          }
          potongan.push(c);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(potongan).toString("utf8"),
            terpotong,
          }),
        );
        res.on("close", () => {
          if (terpotong) {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(potongan).toString("utf8"),
              terpotong,
            });
          }
        });
        res.on("error", reject);
      },
    );

    req.on("timeout", () => {
      req.destroy(new AmbilError("Situs tidak menjawab dalam 10 detik.", false));
    });
    req.on("error", (e) =>
      reject(e instanceof AmbilError ? e : new AmbilError(`Gagal menghubungi situs: ${e.message}`, false)),
    );
    req.end();
  });
}

export interface HasilAmbil {
  /** Teks bersih siap dimasukkan ke prompt AI. */
  teks: string;
  /** Judul halaman kalau ada. */
  judul?: string;
  /** URL terakhir setelah mengikuti pengalihan. */
  urlAkhir: string;
  /** True kalau halaman dipotong karena melebihi batas. */
  terpotong: boolean;
}

/** Ambil satu halaman dan kembalikan teksnya. Melempar AmbilError bila gagal. */
export async function ambilHalaman(urlMentah: string): Promise<HasilAmbil> {
  let target = urlMentah;

  for (let lompat = 0; lompat <= MAKS_REDIRECT; lompat++) {
    const tujuan = await periksaTujuan(target);
    const res = await mintaSekali(tujuan);

    // Pengalihan: periksa ulang tujuan barunya dari nol.
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (lompat === MAKS_REDIRECT) {
        throw new AmbilError("Terlalu banyak pengalihan (redirect).");
      }
      target = new URL(res.headers.location, tujuan.url).toString();
      continue;
    }

    if (res.status === 404) throw new AmbilError("Halaman tidak ditemukan (404).");
    if (res.status === 403 || res.status === 401) {
      throw new AmbilError("Situs menolak diakses (perlu login atau memblokir bot).");
    }
    if (res.status < 200 || res.status >= 400) {
      throw new AmbilError(`Situs membalas dengan status ${res.status}.`, false);
    }

    const tipe = String(res.headers["content-type"] ?? "").toLowerCase();
    if (tipe && !/text\/html|text\/plain|application\/xhtml/.test(tipe)) {
      throw new AmbilError(
        `Isi halaman bukan teks (${tipe.split(";")[0]}). Hanya halaman web biasa yang bisa dibaca.`,
      );
    }

    const { teks, judul } = htmlKeTeks(res.body);
    if (!teks.trim()) {
      throw new AmbilError(
        "Halaman terbaca tapi isinya kosong. Situs ini kemungkinan memuat isinya dengan JavaScript — salin-tempel teksnya secara manual.",
      );
    }

    return {
      teks: teks.slice(0, MAKS_TEKS),
      judul,
      urlAkhir: tujuan.url.toString(),
      terpotong: res.terpotong || teks.length > MAKS_TEKS,
    };
  }

  throw new AmbilError("Terlalu banyak pengalihan (redirect).");
}

// ---------------------------------------------------------------------------
// HTML → teks
// ---------------------------------------------------------------------------

const ENTITAS: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

function bukaEntitas(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (utuh, isi: string) => {
    if (isi.startsWith("#")) {
      const angka = isi[1] === "x" || isi[1] === "X"
        ? parseInt(isi.slice(2), 16)
        : parseInt(isi.slice(1), 10);
      return Number.isFinite(angka) && angka > 0 && angka < 0x110000
        ? String.fromCodePoint(angka)
        : utuh;
    }
    return ENTITAS[isi.toLowerCase()] ?? utuh;
  });
}

/**
 * Ubah HTML jadi teks yang bisa dibaca AI.
 *
 * Sengaja tanpa pustaka parser: kebutuhannya cuma "buang markup, sisakan
 * kalimat". Menambah dependensi berat untuk itu tidak sepadan, apalagi
 * hasilnya tetap harus dipotong ke beberapa ribu karakter.
 */
export function htmlKeTeks(html: string): { teks: string; judul?: string } {
  const judulCocok = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const judul = judulCocok ? bukaEntitas(judulCocok[1]).trim().slice(0, 200) : undefined;

  const teks = html
    // Buang yang bukan isi baca sama sekali.
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Tag yang memisahkan baris jadi baris betulan, supaya daftar produk tidak
    // menempel jadi satu kalimat panjang.
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|td)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return {
    judul,
    teks: bukaEntitas(teks)
      .replace(/[ \t ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}
