// POST /api/catalog/from-url → baca halaman web, usulkan katalognya.
//
// Mengembalikan PRATINJAU saja. Tidak pernah menyentuh katalog tersimpan —
// pemilik yang memutuskan "ganti" atau "tambahkan", persis seperti impor Excel.
//
// Memakai fitur "ai_replies", bukan "knowledge_base", karena ini benar-benar
// satu panggilan AI: biayanya nyata dan ditanggung platform. Karena itu satu
// pemindaian dihitung satu balasan AI dari kuota tenant — kalau tidak, pemindai
// ini jadi celah memakai AI tanpa batas di luar kuota yang dibayar.
import { pindaiKatalogDariUrl, PindaiError } from "@/lib/catalog/dari-url";
import { getPlatformStore } from "@/lib/db/store";
import { contextErrorResponse, requireFeature } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let body: { url?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const url = body.url?.trim();
    if (!url) return Response.json({ error: "URL wajib diisi." }, { status: 400 });

    const ctx = await requireFeature(request, "ai_replies");

    // Mode demo ditolak, sama seperti endpoint pembayaran. Alasannya bukan
    // sekadar konsistensi: satu pemindaian membelanjakan uang AI sungguhan
    // DAN menyuruh server mengambil URL dari luar. Demo ada untuk
    // memperlihatkan tampilan, bukan untuk dipakai membakar anggaran AI oleh
    // siapa pun yang bisa menjangkau alamatnya tanpa login.
    if (ctx.isDemo) {
      return Response.json(
        { error: "Mode demo tidak bisa memindai halaman. Silakan daftar akun." },
        { status: 403 },
      );
    }

    const hasil = await pindaiKatalogDariUrl(url);

    // Kuota dipotong hanya setelah AI benar-benar dipanggil dan berhasil —
    // kegagalan tidak boleh memotong jatah pelanggan.
    const platform = getPlatformStore();
    const kuota = await platform.konsumsiKuotaAI(
      ctx.tenant.id,
      ctx.entitlement.aiRepliesLimit,
    );

    return Response.json({
      ...hasil,
      kuota: { dariPaket: kuota.dariPaket, dariKredit: kuota.dariKredit },
    });
  } catch (err) {
    if (err instanceof PindaiError) {
      return Response.json({ error: err.message }, { status: err.salahPengguna ? 400 : 502 });
    }
    return (
      contextErrorResponse(err) ??
      Response.json({ error: "Gagal memindai halaman." }, { status: 500 })
    );
  }
}
