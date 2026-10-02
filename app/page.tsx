// ---------------------------------------------------------------------------
// Beranda PUBLIK — halaman yang dilihat orang sebelum punya akun.
//
// Dulu root ini adalah dasbor (kini di /dashboard). Diubah karena dua alasan
// yang sama-sama nyata:
//
//  1. Verifikasi Penyedia Teknologi Meta meminta "URL ke situs web lengkap yang
//     menunjukkan layanan yang Anda jelaskan dan detail bisnis yang
//     menyediakannya". Peninjau yang mendarat di halaman login akan menolak.
//  2. Calon mitra yang dikirimi tautan Zavi juga langsung disuruh login sebelum
//     tahu Zavi itu apa dan berapa harganya. Itu kehilangan pelanggan.
//
// Server component tanpa "use client" — SELURUH isinya harus ada di HTML mentah
// supaya crawler Meta dan mesin pencari membacanya. Halaman yang isinya baru
// muncul setelah JavaScript jalan akan terbaca kosong.
//
// Harga diambil dari lib/billing/plans.ts, bukan ditulis ulang di sini: harga
// di halaman jualan tidak boleh bisa berbeda dari harga yang ditagihkan.
// ---------------------------------------------------------------------------
import type { Metadata } from "next";
import Link from "next/link";
import { PURCHASABLE_PLANS, TRIAL_DAYS, formatIdr } from "@/lib/billing/plans";

const BISNIS = "Gallery Makassar";

export const metadata: Metadata = {
  title: "Zavi — Chatbot WhatsApp untuk UMKM",
  description:
    "Zavi membalas chat pelanggan di WhatsApp 24 jam, menjawab pertanyaan dengan AI dari katalog Anda sendiri, dan mencatat pesanan otomatis. Coba gratis 3 hari.",
};

export default function BerandaPage() {
  return (
    <div className="min-h-screen">
      <header
        className="text-white"
        style={{ background: "linear-gradient(160deg, var(--wa-teal), #0b4f47)" }}
      >
        <nav className="flex items-center justify-between gap-3 px-5 md:px-10 py-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={36} height={36} className="w-9 h-9 rounded-xl" />
            <div className="leading-tight">
              <div className="font-bold">Zavi</div>
              <div className="text-[11px] text-white/60">WA Assistant</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/login" className="btn btn-ghost text-white border-white/30">
              Masuk
            </Link>
            <Link
              href="/daftar"
              className="btn"
              style={{ background: "var(--wa-green)", color: "#053d36" }}
            >
              Coba gratis
            </Link>
          </div>
        </nav>

        <div className="px-5 md:px-10 pb-14 pt-6 max-w-5xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-bold leading-tight max-w-2xl">
            Chat pelanggan terjawab, bahkan saat Anda tidur.
          </h1>
          <p className="mt-4 text-white/80 max-w-2xl text-[17px]">
            Zavi adalah asisten WhatsApp untuk usaha kecil di Indonesia. Ia membalas
            pertanyaan pelanggan 24 jam, menjawab dari katalog dan info usaha Anda
            sendiri, lalu mencatat pesanan yang masuk — tanpa Anda perlu memegang
            ponsel terus.
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link
              href="/daftar"
              className="btn"
              style={{ background: "var(--wa-green)", color: "#053d36" }}
            >
              Coba gratis {TRIAL_DAYS} hari
            </Link>
            <Link href="#harga" className="btn btn-ghost text-white border-white/30">
              Lihat harga
            </Link>
          </div>
          <p className="text-xs text-white/60 mt-3">
            Tanpa kartu kredit. Tanpa aplikasi tambahan di ponsel Anda.
          </p>
        </div>
      </header>

      <main className="px-5 md:px-10 py-12 max-w-5xl mx-auto">
        <section>
          <h2 className="text-2xl font-bold">Apa yang Zavi kerjakan</h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            <Kartu ikon="💬" judul="Membalas pertanyaan yang itu-itu terus">
              Jam buka, alamat, cara pesan, cara bayar — dijawab seketika dengan
              jawaban yang Anda tentukan sendiri.
            </Kartu>
            <Kartu ikon="✨" judul="Menjawab pertanyaan bebas dengan AI">
              &quot;Ada ukuran L warna hitam?&quot; dijawab dari katalog Anda, bukan
              dibalas daftar harga yang panjang.
            </Kartu>
            <Kartu ikon="🛒" judul="Mencatat pesanan otomatis">
              Pesanan yang masuk lewat chat langsung tercatat, lengkap dengan
              statusnya, supaya tidak ada yang terlewat.
            </Kartu>
            <Kartu ikon="📚" judul="Belajar dari data Anda sendiri">
              Unggah katalog dari Excel, atau biarkan Zavi membaca halaman produk
              di website Anda. Tidak ada jawaban yang dikarang.
            </Kartu>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold">Cara mulai</h2>
          <ol className="mt-5 space-y-4">
            <Langkah n={1} judul="Daftar dan isi profil usaha">
              Nama usaha, jam buka, katalog, cara pesan. Zavi langsung bisa dicoba di
              simulator, tanpa menyambungkan WhatsApp dulu.
            </Langkah>
            <Langkah n={2} judul="Hubungkan nomor WhatsApp Business Anda">
              Satu tombol lewat akun Facebook Anda. Tidak perlu membuat aplikasi Meta
              sendiri dan tidak perlu menyalin kode apa pun.
            </Langkah>
            <Langkah n={3} judul="Biarkan Zavi bekerja">
              Pantau chat dan pesanan dari dasbor. Anda tetap bisa mengambil alih
              percakapan kapan saja.
            </Langkah>
          </ol>
        </section>

        <section id="harga" className="mt-14 scroll-mt-6">
          <h2 className="text-2xl font-bold">Harga</h2>
          <p className="text-[var(--muted)] mt-1">
            Coba {TRIAL_DAYS} hari gratis lebih dulu. Semua fitur terbuka selama masa
            percobaan.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            {PURCHASABLE_PLANS.map((p) => (
              <div key={p.id} className="card p-5 flex flex-col">
                <div className="font-semibold text-lg">{p.name}</div>
                <div className="text-3xl font-bold mt-1">
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
                <Link href="/daftar" className="btn btn-primary w-full mt-5">
                  Mulai dengan {p.name}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)] mt-4">
            Pembayaran diproses Lynk.id. Langganan aktif otomatis setelah pembayaran
            dikonfirmasi — tidak perlu menunggu admin.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold">Tentang penyelenggara</h2>
          <p className="mt-3 max-w-2xl">
            Zavi — WA Assistant dikembangkan dan dioperasikan oleh{" "}
            <strong>{BISNIS}</strong>, penyedia teknologi dari Indonesia. Kami
            menyediakan layanan chatbot WhatsApp berbasis AI untuk pelaku usaha, serta
            pembuatan portofolio web dan halaman penjualan.
          </p>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Zavi memakai WhatsApp Business Cloud API resmi dari Meta. Setiap mitra
            menyambungkan nomor WhatsApp Business miliknya sendiri, dan tetap menjadi
            pemilik data pelanggannya. Rinciannya ada di{" "}
            <Link href="/privasi" className="text-[var(--wa-teal)] underline">
              Kebijakan Privasi
            </Link>
            .
          </p>
        </section>

        <section className="mt-14 card p-6 text-center">
          <h2 className="text-xl font-bold">Coba dulu, gratis {TRIAL_DAYS} hari</h2>
          <p className="text-[var(--muted)] mt-1.5">
            Tanpa kartu kredit. Kalau tidak cocok, tinggal berhenti.
          </p>
          <Link href="/daftar" className="btn btn-primary mt-5 inline-block">
            Daftar sekarang
          </Link>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] px-5 md:px-10 py-8">
        <div className="max-w-5xl mx-auto flex flex-wrap justify-between gap-4 text-sm text-[var(--muted)]">
          <div>
            <div className="font-semibold text-[var(--fg)]">Zavi — WA Assistant</div>
            <div className="mt-0.5">Dioperasikan oleh {BISNIS}, Indonesia</div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/privasi" className="hover:underline">
              Kebijakan Privasi
            </Link>
            <Link href="/login" className="hover:underline">
              Masuk
            </Link>
            <Link href="/daftar" className="hover:underline">
              Daftar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Kartu({
  ikon,
  judul,
  children,
}: {
  ikon: string;
  judul: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="text-2xl" aria-hidden="true">
        {ikon}
      </div>
      <div className="font-semibold mt-2">{judul}</div>
      <p className="text-sm text-[var(--muted)] mt-1">{children}</p>
    </div>
  );
}

function Langkah({
  n,
  judul,
  children,
}: {
  n: number;
  judul: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        className="grid place-items-center w-8 h-8 rounded-full font-bold text-sm shrink-0"
        style={{ background: "var(--surface-2)" }}
      >
        {n}
      </span>
      <div>
        <div className="font-semibold">{judul}</div>
        <p className="text-sm text-[var(--muted)] mt-0.5">{children}</p>
      </div>
    </li>
  );
}
