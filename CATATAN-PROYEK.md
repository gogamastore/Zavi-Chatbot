# Catatan Proyek — Zavi (WA Assistant)

> Catatan utama proyek (living document). Diperbarui tiap ada perkembangan.
> Log rinci per sesi ada di folder [`catatan/`](./catatan/).
> Belum pakai GitHub — penyimpanan di hard disk eksternal. **Backup folder ini secara berkala.**

Terakhir diperbarui: **19 September 2026**

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
| Pembayaran | **Midtrans Snap** (mulai dari Sandbox) | Sandbox jalan tanpa dokumen badan usaha; produksi tinggal ganti key |
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
│   │   └── 2026-09-19-sesi-7-pengamanan-webhook.md
│   ├── app\  lib\  components\                      # kode
│   └── zavi-assistant-firebase-adminsdk-*.json      # service account (RAHASIA, gitignored)
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

### 🔜 Diputuskan, dikerjakan nanti

**Peran owner + menu khusus owner.** Saat ini Zavi sama sekali tidak punya
konsep admin platform: tiap akun otomatis jadi pemilik tenant-nya sendiri,
tidak lebih. Pemilik Zavi belum punya pintu masuk untuk melihat semua klien,
memantau siapa yang akan habis masa langganannya, atau memperpanjang manual
saat pembayaran bermasalah — semuanya masih lewat Firestore Console.

Rencana saat dikerjakan:
- Penanda admin lewat **custom claim Firebase Auth** (`admin: true`), bukan
  field `role` di dokumen. Claim hanya bisa diberikan lewat Admin SDK,
  sehingga pengguna tidak mungkin memberikannya ke dirinya sendiri.
- Halaman `/admin` yang hanya terbuka untuk pemegang claim itu: daftar tenant,
  status langganan, pemakaian AI lintas klien (ini biaya platform), dan
  tombol perpanjang manual.

### ⏳ Belum / langkah berikutnya
1. **Daftarkan Payment Notification URL** di Midtrans Dashboard →
   `https://<domain>/api/payment/notification`. **Penghalang nomor satu.**
   Lalu pasang penjadwal untuk `/api/payment/reconcile` (lihat catatan sesi 6).
4. **Hubungkan WhatsApp asli** — UI sambungan sudah ada di /settings/whatsapp;
   tinggal isi App Secret + nomor tes dari Meta.
5. **Amankan webhook sebelum dipakai klien** — lihat bagian 8.
6. **Buat proyek Flutter** (`../flutter/`) — panduan di [`FLUTTER_MIRROR.md`](./FLUTTER_MIRROR.md).
7. (Nanti) Setup GitHub + push repo.

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
- **Key sandbox Midtrans TIDAK lagi berawalan `SB-`.** Key sandbox dan produksi
  kini sama bentuknya (`Mid-server-…`) dan tidak bisa dibedakan dari teksnya.
  Karena itu `MIDTRANS_IS_PRODUCTION` wajib diisi eksplisit — jangan pernah
  menebak dari bentuk key. Default: sandbox (kegagalan yang aman).
- Folder route berawalan `_` (mis. `app/api/_dev/`) adalah private folder di App
  Router — tidak pernah jadi route, selalu 404.
- Model AI default `claude-sonnet-5` (roadmap menulis `claude-sonnet-4-6` yang sudah lama).
