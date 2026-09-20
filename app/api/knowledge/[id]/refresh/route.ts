// POST /api/knowledge/[id]/refresh → ambil ulang isi satu sumber URL.
//
// Halaman web berubah: harga naik, produk habis, promo lewat. Tanpa tombol
// ini, isi yang dipakai AI membeku di hari pertama ditambahkan sementara
// pemiliknya mengira botnya tahu yang terbaru.
//
// Kegagalan DISIMPAN di dokumen (fetchError), bukan cuma dikembalikan sekali.
// Kalau tidak, pemilik yang menutup halaman tidak akan pernah tahu sumbernya
// sudah mati dan botnya menjawab dari data basi.
import { AmbilError, ambilHalaman } from "@/lib/knowledge/ambil";
import { contextErrorResponse, requireFeature } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctxParam: RouteContext<"/api/knowledge/[id]/refresh">,
) {
  try {
    const { id } = await ctxParam.params;
    const ctx = await requireFeature(request, "knowledge_base");

    const doc = await ctx.store.getKnowledge(id);
    if (!doc) return Response.json({ error: "Sumber tidak ditemukan." }, { status: 404 });
    if (doc.kind !== "url" || !doc.url) {
      return Response.json(
        { error: "Hanya sumber berjenis URL yang bisa disegarkan." },
        { status: 400 },
      );
    }

    try {
      const hasil = await ambilHalaman(doc.url);
      const baru = await ctx.store.updateKnowledge(id, {
        content: hasil.teks,
        fetchedAt: Date.now(),
        truncated: hasil.terpotong || undefined,
        // undefined = hapus. Pengambilan berhasil harus menghapus jejak
        // kegagalan sebelumnya, bukan menumpuk di atasnya.
        fetchError: undefined,
      });
      return Response.json({ doc: baru });
    } catch (e) {
      if (e instanceof AmbilError) {
        // Isi lama SENGAJA dipertahankan. Bot yang menjawab dari data kemarin
        // masih lebih berguna daripada bot yang mendadak kehilangan sumbernya
        // karena situsnya sedang down.
        const baru = await ctx.store.updateKnowledge(id, { fetchError: e.message });
        return Response.json(
          { error: e.message, doc: baru, gagalAmbil: true },
          { status: e.salahPengguna ? 400 : 502 },
        );
      }
      throw e;
    }
  } catch (err) {
    return (
      contextErrorResponse(err) ??
      Response.json({ error: "Gagal menyegarkan sumber." }, { status: 500 })
    );
  }
}
