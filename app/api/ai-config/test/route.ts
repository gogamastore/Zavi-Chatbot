// POST /api/ai-config/test → uji koneksi AI sekarang juga.
//
// Memanggil penyedia dengan 1 token: cukup untuk membuktikan key DAN saldo,
// biayanya dapat diabaikan. Dipakai tombol "Uji koneksi" di Pengaturan AI.
import { kesehatanAI, saranPerbaikan, ujiKoneksi } from "@/lib/bot/ai-health";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Wajib login (atau demo lokal) — jangan biarkan orang asing memancing
    // panggilan ke penyedia AI kita.
    await getTenantContext(request);
    const health = await ujiKoneksi();
    return Response.json({ ai: { ...health, saran: saranPerbaikan(health) } });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menguji" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await getTenantContext(request);
    const health = await kesehatanAI();
    return Response.json({ ai: { ...health, saran: saranPerbaikan(health) } });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}
