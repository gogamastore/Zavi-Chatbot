# Catatan Proyek — Zavi (WA Assistant)

> Catatan utama proyek (living document). Diperbarui tiap ada perkembangan.
> Log rinci per sesi ada di folder [`catatan/`](./catatan/).
> Belum pakai GitHub — penyimpanan di hard disk eksternal. **Backup folder ini secara berkala.**

Terakhir diperbarui: **29 September 2026**

---

## 1. Tentang proyek

**Zavi — WA Assistant**: chatbot WhatsApp otomatis untuk UMKM (toko, resto, klinik kecil, jasa) yang bisa:
- Balas chat pelanggan 24 jam (jam buka, harga, katalog, cara order) lewat template/menu.
- Menjawab pertanyaan bebas pakai AI (Claude), bukan cuma keyword.
- Mencatat pesanan masuk otomatis ke database, dipantau lewat dashboard admin.

Sumber rencana: `Zavi Chatbot WhatsApp — Roadmap Prototype.docx` (di folder induk,
satu tingkat di atas proyek ini).
Pemilik: **@GogamaLab**.

## 2. Keputusan besar

| Topik | Keputusan | Alasan |
|---|---|---|
| **Model bisnis** | **SaaS multi-tenant untuk UMKM** — klien daftar sendiri, trial 3 hari, lalu langganan bulanan | Zavi jadi produk, bukan proyek per-klien |
| Pembayaran | **Lynk.id (webhook)** — AKTIF. **Midtrans dinonaktifkan sementara** lewat sakelar `PAYMENT_PROVIDER` | Lynk.id lebih mudah untuk pemilik: cukup buat produk + link, tanpa integrasi API. Kode Midtrans tetap ada, bisa dihidupkan lagi dengan `PAYMENT_PROVIDER=midtrans` |
| Letak logika pembayaran | **Next.js**, bukan Firebase Functions | Satu sumber kebenaran untuk status langganan. Blaze sudah aktif, tapi Functions/Scheduler dipakai sebagai **pemicu** rekonsiliasi, bukan tempat logikanya |
| Integrasi Meta | **Jadilah Mitra (Tech Provider)** — Embedded Signup menunggu verifikasi bisnis | Satu-satunya jalur realistis: klien UMKM tidak mungkin membuat app Meta sendiri |
| Login klien | **Firebase Auth: email/password + Google** | Gratis, langsung dipakai ulang app Flutter lewat `firebase_auth` |
| Penyedia AI | **Anthropic (`claude-sonnet-5`) — AKTIF** | Lapis AI provider-agnostic; Gemini tetap tersedia sebagai cadangan lewat `ZAVI_AI_PROVIDER` |
| Urutan build | **Web dulu, lalu dicerminkan ke Flutter** | Cepat didemokan; backend web dipakai ulang oleh Flutter |
| Nama folder proyek web | **`Zavi_Web`** | Nama resmi — semua dokumen mengacu ke nama ini |
| Letak catatan proyek | **Di dalam `Zavi_Web`** | Supaya ikut ter-commit saat repo di-push ke GitHub |
| Stack web | **Next.js 16 full-stack** (React 19 + TypeScript + Tailwind v4) | Satu bahasa, backend + dashboard + simulator jadi satu, API bersih |
| Database | **Firestore** (dengan fallback in-memory saat belum ada kredensial) | Sesuai roadmap; fallback supaya demo langsung jalan |
| Simulator | **Ada** — chat gaya WhatsApp di browser | Bisa uji & demo bot tanpa nomor Meta |
| Model AI | Default `claude-sonnet-5` (bisa ganti `claude-opus-5`) | Hemat & cepat untuk CS volume tinggi; roadmap menyebut `claude-sonnet-4-6` (versi lama) |

## 3. Struktur folder

```
D:\Zavi Wa Assistant\
├── Zavi Chatbot WhatsApp — Roadmap Prototype.docx   # rencana awal
├── zavi-assistant-firebase-adminsdk-*.json          # service account (RAHASIA, di LUAR repo)
├── Zavi_Web\                                        # proyek Next.js (SUDAH JADI)
│   ├── CATATAN-PROYEK.md                            # file ini (acuan utama)
│   ├── catatan\                                     # log per sesi
│   │   ├── 2026-09-19-sesi-1-build-web.md
│   │   ├── 2026-09-19-sesi-2-sambung-firestore.md
│   │   ├── 2026-09-19-sesi-3-arah-saas.md
│   │   ├── 2026-09-19-sesi-4-auth-multitenant.md
│   │   ├── 2026-09-19-sesi-5-midtrans.md
│   │   ├── 2026-09-19-sesi-6-blaze-rekonsiliasi.md
│   │   ├── 2026-09-19-sesi-7-pengamanan-webhook.md
│   │   └── 2026-09-29-sesi-11-lynkid.md            # ganti pembayaran ke Lynk.id
│   ├── app\  lib\  components\                      # kode
│   ├── public\ (logo.svg, ikon PWA) + app\icon.svg  # aset logo Zavi terpasang
│   └── zavi-assistant-firebase-adminsdk-*.json      # service account (RAHASIA, gitignored)
├── brand\                                            # kit logo master (ikon, favicon, wordmark)
└── flutter\                                         # (BELUM) app Flutter — tahap berikutnya
```

## 4. Status pengerjaan

### ✅ Selesai (proyek web) — 19 Sep 2026
- Tahap 1: Webhook WhatsApp (`/api/webhook`) + WhatsApp client
- Tahap 2: Intent router + rules template Bahasa Indonesia + menu
- Tahap 3: Integrasi AI Claude + knowledge base + eskalasi ke admin
- Tahap 4: Deteksi & pencatatan pesanan + Firestore (fallback memory)
- Tahap 5: Dashboard admin (Dashboard, Riwayat Chat, Pesanan, Pengaturan) + Simulator
- Tahap 6: Dockerfile + panduan deploy (build standalone terverifikasi)
- **Firestore tersambung sungguhan** (service account project `zavi-assistant`) —
  chat & pesanan sekarang permanen, tidak hilang saat restart.

### ✅ Lapis SaaS (sesi 3–4)
- **Tahap A** — model data: `Tenant`, `Plan`, `Subscription`, `Entitlement`,
  `Payment`, `BotTemplate`, `BotConfig`, `AIConfig` + katalog paket.
- **Tahap B** — Firebase Auth (email + Google), pendaftaran 2 langkah,
  penyediaan tenant otomatis, **refactor seluruh data jadi multi-tenant**.
- **Tahap C** — trial 3 hari + `useSubscription()` + `requireFeature()` di server.
- **Tahap E** — halaman pengaturan dipisah: Profil Bisnis / Bot Template /
  Pengaturan AI. Plus 5 preset template bot per jenis usaha.
- **Tahap D** — Midtrans Snap: buat transaksi, webhook notifikasi terverifikasi
  tanda tangan, idempoten, langganan aktif otomatis.
- **Jaring pengaman** — `/api/payment/reconcile`: menanyakan Midtrans Status API
  untuk pembayaran pending, menyelamatkan yang notifikasinya hilang.
- **Cloud Functions** (TypeScript) — `rekonsiliasiPembayaran`, penjadwal tipis
  tiap 30 menit yang memanggil endpoint di atas. Logika tetap di Next.js.
- Lapis AI jadi **provider-agnostic** (Claude + Gemini di balik satu antarmuka).

> **Auth sudah aktif & teruji.** Email/Password + Google Enabled di Firebase
> Console. Alur lengkap daftar → trial 3 hari → terkunci → bayar → terbuka
> otomatis sudah diverifikasi end-to-end dengan akun sungguhan.

### ✅ Fitur ala Kommo (sesi 8–10)

Daftar keinginan dari `catatan/referensi/ALUR INTEGRASI WHATSAPP KOMMO.pdf`,
dikerjakan berurutan dari yang paling cepat menghasilkan:

1. **Impor katalog dari Excel/CSV** — unduh template `.xlsx` (dua lembar:
   *Katalog* untuk data, *Petunjuk* untuk cara pakai), unggah, lalu
   **pratinjau dulu** sebelum disimpan. Impor tidak pernah menimpa katalog
   diam-diam: pemilik memilih "ganti" atau "tambahkan", lalu menekan Simpan.
   Batas sengaja ketat (2 MB, 500 produk, hanya `.xlsx`/`.csv`) karena berkas
   ini datang dari luar.
2. **Beli kredit AI (top-up)** — tiga paket (250 / 1.000 / 3.000 balasan) lewat
   Midtrans yang sudah ada. Keputusan penting di fitur ini:
   - **Kredit dipakai setelah kuota bulanan paket habis**, tidak sebaliknya.
     Kuota bulanan hangus tiap periode, kredit tidak — jadi memakai yang akan
     hangus lebih dulu menguntungkan pelanggan.
   - **Kredit tidak hangus** saat periode langganan berganti. Sudah dibayar
     terpisah, jadi menghanguskannya sama dengan mengambil barang yang sudah
     dibeli.
   - **Kredit bukan pengganti langganan.** Saat akun terkunci, punya kredit
     tetap tidak membuka AI — dan penjualan kredit ke akun terkunci ditolak
     di server (403), supaya tidak ada yang membayar sesuatu yang belum bisa
     dipakai.
   - **Harga per kredit selalu di atas harga per balasan paket Pro**
     (Rp 83). Kalau top-up lebih murah daripada naik paket, pendapatan
     berulang hilang. Aturan ini ada di komentar `lib/billing/credits.ts` dan
     diuji otomatis.
   - `terapkanStatusPembayaran()` tetap satu-satunya pintu aktivasi. Pembelian
     kredit **tidak** memperpanjang masa aktif dan **tidak** me-reset
     pemakaian — hanya menambah saldo, lewat increment atomik.

3. **Tab "Sumber" & "Tindakan" terstruktur** — SELESAI (sesi 10).
   Halaman Pengaturan AI dibagi tiga tab: **Perilaku**, **Sumber**, **Tindakan**.
   - **Tindakan** menggantikan peran satu kotak teks bebas: aturan bersyarat
     `AIAction` ("KALAU x → MAKA y") ditambah satu per satu, bisa dimatikan,
     diurutkan, dan dihapus sendiri-sendiri. Hanya yang aktif masuk prompt.
     Dibatasi 30 aturan × 300 karakter karena isinya masuk ke setiap panggilan
     AI — biaya token ditanggung platform. `customInstructions` tetap ada
     sebagai "Instruksi umum" (yang berlaku selalu), tidak dibuang.
   - **Sumber**: URL sekarang **benar-benar diambil** isinya oleh server, bukan
     sekadar dicatat. `fetchedAt` dan `fetchError` disimpan dan ditampilkan apa
     adanya, plus tombol **Segarkan**. Saat penyegaran gagal, isi lama sengaja
     DIPERTAHANKAN — bot yang menjawab dari data kemarin lebih berguna daripada
     bot yang kehilangan sumbernya karena situsnya sedang mati. Prompt AI juga
     memberi tahu model kapan halaman itu diambil, supaya tidak menjaminkan
     stok/promo yang mungkin sudah berubah.
   - **PENJAGAAN SSRF** (`lib/knowledge/ambil.ts`) — ini syarat fitur ini boleh
     ada, bukan tambahan. Server mengambil URL yang diketik pelanggan, jadi
     tanpa penjagaan siapa pun bisa menyuruhnya membaca
     `169.254.169.254/computeMetadata` dan mencuri token service account kita
     — yang berarti seluruh Firestore semua tenant. Caranya: hanya http/https;
     DNS diresolusi sendiri lalu SEMUA hasilnya wajib publik; koneksi dibuka ke
     IP yang sudah diperiksa (bukan ke nama host lagi, menutup DNS rebinding);
     redirect diikuti manual maksimal 3× dengan pemeriksaan ulang tiap lompatan;
     ada batas waktu 10 detik, batas unduh 512 KB, dan pemeriksaan tipe konten.
   - Konfigurasi AI dimuat SATU KALI di halaman dan dibagi ke semua tab. Kalau
     tiap tab memuat & menyimpan sendiri, menyimpan dari satu tab akan mengirim
     konfigurasi tanpa data tab lain dan menghapusnya.
   - **Katalog produk + impor Excel PINDAH ke tab Sumber** (dari Profil
     Bisnis). Bukan soal tata letak: katalog adalah sumber fakta yang dibaca
     AI, jadi tempatnya bersama sumber pengetahuan lain. Penyimpanannya tetap
     satu — `Business.catalog` — supaya tidak pernah ada dua katalog yang
     isinya berbeda. Profil Bisnis tetap bisa mengedit item satu per satu dan
     kini menunjuk ke sini untuk impor massal.
   - **Pertanyaan produk dijawab AI, bukan aturan template.** Dulu kata
     "harga/produk/katalog/menu" dicegat aturan `harga` yang membalas dengan
     menyiram SELURUH katalog — AI tidak pernah kebagian, padahal justru AI
     yang bisa menjawab "ada baju hitam ukuran L?" dengan tepat. Sekarang
     `route()` menyerahkan intent produk ke AI. Tiga penjagaan menyertainya:
     (1) pilihan menu EKSPLISIT (menekan tombol / mengetik nomornya) tetap
     dibalas daftar lengkap, karena itu persis yang diminta; (2) intent
     non-produk (jam buka, alamat, pembayaran, admin) tetap dijawab aturan —
     cepat, gratis, tidak mungkin salah; (3) kalau AI mati / terkunci / kuota
     habis, aturan katalog otomatis mengambil alih lagi, jadi bot tidak pernah
     berubah jadi "tunggu admin" untuk pertanyaan yang katalognya ada.
     Bisa dimatikan lewat sakelar `productQuestionsToAI` di tab Perilaku.

Sisa urutan yang disepakati (dikerjakan dari atas):

4. **Katalog dari URL situs** — SELESAI (sesi 10). Jadi jauh lebih kecil
   daripada perkiraan awal karena bagian paling berisikonya — pengambil URL
   ber-penjagaan SSRF — sudah dibangun di poin 3 dan tinggal dipakai ulang.
   Alurnya: ambil halaman → AI memetakan produknya → **pratinjau** → pemilik
   memilih "ganti"/"tambahkan" → Simpan. Sama seperti impor Excel: tidak
   pernah menimpa katalog diam-diam.
   Tiga kekhawatiran yang dulu dicatat, dan jawabannya:
   - **Situs ber-JavaScript / Instagram / marketplace** — memang tidak
     terbaca. Ditangani dengan jujur: pemindaian mengembalikan daftar kosong
     beserta alasannya dan menyuruh pakai Excel atau salin-tempel, bukan
     diam-diam menyimpan katalog kosong.
   - **Biaya AI tiap memindai** — satu pemindaian dihitung **satu balasan AI**
     dari kuota tenant, dipotong hanya setelah panggilan berhasil. Tanpa itu,
     pemindai jadi celah memakai AI tanpa batas di luar kuota yang dibayar.
     Mode demo ditolak karena bisa dipakai tanpa login.
   - **AI mengarang produk** — kekhawatiran terbesar dan tidak ada di catatan
     awal. Halaman katalog penuh teks promosi dan menu; model yang "membantu"
     bisa menyulapnya jadi produk berikut harga karangan, dan harga karangan
     di WhatsApp adalah janji yang harus ditepati pemiliknya. Dijaga dengan
     prompt yang melarang mengarang secara eksplisit, harga dikosongkan kalau
     tidak tertulis, hasil dibersihkan & dibatasi di server, dan peringatan
     "dibaca mesin — periksa dulu" selalu ikut. Diuji: halaman non-katalog
     menghasilkan 0 produk, bukan produk karangan.
5. **Embedded Signup + "Hubungkan WhatsApp lewat login Facebook"** —
   KODENYA SELESAI (sesi 10), tinggal menunggu Meta. Tombol ada di
   /settings/whatsapp, paling atas; pengisian manual tetap ada sebagai
   cadangan.
   - **Yang kurang cuma satu env: `META_CONFIG_ID`** — id konfigurasi
     Embedded Signup yang dibuat di Meta App Dashboard → WhatsApp → Embedded
     Signup, dan baru bisa dibuat setelah verifikasi bisnis selesai. Selama
     kosong, tombolnya ditampilkan MATI beserta keterangan apa yang kurang —
     bukan tombol yang kelihatan hidup lalu gagal misterius.
   - **Klaim dari browser TIDAK dipercaya.** `waba_id` dan `phone_number_id`
     datang dari event Embedded Signup di browser, padahal `phone_number_id`
     adalah kunci yang dipakai webhook menentukan pesan masuk milik tenant
     siapa. Kalau dipercaya mentah, satu mitra bisa mengklaim nomor mitra
     lain dan membajak seluruh chat pelanggannya. Urutan yang dipakai:
     tukar kode jadi token bisnis di server (butuh app secret) → tanya Meta
     lewat `debug_token` WABA mana yang SEBENARNYA diizinkan token itu →
     ambil daftar nomornya dari Meta, bukan dari browser → tolak kalau
     nomornya sudah diklaim tenant lain (409).
   - Langganan webhook (`POST {waba}/subscribed_apps`) dan pendaftaran nomor
     (`POST {phone}/register`) dijalankan setelahnya, dan boleh gagal
     sendiri-sendiri: kegagalannya dilaporkan apa adanya ke pemilik, tidak
     menggagalkan seluruh penyambungan.
   - Terverifikasi melawan Meta sungguhan: penukaran kode palsu dibalas
     "Meta menolak (100): Invalid verification code format" — artinya jalur
     dan kredensial app sudah benar, tinggal config id.
   - ⚠️ **`GRAPH_API_VERSION` masih `v21.0`.** Dokumen Meta sekarang memakai
     v25/v26. Versi lama biasanya dihentikan ~2 tahun setelah rilis, jadi
     v21.0 (rilis Okt 2024) kemungkinan besar habis masa dukungannya sekitar
     Okt 2026. Perlu dinaikkan dan diuji — menyentuhnya berarti ikut menguji
     jalur kirim pesan, jadi jangan diubah sambil lalu. — persis
   seperti Kommo: mitra menekan satu tombol, login dengan akun Facebook
   mereka, lalu nomor WhatsApp-nya tersambung ke **App ID Meta milik Zavi**
   (model Tech Provider). Mitra tidak perlu membuat app Meta sendiri, tidak
   perlu menyalin token, dan tidak perlu mengisi `phone_number_id` manual —
   semuanya lewat dialog Facebook Login for Business. Bisa **dibangun
   sekarang**, tapi baru **hidup setelah verifikasi bisnis Meta selesai**.
   Ini yang akhirnya menggantikan halaman /settings/whatsapp yang sekarang
   masih minta isian manual.
6. **Galeri template bot berwarna** — SELESAI (sesi 10). Tiap template
   punya ikon dan warna khas (resto 🍜 jingga, toko 🛍️ biru, klinik 🩺 sian,
   jasa 🔧 ungu, custom ✨ abu). Kartu juga menampilkan **pratinjau tombol
   yang akan dilihat pelanggan** — itu yang sebenarnya membantu memilih,
   bukan warnanya.
   - Satu komponen `components/GaleriTemplate.tsx` dipakai di **/daftar** dan
     **/settings/bot**. Kalau keduanya punya galeri sendiri, cepat atau
     lambat calon mitra melihat pilihan yang berbeda dari yang dia lihat
     setelah masuk.
   - Warna khas hanya untuk ikon, garis tepi, dan latar ber-alpha rendah.
     Teks tetap memakai warna teks biasa di atas permukaan biasa, jadi tidak
     ada pasangan warna yang kontrasnya meragukan. Garis tepi berwarna hanya
     muncul saat terpilih supaya galerinya tidak jadi pelangi yang bising.

**Seluruh daftar Kommo selesai.** Yang tersisa dari daftar itu hanya poin 5
yang menunggu verifikasi bisnis Meta (kodenya sudah siap), dan pipeline CRM
yang ditunda atas permintaan pemilik.

Pipeline CRM ditunda atas permintaan pemilik — hanya relevan kalau mitra
berjualan lewat META, sedangkan penjualan lewat aplikasi/website sendiri tidak
akan terbaca.

### ✅ Peran owner / pengembang (sesi 9)

Zavi sekarang punya konsep pengelola platform, terpisah dari pelanggan.

- **Penanda owner = custom claim Firebase Auth `owner: true`**, bukan field
  `role` di Firestore dan bukan daftar email di env. Claim hanya bisa diberikan
  lewat Admin SDK, jadi tidak ada pengguna yang bisa mengangkat dirinya sendiri.
  Claim ditandatangani Google di dalam token — tidak bisa dipalsukan dari klien.
- **`/owner/login`** — halaman login terpisah. Tidak ada tautan daftar, tidak
  ada login Google. Setelah login, akses diperiksa ke **server**
  (`/api/owner/me`), bukan dengan membaca claim di browser; kalau ternyata bukan
  owner, sesinya langsung ditutup lagi.
- **`/owner`** — ringkasan: jumlah mitra, aktif, percobaan, terkunci, total
  pemakaian AI, dan daftar **"perlu perhatian"** (mitra terkunci atau tinggal
  < 7 hari).
- **`/owner/mitra`** — daftar lengkap mitra dengan pencarian (nama bisnis,
  email, nomor) dan penyaringan status: paket, status langganan, masa berlaku,
  pemakaian AI, saldo kredit, sambungan WhatsApp, tanggal bergabung. Status
  dihitung ulang dengan `computeEntitlement`, jadi sama persis dengan yang
  dialami pelanggan. Masih **baca-saja**.
- **Owner punya akses penuh tanpa batas ke seluruh aplikasi.** `ownerEntitlement()`
  membuka semua fitur, tidak pernah terkunci, tidak pernah kehabisan kuota, dan
  tidak punya masa berlaku — pengelola harus bisa mencoba setiap fitur kapan
  saja untuk menguji produknya sendiri. Pemakaian AI tetap **dihitung dan
  ditampilkan** apa adanya, karena biayanya nyata.
- **Owner berada di luar sistem langganan.** Paketnya `owner` (PlanId
  tersendiri, bukan meminjam "pro", supaya akun internal tidak pernah terbaca
  sebagai pelanggan Pro yang membayar). `/api/payment/create` menolak akun
  owner — tidak ada yang perlu dibeli. Di sidebar, menu "Langganan" diganti
  "Area Owner".
- **Ruang kerja owner dibuat otomatis** saat pertama login (`Ruang Uji Owner`,
  isi contoh) dan ditandai `platformOwner: true`, sehingga **tidak ikut
  terhitung sebagai mitra** di dasbor. Angka "total mitra" harus jujur.
- **`requireOwner()`** di `lib/auth/owner.ts` adalah penegakannya. Berbeda dari
  `requireUser()`, token diperiksa terhadap daftar pencabutan (`checkRevoked`),
  sehingga "keluarkan semua sesi" berlaku seketika, bukan menunggu satu jam.
- **`scripts/owner.mjs`** mengelola claim dari terminal:

  ```bash
  node --env-file=.env.local scripts/owner.mjs daftar
  node --env-file=.env.local scripts/owner.mjs beri  <email>
  node --env-file=.env.local scripts/owner.mjs cabut <email>
  node --env-file=.env.local scripts/owner.mjs buat  <email>   # sandi dari stdin
  ```

  Sandi dibaca dari **stdin**, bukan argumen — argumen tersimpan di riwayat
  shell dan terlihat di daftar proses. `beri` dan `cabut` juga mencabut sesi
  lama, supaya perubahan izin langsung berlaku.

Belum dikerjakan di area owner: perpanjangan langganan manual, pemberian kredit
manual, dan ringkasan pendapatan. Pendapatan sengaja belum ditampilkan karena
angkanya harus diambil dari Midtrans — angka yang dihitung ulang sendiri akan
menyesatkan.

### ✅ Logo & branding

Logo resmi **Zavi Assistant**: kotak putih bercincin hijau + gelembung chat +
huruf "Z". Master `public/logo.svg` (vektor tanpa teks → tajam di semua ukuran).
`npm run icons` (`scripts/generate-icons.mjs`) membuat favicon.ico, `app/icon.svg`,
apple-icon, ikon PWA 192/512, dan kit di folder induk `../brand`. Terpasang di
favicon, sidebar, dan manifest PWA (`app/manifest.ts`, warna tema hijau).

### ✅ Pembayaran Lynk.id, Midtrans dinonaktifkan (sesi 11)

Detail lengkap: [`catatan/2026-09-29-sesi-11-lynkid.md`](./catatan/2026-09-29-sesi-11-lynkid.md).

- **Sakelar `PAYMENT_PROVIDER`** (default `lynkid`). Midtrans dimatikan tanpa
  dihapus — `hasMidtrans()` false kecuali provider `midtrans`, jadi rute Midtrans
  (create / notification / reconcile) balas 503. Balik dengan `PAYMENT_PROVIDER=midtrans`.
- **Aktivasi tetap satu pintu** — `activate.ts` direfactor jadi inti
  `terapkanKeadaanPembayaran()` yang dipakai bersama Midtrans & Lynk.id. Lunas →
  `subscription active`, berlaku **30 hari dari tanggal mulai**.
- **Webhook** `/api/payment/lynkid`: verifikasi `X-Lynk-Signature`
  (`SHA256(grandTotal + refId + message_id + merchantKey)`; `LYNKID_WEBHOOK_SECRET`
  = merchant key Lynk.id), cocokkan ke tenant lewat email pembeli (+ email dari
  pertanyaan custom), tebak paket dari `totals.totalPrice` — bukan `grandTotal`
  yang sudah dipotong biaya. Idempoten.
- Terverifikasi: build TypeScript lolos + 11 unit test algoritma + smoke test
  (403/200/503).

### ⏳ Belum / langkah berikutnya
> ### ✅ Lynk.id SUDAH LIVE & terbukti (1 Okt 2026)
>
> Pembayaran sungguhan Rp 99.000 berhasil end-to-end: webhook balas 200 dan
> langganan aktif otomatis. Terverifikasi langsung di Firestore —
> `payments/ZAVILYNK-…MUPKOC0K` status `paid`, `subscriptions` jadi
> `active` paket **basic** (bukan salah tebak jadi pro), berlaku **tepat 30
> hari** dari tanggal bayar, dan kuota AI ter-reset ke 0.
>
> Jadi kelima hal yang sebelumnya belum terbukti kini terbukti sekaligus:
> merchant key cocok, verifikasi tanda tangan jalan, pencocokan tenant lewat
> email berhasil, penebakan paket benar, dan perhitungan masa aktif benar.
>
> Catatan operasional: ada beberapa dokumen `payments` berstatus `pending` —
> itu checkout yang dibuka lalu tidak diselesaikan. Normal, biarkan sebagai
> jejak audit.
>
> **Pertanyaan UI langganan sudah terjawab:** pertanyaan kustom "Email akun
> Zavi Anda" dipasang di checkout Lynk.id, dan kode memprioritaskannya di
> atas email pembeli. Itu yang menyelamatkan kasus pemilik warung yang
> membayar memakai email lain.

1. ⚠️ **Jebakan nama produk Lynk.id (BELUM diperbaiki).** `tebakPlan()`
   memeriksa `judul.includes("pro")` SEBELUM `"basic"`, tanpa batas kata.
   Jadi produk bernama `"Zavi Basic (Promo)"` akan diaktifkan sebagai **Pro**
   — pelanggan bayar Rp 99.000, dapat paket Rp 249.000. Sekarang aman karena
   nama produknya tepat `Zavi Basic` / `Zavi Pro`, tapi promo itu pasti
   terjadi. Perbaikannya: periksa `"basic"` lebih dulu + pencocokan batas kata.
2. **Beli kredit AI** masih mati — dulu lewat Midtrans, belum dipindah ke
   Lynk.id.
3. **Beli kredit AI lewat Lynk.id** — sementara dimatikan (dulu via Midtrans).
4. **Hubungkan WhatsApp asli** — UI sambungan sudah ada di /settings/whatsapp;
   tinggal isi App Secret + nomor tes dari Meta.
5. **Buat proyek Flutter** (`../flutter/`) — panduan di [`FLUTTER_MIRROR.md`](./FLUTTER_MIRROR.md).
6. (Nanti) Setup GitHub + push repo.

## 5. Cara menjalankan web

```bash
cd "D:/Zavi Wa Assistant/Zavi_Web"
npm install     # pertama kali saja
npm run dev     # buka http://localhost:3000
```

Sekarang aplikasi langsung tersambung ke Firestore. Kalau kredensial Firebase
dikosongkan, aplikasi tetap jalan penuh untuk demo memakai penyimpanan in-memory
(data contoh "Sambal Nyonya" + simulator). Detail lengkap: [`README.md`](./README.md).

## 6. Dokumen penting

- [`README.md`](./README.md) — cara pakai, arsitektur, deploy, checklist testing
- [`FLUTTER_MIRROR.md`](./FLUTTER_MIRROR.md) — rencana cermin ke Flutter
- [`.env.example`](./.env.example) — daftar semua env var
- [`lib/types.ts`](./lib/types.ts) — model data (acuan untuk web & Flutter)

## 7. Catatan penyimpanan & rahasia

- Repo belum di GitHub → **rutin backup** seluruh folder `D:\Zavi Wa Assistant\`.
- Folder `node_modules\` boleh **tidak** dibackup (bisa dibuat ulang dengan
  `npm install`); yang wajib: `app\`, `lib\`, `components\`, `catatan\`,
  file config, `.env.local`, dan file service account JSON di folder induk.
- **File rahasia** (jangan pernah disebar / di-commit):
  - `Zavi_Web.env.local` — sudah masuk `.gitignore`
  - `zavi-assistant-firebase-adminsdk-*.json` — sekarang disimpan di folder
    induk, **di luar repo**, jadi mustahil ikut ter-commit. App tidak
    memerlukannya saat berjalan (kredensial dibaca dari `.env.local`);
    file itu hanya dipakai skrip administratif.
- Git baru berisi 1 commit scaffold — **seluruh kerja Zavi masih belum di-commit**.
  Ini titik paling rawan saat ini.

## 8. Risiko yang harus dibereskan sebelum dipakai klien

Belum rusak, tapi akan menggigit begitu nomor WhatsApp asli tersambung:

1. **Pesanan gampang dobel** — order dibuat tiap kali kata "pesan"/"order"/"beli"
   muncul, jadi satu percakapan tawar-menawar bisa melahirkan beberapa order.
5. **`ALLOW_DEMO_TENANT` wajib `false`** begitu menerima pelanggan asli.

### ✅ Sudah diperbaiki (sesi 4)
- ~~Keyword matching pakai substring~~ → kata tunggal kini dicocokkan sebagai
  kata utuh (`\bkata\b`). *"info harga dong"* sudah membalas daftar harga, dan
  *"ada baju hitam?"* tidak lagi dibalas sapaan.
- ~~Firestore Security Rules belum ada~~ → `firestore.rules` tolak-semua sudah
  live; 12 serangan dengan SDK klien semuanya ditolak.
- ~~Webhook tanpa verifikasi tanda tangan~~ → HMAC-SHA256 atas body mentah
  terhadap `META_APP_SECRET`; di produksi menolak 503 bila secret kosong.
- ~~Balasan dobel dari retry Meta~~ → penolak pesan ganda atomik lewat
  `processedMessages/{messageId}`.
- ~~Riwayat AI tanpa batas~~ → dibatasi `AIConfig.historyLimit` (bawaan 20 pesan
  terakhir), bisa diatur tiap tenant di Pengaturan AI.

## 9. Jebakan teknis yang sudah ketahuan

- **Database Firestore project ini bernama `default`, BUKAN `(default)`.** Keduanya
  beda. SDK `firebase-admin` secara bawaan mencari `(default)` → error `5 NOT_FOUND`.
  Solusi: env `FIREBASE_DATABASE_ID=default` (dipakai [`lib/db/firestore.ts`](./lib/db/firestore.ts)).
- **Pola bahaya: mengecek "env terisi" dan menganggapnya "berfungsi".** Sudah
  menggigit dua kali — `hasFirestore()` (sesi 2, fatal) dan `hasAI()` (sesi 6,
  indikator palsu). Status AI kini diturunkan dari hasil panggilan/uji koneksi
  sungguhan lewat `lib/bot/ai-health.ts`. Terapkan pola yang sama kalau nanti
  menambah integrasi baru.
- **`hasFirestore()` hanya mengecek env terisi, bukan valid.** Kalau diisi nilai
  keliru, app memilih Firestore lalu gagal total — fallback in-memory tidak menolong.
  Kalau semua endpoint tiba-tiba 500, curigai kredensial Firebase dulu.
- Menjalankan `npm run build` saat `npm run dev` masih hidup → gagal type-check
  karena `.next/dev/types` sedang ditulis. Hentikan dev dulu sebelum build.
- **`npm run dev` kadang segfault (exit 139)** di mesin ini saat request pertama
  memicu kompilasi rute on-demand — masalah stabilitas Turbopack/Node, bukan dari
  kode. Kalau perlu verifikasi andal, pakai `npm run build` + unit test, atau
  jalankan `npm run build && npm start`. Ulangi `npm run dev` kalau crash.
- **Key sandbox Midtrans TIDAK lagi berawalan `SB-`.** Key sandbox dan produksi
  kini sama bentuknya (`Mid-server-…`) dan tidak bisa dibedakan dari teksnya.
  Karena itu `MIDTRANS_IS_PRODUCTION` wajib diisi eksplisit — jangan pernah
  menebak dari bentuk key. Default: sandbox (kegagalan yang aman).
- Folder route berawalan `_` (mis. `app/api/_dev/`) adalah private folder di App
  Router — tidak pernah jadi route, selalu 404.
- Model AI default `claude-sonnet-5` (roadmap menulis `claude-sonnet-4-6` yang sudah lama).
