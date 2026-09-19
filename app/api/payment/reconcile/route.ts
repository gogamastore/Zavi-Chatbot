// ---------------------------------------------------------------------------
// POST /api/payment/reconcile → jaring pengaman pembayaran.
//
// Notifikasi Midtrans bisa hilang: server sedang mati atau sedang redeploy,
// URL notifikasi salah, atau gangguan jaringan. Akibatnya pelanggan sudah
// membayar tapi fiturnya tetap terkunci — keluhan paling merusak kepercayaan
// di layanan langganan.
//
// Pekerjaan ini menanyakan langsung ke Midtrans Status API untuk setiap
// pembayaran yang masih "pending", lalu menerapkan hasilnya lewat fungsi yang
// SAMA dengan webhook. Tidak ada logika masa aktif yang diduplikasi di sini.
//
// Dijalankan terjadwal (Cloud Scheduler / cron), dilindungi CRON_SECRET.
// Aman dipanggil berkali-kali — seluruh jalurnya idempoten.
// ---------------------------------------------------------------------------
import { terapkanStatusPembayaran } from "@/lib/billing/activate";
import { getTransactionStatus, hasMidtrans } from "@/lib/billing/midtrans";
import { getPlatformStore } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Umur maksimum pembayaran pending yang masih diperiksa. */
const MAKS_UMUR_JAM = 48;

function diizinkan(request: Request): boolean {
  const rahasia = process.env.CRON_SECRET ?? "";
  // Tanpa CRON_SECRET, endpoint ini hanya boleh jalan di luar produksi.
  if (!rahasia) return process.env.NODE_ENV !== "production";

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  // Cloud Scheduler bisa mengirim header kustom; dukung keduanya.
  const kustom = request.headers.get("x-cron-secret")?.trim() ?? "";
  return bearer === rahasia || kustom === rahasia;
}

export async function POST(request: Request) {
  if (!diizinkan(request)) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  if (!hasMidtrans()) {
    return Response.json({ error: "Midtrans belum dikonfigurasi." }, { status: 503 });
  }

  const platform = getPlatformStore();
  const pending = await platform.listPendingPayments(MAKS_UMUR_JAM);

  const laporan: {
    orderId: string;
    hasil: string;
    diaktifkan: boolean;
    catatan: string;
  }[] = [];
  let diaktifkan = 0;

  for (const p of pending) {
    try {
      const status = await getTransactionStatus(p.orderId);
      if (!status) {
        laporan.push({
          orderId: p.orderId,
          hasil: "tidak dikenal",
          diaktifkan: false,
          catatan: "Midtrans tidak mengenal order ini",
        });
        continue;
      }
      const r = await terapkanStatusPembayaran(platform, p, status);
      if (r.diaktifkan) diaktifkan += 1;
      laporan.push({
        orderId: p.orderId,
        hasil: r.status,
        diaktifkan: r.diaktifkan,
        catatan: r.catatan,
      });
      if (r.diaktifkan) {
        // Layak dicatat keras: ini pembayaran yang nyaris tertinggal.
        console.log(
          `[reconcile] MENYELAMATKAN ${p.orderId} (tenant ${p.tenantId}) — ${r.catatan}`,
        );
      }
    } catch (err) {
      laporan.push({
        orderId: p.orderId,
        hasil: "error",
        diaktifkan: false,
        catatan: (err as Error).message,
      });
    }
  }

  return Response.json({
    diperiksa: pending.length,
    diaktifkan,
    laporan,
    at: Date.now(),
  });
}

/** GET dipetakan ke POST agar mudah dipicu penjadwal yang hanya bisa GET. */
export async function GET(request: Request) {
  return POST(request);
}
