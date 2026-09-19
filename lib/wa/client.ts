// ---------------------------------------------------------------------------
// Klien WhatsApp Cloud API (Tahap 1 — wa_client).
//
// MULTI-TENANT: setiap balasan dikirim dari NOMOR MILIK TENANT, bukan dari satu
// nomor global. Ini wajib pada model Meta Tech Provider ("Jadilah Mitra"), di
// mana tiap klien UMKM punya WABA dan nomornya sendiri. Versi lama memakai
// PHONE_NUMBER_ID dari env untuk semua tenant — dengan dua klien, balasan untuk
// pelanggan klien B akan keluar dari nomor klien A.
//
// Token: pada model Mitra, token Pengguna Sistem milik platform berlaku untuk
// semua WABA klien yang dikelola. Jadi token bersifat platform-level, sementara
// phone_number_id bersifat per-tenant. Tenant yang memakai app Meta sendiri
// bisa menimpanya dengan token miliknya.
// ---------------------------------------------------------------------------
import { env } from "@/lib/config";
import type { Tenant } from "@/lib/types";

export interface WACredentials {
  /** phone_number_id milik tenant — menentukan nomor pengirim. */
  phoneNumberId: string;
  /** Kosong = pakai token Pengguna Sistem platform. */
  accessToken: string;
}

/** Susun kredensial pengiriman untuk satu tenant. */
export function credentialsFor(tenant: Pick<Tenant, "whatsappPhoneNumberId" | "whatsappToken">): WACredentials | null {
  const phoneNumberId = tenant.whatsappPhoneNumberId?.trim() || "";
  // Token tenant menang; kalau kosong pakai token Pengguna Sistem platform.
  const accessToken = tenant.whatsappToken?.trim() || env.whatsappToken;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

function endpoint(phoneNumberId: string): string {
  return `https://graph.facebook.com/${env.graphApiVersion}/${phoneNumberId}/messages`;
}

/** Kirim pesan teks ke satu nomor WhatsApp (wa_id), dari nomor tenant. */
export async function sendText(
  creds: WACredentials | null,
  to: string,
  body: string,
): Promise<boolean> {
  if (!creds) {
    console.warn("[wa] tenant belum menghubungkan nomor WhatsApp — pengiriman dilewati.");
    return false;
  }
  try {
    const res = await fetch(endpoint(creds.phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[wa] gagal kirim dari ${creds.phoneNumberId} (${res.status}):`, err.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[wa] error kirim:", err);
    return false;
  }
}

/** Tandai pesan masuk sebagai dibaca (centang biru). Best-effort. */
export async function markAsRead(
  creds: WACredentials | null,
  messageId: string,
): Promise<void> {
  if (!creds) return;
  try {
    await fetch(endpoint(creds.phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  } catch {
    // tidak fatal
  }
}
