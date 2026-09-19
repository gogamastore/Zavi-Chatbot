// GET /api/templates → daftar preset template bot per jenis usaha.
// Publik: dibutuhkan halaman pendaftaran sebelum pengguna punya akun.
import { TEMPLATE_LIST } from "@/lib/bot/templates";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    templates: TEMPLATE_LIST.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      suitableFor: t.suitableFor,
      menuOptions: t.menuOptions,
      jumlahAturan: t.rules.length,
    })),
  });
}
