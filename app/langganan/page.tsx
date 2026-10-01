"use client";

// Halaman langganan: status sekarang + pilihan paket + pembayaran.
// Penyedia aktif ditentukan NEXT_PUBLIC_PAYMENT_PROVIDER ("lynkid" | "midtrans").
// Default "lynkid" — Midtrans dinonaktifkan sementara (lihat lib/config.ts).

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

const PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ?? "lynkid").toLowerCase();
const PAKAI_LYNKID = PROVIDER !== "midtrans";

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
  const [proses, setProses] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function beliPaket(p: Plan) {
    return PAKAI_LYNKID
      ? bayarLynkid(p)
      : bayarMidtrans(p.id, { planId: p.id }, "Semua fitur sudah terbuka 🎉");
  }

  function beliKredit(pack: CreditPack) {
    return bayarMidtrans(
      pack.id,
      { kind: "credits", packId: pack.id },
      `${pack.credits.toLocaleString("id-ID")} kredit AI sudah masuk ke saldo Anda 🎉`,
    );
  }

  // --- Alur Lynk.id: buka link checkout, lalu tunggu konfirmasi webhook -----
  async function bayarLynkid(p: Plan) {
    setProses(p.id);
    setError(null);
    setPesan(null);
    try {
      const r = await apiFetch<{ orderId: string; checkoutUrl: string }>(
        "/api/payment/lynkid/create",
        { method: "POST", body: JSON.stringify({ planId: p.id }) },
      );
      window.open(r.checkoutUrl, "_blank", "noopener,noreferrer");
      setPesan(
        "Halaman pembayaran Lynk.id dibuka di tab baru. Selesaikan pembayaran di sana — " +
          "langganan aktif otomatis dan status di sini akan diperbarui.",
      );
      // Webhook bisa tiba beberapa menit setelah bayar → tunggu lebih sabar.
      tungguKonfirmasi(r.orderId, "Semua fitur sudah terbuka 🎉", 30);
    } catch (err) {
      setError((err as Error).message);
      setProses(null);
    }
  }

  // --- Alur Midtrans (dipakai saat PAYMENT_PROVIDER=midtrans) ---------------
  async function bayarMidtrans(id: string, body: object, pesanSukses: string) {
    setProses(id);
    setError(null);
    setPesan(null);
    try {
      const r = await apiFetch<{ orderId: string; snapToken: string; redirectUrl: string }>(
        "/api/payment/create",
        { method: "POST", body: JSON.stringify(body) },
      );
      if (!window.snap) {
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
   * Konfirmasi tiba server-to-server (webhook), bisa beberapa detik–menit
   * setelah bayar. Jadi kita tanya berkala sebentar, bukan langsung menyerah.
   */
  async function tungguKonfirmasi(orderId: string, pesanSukses: string, percobaan = 10) {
    setPesan("Menunggu konfirmasi pembayaran…");
    for (let i = 0; i < percobaan; i++) {
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
      "Konfirmasi belum masuk. Kalau dana sudah terpotong, langganan Anda diaktifkan otomatis dalam beberapa menit.",
    );
    setProses(null);
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {!PAKAI_LYNKID && (
        <Script src={SNAP_SRC} data-client-key={CLIENT_KEY} strategy="afterInteractive" />
      )}

      <PageHeader title="Langganan" subtitle="Status layanan Zavi untuk bisnis Anda." />

      {PAKAI_LYNKID ? (
        <div
          className="rounded-lg px-4 py-2.5 text-sm mb-5 border"
          style={{ background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" }}
        >
          💳 Pembayaran via <b>Lynk.id</b>. Setelah membayar, langganan aktif otomatis
          begitu konfirmasi diterima.
        </div>
      ) : PRODUKSI ? (
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
                {plans.map((p) => {
                  // Paket yang sedang dipakai: statusnya berbayar DAN id-nya sama.
                  // "past_due" ikut dihitung sedang dipakai — masa tenggang itu
                  // tetap paket yang sama, cuma lewat jatuh tempo.
                  const berbayar =
                    entitlement?.status === "active" || entitlement?.status === "past_due";
                  const paketSaya = berbayar && entitlement?.planId === p.id;

                  // Tombol paket sendiri dimatikan — TAPI dihidupkan lagi saat
                  // mendekati habis. Kalau dimatikan mentah, pelanggan yang masa
                  // aktifnya tinggal sehari tidak punya cara memperpanjang sama
                  // sekali. Pembayaran ulang memang memperpanjang: masa aktif
                  // dihitung dari sisa yang ada, jadi hari yang sudah dibayar
                  // tidak hilang.
                  const sisaHari = entitlement?.periodDaysLeft ?? 0;
                  const bolehPerpanjang =
                    paketSaya && (sisaHari <= 7 || entitlement?.status === "past_due");

                  const label = paketSaya
                    ? bolehPerpanjang
                      ? `Perpanjang ${p.name}`
                      : "Paket saat ini"
                    : berbayar
                      ? `Ganti ke ${p.name}`
                      : `Berlangganan ${p.name}`;

                  return (
                  <div
                    key={p.id}
                    className="card p-5 flex flex-col"
                    style={
                      paketSaya
                        ? { borderColor: "var(--wa-green)", borderWidth: 2 }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-lg">{p.name}</div>
                      {paketSaya && (
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: "var(--wa-green-dark)", color: "#fff" }}
                        >
                          Paket Anda
                        </span>
                      )}
                    </div>
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
                      className={`btn w-full mt-5 ${paketSaya && !bolehPerpanjang ? "btn-ghost" : "btn-primary"}`}
                      onClick={() => beliPaket(p)}
                      disabled={proses !== null || isDemo || (paketSaya && !bolehPerpanjang)}
                      title={
                        isDemo
                          ? "Mode demo tidak bisa membayar"
                          : paketSaya && !bolehPerpanjang
                            ? `Sudah aktif, sisa ${sisaHari} hari. Tombol perpanjang muncul 7 hari sebelum habis.`
                            : undefined
                      }
                    >
                      {proses === p.id ? "Memproses…" : label}
                    </button>
                  </div>
                  );
                })}
              </div>

              <h2 className="font-semibold text-lg mb-1 mt-8">Beli kredit AI</h2>
              <p className="text-sm text-[var(--muted)] mb-3">
                Kuota bulanan hampir habis di tengah bulan? Tambah kredit supaya bot
                tetap menjawab. Kredit dipakai setelah kuota paket habis, dan{" "}
                <b>tidak hangus</b> saat bulan berganti.
              </p>
              {PAKAI_LYNKID && (
                <p className="text-xs text-[var(--muted)] mb-3">
                  ℹ️ Pembelian kredit AI untuk sementara belum tersedia lewat Lynk.id.
                </p>
              )}
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
                      disabled={
                        proses !== null || isDemo || PAKAI_LYNKID || Boolean(entitlement?.locked)
                      }
                      title={
                        PAKAI_LYNKID
                          ? "Pembelian kredit sementara hanya lewat Midtrans"
                          : isDemo
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
              {entitlement?.locked && !PAKAI_LYNKID && (
                <p className="text-xs text-[var(--muted)] mt-3">
                  Kredit baru bisa dibeli setelah langganan aktif — supaya Anda tidak
                  membayar sesuatu yang belum bisa dipakai.
                </p>
              )}

              <p className="text-xs text-[var(--muted)] mt-6">
                {PAKAI_LYNKID
                  ? "Pembayaran diproses Lynk.id. Fitur terbuka otomatis begitu pembayaran dikonfirmasi — tidak perlu menunggu admin."
                  : "Pembayaran diproses Midtrans (QRIS, Virtual Account, e-wallet, kartu). Fitur dan kredit masuk otomatis begitu pembayaran dikonfirmasi — tidak perlu menunggu admin."}
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
