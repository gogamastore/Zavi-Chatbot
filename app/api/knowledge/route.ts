// GET  /api/knowledge  → daftar sumber pengetahuan
// POST /api/knowledge  → tambah sumber (fitur berbayar: knowledge_base)
//
// Untuk kind "url", isi halaman DIAMBIL di server. Sebelumnya URL hanya
// disimpan sebagai catatan dan pemilik harus menyalin sendiri isinya — yang
// berarti fitur "tambah URL" sebenarnya tidak melakukan apa-apa.
//
// Pengambilan URL punya penjagaan SSRF; lihat lib/knowledge/ambil.ts.
import type { KnowledgeDoc } from "@/lib/types";
import { getPlan } from "@/lib/billing/plans";
import { AmbilError, ambilHalaman } from "@/lib/knowledge/ambil";
import { contextErrorResponse, getTenantContext, requireFeature } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext(request);
    const docs = await ctx.store.listKnowledge();
    return Response.json({ docs });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let body: Partial<KnowledgeDoc>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const kind = (body.kind ?? "text") as KnowledgeDoc["kind"];
    const url = body.url?.trim();
    let title = body.title?.trim();
    let content = body.content?.trim();

    if (kind === "url") {
      if (!url) return Response.json({ error: "URL wajib diisi." }, { status: 400 });
    } else if (!title || !content) {
      return Response.json({ error: "Judul dan isi wajib diisi" }, { status: 400 });
    }

    const ctx = await requireFeature(request, "knowledge_base");

    // Tegakkan batas jumlah dokumen sesuai paket.
    const existing = await ctx.store.listKnowledge();
    const maks = getPlan(ctx.subscription.planId).maxKnowledgeDocs;
    if (existing.length >= maks) {
      return Response.json(
        { error: `Paket Anda maksimal ${maks} dokumen. Upgrade untuk menambah.`, locked: true },
        { status: 402 },
      );
    }

    let fetchedAt: number | undefined;
    let truncated: boolean | undefined;

    if (kind === "url") {
      try {
        const hasil = await ambilHalaman(url!);
        // Isi dari halaman dipakai apa adanya; kalau pemilik sudah menulis
        // catatan sendiri, catatannya ditaruh di depan sebagai konteks.
        const catatan = content ? `${content}\n\n---\n\n` : "";
        content = catatan + hasil.teks;
        title = title || hasil.judul || new URL(hasil.urlAkhir).hostname;
        fetchedAt = Date.now();
        truncated = hasil.terpotong || undefined;
      } catch (e) {
        if (e instanceof AmbilError) {
          return Response.json(
            { error: e.message, gagalAmbil: true },
            { status: e.salahPengguna ? 400 : 502 },
          );
        }
        throw e;
      }
    }

    const doc = await ctx.store.addKnowledge({
      title: title!,
      content: content!,
      kind,
      url: url || undefined,
      fetchedAt,
      truncated,
    });
    return Response.json({ doc }, { status: 201 });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}
