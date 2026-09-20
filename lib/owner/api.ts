// ---------------------------------------------------------------------------
// Bentuk data area owner + pemuatnya.
//
// Dipisah supaya halaman ringkasan dan halaman mitra membaca sumber yang sama —
// kalau tiap halaman punya tipenya sendiri, cepat atau lambat keduanya akan
// menampilkan angka yang berbeda untuk hal yang sama.
// ---------------------------------------------------------------------------
import { apiFetch } from "@/lib/api/client";

/** Satu mitra (klien) Zavi, sebagaimana dilihat pengelola. */
export interface Mitra {
  id: string;
  businessName: string;
  ownerEmail: string;
  createdAt: number;
  whatsappNomor: string | null;
  whatsappTersambung: boolean;
  planId: string | null;
  planName: string | null;
  status: string | null;
  locked: boolean | null;
  berlakuSampai: number | null;
  /** Masih aktif tapi tinggal < 7 hari. Dihitung di server, bukan di browser. */
  akanHabis: boolean;
  aiRepliesUsed: number;
  aiRepliesLimit: number;
  aiCreditsBalance: number;
}

export interface RingkasanMitra {
  total: number;
  aktif: number;
  percobaan: number;
  terkunci: number;
  /** Mitra yang masih aktif tapi masa berlakunya tinggal < 7 hari. */
  akanHabis7Hari: number;
  totalPemakaianAI: number;
}

export interface DataOwner {
  tenants: Mitra[];
  ringkasan: RingkasanMitra;
  /** Ruang kerja internal pengelola — bukan mitra, tidak ikut dihitung. */
  ruangInternal: string[];
  langgananTanpaTenant: string[];
}

export function muatDataOwner(): Promise<DataOwner> {
  return apiFetch<DataOwner>("/api/owner/tenants");
}

/** Label Bahasa Indonesia untuk status langganan mitra. */
export const LABEL_STATUS: Record<string, string> = {
  trial: "Percobaan",
  trial_ended: "Percobaan habis",
  pending: "Menunggu bayar",
  active: "Aktif",
  past_due: "Jatuh tempo",
  expired: "Berakhir",
};

export function labelStatusMitra(s: string | null): string {
  return s ? (LABEL_STATUS[s] ?? s) : "—";
}

/**
 * True kalau pesan error dari API berarti "bukan owner / sesi habis", sehingga
 * pengunjung harus dipulangkan ke halaman login owner.
 */
export function perluLoginUlang(pesan: string): boolean {
  return /tidak punya akses|Belum login|Sesi/i.test(pesan);
}
