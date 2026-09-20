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

export interface OpsiPenyediaan {
  /**
   * Tandai sebagai ruang kerja pengelola Zavi, bukan mitra pelanggan.
   *
   * Sengaja parameter tersendiri, bukan bagian dari PendaftaranInput: input itu
   * dirakit dari body request, dan penanda ini tidak boleh pernah bisa datang
   * dari sana.
   */
  platformOwner?: boolean;
}

/** Buat tenant lengkap untuk pengguna yang baru mendaftar. */
export async function provisionTenant(
  user: AuthUser,
  input: PendaftaranInput,
  opsi: OpsiPenyediaan = {},
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
    ...(opsi.platformOwner ? { platformOwner: true } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await platform.createTenant(tenant);

  const langganan = newTrialSubscription(tenantId, now);
  await platform.saveSubscription(
    opsi.platformOwner
      ? {
          // Ruang kerja owner tidak pernah jatuh tempo. Hak aksesnya tetap
          // ditentukan ownerEntitlement(), tapi data tersimpannya pun dibuat
          // masuk akal supaya tidak ada laporan yang membacanya sebagai
          // "trial yang sudah lewat".
          ...langganan,
          status: "active",
          planId: "owner",
          currentPeriodEnd: now + 100 * 365 * 86_400_000,
        }
      : langganan,
  );

  const store = getStore(tenantId);
  await Promise.all([
    store.saveBusiness(businessAwal(input)),
    store.saveBotConfig(botConfigAwal(tenantId, input.templateId)),
    store.saveAIConfig(aiConfigAwal(tenantId)),
  ]);

  return { tenant, baru: true };
}

/**
 * Pastikan akun owner punya ruang kerja sendiri untuk mencoba semua fitur.
 *
 * Owner tidak melewati onboarding seperti pelanggan — begitu login, ruang
 * kerjanya dibuatkan sekali dengan isi contoh, supaya simulator, chat,
 * pesanan, katalog, dan pengaturan bisa langsung dipakai menguji produk.
 * Idempoten: pemanggilan berikutnya mengembalikan yang sudah ada.
 */
export async function pastikanRuangKerjaOwner(user: AuthUser): Promise<Tenant> {
  const { tenant } = await provisionTenant(
    user,
    {
      businessName: "Ruang Uji Owner",
      businessType: "Internal Zavi",
      templateId: "resto",
    },
    { platformOwner: true },
  );
  return tenant;
}
