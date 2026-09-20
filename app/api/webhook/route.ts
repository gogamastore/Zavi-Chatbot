// ---------------------------------------------------------------------------
// Webhook WhatsApp Cloud API (Tahap 1).
//   GET  /api/webhook  → jabat tangan verifikasi dengan Meta
//   POST /api/webhook  → terima pesan masuk, jalankan bot, balas
//
// MULTI-TENANT: Meta memanggil satu URL ini untuk SEMUA nomor yang terhubung.
// Tenant pemilik pesan ditentukan dari `metadata.phone_number_id` di payload —
// bukan dari env. Satu nomor milik satu tenant.
// ---------------------------------------------------------------------------
import { env } from "@/lib/config";
import { handleIncoming } from "@/lib/bot/engine";
import { computeEntitlement, newTrialSubscription } from "@/lib/billing/entitlement";
import { DEMO_TENANT_ID, getPlatformStore, getStore } from "@/lib/db/store";
import { credentialsFor, markAsRead, sendText } from "@/lib/wa/client";
import { bisaVerifikasiTandaTangan, tandaiPesanBaru, tandaTanganSah } from "@/lib/wa/verify";
import type { Tenant } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Verifikasi Meta ---------------------------------------------------------
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.verifyToken) {
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

// --- Pesan masuk -------------------------------------------------------------
interface WAMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}

interface WAContact {
  wa_id: string;
  profile?: { name?: string };
}

function extractText(m: WAMessage): string | null {
  if (m.type === "text") return m.text?.body ?? null;
  if (m.type === "interactive") {
    const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
    // Utamakan id opsi (cocok dengan menu), jatuh ke judul.
    return r?.id ?? r?.title ?? null;
  }
  return null;
}

/**
 * Cari tenant pemilik nomor tujuan.
 *
 * Kalau tidak ketemu, pesan diabaikan — jangan pernah menjawab atas nama
 * tenant yang salah. Pengecualian: saat berjalan tanpa Firestore (demo lokal),
 * semua pesan masuk ke tenant demo supaya pengujian tetap mudah.
 */
async function resolveTenant(phoneNumberId: string | undefined): Promise<Tenant | null> {
  const platform = getPlatformStore();
  if (platform.kind === "memory") {
    return {
      id: DEMO_TENANT_ID,
      ownerUid: "demo",
      ownerEmail: "demo@zavi.local",
      businessName: "Demo",
      templateId: "resto",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  if (!phoneNumberId) return null;
  return platform.getTenantByPhoneNumberId(phoneNumberId);
}

export async function POST(request: Request) {
  // Baca sebagai TEKS MENTAH, bukan .json(). Tanda tangan dihitung atas byte
  // asli — mem-parse lalu men-serialisasi ulang akan mengubahnya dan
  // verifikasi pasti gagal.
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // --- Lapis 1: pastikan permintaan benar-benar dari Meta ---
  if (bisaVerifikasiTandaTangan()) {
    if (!tandaTanganSah(raw, request.headers.get("x-hub-signature-256"))) {
      console.error("[webhook] TANDA TANGAN TIDAK SAH — permintaan ditolak.");
      return new Response("Invalid signature", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Di produksi, webhook tanpa App Secret adalah pintu terbuka. Lebih baik
    // menolak daripada memproses pesan yang tidak bisa dipercaya asalnya.
    console.error("[webhook] META_APP_SECRET belum diisi — permintaan ditolak di produksi.");
    return new Response("Not configured", { status: 503 });
  } else {
    console.warn("[webhook] META_APP_SECRET kosong — verifikasi tanda tangan dilewati (non-produksi).");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const platform = getPlatformStore();
    const entries = (payload as { entry?: unknown[] })?.entry ?? [];

    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] })?.changes ?? [];
      for (const change of changes) {
        const value = (change as { value?: Record<string, unknown> })?.value;
        if (!value) continue;

        const metadata = value.metadata as { phone_number_id?: string } | undefined;
        const tenant = await resolveTenant(metadata?.phone_number_id);
        if (!tenant) {
          console.warn(
            `[webhook] tidak ada tenant untuk phone_number_id=${metadata?.phone_number_id} — diabaikan.`,
          );
          continue;
        }

        let sub = await platform.getSubscription(tenant.id);
        sub ??= await platform.saveSubscription(newTrialSubscription(tenant.id));
        const entitlement = computeEntitlement(sub);
        const store = getStore(tenant.id);
        // Kredensial pengirim milik TENANT INI — bukan nomor global.
        const creds = credentialsFor(tenant);

        const messages = (value.messages as WAMessage[]) ?? [];
        const contacts = (value.contacts as WAContact[]) ?? [];
        const nameByWaId = new Map<string, string>();
        for (const c of contacts) {
          if (c.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);
        }

        for (const message of messages) {
          const text = extractText(message);
          if (!text) continue; // abaikan non-teks (gambar/suara) untuk prototype

          // --- Lapis 2: jangan proses pesan yang sama dua kali ---
          // Meta mengirim ulang notifikasi yang dianggap gagal. Tanpa penjaga
          // ini, satu pesan bisa dibalas dua kali dan melahirkan dua pesanan.
          if (!(await tandaiPesanBaru(message.id))) {
            console.log(`[webhook] pesan ${message.id} sudah diproses — dilewati.`);
            continue;
          }

          void markAsRead(creds, message.id);
          const result = await handleIncoming(
            { phone: message.from, name: nameByWaId.get(message.from), text },
            {
              store,
              entitlement,
              onAiUsed: async () => {
                await platform.konsumsiKuotaAI(tenant.id, entitlement.aiRepliesLimit);
              },
            },
          );
          await sendText(creds, message.from, result.reply);
        }
      }
    }
  } catch (err) {
    console.error("[webhook] error memproses:", err);
    // Tetap balas 200 supaya Meta tidak retry bertubi-tubi.
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
