"use client";

// ---------------------------------------------------------------------------
// Tombol "Hubungkan WhatsApp lewat Facebook" (Embedded Signup).
//
// Mitra menekan satu tombol, login akun Facebook mereka, dan nomornya
// tersambung ke App ID Meta milik Zavi. Tidak perlu membuat app Meta sendiri,
// tidak perlu menyalin token, tidak perlu mengisi id apa pun.
//
// Dua hal yang disengaja:
//
// 1. Kalau server belum siap (META_APP_ID / META_APP_SECRET / META_CONFIG_ID
//    kosong, atau verifikasi bisnis Meta belum selesai), tombolnya ditampilkan
//    MATI beserta keterangan apa yang kurang. Tombol yang kelihatan hidup lalu
//    gagal misterius saat ditekan jauh lebih buruk daripada tombol yang jujur
//    bilang belum siap.
//
// 2. Yang dikirim ke server hanyalah `code` dari Facebook. Id WABA dan nomor
//    ikut dikirim sebagai petunjuk, tapi server memverifikasinya ulang ke Meta
//    — lihat lib/wa/embedded-signup.ts. Browser tidak menentukan nomor siapa
//    yang tersambung ke akun siapa.
// ---------------------------------------------------------------------------

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";

export interface StatusEmbeddedSignup {
  siap: boolean;
  kurang: string[];
  appId: string;
  configId: string;
  graphVersion: string;
}

interface HasilSambung {
  terhubung: boolean;
  displayNumber: string;
  verifiedName?: string;
  nomorTersedia: number;
  catatan: string[];
}

declare global {
  interface Window {
    FB?: {
      init(opsi: Record<string, unknown>): void;
      login(cb: (r: { authResponse?: { code?: string } }) => void, opsi: Record<string, unknown>): void;
    };
  }
}

export default function HubungkanFacebook({
  status,
  onTersambung,
}: {
  status: StatusEmbeddedSignup;
  onTersambung(): void;
}) {
  const [sdkSiap, setSdkSiap] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<HasilSambung | null>(null);
  // Event "message" dari Facebook membawa waba_id & phone_number_id. Disimpan
  // di ref karena datangnya bisa sebelum callback FB.login selesai.
  const sesi = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  useEffect(() => {
    function terima(e: MessageEvent) {
      if (!/facebook\.com$/.test(new URL(e.origin).hostname)) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (d.event === "FINISH" || d.event === "FINISH_ONLY_WABA") {
          sesi.current = {
            wabaId: d.data?.waba_id,
            phoneNumberId: d.data?.phone_number_id,
          };
        } else if (d.event === "CANCEL") {
          setError(
            d.data?.error_message
              ? `Dibatalkan di langkah "${d.data.current_step ?? "?"}": ${d.data.error_message}`
              : "Penyambungan dibatalkan sebelum selesai.",
          );
        }
      } catch {
        // Bukan pesan Embedded Signup — abaikan.
      }
    }
    window.addEventListener("message", terima);
    return () => window.removeEventListener("message", terima);
  }, []);

  function mulai() {
    if (!window.FB) {
      setError("SDK Facebook belum termuat. Periksa koneksi atau pemblokir iklan, lalu muat ulang halaman.");
      return;
    }
    setError(null);
    setHasil(null);
    sesi.current = {};

    window.FB.login(
      async (r) => {
        const code = r.authResponse?.code;
        if (!code) {
          setError("Facebook tidak mengembalikan kode. Penyambungan dibatalkan atau ditolak.");
          return;
        }
        setSibuk(true);
        try {
          // Kode ini hanya berlaku 30 detik — langsung kirim ke server.
          const j = await apiFetch<HasilSambung>("/api/whatsapp/connect", {
            method: "POST",
            body: JSON.stringify({ code, ...sesi.current }),
          });
          setHasil(j);
          onTersambung();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setSibuk(false);
        }
      },
      {
        config_id: status.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  }

  if (!status.siap) {
    return (
      <div
        className="rounded-lg px-4 py-3 text-sm border"
        style={{ background: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" }}
      >
        <div className="font-semibold">○ Hubungkan lewat Facebook — belum tersedia</div>
        <p className="text-xs mt-1">
          Cara satu tombol ini aktif setelah verifikasi bisnis Meta selesai dan
          konfigurasinya dipasang di server. Sementara itu, pakai pengisian
          manual di bawah.
        </p>
        {status.kurang.length > 0 && (
          <p className="text-xs mt-1.5">
            Belum diatur di server: <b>{status.kurang.join(", ")}</b>
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg px-4 py-3 text-sm border"
      style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}
    >
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.FB?.init({
            appId: status.appId,
            autoLogAppEvents: true,
            xfbml: false,
            version: status.graphVersion,
          });
          setSdkSiap(true);
        }}
        onError={() => setError("Gagal memuat SDK Facebook (mungkin diblokir pemblokir iklan).")}
      />

      <div className="font-semibold">Hubungkan lewat Facebook</div>
      <p className="text-xs mt-1">
        Cara tercepat: login dengan akun Facebook bisnis Anda, pilih nomor
        WhatsApp, selesai. Tidak perlu menyalin token atau id apa pun.
      </p>

      <button
        className="btn btn-primary mt-3"
        onClick={mulai}
        disabled={!sdkSiap || sibuk}
        title={!sdkSiap ? "Menunggu SDK Facebook termuat" : undefined}
      >
        {sibuk ? "Menyambungkan…" : !sdkSiap ? "Memuat…" : "Hubungkan dengan Facebook"}
      </button>

      {error && (
        <div className="mt-3 text-xs" style={{ color: "#991b1b" }}>
          {error}
        </div>
      )}

      {hasil && (
        <div className="mt-3 text-xs" style={{ color: "#166534" }}>
          ✅ Tersambung: <b>{hasil.displayNumber}</b>
          {hasil.verifiedName && ` (${hasil.verifiedName})`}
          {hasil.nomorTersedia > 1 && (
            <div className="mt-0.5">
              Akun Anda punya {hasil.nomorTersedia} nomor; yang pertama dipakai.
              Ganti lewat pengisian manual di bawah kalau perlu.
            </div>
          )}
          {hasil.catatan.map((c) => (
            <div key={c} className="mt-1" style={{ color: "#92400e" }}>
              ⚠️ {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
