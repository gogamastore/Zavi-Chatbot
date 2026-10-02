// ---------------------------------------------------------------------------
// Kebijakan Privasi — halaman PUBLIK.
//
// Sengaja server component tanpa "use client": Meta (dan mesin pencari)
// mensyaratkan kebijakan privasi yang bisa dibaca crawler. Halaman yang isinya
// baru muncul setelah JavaScript jalan akan terbaca KOSONG oleh crawler, dan
// verifikasinya ditolak.
//
// Tidak ada pemeriksaan login di sini, dan memang tidak boleh ada.
//
// ATURAN ISI: hanya tulis yang benar-benar dilakukan kode ini. Kebijakan
// privasi yang menjanjikan hal yang tidak dikerjakan (mis. "data dihapus
// otomatis setelah 90 hari" padahal tidak ada mekanismenya) lebih buruk
// daripada tidak punya kebijakan — itu pernyataan salah kepada publik.
// ---------------------------------------------------------------------------
import type { Metadata } from "next";
import Link from "next/link";

/**
 * Alamat kontak yang tampil di kebijakan privasi — SATU tempat untuk diganti.
 *
 * Sementara memakai email pribadi pemilik atas permintaannya sendiri. Begitu
 * alamat bisnis tersedia, ganti di sini saja: nilainya dipakai di tiga tempat
 * pada halaman ini.
 */
const KONTAK = "enerinsanmulia@gmail.com";
const BISNIS = "Gallery Makassar";
const DIPERBARUI = "1 Oktober 2026";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — Zavi WA Assistant",
  description:
    "Bagaimana Zavi mengumpulkan, memakai, dan melindungi data pemilik usaha dan pelanggannya.",
};

export default function KebijakanPrivasiPage() {
  return (
    <main className="p-5 md:p-10 max-w-3xl mx-auto leading-relaxed">
      <p className="text-sm text-[var(--muted)]">
        <Link href="/" className="text-[var(--wa-teal)] underline">
          Zavi — WA Assistant
        </Link>
      </p>
      <h1 className="text-3xl font-bold mt-2">Kebijakan Privasi</h1>
      <p className="text-sm text-[var(--muted)] mt-1">Terakhir diperbarui: {DIPERBARUI}</p>

      <Bagian judul="1. Tentang layanan ini">
        <p>
          Zavi — WA Assistant (&quot;Zavi&quot;) adalah layanan chatbot WhatsApp untuk
          pelaku usaha kecil dan menengah di Indonesia. Zavi membalas pesan pelanggan
          secara otomatis, menjawab pertanyaan dengan bantuan AI, dan mencatat pesanan
          yang masuk. Layanan ini dioperasikan oleh <strong>{BISNIS}</strong>.
        </p>
        <p>
          Zavi adalah <strong>penyedia teknologi</strong>. Pemilik usaha yang
          berlangganan Zavi (&quot;Mitra&quot;) adalah pemilik data pelanggannya sendiri.
          Zavi mengolah data itu <strong>atas nama Mitra</strong>, untuk menjalankan
          layanan yang Mitra minta — bukan untuk kepentingan Zavi sendiri.
        </p>
      </Bagian>

      <Bagian judul="2. Data yang kami kumpulkan">
        <h3 className="font-semibold mt-4 mb-1">a. Dari Mitra (pemilik usaha)</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Nama dan alamat email untuk akun, lewat Firebase Authentication.</li>
          <li>
            Profil usaha yang Mitra isi sendiri: nama usaha, jenis usaha, jam buka,
            alamat, nomor kontak, katalog produk dan harga, cara pemesanan, serta
            informasi pembayaran.
          </li>
          <li>
            Dokumen pengetahuan yang Mitra tambahkan: teks yang ditempel, isi halaman
            web yang Mitra minta kami ambil, atau isi berkas yang diunggah.
          </li>
          <li>
            Kredensial sambungan WhatsApp Business milik Mitra (id akun, id nomor, dan
            token akses). Token ini <strong>tidak pernah dikirim ke browser</strong> dan
            hanya dipakai server kami untuk mengirim balasan atas nama Mitra.
          </li>
        </ul>

        <h3 className="font-semibold mt-4 mb-1">b. Dari pelanggan Mitra, melalui WhatsApp</h3>
        <p>
          Saat seseorang mengirim pesan WhatsApp ke nomor usaha Mitra, kami menerima dan
          menyimpan:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Nomor WhatsApp pengirim dan nama profil WhatsApp-nya, bila tersedia.</li>
          <li>Isi pesan teks dan waktu kirim.</li>
          <li>
            Pesanan yang terdeteksi dari isi pesan tersebut, supaya Mitra bisa
            menindaklanjutinya.
          </li>
        </ul>
        <p className="mt-2">
          Pesan non-teks (gambar, suara, dokumen) saat ini tidak diproses dan isinya
          tidak disimpan.
        </p>

        <h3 className="font-semibold mt-4 mb-1">c. Dari proses pembayaran</h3>
        <p>
          Pembayaran langganan diproses oleh <strong>Lynk.id</strong>. Kami menerima
          pemberitahuan berisi nama, email, dan nomor telepon pembeli, nama produk,
          serta jumlah pembayaran — untuk mengaktifkan langganan akun yang tepat.{" "}
          <strong>
            Kami tidak pernah menerima, melihat, atau menyimpan nomor kartu maupun data
            rekening Anda.
          </strong>
        </p>
      </Bagian>

      <Bagian judul="3. Bagaimana data dipakai">
        <ul className="list-disc pl-5 space-y-1">
          <li>Menjalankan bot: membaca pesan masuk dan mengirim balasan.</li>
          <li>
            Menyusun balasan AI. Untuk itu, isi pesan pelanggan beserta profil usaha,
            katalog, dan dokumen pengetahuan Mitra dikirim ke penyedia AI — lihat bagian
            4.
          </li>
          <li>Menampilkan riwayat chat dan daftar pesanan di dasbor Mitra.</li>
          <li>Menghitung pemakaian AI untuk menegakkan kuota paket langganan.</li>
          <li>Mengaktifkan dan memperpanjang langganan setelah pembayaran.</li>
          <li>Menjaga keamanan layanan dan menyelidiki penyalahgunaan.</li>
        </ul>
      </Bagian>

      <Bagian judul="4. Pihak ketiga yang menerima data">
        <p>Kami memakai layanan berikut untuk menjalankan Zavi:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Google Cloud / Firebase</strong> — hosting aplikasi, autentikasi
            akun, dan basis data (Firestore) tempat seluruh data di atas disimpan.
          </li>
          <li>
            <strong>Meta / WhatsApp Business Cloud API</strong> — menerima dan mengirim
            pesan WhatsApp.
          </li>
          <li>
            <strong>Anthropic (Claude)</strong> dan/atau <strong>Google (Gemini)</strong>{" "}
            — menyusun balasan AI. Yang dikirim adalah isi pesan pelanggan dan informasi
            usaha Mitra yang relevan untuk menjawabnya.
          </li>
          <li>
            <strong>Lynk.id</strong> — memproses pembayaran langganan.
          </li>
        </ul>
        <p className="mt-2">
          Sebagian layanan ini memproses data di luar Indonesia. Dengan memakai Zavi,
          Mitra menyetujui pemindahan data tersebut sejauh diperlukan untuk menjalankan
          layanan.
        </p>
      </Bagian>

      <Bagian judul="5. Yang tidak kami lakukan">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Kami <strong>tidak menjual</strong> data kepada siapa pun.
          </li>
          <li>
            Kami <strong>tidak memakai</strong> data pesan untuk periklanan, penargetan
            iklan, atau membangun profil pemasaran.
          </li>
          <li>
            Kami <strong>tidak membagikan</strong> data satu Mitra kepada Mitra lain.
            Data tiap Mitra disimpan terpisah dan hanya dapat diakses lewat akun Mitra
            itu sendiri.
          </li>
          <li>
            Kami tidak memakai isi pesan pelanggan untuk melatih model AI kami sendiri.
          </li>
        </ul>
      </Bagian>

      <Bagian judul="6. Penyimpanan dan jangka waktu">
        <p>
          Data disimpan selama akun Mitra masih ada, karena riwayat chat dan pesanan
          adalah catatan usaha yang Mitra butuhkan. Kami{" "}
          <strong>tidak menghapus data secara otomatis setelah jangka waktu tertentu</strong>{" "}
          — kami memilih menyatakannya terus terang daripada menjanjikan penghapusan
          otomatis yang tidak kami jalankan.
        </p>
        <p>
          Penghapusan dilakukan <strong>atas permintaan</strong>. Lihat bagian 7.
        </p>
      </Bagian>

      <Bagian judul="7. Hak Anda">
        <p>
          Mitra dapat meminta salinan data akunnya, perbaikan data yang keliru, atau
          penghapusan akun beserta seluruh datanya. Mitra juga dapat memutuskan sambungan
          WhatsApp kapan saja, yang langsung menghentikan Zavi menerima pesan baru.
        </p>
        <p>
          Jika Anda adalah <strong>pelanggan dari sebuah usaha</strong> yang memakai Zavi
          dan ingin pesan Anda dihapus, hubungi usaha tersebut lebih dulu — merekalah
          pemilik data itu. Anda juga bisa menghubungi kami dan kami akan meneruskannya.
        </p>
        <p>
          Permintaan dikirim ke{" "}
          <a href={`mailto:${KONTAK}`} className="text-[var(--wa-teal)] underline">
            {KONTAK}
          </a>
          . Kami menanggapi dalam 30 hari kerja.
        </p>
      </Bagian>

      <Bagian judul="8. Keamanan">
        <ul className="list-disc pl-5 space-y-1">
          <li>Semua lalu lintas memakai HTTPS.</li>
          <li>
            Basis data tidak dapat diakses langsung dari browser. Aturan keamanan
            Firestore menolak seluruh akses dari sisi klien; hanya server kami yang boleh
            membaca dan menulis, dan hanya pada data milik akun yang sedang login.
          </li>
          <li>
            Token WhatsApp dan kunci API disimpan sebagai rahasia terkelola, tidak pernah
            dikirim ke browser, dan tidak pernah ditulis di dalam kode.
          </li>
        </ul>
        <p className="mt-2">
          Tidak ada sistem yang kebal. Jika terjadi kebocoran data yang berisiko merugikan
          Anda, kami akan memberitahukannya.
        </p>
      </Bagian>

      <Bagian judul="9. Anak-anak">
        <p>
          Zavi ditujukan untuk pelaku usaha. Kami tidak menyediakan layanan ini untuk anak
          di bawah 18 tahun dan tidak dengan sengaja mengumpulkan data mereka.
        </p>
      </Bagian>

      <Bagian judul="10. Perubahan kebijakan">
        <p>
          Kebijakan ini dapat diperbarui. Tanggal &quot;terakhir diperbarui&quot; di atas
          selalu menunjukkan versi yang berlaku. Perubahan yang berdampak besar akan kami
          sampaikan lewat email atau pemberitahuan di dasbor.
        </p>
      </Bagian>

      <Bagian judul="11. Hubungi kami">
        <p>
          {BISNIS} — operator Zavi WA Assistant
          <br />
          Email:{" "}
          <a href={`mailto:${KONTAK}`} className="text-[var(--wa-teal)] underline">
            {KONTAK}
          </a>
        </p>
      </Bagian>

      <p className="text-sm text-[var(--muted)] mt-10 pt-5 border-t border-[var(--border)]">
        <Link href="/" className="text-[var(--wa-teal)] underline">
          ← Kembali ke Zavi
        </Link>
      </p>
    </main>
  );
}

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-2">{judul}</h2>
      <div className="space-y-2 text-[15px]">{children}</div>
    </section>
  );
}
