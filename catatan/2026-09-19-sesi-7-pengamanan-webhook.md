# Sesi 7 — Pengamanan webhook WhatsApp (sebelum nomor asli tersambung)

**Tanggal:** 19 September 2026
**Konteks:** User menyatakan "tinggal nomor WhatsApp dari Meta, bisnis masih
menunggu verifikasi."

---

## Dua koreksi atas anggapan itu

### 1. Verifikasi bisnis Meta TIDAK memblokir pengembangan

WhatsApp Cloud API memberi **nomor tes gratis** begitu app dibuat — lengkap
dengan token sementara dan `Phone number ID`, tanpa menunggu verifikasi. Bisa
mendaftarkan sampai 5 nomor penerima dan menguji alur penuh hari ini juga.

Verifikasi bisnis dibutuhkan untuk **nomor produksi**, nama tampilan yang
disetujui, dan batas kirim lebih tinggi — jadi memblokir peluncuran, bukan
pengembangan.

### 2. "Tinggal nomor WhatsApp" belum tepat

Satu hal justru harus dibereskan **sebelum** nomor asli tersambung, dan sudah
tiga sesi tercatat sebagai risiko: **webhook tidak memverifikasi tanda tangan
Meta.** Selama masih simulator tidak ada risikonya. Begitu URL itu terdaftar di
Meta, ia jadi pintu terbuka — siapa pun yang tahu alamatnya bisa mengirim pesan
palsu, memicu balasan, membuat pesanan fiktif, dan menghabiskan kuota AI klien.

Karena itu dikerjakan sekarang, tepat sebelum nomor disambungkan.

## Yang dibangun

`lib/wa/verify.ts` — dua lapis pengaman:

**Lapis 1 — verifikasi tanda tangan.**
`HMAC-SHA256(raw body, META_APP_SECRET)` dibandingkan dengan header
`X-Hub-Signature-256` memakai `timingSafeEqual`.

Detail yang menentukan berhasil-tidaknya: webhook kini membaca `request.text()`
(**body mentah**), bukan `request.json()`. Mem-parse lalu men-serialisasi ulang
JSON mengubah byte-nya — urutan kunci, spasi — dan tanda tangan pasti gagal.
Ini jebakan paling umum saat memasang verifikasi webhook.

**Lapis 2 — penolak pesan ganda.**
Meta mengirim ulang notifikasi yang dianggap gagal. Tanpa penjaga, satu pesan
pelanggan dibalas dua kali dan melahirkan dua pesanan. Dipakai `create()` pada
`processedMessages/{messageId}` — operasi atomik yang gagal bila dokumen sudah
ada, jadi dua notifikasi yang tiba bersamaan tidak keduanya lolos.

Kegagalan Firestore saat menandai **tidak** menelan pesan: lebih baik berisiko
balasan ganda daripada pelanggan didiamkan.

### Sikap di produksi

Tanpa `META_APP_SECRET`, webhook **menolak semua permintaan (503) di
produksi** — bukan memproses diam-diam. Di luar produksi hanya memperingatkan,
supaya pengembangan lokal tetap lancar.

## Verifikasi

### Tanda tangan

| Uji | Hasil |
|---|---|
| Tanpa tanda tangan | **403** ✅ |
| Tanda tangan palsu | **403** ✅ |
| Tanda tangan rusak (bukan hex) | **403** ✅ |
| Tanda tangan sah | **200** ✅ |
| Isi diubah, tanda tangan lama | **403** ✅ |

Baris terakhir membuktikan verifikasi benar-benar terikat ke isi pesan, bukan
sekadar keberadaan header.

### Jalur WhatsApp lengkap dengan tenant sungguhan

Tenant dibuat, `whatsappPhoneNumberId` diisi, lalu payload Meta disimulasikan:

| # | Langkah | Chat | Hasil |
|---|---|---|---|
| 1 | Pesan masuk "jam buka berapa?" | 0 → **2** | tenant dikenali dari `phone_number_id`, dibalas rule ✅ |
| 2 | Meta retry ke-1 | **tetap 2** | pesan ganda ditolak ✅ |
| 3 | Meta retry ke-2 | **tetap 2** | ✅ |
| 4 | Pesan BARU "mau pesan ayam geprek 2 porsi" | 2 → **4** | diproses normal ✅ |
| | Pesanan tercatat | **1** | tidak dobel ✅ |

Detail yang menyenangkan: AI menjawab *"Ayam Geprek belum ada di menu"* —
karena tenant baru ini punya katalognya sendiri (preset template resto), bukan
katalog Sambal Nyonya. **Grounding per-tenant terbukti bekerja**, bukan
mengarang dari data tenant lain.

## Yang harus user lakukan

1. **Ambil App Secret** di Meta → App Settings → Basic → isi `META_APP_SECRET`.
   Tanpa ini webhook menolak semua permintaan di produksi.
2. **Ambil nomor tes** di WhatsApp → API Setup (tidak perlu menunggu
   verifikasi), isi `WHATSAPP_TOKEN` dan `PHONE_NUMBER_ID`.
3. **Ekspos lokal**: `npx ngrok http 3000`, daftarkan
   `https://<ngrok>/api/webhook` sebagai Callback URL + `VERIFY_TOKEN` yang
   sama, subscribe field `messages`.
4. **Isi `whatsappPhoneNumberId` tenant** — belum ada UI-nya, masih manual di
   Firestore. Ini item terbuka berikutnya.

## Pembersihan

Seluruh akun uji, tenant, payment, dan `processedMessages` dihapus. Tenant demo
juga dibersihkan dari sampah pengujian (42 chat, 6 pesanan, 1 dokumen
pengetahuan); `config` (business, bot, ai) dipertahankan. `npm run build` bersih.

## Masih terbuka

1. **UI onboarding nomor WhatsApp per tenant** — `whatsappPhoneNumberId` masih
   diisi manual. Ini penghalang nyata untuk klien non-teknis.
2. **Model onboarding multi-tenant belum diputuskan.** Untuk SaaS, tiap UMKM
   butuh nomornya sendiri. Jalur yang lazim adalah menjadi **Meta Tech
   Provider** + Embedded Signup — dan *itu* memang butuh verifikasi bisnis yang
   sedang ditunggu. Alternatifnya tiap klien membuat app Meta sendiri, yang
   tidak realistis untuk pemilik UMKM.
3. Firestore Security Rules belum ditulis.
4. Pesanan masih bisa dobel dalam satu percakapan (heuristik kata kunci).
5. `ALLOW_DEMO_TENANT` masih `true`.
6. Seluruh kerja masih belum di-commit.

---

## Tambahan: rute "Jadilah Mitra" (Meta Tech Provider)

User membuat aplikasi Meta `zavi-assistant` dan memilih jenis integrasi
**"Jadilah Mitra"** — pilihan yang tepat untuk model SaaS multi-tenant.

Skema aset Meta memetakan langkahnya:

| Langkah | Aset | Menunggu verifikasi? |
|---|---|---|
| **1** | Uji akun WhatsApp Business (WABA) | **Tidak** |
| **2** | Webhooks, Pengguna Sistem | **Tidak** |
| **3** | Verifikasi Bisnis | ya |
| Mitra | Embedded Signup, WABA Klien, Lini Kredit, Migrasi Klien | butuh Langkah 3 |

Jadi pengembangan dan pengujian bisa penuh sekarang; yang menunggu adalah
onboarding klien secara mandiri.

## Cacat yang ditemukan rute Mitra: balasan dikirim dari nomor yang salah

Webhook sudah benar mengenali tenant dari `metadata.phone_number_id`, tapi
`lib/wa/client.ts` mengirim balasan lewat `env.phoneNumberId` yang **global**.

Dengan satu klien ini kebetulan jalan. Dengan dua klien, balasan untuk
pelanggan klien B keluar dari nomor klien A — kegagalan yang memalukan dan
sulit dilacak, karena tidak ada error apa pun; pesannya terkirim, hanya dari
identitas yang salah.

### Perbaikan

`sendText()` dan `markAsRead()` kini menerima `WACredentials` per-tenant:

- **phone_number_id** → dari `tenant.whatsappPhoneNumberId` (per-tenant, wajib)
- **access token** → `tenant.whatsappToken` kalau ada, kalau tidak token
  Pengguna Sistem platform. Ini sesuai model Mitra: satu token Pengguna Sistem
  platform berlaku untuk semua WABA klien yang dikelola.

Tipe `Tenant` bertambah: `whatsappWabaId`, `whatsappToken` (rahasia),
`whatsappDisplayNumber`.

## UI sambungan WhatsApp (item terbuka yang ditutup)

Halaman baru `/settings/whatsapp` + `GET/PUT /api/whatsapp`. Sebelumnya
`whatsappPhoneNumberId` harus diisi manual di Firestore — penghalang nyata
untuk klien non-teknis.

Empat penjagaan yang disengaja:

1. **Token tidak pernah dikirim ke browser** — hanya penanda `punyaTokenSendiri`.
2. **Satu nomor hanya boleh satu tenant** — kalau tidak, pesan masuk bisa
   diarahkan ke bisnis yang salah. Duplikat ditolak **409**.
3. **Validasi format** — `phone_number_id` itu angka, bukan nomor telepon.
   Kesalahan paling umum saat setup, ditangkap dengan pesan yang menjelaskan.
4. **Peringatan App Secret** — halaman memberi tahu kalau `META_APP_SECRET`
   belum diatur di server.

### Verifikasi

| # | Uji | Hasil |
|---|---|---|
| 1 | Tenant A hubungkan nomor | HTTP 200, terhubung ✅ |
| 2 | Baca kembali | `punyaTokenSendiri: true`, **token tidak ada di respons** ✅ |
| 3 | Tenant B pakai nomor yang sama | **HTTP 409 ditolak** ✅ |
| 4 | Tenant B pakai nomor sendiri | HTTP 200 ✅ |
| 5 | Diisi nomor HP (`0812-3456`) | **HTTP 400** + penjelasan ✅ |
| 6 | B membaca datanya | hanya miliknya, tidak melihat data A ✅ |

## Yang perlu dipikirkan: biaya percakapan WhatsApp

Skema Mitra menyebut **Lini Kredit (pembayaran bersama)**. Artinya pada model
ini platform bisa menanggung biaya percakapan WhatsApp milik klien, lalu
menagihkannya. Itu **biaya pokok kedua** di samping AI, dan harga langganan
Rp 99.000 / Rp 249.000 harus menutup keduanya.

Kabar yang meringankan: kasus pakai Zavi sebagian besar adalah percakapan
**yang dimulai pelanggan** (pelanggan chat duluan, bisnis membalas) — kategori
yang secara historis paling murah, dan pernah digratiskan Meta. **Verifikasi
tarif Indonesia yang berlaku sekarang** sebelum mengunci harga; jangan pakai
angka dari ingatan siapa pun, termasuk saya.

---

## Tambahan: kredensial WhatsApp terpasang & Firestore Security Rules

### Nomor tes Meta sudah hidup

`WHATSAPP_TOKEN` + `PHONE_NUMBER_ID` dipasang dan diuji ke Graph API:

```
nomor    : +1 555-627-6563     ← nomor TES dari Meta
nama     : Test Number
platform : CLOUD_API
pemilik  : Manafidh Kosmetik
```

Membuktikan poin sebelumnya: Meta memberi nomor tes **tanpa menunggu
verifikasi bisnis**. Dua catatan:

- Nomor tes hanya bisa mengirim ke maksimal **5 nomor penerima** yang
  didaftarkan lebih dulu di API Setup.
- Token dari API Setup bersifat **sementara** (umumnya 24 jam). Untuk permanen,
  buat token **Pengguna Sistem** — itu Langkah 2 di skema Meta, sudah bisa
  sekarang.

`META_APP_ID=1058206833505540` disimpan. **App Secret** ada di tempat berbeda:
App Settings → Basic → "Kunci Rahasia Aplikasi" → Tampilkan (perlu kata sandi
Facebook). App ID publik; App Secret rahasia.

### Firestore Security Rules

**Temuan yang menentukan seluruh desain:** klien tidak pernah menyentuh
Firestore langsung. `lib/firebase/client.ts` hanya mengimpor `firebase/auth`,
bukan `firebase/firestore`. Semua data lewat API route dengan firebase-admin,
yang **melewati rules sepenuhnya**.

Maka aturan yang benar adalah **tolak semua akses klien**. Setiap izin yang
diberikan menambah permukaan serangan tanpa menambah satu pun fungsi.

Yang dilindungi:

| Jalur | Kalau diberi izin |
|---|---|
| `tenants/{id}` | membocorkan `whatsappToken` semua klien |
| `subscriptions/{id}` | tulis = langganan gratis selamanya |
| `payments/{orderId}` | tulis = pembayaran palsu |
| `tenants/{id}/chats` | membaca percakapan pelanggan UMKM (data pihak ketiga) |
| `users/{uid}` | tulis = mengarahkan akun sendiri ke tenant orang lain |

`firebase.json` diberi bagian `firestore` dengan **`"database": "default"`** —
wajib, karena database project ini bernama `default`, bukan `(default)`.
Tanpa itu rules akan dikirim ke database yang tidak ada. Jebakan yang sama
dengan sesi 2.

Fungsi bantu sengaja **tidak** ditinggalkan di berkas: selama semuanya ditolak,
mereka hanya kode mati yang memicu 9 peringatan kompilasi. Polanya disimpan
utuh sebagai cetak biru di bagian bawah berkas, lengkap dengan peringatan
bahwa aturan spesifik harus ditulis sebelum jaring pengaman `{document=**}`.

### Fase Devil's Advocate — 12 serangan, semua ditolak

Diuji dengan **SDK klien sungguhan** terhadap rules yang **sudah live**, sebagai
penyerang yang **login secara sah** (posisi paling realistis: dia bisa
mendaftar sendiri).

| # | Serangan | Hasil |
|---|---|---|
| 1 | Baca dokumen tenant (berisi `whatsappToken`) | ditolak |
| 2 | Daftar semua tenant | ditolak |
| 3 | Baca chat pelanggan tenant lain | ditolak |
| 4 | Baca konfigurasi tenant | ditolak |
| 5 | Baca langganan | ditolak |
| 6 | **Tulis langganan jadi aktif selamanya** | ditolak |
| 7 | **Buat pembayaran palsu berstatus lunas** | ditolak |
| 8 | **Arahkan akun sendiri ke tenant orang lain** | ditolak |
| 9 | Baca pemetaan uid orang lain | ditolak |
| 10 | Tandai pesan sudah diproses (menelan pesan asli) | ditolak |
| 11 | Tulis ke collection yang belum ada | ditolak |
| 12 | **Ubah token WhatsApp tenant** | ditolak |

Setelah deploy, aplikasi diverifikasi tetap jalan penuh — Admin SDK memang
melewati rules, jadi API route tidak terpengaruh.

Query juga diperiksa: **tidak ada composite index yang dibutuhkan**. Enam pola
query yang dipakai aplikasi (termasuk `where(status) + orderBy(createdAt)` dan
`where(status) + where(createdAt >=)`) semuanya lolos tanpa index tambahan.

### Masalah lingkungan: Google Fonts tidak bisa diakses

Dev server dua kali mati dengan HTTP 500. Bukan dari perubahan kode:

```
curl https://fonts.googleapis.com/... -> HTTP 000 (timeout 11 detik)
```

`next/font/google` (Geist) di `app/layout.tsx` gagal mengambil font, dan
Turbopack tidak bisa me-resolve modulnya. Selama cache `.next` hangat semuanya
normal; begitu cache dibersihkan tanpa akses jaringan, seluruh app 500.

**Dampak terbatas ke mesin ini.** Host produksi (Vercel/Railway) hampir pasti
bisa menjangkau fonts.googleapis.com, jadi build produksi tidak terancam.
Kalau ingin kebal sepenuhnya: ganti ke system font stack, atau self-host font
lewat `next/font/local`. Belum dilakukan karena mengubah tipografi adalah
keputusan desain, bukan perbaikan bug.
