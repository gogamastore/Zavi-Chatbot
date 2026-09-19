# Sesi 5 — Tahap D: pembayaran Midtrans Snap

**Tanggal:** 19 September 2026
**Fokus:** Menyambungkan pembayaran langganan, dan menjawab pertanyaan apakah
sebaiknya memakai Firebase Functions.

---

## Pertanyaan user: kenapa tidak pakai Firebase Functions?

Jawaban: untuk kasus ini Functions **lebih sulit**, bukan lebih mudah.

Pemeriksaan project `zavi-assistant`:

```
Billing : 403 — "Cloud Billing API has not been used in project 218181720280
                 before or it is disabled"
cloudfunctions.googleapis.com : tidak terbaca (403)
```

Tiga alasan menolak Functions untuk endpoint pembayaran:

1. **Cloud Functions mewajibkan paket Blaze** — harus memasang billing ke GCP
   dulu. Cloud Billing API di project ini bahkan belum pernah diaktifkan.
   Saldo Anthropic/Gemini saja belum diisi; menambah syarat billing baru untuk
   memindahkan satu endpoint adalah langkah mundur.
2. **Risiko dua sumber kebenaran.** Logika "siapa sudah bayar" hidup di
   `lib/billing/entitlement.ts` + `plans.ts`, dipakai web dan nanti Flutter.
   Kalau Functions memutuskan status langganan secara terpisah, dua tempat akan
   menyimpang — bug yang baru ketahuan saat klien komplain sudah bayar tapi
   fiturnya terkunci.
3. **Dua deployment, dua tempat rahasia, dua log.** Server Key harus disalin
   ke keduanya.

Midtrans hanya butuh satu URL HTTPS publik — pola yang sama dengan webhook
WhatsApp yang sudah jalan. Kelemahannya (app mati = notifikasi terlewat)
ditutup oleh retry Midtrans + handler yang idempoten.

Catatan: kalau nanti butuh **reset kuota AI bulanan**, Cloud Scheduler +
Functions memang pas. Itu keputusan terpisah, diambil saat Blaze memang dipakai.

## ⚠️ Temuan penting: key sandbox Midtrans tidak lagi berawalan `SB-`

Set key pertama yang diberikan user adalah key **produksi**
(`Mid-server-Q5Fo…`). Saya menolak memakainya untuk pengujian dan meminta
sandbox. Set kedua datang — **juga tanpa awalan `SB-`**.

Diuji langsung ke endpoint sandbox:

```
POST https://app.sandbox.midtrans.com/snap/v1/transactions
  → HTTP 201, token terbit
```

Jadi key sandbox itu sah. **Midtrans sudah tidak memakai awalan `SB-`** —
key sandbox dan produksi kini sama bentuknya dan tidak bisa dibedakan.

**Akibatnya:** deteksi otomatis yang saya tulis pertama
(`isProduction() = !serverKey.startsWith("SB-")`) **salah dan berbahaya** —
dengan key sandbox ia menyimpulkan "produksi", lalu menembak endpoint produksi.
Dalam kondisi tertentu itu berarti memproses uang sungguhan saat dikira menguji.

**Perbaikan:** lingkungan wajib dinyatakan eksplisit lewat
`MIDTRANS_IS_PRODUCTION`, **default sandbox**. Sandbox adalah kegagalan yang
aman; menebak tidak pernah aman untuk uang.

## Yang dibangun

| File | Isi |
|---|---|
| `lib/billing/midtrans.ts` | Klien Snap, verifikasi tanda tangan, tafsir status |
| `app/api/payment/create/route.ts` | Buat transaksi → kembalikan snapToken |
| `app/api/payment/notification/route.ts` | Webhook Midtrans → aktifkan langganan |
| `app/api/payment/status/route.ts` | Cek status satu pembayaran |
| `app/langganan/page.tsx` | Tombol bayar + popup Snap + polling konfirmasi |

### Keputusan desain

1. **Hanya webhook yang boleh mengaktifkan langganan.** Frontend tidak pernah
   dipercaya — pengguna bisa menutup popup lebih awal atau memanggil endpoint
   kita langsung.
2. **Verifikasi tanda tangan wajib**
   (`SHA512(order_id + status_code + gross_amount + serverKey)`). Tanpa ini,
   siapa pun yang tahu URL webhook bisa membuka semua fitur gratis.
3. **Idempoten.** Midtrans mengirim ulang notifikasi; aktivasi hanya sekali.
4. **Perpanjangan dihitung dari `max(currentPeriodEnd, now)`**, bukan dari hari
   ini — pelanggan yang membayar lebih awal tidak kehilangan hari yang sudah
   dibayar.
5. **Pembayaran gagal tidak mencabut akses.** `computeEntitlement` yang
   memutuskan dari tanggal; pelanggan mungkin masih punya sisa masa sah.
6. **Kuota AI di-reset saat periode baru dimulai.**
7. Snap gagal dimuat (pemblokir iklan) → dialihkan ke `redirect_url` Midtrans.

## Verifikasi end-to-end (sandbox, akun sungguhan)

| # | Langkah | Hasil |
|---|---|---|
| 1 | Sebelum bayar (trial habis) | `trial_ended`, terkunci, simulator **402** ✅ |
| 2 | Buat transaksi Snap | HTTP 200, token terbit dari Midtrans sandbox ✅ |
| 3 | **Notifikasi dengan tanda tangan palsu** | **HTTP 403 ditolak**, akun tetap terkunci ✅ |
| 4 | Notifikasi sah (`settlement`) | `active`, paket Basic, kuota 0/500, berlaku s/d 19 Okt ✅ |
| 5 | Simulator setelah bayar | **HTTP 200 terbuka** ✅ |
| 6 | Kirim ulang notifikasi 2× | masa aktif **tidak bertambah** — idempoten ✅ |

Langkah 3 yang paling penting: tanpa verifikasi tanda tangan, seluruh model
bisnis ini bisa dilewati siapa saja yang tahu URL webhook.

Pembersihan: akun uji, tenant, payment, dan pemetaan dihapus. Data demo utuh.

## Yang harus user lakukan

1. **Daftarkan URL notifikasi** di Midtrans Dashboard → Settings →
   Configuration → *Payment Notification URL*:
   `https://<domain>/api/payment/notification`
   (untuk uji lokal: jalankan `npx ngrok http 3000` dan pakai domain ngrok-nya)
2. **Rotasi Server Key produksi.** Key itu sempat ditempel di chat; dengannya
   orang bisa membuat dan menanyakan transaksi atas nama merchant.
3. Saat go-live: ganti tiga baris key di `.env.local` ke nilai produksi **dan**
   set kedua `MIDTRANS_IS_PRODUCTION` jadi `true`.

## Masih terbuka

1. Firestore Security Rules belum ditulis.
2. Reset kuota AI bulanan belum otomatis (butuh penjadwal).
3. Onboarding nomor WhatsApp per tenant belum ada UI-nya.
4. Saldo AI masih kosong.
5. `ALLOW_DEMO_TENANT` masih `true` — wajib `false` sebelum menerima pelanggan.
6. Seluruh kerja masih belum di-commit.
