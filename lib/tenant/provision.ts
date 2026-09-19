// ---------------------------------------------------------------------------
// Penyediaan tenant baru (onboarding).
//
// Dipanggil sekali saat pemilik UMKM menyelesaikan pendaftaran. Menyiapkan
// seluruh isi awal akunnya dalam satu langkah:
//   Tenant → Subscription (trial 3 hari) → Business → BotConfig → AIConfig
//
// Idempoten: kalau uid sudah punya tenant, kembalikan yang lama. Pendaftaran
// yang ter-submit dua kali tidak boleh melahirkan dua bisnis.
// ---------------------------------------------------------------------------
import type { AuthUser } from "@/lib/auth/server";
import { newTrialSubscription } from "@/lib/billing/entitlement";
import { getPlatformStore, getStore } from "@/lib/db/store";
import { contohKatalog, getTemplate } from "@/lib/bot/templates";
import type {
  AIConfig,
  BotConfig,
  BotTemplateId,
  Business,
  Tenant,
} from "@/lib/types";

export interface PendaftaranInput {
  businessName: string;
  /** Jenis usaha bebas, mis. "Kedai Kopi". */
  businessType?: string;
  templateId: BotTemplateId;
  phone?: string;
  address?: string;
  hours?: string;
}

/** Profil bisnis awal, sengaja diisi contoh agar bot langsung bisa dicoba. */
function businessAwal(input: PendaftaranInput): Business {
  const t = getTemplate(input.templateId);
  return {
    name: input.businessName,
    type: input.businessType?.trim() || t.name,
    tagline: "",
    hours: input.hours?.trim() || "Setiap hari, 09.00 - 21.00 WIB",
    address: input.address?.trim() || "",
    phone: input.phone?.trim() || "",
    orderInstructions:
      "Sebutkan pesanan, jumlah, nama, alamat, dan waktu yang diinginkan. Admin akan konfirmasi.",
    paymentInfo: "Transfer bank atau COD. Lengkapi info pembayaran di Pengaturan.",
    catalog: contohKatalog(input.templateId),
    extraInfo: "",
  };
}

function botConfigAwal(tenantId: string, templateId: BotTemplateId): BotConfig {
  const t = getTemplate(templateId);
  return {
    tenantId,
    templateId,
    // Disalin, bukan dirujuk — tenant bebas mengedit tanpa mengubah preset.
    rules: structuredClone(t.rules),
    menuOptions: structuredClone(t.menuOptions),
    updatedAt: Date.now(),
  };
}

function aiConfigAwal(tenantId: string): AIConfig {
  return {
    tenantId,
    enabled: true,
    // "none" = pakai penyedia bawaan server. Tenant bisa menggantinya nanti.
    provider: "none",
    tone: "Ramah, sopan, singkat. Panggil pelanggan dengan \"Kak\".",
    escalateWhenUnsure: true,
    // Batas riwayat menahan biaya token pada pelanggan lama.
    historyLimit: 20,
    updatedAt: Date.now(),
  };
}

export interface HasilPendaftaran {
  tenant: Tenant;
  /** True kalau tenant memang baru dibuat sekarang. */
  baru: boolean;
}

/** Buat tenant lengkap untuk pengguna yang baru mendaftar. */
export async function provisionTenant(
  user: AuthUser,
  input: PendaftaranInput,
): Promise<HasilPendaftaran> {
  const platform = getPlatformStore();

  const existing = await platform.getTenantByUid(user.uid);
  if (existing) return { tenant: existing, baru: false };

  const nama = input.businessName.trim();
  if (!nama) throw new Error("Nama bisnis wajib diisi.");

  const now = Date.now();
  const tenantId = `t_${user.uid.slice(0, 20)}`;

  const tenant: Tenant = {
    id: tenantId,
    ownerUid: user.uid,
    ownerEmail: user.email,
    businessName: nama,
    templateId: input.templateId,
    createdAt: now,
    updatedAt: now,
  };

  await platform.createTenant(tenant);
  await platform.saveSubscription(newTrialSubscription(tenantId, now));

  const store = getStore(tenantId);
  await Promise.all([
    store.saveBusiness(businessAwal(input)),
    store.saveBotConfig(botConfigAwal(tenantId, input.templateId)),
    store.saveAIConfig(aiConfigAwal(tenantId)),
  ]);

  return { tenant, baru: true };
}
