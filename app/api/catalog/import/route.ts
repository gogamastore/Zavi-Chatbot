// ---------------------------------------------------------------------------
// POST /api/catalog/import → urai berkas katalog, kembalikan PRATINJAU.
//
// Sengaja TIDAK menyimpan apa pun. Menimpa katalog orang secara diam-diam
// adalah kerusakan yang sulit dibatalkan, jadi pengguna harus melihat hasil
// bacaannya dulu lalu menekan simpan sendiri lewat /api/business.
// ---------------------------------------------------------------------------
import { MAKS_UKURAN_BYTE, uraiKatalog } from "@/lib/catalog/excel";
import { contextErrorResponse, getTenantContext } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EKSTENSI_DIIZINKAN = [".xlsx", ".csv", ".txt"];

export async function POST(request: Request) {
  try {
    await getTenantContext(request);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Unggahan tidak terbaca." }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Berkas belum dipilih." }, { status: 400 });
    }

    const nama = file.name || "katalog";
    const ext = nama.slice(nama.lastIndexOf(".")).toLowerCase();
    if (!EKSTENSI_DIIZINKAN.includes(ext)) {
      return Response.json(
        { error: `Format ${ext || "ini"} belum didukung. Pakai .xlsx atau .csv.` },
        { status: 400 },
      );
    }
    if (file.size > MAKS_UKURAN_BYTE) {
      return Response.json(
        { error: `Berkas terlalu besar (${Math.round(file.size / 1024)} KB). Maksimal 2 MB.` },
        { status: 413 },
      );
    }
    if (file.size === 0) {
      return Response.json({ error: "Berkas kosong." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    let hasil;
    try {
      hasil = await uraiKatalog(buf, nama);
    } catch (err) {
      // Berkas rusak atau bukan Excel sungguhan — jangan bocorkan jejak galat.
      console.error("[catalog/import] gagal mengurai:", err);
      return Response.json(
        { error: "Berkas tidak bisa dibaca. Pastikan berformat .xlsx atau .csv yang sah." },
        { status: 400 },
      );
    }

    return Response.json({
      items: hasil.items,
      peringatan: hasil.peringatan,
      barisDibaca: hasil.barisDibaca,
      namaBerkas: nama,
    });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memproses" }, { status: 500 });
  }
}
