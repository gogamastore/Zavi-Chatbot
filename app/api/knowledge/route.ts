// GET  /api/knowledge  → daftar dokumen pengetahuan
// POST /api/knowledge  → tambah dokumen (fitur berbayar: knowledge_base)
import type { KnowledgeDoc } from "@/lib/types";
import { getPlan } from "@/lib/billing/plans";
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

    const title = body.title?.trim();
    const content = body.content?.trim();
    if (!title || !content) {
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

    const doc = await ctx.store.addKnowledge({
      title,
      content,
      kind: (body.kind ?? "text") as KnowledgeDoc["kind"],
      url: body.url?.trim() || undefined,
    });
    return Response.json({ doc }, { status: 201 });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}
