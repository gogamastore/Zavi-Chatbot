// ---------------------------------------------------------------------------
// Pengamanan webhook WhatsApp.
//
// Dua lapis yang wajib ada sebelum nomor asli tersambung:
//
//   1. Verifikasi tanda tangan — membuktikan permintaan benar-benar dari Meta.
//      Tanpa ini, siapa pun yang tahu URL webhook bisa mengirim pesan palsu:
//      memicu balasan, membuat pesanan fiktif, dan menghabiskan kuota AI
//      pelanggan. URL webhook itu publik menurut desainnya, jadi tanda tangan
//      adalah satu-satunya yang membedakan Meta dari orang asing.
//
//   2. Penolak pesan ganda — Meta mengirim ulang notifikasi yang dianggap
//      gagal. Tanpa penjaga, satu pesan pelanggan bisa dibalas dua kali dan
//      menghasilkan dua pesanan untuk satu pembelian.
// ---------------------------------------------------------------------------
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config";

/** True kalau App Secret tersedia sehingga tanda tangan bisa diperiksa. */
export function bisaVerifikasiTandaTangan(): boolean {
  return Boolean(env.metaAppSecret);
}

/**
 * Periksa header `X-Hub-Signature-256` terhadap isi mentah permintaan.
 *
 * Rumus Meta: HMAC-SHA256(raw body, App Secret), dikirim sebagai "sha256=<hex>".
 * Perbandingan memakai timingSafeEqual agar tidak bocor lewat perbedaan waktu.
 *
 * PENTING: harus memakai body MENTAH. Mem-parse lalu men-serialisasi ulang JSON
 * mengubah byte-nya (urutan kunci, spasi) dan tanda tangan pasti gagal.
 */
export function tandaTanganSah(rawBody: string, header: string | null): boolean {
  if (!env.metaAppSecret) return false;
  if (!header) return false;

  const diterima = header.startsWith("sha256=") ? header.slice(7) : header;
  if (!/^[0-9a-f]+$/i.test(diterima)) return false;

  const dihitung = createHmac("sha256", env.metaAppSecret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(dihitung, "hex");
  const b = Buffer.from(diterima.toLowerCase(), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Penolak pesan ganda
// ---------------------------------------------------------------------------

/**
 * Berapa lama id pesan diingat. Meta mengulang notifikasi dalam hitungan menit
 * sampai beberapa jam; 24 jam memberi jarak aman tanpa menumpuk data.
 */
const INGAT_JAM = 24;

/**
 * Tandai satu pesan sebagai sedang/sudah diproses.
 *
 * Mengembalikan true kalau pesan ini BARU (boleh diproses), false kalau sudah
 * pernah terlihat. Memakai `create()` yang gagal bila dokumen sudah ada —
 * operasi atomik, jadi dua notifikasi yang tiba bersamaan tidak keduanya lolos.
 */
export async function tandaiPesanBaru(messageId: string): Promise<boolean> {
  if (!messageId) return true;

  const { hasFirestore } = await import("@/lib/config");
  if (!hasFirestore()) return tandaiDiMemori(messageId);

  try {
    const { getDb } = await import("@/lib/db/firestore");
    const ref = getDb().collection("processedMessages").doc(messageId);
    await ref.create({
      at: Date.now(),
      // Dipakai aturan TTL Firestore kalau nanti diaktifkan di console.
      expiresAt: new Date(Date.now() + INGAT_JAM * 3_600_000),
    });
    return true;
  } catch (err) {
    // ALREADY_EXISTS (kode 6) = pesan ini sudah pernah diproses.
    const kode = (err as { code?: number })?.code;
    if (kode === 6) return false;
    // Kegagalan lain (jaringan/izin): jangan sampai menelan pesan pelanggan.
    // Lebih baik berisiko balasan ganda daripada diam sama sekali.
    console.error("[webhook] gagal menandai pesan, lanjut memproses:", err);
    return true;
  }
}

/** Cadangan saat berjalan tanpa Firestore (mode demo). */
function tandaiDiMemori(messageId: string): boolean {
  const g = globalThis as unknown as { __zaviSeen?: Map<string, number> };
  g.__zaviSeen ??= new Map();
  const seen = g.__zaviSeen;

  const sekarang = Date.now();
  if (seen.has(messageId)) return false;

  seen.set(messageId, sekarang);
  // Bersihkan yang kedaluwarsa agar peta tidak tumbuh tanpa batas.
  if (seen.size > 5000) {
    const batas = sekarang - INGAT_JAM * 3_600_000;
    for (const [id, t] of seen) if (t < batas) seen.delete(id);
  }
  return true;
}
