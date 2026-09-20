"use client";

// Halaman langganan: status sekarang + pilihan paket + pembayaran Midtrans Snap.

import Script from "next/script";
import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/api/client";
import { CREDIT_PACKS, hargaPerKredit } from "@/lib/billing/credits";
import { formatIdr } from "@/lib/billing/plans";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { formatDateTime } from "@/lib/format";
import type { CreditPack, Payment, Plan } from "@/lib/types";

/** Snap menyuntikkan objek ini ke window saat skripnya selesai dimuat. */
declare global {
  interface Window {
    snap?: {
      pay(
        token: string,
        cb: {
          onSuccess?(r: unknown): void;
          onPending?(r: unknown): void;
          onError?(r: unknown): void;
          onClose?(): void;
        },
      ): void;
    };
  }
}

const CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
// Lingkungan dinyatakan eksplisit, tidak ditebak dari bentuk key — key sandbox
// dan produksi Midtrans kini identik bentuknya. Lihat lib/billing/midtrans.ts.
const PRODUKSI =
  (process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION ?? "").toLowerCase() === "true";
const SNAP_SRC = PRODUKSI
  ? "https://app.midtrans.com/snap/snap.js"
  : "https://app.sandbox.midtrans.com/snap/snap.js";

export default function LanggananPage() {
  const { loading, entitlement, subscription, plan, plans, isDemo, isOwner, refresh } =
    useSubscription();
  // Satu penanda "sedang diproses" untuk paket maupun kredit — id-nya cukup
  // untuk tahu tombol mana yang harus berubah jadi "Memproses…".
  const [proses, setProses] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function beliPaket(plan: Plan) {
    return bayar(plan.id, { planId: plan.id }, "Semua fitur sudah terbuka 🎉");
  }

  function beliKredit(pack: CreditPack) {
    return bayar(
      pack.id,
      { kind: "credits", packId: pack.id },
      `${pack.credits.toLocaleString("id-ID")} kredit AI sudah masuk ke saldo Anda 🎉`,
    );
  }

  async function bayar(id: string, body: object, pesanSukses: string) {
    setProses(id);
    setError(null);
    setPesan(null);
    try {
      const r = await apiFetch<{ orderId: string; snapToken: string; redirectUrl: string }>(
        "/api/payment/create",
        { method: "POST", body: JSON.stringify(body) },
      );

      if (!window.snap) {
        // Skrip Snap gagal dimuat (pemblokir iklan / jaringan) — pakai halaman
        // pembayaran Midtrans sebagai cadangan agar transaksi tetap bisa jalan.
        window.location.href = r.redirectUrl;
        return;
      }

      window.snap.pay(r.snapToken, {
        onSuccess: () => tungguKonfirmasi(r.orderId, pesanSukses),
        onPending: () => {
          setPesan("Pembayaran menunggu penyelesaian. Pesanan diproses otomatis setelah dana masuk.");
          setProses(null);
        },
        onError: () => {
          setError("Pembayaran gagal. Silakan coba lagi.");
          setProses(null);
        },
        onClose: () => {
          setPesan("Jendela pembayaran ditutup. Kalau sudah membayar, status akan menyusul otomatis.");
          setProses(null);
        },
      });
    } catch (err) {
      setError((err as Error).message);
      setProses(null);
    }
  }

  /**
   * Notifikasi Midtrans tiba server-to-server, biasanya beberapa detik setelah
   * popup tertutup. Jadi kita tanya berkala sebentar, bukan langsung menyerah.
   */
  async function tungguKonfirmasi(orderId: string, pesanSukses: string) {
    setPesan("Pembayaran diterima, sedang dikonfirmasi…");
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const s = await apiFetch<{ payment: Payment }>(
          `/api/payment/status?orderId=${encodeURIComponent(orderId)}`,
        );
        if (s.payment.status === "paid") {
          await refresh();
          setPesan(`Pembayaran berhasil. ${pesanSukses}`);
          setProses(null);
          return;
        }
      } catch {
        // abaikan, coba lagi
      }
    }
    await refresh();
    setPesan(
      "Konfirmasi belum masuk. Kalau dana sudah terpotong, pesanan Anda diproses otomatis dalam beberapa menit.",
    );
    setProses(null);
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Script src={SNAP_SRC} data-client-key={CLIENT_KEY} strategy="afterInteractive" />

      <PageHeader title="Langganan" subtitle="Status layanan Zavi untuk bisnis Anda." />

      {PRODUKSI ? (
        <div
          className="rounded-lg px-4 py-2.5 text-sm mb-5 border"
          style={{ background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" }}
        >
          ⚠️ Midtrans mode <b>PRODUKSI</b> — setiap transaksi memakai uang sungguhan.
        </div>
      ) : (
        <div
          className="rounded-lg px-4 py-2.5 text-sm mb-5 border"
          style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}
        >
          🧪 Mode <b>Sandbox</b> — pembayaran hanya simulasi, tidak ada uang berpindah.
        </div>
      )}
      {pesan && (
        <div
          className="rounded-lg px-4 py-2.5 text-sm mb-5 border"
          style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}
        >
          {pesan}
        </div>
      )}
      {error && (
        <div
          className="rounded-lg px-4 py-2.5 text-sm mb-5 border"
          style={{ background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="card p-5 text-sm text-[var(--muted)]">Memuat…</div>
      ) : (
        <>
          <section className="card p-5 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm text-[var(--muted)]">Status saat ini</div>
                <div className="text-2xl font-bold mt-1">
                  {plan?.name ?? "—"}
                  {isDemo && <span className="badge src-rule ml-2">demo</span>}
                </div>
                <p className="text-sm text-[var(--muted)] mt-1">{entitlement?.reason}</p>
              </div>
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{
                  background: entitlement?.locked ? "#fef2f2" : "#f0fdf4",
                  color: entitlement?.locked ? "#991b1b" : "#166534",
                }}
              >
                {entitlement?.locked ? "🔒 Terkunci" : "✅ Aktif"}
              </div>
            </div>

            {entitlement && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-[var(--border)]">
                <Info
                  label="Sisa percobaan"
                  nilai={entitlement.unlimited ? "—" : `${entitlement.trialDaysLeft} hari`}
                />
                <Info
                  label="Pemakaian AI bulan ini"
                  nilai={
                    entitlement.unlimited
                      ? `${entitlement.aiRepliesUsed.toLocaleString("id-ID")} · tanpa batas`
                      : `${entitlement.aiRepliesUsed} / ${entitlement.aiRepliesLimit}`
                  }
                />
                <Info
                  label="Kredit tambahan"
                  nilai={
                    entitlement.aiCreditsBalance > 0
                      ? `${entitlement.aiCreditsBalance.toLocaleString("id-ID")} kredit`
                      : "—"
                  }
                  catatan={
                    entitlement.aiCreditsBalance > 0
                      ? `Total sisa balasan: ${entitlement.aiRepliesRemaining.toLocaleString("id-ID")}`
                      : undefined
                  }
                />
                <Info
                  label="Berlaku sampai"
                  nilai={
                    entitlement.unlimited
                      ? "Tanpa batas waktu"
                      : subscription?.currentPeriodEnd
                        ? formatDateTime(subscription.currentPeriodEnd)
                        : subscription?.trialEndsAt
                          ? formatDateTime(subscription.trialEndsAt)
                          : "—"
                  }
                />
              </div>
            )}
          </section>

          {isOwner ? (
            <div className="card p-5 text-sm">
              <div className="font-semibold mb-1">Akun owner — di luar sistem langganan</div>
              <p className="text-[var(--muted)]">
                Tidak ada paket, tagihan, maupun masa berlaku untuk akun ini.
                Semua fitur terbuka tanpa batas supaya Anda bisa menguji seluruh
                aplikasi. Pemakaian AI tetap dihitung di atas karena biayanya
                nyata — tapi tidak pernah mengunci apa pun.
              </p>
            </div>
          ) : (
          <>
          <h2 className="font-semibold text-lg mb-3">Pilih paket</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {plans.map((p) => (
              <div key={p.id} className="card p-5 flex flex-col">
                <div className="font-semibold text-lg">{p.name}</div>
                <div className="text-2xl font-bold mt-1">
                  {formatIdr(p.priceIdr)}
                  <span className="text-sm font-normal text-[var(--muted)]"> / bulan</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm flex-1">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <span style={{ color: "var(--wa-green-dark)" }}>✓</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className="btn btn-primary w-full mt-5"
                  onClick={() => beliPaket(p)}
                  disabled={proses !== null || isDemo}
                  title={isDemo ? "Mode demo tidak bisa membayar" : undefined}
                >
                  {proses === p.id ? "Memproses…" : `Berlangganan ${p.name}`}
                </button>
              </div>
            ))}
          </div>

          <h2 className="font-semibold text-lg mb-1 mt-8">Beli kredit AI</h2>
          <p className="text-sm text-[var(--muted)] mb-3">
            Kuota bulanan hampir habis di tengah bulan? Tambah kredit supaya bot
            tetap menjawab. Kredit dipakai setelah kuota paket habis, dan{" "}
            <b>tidak hangus</b> saat bulan berganti.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {CREDIT_PACKS.map((k) => (
              <div key={k.id} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{k.name}</div>
                  {k.badge && <span className="badge src-rule">{k.badge}</span>}
                </div>
                <div className="text-xl font-bold mt-1">{formatIdr(k.priceIdr)}</div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {k.credits.toLocaleString("id-ID")} balasan AI ·{" "}
                  {formatIdr(hargaPerKredit(k))}/balasan
                </div>
                <button
                  className="btn w-full mt-4"
                  onClick={() => beliKredit(k)}
                  disabled={proses !== null || isDemo || Boolean(entitlement?.locked)}
                  title={
                    isDemo
                      ? "Mode demo tidak bisa membayar"
                      : entitlement?.locked
                        ? "Aktifkan langganan dulu — kredit hanya bisa dipakai saat langganan aktif"
                        : undefined
                  }
                >
                  {proses === k.id ? "Memproses…" : "Beli kredit"}
                </button>
              </div>
            ))}
          </div>
          {entitlement?.locked && (
            <p className="text-xs text-[var(--muted)] mt-3">
              Kredit baru bisa dibeli setelah langganan aktif — supaya Anda tidak
              membayar sesuatu yang belum bisa dipakai.
            </p>
          )}

          <p className="text-xs text-[var(--muted)] mt-6">
            Pembayaran diproses Midtrans (QRIS, Virtual Account, e-wallet, kartu).
            Fitur dan kredit masuk otomatis begitu pembayaran dikonfirmasi — tidak
            perlu menunggu admin.
          </p>
          </>
          )}
        </>
      )}
    </div>
  );
}

function Info({
  label,
  nilai,
  catatan,
}: {
  label: string;
  nilai: string;
  catatan?: string;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="font-semibold mt-0.5">{nilai}</div>
      {catatan && <div className="text-xs text-[var(--muted)] mt-0.5">{catatan}</div>}
    </div>
  );
}
