# Sesi 4 — Tahap B: Auth + multi-tenant (+ pemisahan halaman pengaturan)

**Tanggal:** 19 September 2026
**Fokus:** Mengubah Zavi dari aplikasi satu-bisnis menjadi SaaS multi-tenant
dengan login, penyediaan akun otomatis, dan penguncian fitur per langganan.

---

## Temuan sebelum mulai

Menguji Web API key Firebase project `zavi-assistant`:

- `GET identitytoolkit/v1/projects` → **HTTP 200**. Key valid, dan project
  number-nya `218181720280` — **sama dengan project Gemini**.
- Percobaan `accounts:signUp` → `OPERATION_NOT_ALLOWED`.

> **Koreksi (akhir sesi):** user memastikan provider Email/Password dan Google
> memang sudah Enabled. Pengujian ulang berhasil — `accounts:signUp` balas
> **HTTP 200** dengan uid asli. Kemungkinan besar probe pertama kena jeda
> propagasi konfigurasi. Login end-to-end akhirnya bisa diuji penuh di sesi
> ini; hasilnya ada di bagian "Verifikasi end-to-end" di bawah.

## Yang berubah secara arsitektur

Sebelumnya semua data berada di collection datar (`chats`, `orders`, …) tanpa
penanda pemilik. Sekarang setiap tenant punya ruangnya sendiri:

```
tenants/{tid}                    → Tenant
tenants/{tid}/chats/{id}
tenants/{tid}/orders/{id}
tenants/{tid}/knowledge/{id}
tenants/{tid}/config/business | bot | ai
subscriptions/{tid}              → Subscription
payments/{orderId}               → Payment
users/{uid}                      → { tenantId }
```

**Kenapa subcollection, bukan kolom `tenantId` di collection datar:** isolasi
jadi sifat bawaan struktur, bukan sesuatu yang harus diingat di setiap query.
Lupa satu `where("tenantId", ...)` pada model datar = data satu klien bocor ke
klien lain. Dengan subcollection, kebocoran itu tidak mungkin terjadi karena
datanya memang tidak berada di jalur yang sama. Bonus: tidak perlu composite
index.

`getStore()` sekarang **wajib** menerima `tenantId`, dan `tenantId` **selalu**
diturunkan dari ID token — tidak pernah dari body atau query. Kalau diambil
dari request, siapa pun bisa membaca data tenant lain hanya dengan mengganti
satu nilai.

## File baru

| File | Isi |
|---|---|
| `lib/firebase/client.ts` | Firebase Auth sisi browser |
| `lib/auth/server.ts` | Verifikasi ID token → `AuthUser` |
| `lib/auth/context.tsx` | `AuthProvider`, `useAuth()`, pesan error Indonesia |
| `lib/api/client.ts` | `apiFetch()` — pasang token, terjemahkan HTTP 402 |
| `lib/tenant/context.ts` | `getTenantContext()`, `requireFeature()` |
| `lib/tenant/provision.ts` | Buat tenant + trial + isi awal, idempoten |
| `lib/bot/templates.ts` | 5 preset template bot per jenis usaha |
| `lib/hooks/useSubscription.ts` | Hook penguncian fitur |
| `components/Gate.tsx` | `TrialBanner`, `FeatureGate` |
| `components/AuthShell.tsx` | Kerangka halaman login/daftar |

Halaman baru: `/login`, `/daftar` (2 langkah), `/langganan`,
`/settings/bisnis`, `/settings/bot`, `/settings/ai`.

API baru: `/api/me`, `/api/register`, `/api/templates`, `/api/bot-config`,
`/api/ai-config`.

## Pemisahan halaman pengaturan (permintaan user)

`/settings` yang tadinya satu halaman gabungan kini jadi indeks berisi tiga
kartu, masing-masing punya halaman sendiri:

- **Profil Bisnis** (`/settings/bisnis`) — nama, jam, alamat, katalog, pembayaran
- **Bot Template** (`/settings/bot`) — pilih preset + edit kata kunci & balasan
- **Pengaturan AI** (`/settings/ai`) — aktif/nonaktif, penyedia, gaya bicara,
  batas riwayat, kuota, + Knowledge Base

Sidebar dikelompokkan jadi tiga bagian: menu utama, Pengaturan, Akun.

## Bot Template (Roadmap Tahap 2 yang belum pernah dikerjakan)

Roadmap baris 49 meminta: *"Buat Mode Template yang dapat dipilih Calon
Pengguna, sesuai kebutuhan bisnis Mereka."* Sekarang ada 5 preset:

| Template | Aturan | Untuk |
|---|---|---|
| Resto & Kedai Makan | 7 | Warung, kedai kopi, catering |
| Toko / Online Shop | 7 | Olshop, toko baju, reseller |
| Klinik & Praktik | 7 | Klinik, praktik dokter, bidan |
| Jasa & Layanan | 6 | Servis AC, laundry, salon |
| Kosong | 4 | Atur sendiri dari nol |

Preset **disalin** ke BotConfig tenant saat mendaftar, tidak dirujuk. Mengubah
preset di kode tidak akan mengubah bot klien yang sudah jalan.

Balasan mendukung placeholder `{nama} {jam} {alamat} {telepon} {katalog}
{cara_order} {pembayaran}` yang diisi dari profil bisnis.

## Bug lama yang akhirnya diperbaiki

Pencocokan kata kunci dulu memakai `text.includes(keyword)`. Karena grup
`salam` diperiksa paling awal dan memuat `"hi"`, `"info"`, `"pagi"`, kalimat
biasa ikut tertelan:

- *"info harga dong"* → dibalas **sapaan**, bukan daftar harga
- *"ada baju hitam?"* → `hitam` mengandung `hi` → dibalas **sapaan**

Sekarang kata tunggal dicocokkan sebagai **kata utuh** (`\bkata\b`); frasa
(mengandung spasi) tetap substring karena sudah cukup spesifik.

Hasil uji setelah perbaikan:

| Pesan | source | intent | Benar? |
|---|---|---|---|
| `halo` | menu | salam | ✅ sapaan |
| `info harga dong` | rule | harga | ✅ **daftar harga** (dulu sapaan) |
| `ada baju hitam?` | ai | ai | ✅ **bukan sapaan** |
| `jam buka berapa?` | rule | jam buka | ✅ jam buka |
| `mau pesan ayam 2 porsi` | ai | ai+order | ✅ pesanan tercatat |

## Webhook WhatsApp jadi multi-tenant

Meta memanggil satu URL untuk semua nomor. Tenant kini ditentukan dari
`metadata.phone_number_id` di payload, bukan dari env. Kalau nomornya tidak
dikenali, pesan **diabaikan** — lebih baik diam daripada menjawab atas nama
tenant yang salah.

## Lapis AI jadi provider-agnostic

`askAI()` kini punya dua adapter (Anthropic dan Gemini) di balik satu
antarmuka. Penyedia dipilih dari `ZAVI_AI_PROVIDER`, atau otomatis dari key
mana pun yang ada. Ditambah: `askAI()` mengembalikan `consumed` — panggilan
yang **gagal tidak memotong kuota pelanggan**. Terbukti di uji:
`aiRepliesUsed: 0` setelah dua panggilan Gemini gagal.

## Keputusan desain yang perlu diketahui

1. **Entitlement tidak pernah disimpan** — selalu dihitung dari Subscription.
2. **Chat & pesanan tetap terbaca walau belum bayar** — yang dijual botnya
   yang bekerja, bukan sandera data.
3. **Hook hanya mengatur tampilan.** Penegakan sesungguhnya di server
   (`requireFeature` di API route). Pengguna bisa memanggil API langsung, jadi
   UI tidak boleh jadi satu-satunya penjaga.
4. **Kuota AI habis ≠ layanan mati.** Hanya AI yang dimatikan; bot tetap
   melayani lewat template.
5. **Mode demo dijaga dua lapis** — `NODE_ENV !== "production"` DAN
   `ALLOW_DEMO_TENANT=true`. Satu salah konfigurasi tidak boleh membuka
   dashboard tanpa login.

## Verifikasi

- ✅ `npx tsc --noEmit` lolos
- ✅ `npm run build` bersih — 27 route
- ✅ `/api/me` mode demo → tenant `demo`, paket Pro, tidak terkunci
- ✅ `/api/templates` → 5 template
- ✅ Ganti template → BotConfig tersimpan (7 aturan)
- ✅ Struktur Firestore benar: `tenants/demo/{chats:10, orders:1, config:1}`,
  `subscriptions/demo`, root `/chats` kosong
- ✅ `aiRepliesUsed: 0` — panggilan AI gagal tidak memotong kuota
- ✅ Log dev bersih kecuali `[ai:gemini] gagal` yang memang diharapkan

## Verifikasi end-to-end (dengan Auth sungguhan)

Akun uji dibuat lewat Identity Toolkit, dipakai menembak API sungguhan, lalu
dihapus bersih. Seluruh alur pelanggan baru:

| # | Langkah | Hasil |
|---|---|---|
| 1 | Buat akun | uid terbit ✅ |
| 2 | `GET /api/me` | `authenticated=true`, `needsRegistration=true` ✅ |
| 3 | Pakai fitur sebelum onboarding | **HTTP 403** + pesan jelas ✅ |
| 4 | `POST /api/register` | HTTP 201, tenant `t_<uid>` dibuat ✅ |
| 5 | `GET /api/me` | `trial`, sisa **3 hari**, kuota 0/100 ✅ |
| 6 | Bot membalas | pakai nama bisnis sendiri + template resto ✅ |
| 7 | Daftar dua kali | tenant **sama**, `baru=false` — idempoten ✅ |
| 8 | Isolasi data | hanya 1 percakapan miliknya, **tidak melihat 10 chat tenant demo** ✅ |
| 9 | Tanpa token | jatuh ke mode demo ✅ |

### Uji penguncian & pembukaan otomatis

`trialEndsAt` dimundurkan ke masa lalu lewat Firestore, lalu pembayaran
disimulasikan (persis yang nanti dilakukan webhook Midtrans). **Tidak ada satu
baris kode pun yang diubah di antara ketiga kondisi:**

| Kondisi | status | Simulator | Knowledge Base | Lihat chat |
|---|---|---|---|---|
| Trial berjalan | `trial` | 200 terbuka | 201 terbuka | 200 |
| **Trial habis** | `trial_ended` | **402 terkunci** | **402 terkunci** | **200 tetap terbaca** |
| **Setelah bayar** | `active` | **200 terbuka lagi** | **201 terbuka lagi** | 200 |

Kolom terakhir membuktikan keputusan desain nomor 2 bekerja: pelanggan yang
belum bayar tetap bisa melihat datanya sendiri.

Pembersihan: 2 akun uji dihapus dari Auth, tenant uji + subcollection +
langganan + pemetaan `users/{uid}` dihapus dari Firestore. Data demo utuh
(`tenants/demo`: 10 chat, 1 order, 1 config).

## Jebakan Firestore yang ditemukan

`tenants/demo` adalah **dokumen hantu** — hanya punya subcollection, tanpa
field. Firestore tidak memasukkan dokumen semacam ini ke hasil
`collection("tenants").get()`. Tenant sungguhan aman karena `createTenant()`
menulis dokumen beneran, tapi ingat ini saat nanti membuat halaman admin
"daftar semua tenant".

## Masih terbuka

1. **Firestore Security Rules belum ditulis.** Saat ini akses data hanya
   dijaga API route. Karena klien tidak pernah menyentuh Firestore langsung,
   ini aman — tapi rules tetap perlu sebagai lapis kedua.
2. **Tahap D: Midtrans Snap** — tombol bayar di `/langganan` masih nonaktif.
   Butuh Server Key + Client Key *Sandbox*.
3. Reset kuota AI bulanan belum berjalan (butuh cron/scheduled job).
4. Onboarding nomor WhatsApp per tenant belum ada UI-nya
   (`whatsappPhoneNumberId` masih harus diisi manual).
5. Saldo AI (Anthropic atau Gemini) masih kosong.
6. `ALLOW_DEMO_TENANT` masih `true` di `.env.local` — **wajib `false`** sebelum
   menerima pelanggan asli.
7. Seluruh kerja masih belum di-commit.
