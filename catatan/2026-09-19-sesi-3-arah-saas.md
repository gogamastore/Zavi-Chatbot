# Sesi 3 — Belok ke model SaaS multi-tenant

**Tanggal:** 19 September 2026
**Fokus:** Menetapkan arah Zavi sebagai produk SaaS (bukan proyek per-klien),
memutuskan pembayaran & login, dan membangun fondasi datanya (Tahap A).

---

## Keputusan arah

Zavi dijual ke banyak UMKM. Alurnya: klien **mendaftar sendiri** lewat web
(nanti juga Flutter) → dapat **percobaan gratis 3 hari** → setelah itu fitur
**terkunci** → diarahkan bayar **langganan bulanan** → begitu lunas, fitur
terbuka otomatis.

| Topik | Keputusan |
|---|---|
| Pembayaran | Midtrans Snap, mulai dari environment **Sandbox** |
| Login | Firebase Auth — email/password + Google |
| Penyedia AI | **Ditunda**, lapis AI dibuat provider-agnostic |

## Temuan: pindah ke Gemini tidak menghindarkan dari pembayaran

User mengusulkan ganti dari Claude ke Gemini karena billing Anthropic belum
aktif, dan memberikan API key project **Zavi AI** (`218181720280`).

Hasil pengujian key tersebut:

- `GET /v1beta/models` → **HTTP 200**, 35 model terdaftar. Key valid.
- **Semua** percobaan `generateContent` → `RESOURCE_EXHAUSTED: Your prepayment
  credits are depleted.`
- `gemini-2.5-flash` dan `gemini-2.5-flash-lite` → `NOT_FOUND`, sudah ditutup
  untuk pengguna baru (disarankan pindah ke `gemini-3.6`).

**Kesimpulan:** project Gemini-nya prabayar dan saldonya habis. Sama seperti
Anthropic — key hidup, tapi tidak bisa generate sampai diisi saldo. Jadi
mengganti penyedia **tidak** menyelesaikan masalah biaya.

**Jalan keluar yang diambil:** keluarkan keputusan AI dari jalur kritis.
Seluruh pekerjaan SaaS (auth, multi-tenant, trial, penguncian, Midtrans,
pemisahan halaman pengaturan) tidak butuh AI berfungsi — app sudah punya
fallback "AI belum aktif". Lapis AI dibuat provider-agnostic (`askAI()` di
`lib/bot/ai.ts` sudah jadi satu-satunya celah yang tahu soal penyedia), jadi
mana pun yang duluan diisi saldo tinggal ganti env.

> Catatan keamanan: API key ditempelkan langsung di chat. Sudah dipindahkan ke
> `.env.local`. Kalau key itu pernah menyentuh tempat lain, rotasi di AI Studio.

## Kenyataan arsitektur yang harus dihadapi

Kode saat ini **single-tenant**: satu `config/business` global, collection
`chats`/`orders`/`knowledge` tanpa penanda pemilik, tanpa auth, satu
`PHONE_NUMBER_ID` dan satu `ANTHROPIC_API_KEY` di env.

Artinya hook pembayaran **saja tidak mengunci apa pun** — belum ada konsep
"siapa". Urutan yang tidak bisa dilompati:

| Tahap | Isi | Status |
|---|---|---|
| **A** | Model data: tenant, plan, langganan, entitlement, bot template | ✅ selesai |
| **B** | Firebase Auth + registrasi + resolusi tenant | berikutnya |
| **C** | Trial 3 hari + hook penguncian fitur di UI & API | butuh B |
| **D** | Midtrans Snap + webhook pembayaran → buka fitur otomatis | butuh C |
| **E** | Pisah halaman: Profil Bisnis / Pengaturan AI / Bot Template | butuh B |

Ranjau yang sudah teridentifikasi untuk tahap berikutnya:
**webhook WhatsApp harus membaca `metadata.phone_number_id`** dari payload Meta
untuk tahu pesan masuk milik tenant mana — sekarang masih satu nomor dari env.

## Yang dikerjakan (Tahap A)

- `lib/types.ts` — tipe baru: `Tenant`, `Plan`, `PlanId`, `FeatureKey`,
  `Subscription`, `SubscriptionStatus`, `Entitlement`, `Payment`,
  `PaymentStatus`, `BotTemplate`, `BotRule`, `BotConfig`, `AIConfig`,
  `AIProvider`. Semua ikut jadi acuan model Dart untuk Flutter.
- `lib/billing/plans.ts` — katalog paket + matriks fitur:
  - Trial: 3 hari, semua fitur, 100 balasan AI
  - Basic: Rp 99.000/bln, 500 balasan AI, 1 nomor WA
  - Pro: Rp 249.000/bln, 3.000 balasan AI, 3 nomor WA, ekspor
  - Kuota AI ada **karena biaya AI ditanggung platform** — ini yang menjaga margin.
- `lib/billing/entitlement.ts` — fungsi murni `computeEntitlement(sub, now)`.

Dua keputusan desain yang disengaja:

1. **Entitlement tidak pernah disimpan ke database**, selalu dihitung ulang dari
   `Subscription`. Kalau disimpan, status bisa basi — akun tetap terbuka padahal
   trial sudah lewat.
2. **`chats` dan `orders` tetap terbuka walau belum bayar.** Yang dijual adalah
   botnya yang bekerja, bukan menyandera data pelanggan. Menghindari sengketa.

## Verifikasi (7 skenario, semua lolos)

Diuji lewat route sementara `/api/devcheck`, lalu route-nya dihapus.

| Skenario | status | terkunci | bot AI | simulator | lihat chat/pesanan |
|---|---|---|---|---|---|
| Baru daftar | `trial` | tidak | ya | ya | ya |
| Trial sisa 1 hari | `trial` | tidak | ya | ya | ya |
| Trial habis | `trial_ended` | **ya** | tidak | tidak | **ya** |
| Sudah bayar Basic | `active` | tidak | ya | ya | ya |
| Jatuh tempo (tenggang 3 hari) | `past_due` | tidak | ya | ya | ya |
| Lewat tenggang | `expired` | **ya** | tidak | tidak | **ya** |
| Aktif, kuota AI habis | `active` | tidak | **tidak** | ya | ya |

Baris terakhir penting: kuota AI habis hanya mematikan AI, bukan seluruh
layanan — bot tetap membalas lewat rule template.

- ✅ `npx tsc --noEmit` lolos tanpa error
- ✅ App tetap sehat setelah perubahan (`/api/stats` HTTP 200)

## Catatan kecil

Folder route berawalan `_` (mis. `app/api/_dev/`) adalah **private folder** di
App Router — tidak pernah jadi route, selalu 404. Route uji harus pakai nama
tanpa underscore.

## Masih terbuka

- Saldo AI (Anthropic atau Gemini) — belum ada yang terisi.
- Akun Midtrans belum dibuat; butuh Server Key + Client Key **Sandbox**.
- Provider Email/Google di Firebase Auth belum diaktifkan di console.
- Seluruh kerja masih belum di-commit.
