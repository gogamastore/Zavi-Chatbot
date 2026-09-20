// ---------------------------------------------------------------------------
// GET /api/owner/me → "apakah pemegang token ini owner?"
//
// Dipanggil halaman /owner/login tepat setelah login berhasil. Pemeriksaan
// dilakukan di server, bukan dengan membaca claim di browser: token di browser
// bisa saja dikarang, sedangkan di sini tanda tangannya diverifikasi Google.
// ---------------------------------------------------------------------------
import { authErrorResponse } from "@/lib/auth/server";
import { requireOwner } from "@/lib/auth/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const owner = await requireOwner(request);
    return Response.json({ owner: true, email: owner.email, uid: owner.uid });
  } catch (err) {
    return (
      authErrorResponse(err) ??
      Response.json({ error: "Gagal memeriksa akses." }, { status: 500 })
    );
  }
}
