// ---------------------------------------------------------------------------
// Penjagaan area owner / pengembang.
//
// Penanda owner adalah CUSTOM CLAIM Firebase Auth (`owner: true`), bukan field
// di Firestore dan bukan daftar email di env.
//
// Alasannya penting: custom claim hanya bisa diberikan lewat Admin SDK (dari
// terminal Anda, lihat `scripts/owner.mjs`). Kalau penandanya berupa dokumen
// Firestore atau kolom di profil, siapa pun yang menemukan satu celah tulis
// bisa mengangkat dirinya sendiri jadi owner. Claim ditandatangani Google di
// dalam token — tidak bisa dipalsukan dari sisi klien.
//
// Halaman /owner di browser hanya mengatur TAMPILAN. Penegakan sesungguhnya
// ada di sini, di setiap API route yang memanggil requireOwner().
// ---------------------------------------------------------------------------
import { getAuth } from "firebase-admin/auth";
import { hasFirestore } from "@/lib/config";
import { getAdminApp } from "@/lib/db/firestore";
import { AuthError, type AuthUser } from "./server";

/** Nama custom claim. Ubah di sini saja kalau suatu saat diganti. */
export const OWNER_CLAIM = "owner";

export interface OwnerUser extends AuthUser {
  owner: true;
}

function bearerToken(request: Request): string | null {
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Pastikan permintaan datang dari owner. Melempar AuthError kalau tidak.
 *
 * Berbeda dari requireUser(): token diperiksa terhadap daftar pencabutan
 * (`checkRevoked`). Untuk area biasa itu berlebihan, tapi untuk area owner
 * artinya "keluarkan semua sesi" benar-benar berlaku seketika, bukan menunggu
 * token lama kedaluwarsa sendiri sampai satu jam.
 */
export async function requireOwner(request: Request): Promise<OwnerUser> {
  const token = bearerToken(request);
  if (!token) throw new AuthError("Belum login.");

  if (!hasFirestore()) {
    throw new AuthError("Area owner butuh kredensial Firebase aktif di server.", 403);
  }

  let decoded;
  try {
    decoded = await getAuth(getAdminApp()).verifyIdToken(token, true);
  } catch {
    throw new AuthError("Sesi tidak sah atau sudah kedaluwarsa. Silakan login ulang.");
  }

  if (decoded[OWNER_CLAIM] !== true) {
    // Sengaja tidak menjelaskan apa pun tentang cara mendapat akses.
    throw new AuthError("Akun ini tidak punya akses owner.", 403);
  }

  return {
    uid: decoded.uid,
    email: decoded.email ?? "",
    name: decoded.name as string | undefined,
    owner: true,
  };
}
