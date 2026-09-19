// ---------------------------------------------------------------------------
// GET/PUT /api/whatsapp → sambungan WhatsApp milik tenant.
//
// Pada model Meta Tech Provider ("Jadilah Mitra"), tiap klien UMKM punya WABA
// dan nomornya sendiri. phone_number_id inilah yang dipakai webhook untuk
// mengenali pemilik pesan DAN sebagai nomor pengirim balasan.
//
// whatsappToken TIDAK PERNAH dikirim ke browser — hanya penanda terisi/tidak.
// ---------------------------------------------------------------------------
import { env } from "@/lib/config";
import { getPlatformStore } from "@/lib/db/store";
import { contextErrorResponse, getTenantContext, requireFeature } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext(request);
    const t = ctx.tenant;
    return Response.json({
      whatsapp: {
        phoneNumberId: t.whatsappPhoneNumberId ?? "",
        wabaId: t.whatsappWabaId ?? "",
        displayNumber: t.whatsappDisplayNumber ?? "",
        // Jangan pernah membocorkan tokennya sendiri.
        punyaTokenSendiri: Boolean(t.whatsappToken),
        terhubung: Boolean(t.whatsappPhoneNumberId),
      },
      platform: {
        // Token Pengguna Sistem platform — dipakai kalau tenant tidak punya sendiri.
        punyaTokenPlatform: Boolean(env.whatsappToken),
        verifyTokenDiatur: Boolean(env.verifyToken),
        appSecretDiatur: Boolean(env.metaAppSecret),
      },
    });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal memuat" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    let body: Record<string, string | undefined>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const ctx = await requireFeature(request, "whatsapp_connect");
    const platform = getPlatformStore();

    const phoneNumberId = (body.phoneNumberId ?? "").trim();
    if (phoneNumberId && !/^\d{5,}$/.test(phoneNumberId)) {
      return Response.json(
        { error: "Phone number ID dari Meta berupa angka saja (biasanya 15-16 digit)." },
        { status: 400 },
      );
    }

    // Satu nomor hanya boleh dimiliki satu tenant — kalau tidak, pesan masuk
    // bisa diarahkan ke bisnis yang salah.
    if (phoneNumberId) {
      const pemilik = await platform.getTenantByPhoneNumberId(phoneNumberId);
      if (pemilik && pemilik.id !== ctx.tenant.id) {
        return Response.json(
          { error: "Nomor ini sudah terhubung ke akun lain." },
          { status: 409 },
        );
      }
    }

    const updated = await platform.updateTenant(ctx.tenant.id, {
      whatsappPhoneNumberId: phoneNumberId || undefined,
      whatsappWabaId: (body.wabaId ?? "").trim() || undefined,
      whatsappDisplayNumber: (body.displayNumber ?? "").trim() || undefined,
      // Kosongkan hanya bila dikirim string kosong secara eksplisit.
      ...(body.token !== undefined
        ? { whatsappToken: body.token.trim() || undefined }
        : {}),
    });

    if (!updated) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });

    return Response.json({
      whatsapp: {
        phoneNumberId: updated.whatsappPhoneNumberId ?? "",
        wabaId: updated.whatsappWabaId ?? "",
        displayNumber: updated.whatsappDisplayNumber ?? "",
        punyaTokenSendiri: Boolean(updated.whatsappToken),
        terhubung: Boolean(updated.whatsappPhoneNumberId),
      },
    });
  } catch (err) {
    return contextErrorResponse(err) ?? Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}
