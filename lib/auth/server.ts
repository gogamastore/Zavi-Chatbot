// ---------------------------------------------------------------------------
// Autentikasi sisi server.
//
// Browser mengirim ID token Firebase di header:  Authorization: Bearer <token>
// Di sini token itu diverifikasi, lalu dipetakan ke tenant pemiliknya.
//
// ATURAN: jangan pernah percaya tenantId yang dikirim klien. Selalu turunkan
// dari token — kalau tidak, satu tenant bisa membaca data tenant lain hanya
// dengan mengganti angka di request.
// ---------------------------------------------------------------------------
import { getAuth } from "firebase-admin/auth";
import { hasFirestore } from "@/lib/config";
import { getAdminApp } from "@/lib/db/firestore";

export interface AuthUser {
  uid: string;
  email: string;
  name?: string;
}

/** Dilempar saat request tidak terautentikasi atau tidak berhak. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Verifikasi ID token dari request. Melempar AuthError kalau tidak sah.
 *
 * Catatan: verifikasi butuh kredensial Firebase Admin. Tanpa itu (mode demo
 * in-memory) autentikasi tidak bisa ditegakkan — lihat getOptionalUser().
 */
export async function requireUser(request: Request): Promise<AuthUser> {
  const token = bearerToken(request);
  if (!token) throw new AuthError("Belum login.");

  if (!hasFirestore()) {
    throw new AuthError(
      "Autentikasi butuh kredensial Firebase yang aktif di server.",
      403,
    );
  }

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    const email = decoded.email ?? "";
    if (!email) throw new AuthError("Akun tanpa email tidak didukung.", 403);
    return { uid: decoded.uid, email, name: decoded.name as string | undefined };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // Token kedaluwarsa / rusak / ditandatangani project lain.
    throw new AuthError("Sesi tidak sah atau sudah kedaluwarsa. Silakan login ulang.");
  }
}

/** Seperti requireUser() tapi mengembalikan null alih-alih melempar. */
export async function getOptionalUser(request: Request): Promise<AuthUser | null> {
  try {
    return await requireUser(request);
  } catch {
    return null;
  }
}

/** Ubah AuthError jadi Response JSON yang rapi. */
export function authErrorResponse(err: unknown): Response | null {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
