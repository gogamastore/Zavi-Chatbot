// POST /api/whatsapp/connect → selesaikan Embedded Signup.
//
// Browser mengirim: { code, wabaId, phoneNumberId } dari event Embedded Signup.
// Server TIDAK mempercayai wabaId/phoneNumberId — keduanya diverifikasi ulang
// ke Meta. Lihat penjelasan panjang di lib/wa/embedded-signup.ts.
import {
  SignupError,
  daftarkanNomor,
  hasEmbeddedSignup,
  kekuranganEmbeddedSignup,
  langgananWebhook,
  nomorMilikWaba,
  tukarKode,
  wabaYangDiizinkan,
} from "@/lib/wa/embedded-signup";
import { getPlatformStore } from "@/lib/db/store";
import { contextErrorResponse, requireFeature } from "@/lib/tenant/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Autentikasi DULU, baru laporkan keadaan konfigurasi. Kalau dibalik,
    // orang tanpa login bisa memetakan apa saja yang belum diatur di server
    // kita hanya dengan menembak endpoint ini.
    const ctx = await requireFeature(request, "whatsapp_connect");
    if (ctx.isDemo) {
      return Response.json(
        { error: "Mode demo tidak bisa menghubungkan WhatsApp. Silakan daftar akun." },
        { status: 403 },
      );
    }

    if (!hasEmbeddedSignup()) {
      return Response.json(
        {
          error: "Embedded Signup belum dikonfigurasi di server.",
          kurang: kekuranganEmbeddedSignup(),
        },
        { status: 503 },
      );
    }

    let body: { code?: string; wabaId?: string; phoneNumberId?: string; pin?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON tidak valid" }, { status: 400 });
    }

    const code = body.code?.trim();
    if (!code) return Response.json({ error: "Kode dari Facebook kosong." }, { status: 400 });

    // 1. Kode → token bisnis milik klien.
    const token = await tukarKode(code);

    // 2. WABA mana yang SEBENARNYA diizinkan token ini, menurut Meta.
    const diizinkan = await wabaYangDiizinkan(token);
    if (!diizinkan.length) {
      return Response.json(
        {
          error:
            "Token dari Facebook tidak memberi akses ke WhatsApp Business Account mana pun. Ulangi penyambungan dan pastikan memilih akun WhatsApp Business Anda.",
        },
        { status: 400 },
      );
    }

    const diminta = body.wabaId?.trim();
    // Klaim di luar daftar ditolak. Tanpa `diminta`, ambil satu-satunya yang ada.
    const wabaId = diminta && diizinkan.includes(diminta) ? diminta : diizinkan[0];
    if (diminta && !diizinkan.includes(diminta)) {
      console.warn(
        `[connect] tenant ${ctx.tenant.id} mengklaim WABA ${diminta} yang tidak ada di tokennya — dipakai ${wabaId}.`,
      );
    }

    // 3. Nomor diambil dari Meta, bukan dari browser.
    const nomor = await nomorMilikWaba(wabaId, token);
    if (!nomor.length) {
      return Response.json(
        {
          error:
            "WhatsApp Business Account Anda belum punya nomor. Selesaikan dulu penambahan nomor di alur Facebook, lalu coba lagi.",
        },
        { status: 400 },
      );
    }
    const dimintaNomor = body.phoneNumberId?.trim();
    const dipilih = nomor.find((n) => n.id === dimintaNomor) ?? nomor[0];

    // 4. Nomor yang sudah dipakai tenant lain tidak boleh dibajak.
    const platform = getPlatformStore();
    const pemilikLain = await platform.getTenantByPhoneNumberId(dipilih.id);
    if (pemilikLain && pemilikLain.id !== ctx.tenant.id) {
      console.error(
        `[connect] tenant ${ctx.tenant.id} mencoba mengambil nomor ${dipilih.id} milik tenant ${pemilikLain.id} — ditolak.`,
      );
      return Response.json(
        {
          error:
            "Nomor WhatsApp ini sudah terhubung ke akun Zavi lain. Hubungi kami kalau menurut Anda ini keliru.",
        },
        { status: 409 },
      );
    }

    // 5. Langganan webhook. Tanpa ini pesan masuk tidak pernah sampai.
    const catatan: string[] = [];
    try {
      await langgananWebhook(wabaId, token);
    } catch (e) {
      catatan.push(
        `Langganan webhook gagal: ${(e as Error).message}. Bot belum akan menerima pesan sampai ini beres.`,
      );
    }

    // 6. Pendaftaran nomor — opsional, boleh gagal sendiri.
    if (body.pin?.trim()) {
      try {
        await daftarkanNomor(dipilih.id, body.pin.trim(), token);
      } catch (e) {
        catatan.push(`Pendaftaran nomor gagal: ${(e as Error).message}`);
      }
    }

    await platform.updateTenant(ctx.tenant.id, {
      whatsappWabaId: wabaId,
      whatsappPhoneNumberId: dipilih.id,
      whatsappDisplayNumber: dipilih.displayPhoneNumber,
      // Token bisnis milik klien ini. RAHASIA — tidak pernah dikirim balik.
      whatsappToken: token,
    });

    return Response.json({
      terhubung: true,
      wabaId,
      phoneNumberId: dipilih.id,
      displayNumber: dipilih.displayPhoneNumber,
      verifiedName: dipilih.verifiedName,
      nomorTersedia: nomor.length,
      catatan,
    });
  } catch (err) {
    if (err instanceof SignupError) {
      return Response.json({ error: err.message }, { status: err.salahPengguna ? 400 : 502 });
    }
    const r = contextErrorResponse(err);
    if (r) return r;
    console.error("[whatsapp/connect]", err);
    return Response.json({ error: "Gagal menghubungkan WhatsApp." }, { status: 500 });
  }
}
