// ---------------------------------------------------------------------------
// Katalog paket kredit AI (top-up).
//
// Kredit dipakai HANYA setelah kuota bulanan paket habis. Gunanya menolong
// pelanggan yang sedang ramai di tengah bulan supaya botnya tidak mendadak
// berhenti menjawab — bukan pengganti langganan.
//
// ATURAN HARGA (jangan dilanggar saat mengubah angka di bawah):
// harga per kredit harus lebih MAHAL daripada harga per balasan di paket
// termurah per-balasannya, yaitu Pro (Rp 249.000 / 3.000 = Rp 83/balasan).
// Kalau top-up lebih murah daripada naik paket, pelanggan yang butuh banyak
// balasan akan menumpuk top-up selamanya dan pendapatan berulang kita hilang —
// top-up sengaja dibuat sebagai jalan darurat, bukan jalan hemat.
// ---------------------------------------------------------------------------
import type { CreditPack, CreditPackId } from "@/lib/types";

export const CREDIT_PACKS: CreditPack[] = [
  // Rp 156 / kredit
  { id: "kredit-250", name: "Kredit 250", credits: 250, priceIdr: 39_000 },
  // Rp 129 / kredit
  {
    id: "kredit-1000",
    name: "Kredit 1.000",
    credits: 1_000,
    priceIdr: 129_000,
    badge: "Paling laris",
  },
  // Rp 100 / kredit
  { id: "kredit-3000", name: "Kredit 3.000", credits: 3_000, priceIdr: 299_000 },
];

export function getCreditPack(id: string): CreditPack | null {
  return CREDIT_PACKS.find((p) => p.id === id) ?? null;
}

export function isCreditPackId(id: unknown): id is CreditPackId {
  return typeof id === "string" && CREDIT_PACKS.some((p) => p.id === id);
}

/** Harga satuan, dibulatkan — untuk ditampilkan sebagai pembanding di kartu. */
export function hargaPerKredit(pack: CreditPack): number {
  return Math.round(pack.priceIdr / pack.credits);
}
