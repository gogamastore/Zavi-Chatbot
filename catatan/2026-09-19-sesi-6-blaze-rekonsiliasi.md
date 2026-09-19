# Sesi 6 — Blaze aktif: meninjau ulang Firebase Functions + jaring pengaman pembayaran

**Tanggal:** 19 September 2026
**Fokus:** User mengaktifkan paket Blaze dan Firebase Functions. Meninjau ulang
rekomendasi arsitektur secara jujur, lalu membangun yang benar-benar bernilai.

---

## Argumen lama yang sekarang batal

Di sesi 5 saya menolak Firebase Functions dengan tiga alasan. Setelah Blaze
diaktifkan, pemeriksaan ulang:

```
cloudfunctions.googleapis.com   ENABLED   ← butuh Blaze, jadi Blaze memang aktif
cloudscheduler.googleapis.com   ENABLED
run.googleapis.com              DISABLED  ┐
cloudbuild.googleapis.com       DISABLED  ├ dibutuhkan saat deploy;
artifactregistry.googleapis.com DISABLED  ┘ Firebase CLI menyalakan otomatis
```

**Alasan #1 (butuh Blaze) batal.** User benar — itu bukan lagi penghalang.

Alasan #2 (**dua sumber kebenaran**) dan #3 (dua deployment) masih berlaku, dan
#2 memang selalu yang terkuat.

## Keputusan: bukan "pindah atau tidak", tapi pembagian tugas

Yang paling berharga dari Blaze di sini bukan memindahkan webhook, melainkan
**Cloud Scheduler** — pekerjaan terjadwal yang Next.js tidak bisa lakukan
sendiri. Dan pekerjaan terjadwal paling bernilai persis menjawab kekhawatiran
awal user: **menjaring pembayaran yang notifikasinya tidak pernah sampai.**

| Jalur | Tempat | Alasan |
|---|---|---|
| Webhook notifikasi (jalur cepat) | Next.js `/api/payment/notification` | Satu sumber kebenaran; logika langganan tidak diduplikasi |
| Rekonsiliasi (jaring pengaman) | Next.js `/api/payment/reconcile`, dipicu penjadwal | Menangkap notifikasi yang hilang |

Pemicunya bisa Cloud Scheduler langsung ke URL Next.js, atau Cloud Function
tipis yang memanggilnya — **keduanya tidak menduplikasi logika apa pun**.

## Menghapus duplikasi lebih dulu

Sebelum menambah jalur kedua, logika aktivasi diekstrak ke satu tempat:

`lib/billing/activate.ts` → `terapkanStatusPembayaran(platform, payment, notif)`

Webhook dan rekonsiliasi kini memanggil fungsi yang **sama persis**. Tidak ada
perhitungan masa aktif yang tertulis dua kali. Ini menutup risiko yang saya
sebut sebagai alasan utama menolak Functions — dan sekaligus membuat pemindahan
ke Functions nanti jadi murah kalau memang diinginkan.

## Yang dibangun

| File | Isi |
|---|---|
| `lib/billing/activate.ts` | Aktivasi langganan — satu-satunya tempat status jadi `active` |
| `lib/billing/midtrans.ts` | + `getTransactionStatus()` (Midtrans Status API) |
| `lib/db/store.ts` | + `listPendingPayments(maxUmurJam)` di dua implementasi |
| `app/api/payment/reconcile/route.ts` | Pekerjaan rekonsiliasi terjadwal |
| `app/api/payment/notification/route.ts` | Disederhanakan — hanya verifikasi + delegasi |

Rekonsiliasi dilindungi `CRON_SECRET` (header `Authorization: Bearer` atau
`X-Cron-Secret`). Tanpa rahasia itu, endpoint hanya jalan di luar produksi.
Hanya memeriksa pembayaran pending berumur < 48 jam agar query tetap kecil.

## Verifikasi

### Rekonsiliasi (transaksi sandbox sungguhan)

| # | Langkah | Hasil |
|---|---|---|
| 1 | Buat transaksi, pelanggan bayar VA (belum settle) | order tercatat |
| 2 | Notifikasi sengaja TIDAK dikirim | akun tetap `trial_ended`, terkunci ✅ |
| 3 | Rekonsiliasi berjalan | menanyakan Midtrans, dapat `pending` |
| 4 | Aktivasi? | **tidak** — benar, tidak ada positif palsu ✅ |
| 5 | Rekonsiliasi ulang | masa aktif tidak berubah — idempoten ✅ |
| 6 | Tanpa `CRON_SECRET` | **HTTP 401 ditolak** ✅ |

> Batas pengujian yang jujur: saya **tidak** berhasil memaksa transfer bank
> sandbox menjadi `settlement` lewat API (`/approve` hanya untuk kartu dalam
> status challenge). Jadi jalur "rekonsiliasi menemukan transaksi lunas lalu
> mengaktifkan" belum diuji langsung ujung-ke-ujung. Yang sudah dibuktikan:
> rekonsiliasi benar-benar memanggil Midtrans, menafsirkan jawabannya, dan
> memakai fungsi aktivasi yang sama dengan webhook — dan fungsi itu terbukti
> bekerja (di bawah). Untuk menutup sisa celah ini, pakai Sandbox Payment
> Simulator di dashboard Midtrans lalu jalankan rekonsiliasi.

### Aktivasi setelah refactor

| # | Langkah | Hasil |
|---|---|---|
| 1 | Trial habis | `trial_ended`, terkunci |
| 2 | Webhook lewat `activate.ts` bersama | HTTP 200 |
| 3 | Sesudah | `active`, paket Pro, kuota 0/3000, s/d 19 Okt, simulator **200** ✅ |
| 4 | Bayar lagi saat masih aktif | **+30 hari menumpuk** — hari yang sudah dibayar tidak hangus ✅ |

Langkah 4 penting untuk kepercayaan pelanggan: memperpanjang lebih awal tidak
menghanguskan sisa masa aktif.

Pembersihan: seluruh akun uji, tenant, payment, dan pemetaan dihapus. Data demo
utuh. `npm run build` bersih.

## Cara memicu rekonsiliasi (pilih salah satu)

**A. Cloud Scheduler → langsung ke Next.js** (paling sedikit bagian bergerak):

```bash
gcloud scheduler jobs create http zavi-reconcile \
  --schedule "*/30 * * * *" \
  --uri "https://<domain>/api/payment/reconcile" \
  --http-method POST \
  --headers "X-Cron-Secret=<CRON_SECRET>" \
  --location asia-southeast2
```

**B. Cloud Function terjadwal** yang memanggil URL yang sama — berguna kalau
nanti ingin menambah pekerjaan lain (pengingat trial berakhir, laporan bulanan)
di satu tempat.

Keduanya memakai logika yang sama; tidak ada yang perlu ditulis ulang.

## Cloud Functions dipasang (`firebase init functions`)

Bahasa: **TypeScript** — supaya tipe di `lib/types.ts` bisa dipakai ulang.
JavaScript atau Python berarti menulis ulang bentuk dokumen Firestore dengan
tangan, tepat di tempat yang paling mahal kalau salah.

Struktur yang terbentuk:

```
firebase.json          # predeploy: lint + build
.firebaserc            # project default: zavi-assistant
functions/
├── src/index.ts       # rekonsiliasiPembayaran (terjadwal, tipis)
├── eslint.config.mjs  # ditambahkan manual — lihat di bawah
├── package.json       # firebase-functions 7.4.0, Node 24
└── tsconfig.json
.agents/skills/        # 87 berkas dokumentasi Firebase (590 KB)
skills-lock.json
```

### Masalah yang ditemukan & diperbaiki: `firebase deploy` akan gagal

Skrip lint bawaan Firebase adalah `eslint --ext .js,.ts .` (format ESLint
lama). Tapi ESLint menelusuri folder induk mencari konfigurasi, menemukan
`eslint.config.mjs` milik proyek Next.js, lalu beralih ke **mode flat config**
— di mana flag `--ext` sudah tidak berlaku:

```
Invalid option '--ext' - perhaps you meant '-c'?
You're using eslint.config.js, some command line flags are no longer available.
```

Ini bukan gangguan kecil: `firebase.json` menjalankan lint sebagai **predeploy**,
jadi `firebase deploy` akan berhenti sebelum sempat mengunggah apa pun.

Perbaikan: `functions/eslint.config.mjs` sendiri (menghentikan penelusuran ke
induk), skrip diubah jadi `eslint .`, dan `.eslintrc.js` lama dihapus agar
tidak ada dua konfigurasi yang membingungkan.

Rantai predeploy diverifikasi lolos: `lint` ✅ `build` ✅

### Isi function: sengaja tipis

`rekonsiliasiPembayaran` — terjadwal tiap 30 menit (Asia/Jakarta), memanggil
`POST /api/payment/reconcile` dengan header `X-Cron-Secret` berisi rahasia
bersama. **Tidak ada logika langganan di dalamnya.** Satu sumber kebenaran
tetap di `lib/billing/activate.ts`.

Dua parameter yang harus diisi sebelum deploy:

```bash
# Rahasia (sama dengan CRON_SECRET di .env.local aplikasi)
firebase functions:secrets:set ZAVI_CRON_SECRET

# URL aplikasi Next.js yang sudah live, mis. https://zavi.app
# Ditanyakan saat deploy, atau set lewat .env di folder functions/
```

Catatan: function ini memanggil aplikasi lewat HTTP, jadi **baru berguna
setelah Next.js di-deploy ke domain publik**. Selama masih lokal, jalankan
rekonsiliasi manual dengan curl + `CRON_SECRET`.

### Kebersihan repo

- `functions/node_modules` dan `functions/lib/**/*.js` sudah diabaikan oleh
  `functions/.gitignore` bawaan — tidak perlu diubah.
- `AGENTS.md` tidak tersentuh oleh Firebase, jadi tidak bentrok dengan blok
  yang ditulis ulang `next dev`.
- `.agents/` (87 berkas, 590 KB) layak di-commit: dokumentasi Firebase terbaru,
  termasuk `firestore-rules-creation` dan `firebase-security-rules-auditor`
  yang langsung berguna untuk item Security Rules yang masih terbuka.

## Masih terbuka

1. Daftarkan Payment Notification URL di Midtrans Dashboard.
2. Pasang penjadwal rekonsiliasi (opsi A atau B di atas).
3. Firestore Security Rules belum ditulis.
4. Rotasi Server Key produksi (sempat tertulis di chat).
5. Onboarding nomor WhatsApp per tenant belum ada UI-nya.
6. Saldo AI masih kosong.
7. `ALLOW_DEMO_TENANT` masih `true` — wajib `false` sebelum menerima pelanggan.
8. Seluruh kerja masih belum di-commit.

---

## Tambahan: indikator AI yang jujur

**Pertanyaan user:** "apakah saat ini AI sudah aktif di demo?"

Jawabannya **belum** — tapi memeriksanya justru membongkar cacat: dashboard
melaporkan `ai aktif: true`.

Penyebabnya kelas yang sama dengan bug `hasFirestore()` di sesi 2:
`hasAI()` hanya mengecek **API key terisi**, bukan key **bisa dipakai**.
Kenyataannya setiap panggilan gagal:

```
HTTP 402 → RESOURCE_EXHAUSTED: Your prepayment credits are depleted.
```

Bedanya dengan sesi 2, ini tidak fatal — hanya menyesatkan. Tapi indikator yang
berbohong membuat orang mencari masalah di tempat yang salah.

### Perbaikan

`lib/bot/ai-health.ts` — status AI kini punya empat keadaan nyata:

| Status | Arti |
|---|---|
| `belum-dikonfigurasi` | Tidak ada API key sama sekali |
| `belum-diperiksa` | Key ada, belum pernah dipakai/diuji sejak server hidup |
| `berfungsi` | Panggilan terakhir berhasil |
| `gagal` | Key ada tapi panggilan gagal — **alasan aslinya disimpan** |

Dua sumber kebenaran digabung:

1. **Pasif** — `askAI()` mencatat hasil setiap panggilan pelanggan sungguhan
   (`catatBerhasil()` / `catatGagal()`). Ini bukti terkuat.
2. **Aktif** — uji koneksi 1 token saat status belum diketahui atau sudah basi.

Pesan teknis penyedia diterjemahkan jadi saran yang bisa ditindaklanjuti
(`saranPerbaikan()`), mis. `RESOURCE_EXHAUSTED` → *"Saldo penyedia AI habis.
Isi ulang untuk mengaktifkan kembali."* Pesan aslinya tetap ditampilkan di
bawahnya untuk penelusuran.

### Yang berubah

| File | Perubahan |
|---|---|
| `lib/bot/ai-health.ts` | Baru — pelacak kesehatan + uji koneksi + saran |
| `lib/bot/ai.ts` | Mencatat berhasil/gagal tiap panggilan |
| `app/api/stats/route.ts` | `system.ai` kini objek status, bukan boolean |
| `app/api/ai-config/route.ts` | `server` kini berisi kesehatan sebenarnya |
| `app/api/ai-config/test/route.ts` | Baru — endpoint tombol "Uji koneksi" |
| `app/page.tsx` | Baris AI menampilkan alasan gagal + tautan perbaikan |
| `app/settings/ai/page.tsx` | Kartu status + tombol "Uji koneksi" |

### Verifikasi

| Uji | Hasil |
|---|---|
| `/api/stats` | `status: gagal`, saran + pesan asli Gemini ✅ |
| `POST /api/ai-config/test` | `gagal` + saran yang sama ✅ |
| `GET /api/ai-config` | `server.status: gagal` ✅ |
| 5× `/api/stats` beruntun | `checkedAt` **identik** → cache 5 menit bekerja, penyedia tidak dipanggil berulang ✅ |
| `npm run build` | bersih ✅ |

> Batas jujur: keadaan `berfungsi` **belum bisa diuji** karena tidak ada
> penyedia AI yang bersaldo. Yang terbukti adalah jalur gagal, cache, dan
> penerjemahan pesan. Begitu saldo diisi, jalur sukses akan tercatat sendiri
> dari panggilan pelanggan pertama.

### Catatan desain

Cache 5 menit penting: dashboard memanggil `/api/stats` tiap 8 detik. Tanpa
cache, setiap pemuatan dashboard akan memanggil penyedia AI — boros, dan mulai
berbiaya begitu saldo terisi.

---

## AI akhirnya AKTIF (Anthropic)

User memberikan `ANTHROPIC_API_KEY` yang bersaldo. Ini pertama kalinya AI
benar-benar berjalan di proyek ini.

### Parameter API diverifikasi terhadap dokumentasi resmi

Sebelum memasang, referensi API Claude dimuat untuk memeriksa parameter di
`lib/bot/ai.ts` yang sebelumnya ditulis dari ingatan. Hasilnya **sudah benar**
untuk Sonnet 5:

| Parameter | Status |
|---|---|
| `model: "claude-sonnet-5"` | ✅ ID valid, generasi sekarang |
| `thinking: { type: "disabled" }` | ✅ diterima Sonnet 5 |
| `output_config: { effort: "low" }` | ✅ `effort` memang di dalam `output_config` |
| Tanpa `budget_tokens` | ✅ benar — sudah dihapus di Sonnet 5 (400 kalau dikirim) |
| Tanpa prefill assistant | ✅ benar — prefill ditolak 400 di model 4.6+ |

Catatan harga (per 1M token): Sonnet 5 $2/$10, Opus 5 $5/$25,
Haiku 4.5 $1/$5. Pilihan `claude-sonnet-5` untuk CS volume tinggi tetap masuk
akal; **Haiku 4.5 layak dipertimbangkan** kalau nanti volume pelanggan besar
dan jawaban template sudah menangani sebagian besar pertanyaan.

### Uji langsung

Skenario: *"kak ada paket hemat buat berdua gak? budget 35rb"* — sengaja
memancing AI mengarang paket yang tidak ada.

```
BERHASIL (4.0 detik) — claude-sonnet-5, stop: end_turn, 156 in / 130 out
"Halo Kak! Untuk saat ini kami belum ada paket khusus, tapi Kakak bisa pilih
 misalnya 1 Ayam Geprek (Rp18.000) + tambah nasi/menu lain sesuai budget ya..."
```

**AI tidak mengarang paket.** Aturan anti-halusinasi harga di system prompt
bekerja seperti yang dirancang.

### Keadaan `berfungsi` akhirnya terverifikasi

Di catatan sebelumnya saya menandai keadaan `berfungsi` sebagai **belum bisa
diuji** karena tidak ada penyedia bersaldo. Celah itu kini tertutup:

| Uji | Hasil |
|---|---|
| `/api/stats` | `status: berfungsi`, provider **anthropic** (deteksi otomatis berpindah sendiri dari gemini) ✅ |
| Pertanyaan rule ("jam buka") | `source: rule` — **tidak** memanggil AI ✅ |
| Pertanyaan bebas (arisan 30 orang) | `source: ai`, `needsHuman: false` — dijawab benar ✅ |
| Kuota AI | **0 → 1** — hanya panggilan AI yang dihitung ✅ |
| Sumber status | berubah `uji-koneksi` → **`panggilan-nyata`** ✅ |

Jawaban AI untuk pertanyaan arisan mengambil fakta dari profil bisnis yang
benar: *minimal booking H-1* (dari `extraInfo`) dan *transfer/QRIS/COD area
Bandung* (dari `paymentInfo`). Grounding ke knowledge base terbukti bekerja,
bukan sekadar mengarang yang terdengar masuk akal.

### Konsekuensi konfigurasi

`ZAVI_AI_PROVIDER` kosong → deteksi otomatis, dan **Anthropic menang** atas
Gemini. Key Gemini yang saldonya habis kini menganggur; tidak perlu dihapus.
Untuk memaksa Gemini nanti, isi `ZAVI_AI_PROVIDER=gemini`.

Penghitung kuota tenant demo dikembalikan ke 0 setelah pengujian.
