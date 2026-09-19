"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { TrialBanner } from "@/components/Gate";

const KARTU = [
  {
    href: "/settings/bisnis",
    icon: "🏪",
    judul: "Profil Bisnis",
    isi: "Nama, jam buka, alamat, kontak, katalog, dan info pembayaran. Semua balasan bot mengambil datanya dari sini.",
  },
  {
    href: "/settings/bot",
    icon: "🤖",
    judul: "Bot Template",
    isi: "Pilih template sesuai jenis usaha, lalu atur kata kunci, isi balasan, dan menu pilihan cepat.",
  },
  {
    href: "/settings/whatsapp",
    icon: "📱",
    judul: "Sambungan WhatsApp",
    isi: "Hubungkan nomor WhatsApp Business Anda agar bot melayani pelanggan sungguhan, bukan hanya simulator.",
  },
  {
    href: "/settings/ai",
    icon: "✨",
    judul: "Pengaturan AI",
    isi: "Nyalakan/matikan AI, atur gaya bicara, batas riwayat, dan dokumen pengetahuan yang dibaca AI.",
  },
];

export default function SettingsIndexPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <TrialBanner />
      <PageHeader
        title="Pengaturan"
        subtitle="Setiap bagian punya halamannya sendiri agar tidak tercampur."
      />
      <div className="grid sm:grid-cols-2 gap-4">
        {KARTU.map((k) => (
          <Link key={k.href} href={k.href} className="card p-5 hover:shadow-md transition-shadow">
            <div className="text-2xl mb-2">{k.icon}</div>
            <div className="font-semibold mb-1">{k.judul}</div>
            <p className="text-sm text-[var(--muted)]">{k.isi}</p>
            <div className="text-sm mt-3 text-[var(--wa-teal)]">Buka →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
