# Zavi — WhatsApp Assistant (Web)

Chatbot WhatsApp otomatis untuk UMKM. Balas chat pelanggan 24 jam (menu/rule),
jawab pertanyaan bebas pakai **Claude AI**, catat pesanan otomatis, dan pantau
semuanya lewat dashboard admin — semua dalam satu proyek **Next.js**.

Ini adalah implementasi dari _"Zavi" Chatbot WhatsApp — Roadmap Prototype_.
Proyek web ini dibangun lebih dulu; nanti dicerminkan ke proyek **Flutter**
(lihat [`FLUTTER_MIRROR.md`](./FLUTTER_MIRROR.md)).

---

## ✨ Fitur

| Fitur | Status | Roadmap |
|---|---|---|
| Webhook WhatsApp Cloud API (verifikasi + terima pesan) | ✅ | Tahap 1 |
| Kirim balasan via WhatsApp Cloud API | ✅ | Tahap 1 |
| Intent router (rule vs AI) | ✅ | Tahap 2 |
| Balasan template Bahasa Indonesia (jam buka, menu, harga, cara order, bayar, alamat) | ✅ | Tahap 2 |
| Menu pilihan cepat untuk pelanggan | ✅ | Tahap 2 |
| Jawaban AI fleksibel (Claude) + knowledge base | ✅ | Tahap 3 |
| Eskalasi ke admin saat AI tidak yakin | ✅ | Tahap 3 |
| Deteksi & pencatatan pesanan | ✅ | Tahap 4 |
| Simpan chat & order ke Firestore | ✅ | Tahap 4 |
| Dashboard admin (chat, pesanan, ubah status) | ✅ | Tahap 5 |
| **Simulator WhatsApp di browser** (uji tanpa nomor Meta) | ✅ | bonus |
| Dockerfile + panduan deploy | ✅ | Tahap 6 |

---

## 🚀 Menjalankan (mode demo, tanpa setup apa pun)

```bash
npm install
npm run dev
```

Buka <http://localhost:3000>. Tanpa kredensial apa pun, aplikasi jalan dengan:

- **Penyimpanan in-memory** berisi data contoh (bisnis "Sambal Nyonya").
- **Simulator** yang bisa langsung dipakai menguji balasan rule/menu.
- Jawaban AI menampilkan pesan "belum aktif" sampai `ANTHROPIC_API_KEY` diisi.

> Data in-memory akan hilang saat server restart. Hubungkan Firestore agar permanen.

### Mengaktifkan fitur penuh

Salin `.env.example` → `.env.local`, lalu isi sesuai kebutuhan:

1. **AI (Claude)** — isi `ANTHROPIC_API_KEY`. Model default `claude-sonnet-5`
   (cepat & hemat untuk CS); ganti ke `claude-opus-5` untuk kualitas lebih tinggi.
2. **Firestore** — isi `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
   `FIREBASE_PRIVATE_KEY` (dari service account JSON). Begitu terisi, aplikasi
   otomatis pakai Firestore, bukan memory.

   > ⚠️ Ambil ketiganya dari **service account JSON**
   > (Firebase Console → Project Settings → Service accounts → *Generate new private key*),
   > **bukan** dari halaman konfigurasi web. `FIREBASE_PRIVATE_KEY` harus berupa
   > blok PEM `-----BEGIN PRIVATE KEY-----…`, bukan API key `AIza…`.
   >
   > Kalau database Firestore Anda punya **nama khusus**, isi juga
   > `FIREBASE_DATABASE_ID`. Nama `default` dan `(default)` itu **berbeda** —
   > SDK mencari `(default)` secara bawaan, dan salah nama menghasilkan
   > error `5 NOT_FOUND`. Cek nama database Anda dengan:
   > `gcloud firestore databases list --project <project-id>`
3. **WhatsApp** — isi `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN`.

---

## 🔌 Menghubungkan ke WhatsApp (Meta)

1. Buat app di <https://developers.facebook.com> → tambahkan produk **WhatsApp**.
2. Di **API Setup**, salin **Temporary access token** → `WHATSAPP_TOKEN`, dan
   **Phone number ID** → `PHONE_NUMBER_ID`.
3. Ekspos server lokal ke internet (untuk verifikasi webhook):
   ```bash
   npx ngrok http 3000
   ```
4. Di **Configuration → Webhook**, isi:
   - **Callback URL**: `https://<domain-ngrok>/api/webhook`
   - **Verify token**: sama persis dengan `VERIFY_TOKEN` di `.env.local`
   - Klik **Verify and save** (server harus jalan).
5. **Subscribe** ke field `messages`.
6. Kirim pesan WhatsApp ke nomor test → bot membalas otomatis.

> Untuk produksi, ganti Callback URL ke domain deploy (bukan ngrok) dan pakai
> **permanent access token** (System User token).

---

## 🧱 Arsitektur

```
Pelanggan WA ─▶ Meta WhatsApp Cloud API ─▶ /api/webhook
                                              │
Browser (Simulator) ─▶ /api/simulate ─────────┤
                                              ▼
                                     lib/bot/engine.ts
                                       │  route()
                        ┌──────────────┴───────────────┐
                        ▼                              ▼
                 rules.ts (template)          ai.ts (Claude API)
                        └──────────────┬───────────────┘
                                       ▼
                          orders.ts (deteksi pesanan)
                                       ▼
                             lib/db/store.ts
                        (Firestore  |  in-memory)
                                       ▼
                     Dashboard admin (chats / orders)
```

Webhook dan simulator memakai **engine yang sama**, jadi apa yang Anda uji di
simulator persis sama dengan yang dialami pelanggan WhatsApp.

## 📁 Struktur proyek

```
Zavi_Web/
├── app/
│   ├── page.tsx                # Dashboard
│   ├── simulator/page.tsx      # Simulator WhatsApp
│   ├── chats/page.tsx          # Riwayat chat
│   ├── orders/page.tsx         # Manajemen pesanan
│   ├── settings/page.tsx       # Profil bisnis + knowledge base
│   └── api/
│       ├── webhook/route.ts    # GET verifikasi + POST terima pesan (Meta)
│       ├── simulate/route.ts   # endpoint simulator
│       ├── chats/…             # data chat
│       ├── orders/…            # data + ubah status pesanan
│       ├── business/route.ts   # profil bisnis
│       ├── knowledge/…         # knowledge base AI
│       └── stats/route.ts      # ringkasan dashboard
├── lib/
│   ├── types.ts                # model data (dipakai UI + backend + Flutter)
│   ├── config.ts               # env + profil bisnis default
│   ├── bot/                    # engine, router, rules, ai, orders
│   ├── wa/client.ts            # WhatsApp Cloud API client
│   └── db/                     # store (Firestore + memory), firestore init
├── components/                 # Sidebar + UI kecil
├── Dockerfile
└── .env.example
```

## 🗃️ Struktur Firestore

- `chats/{id}` → `ChatMessage` (phone, direction, text, source, createdAt, …)
- `orders/{id}` → `Order` (phone, summary, rawText, status, createdAt, …)
- `config/business` → `Business` (profil bisnis)
- `knowledge/{id}` → `KnowledgeDoc` (title, content, kind)

Lihat definisi lengkap di [`lib/types.ts`](./lib/types.ts).

---

## 🔐 Area owner / pengembang

Terpisah dari akun pelanggan. Penandanya **custom claim Firebase Auth**
(`owner: true`) yang hanya bisa diberikan lewat Admin SDK — tidak ada pengguna
yang bisa mengangkat dirinya sendiri lewat web.

| Halaman | Isi |
|---|---|
| `/owner/login` | Login khusus pengelola. Tanpa daftar, tanpa login Google. |
| `/owner` | Ringkasan: jumlah mitra, aktif, percobaan, terkunci, pemakaian AI, dan daftar "perlu perhatian". |
| `/owner/mitra` | Daftar lengkap mitra + pencarian & filter status: paket, masa berlaku, pemakaian AI, saldo kredit, sambungan WhatsApp. |

Akun owner berada **di luar sistem langganan**: semua fitur terbuka tanpa batas
dan tanpa masa berlaku, dan `/api/payment/create` menolaknya karena tidak ada
yang perlu dibeli. Ruang kerjanya (`Ruang Uji Owner`) dibuat otomatis saat
pertama login dan ditandai `platformOwner`, jadi tidak ikut terhitung sebagai
mitra. Pemakaian AI-nya tetap dihitung dan ditampilkan — biayanya nyata.

Mengelola akun owner dari terminal:

```bash
node --env-file=.env.local scripts/owner.mjs daftar          # lihat semua owner
node --env-file=.env.local scripts/owner.mjs buat  <email>   # buat akun (sandi dari stdin)
node --env-file=.env.local scripts/owner.mjs beri  <email>   # jadikan owner
node --env-file=.env.local scripts/owner.mjs cabut <email>   # cabut akses owner
```

Kata sandi dibaca dari stdin, bukan argumen — argumen tersimpan di riwayat
shell dan terlihat di daftar proses:

```bash
printf '%s' 'sandi-rahasia' | node --env-file=.env.local scripts/owner.mjs buat owner@contoh.com
```

`beri` dan `cabut` sekaligus mencabut sesi lama, jadi perubahan izin langsung
berlaku tanpa menunggu token kedaluwarsa.

---

## 🚢 Deploy (Tahap 6)

### Docker / VPS
```bash
docker build -t zavi-web .
docker run -p 3000:3000 --env-file .env.local zavi-web
```

### Railway / Render / Vercel
- **Vercel**: import repo, set Root Directory = `Zavi_Web`, tambahkan env vars. Selesai.
- **Railway/Render**: pakai Dockerfile, atau build `npm run build` + start
  `npm start`. Tambahkan semua env var dari `.env.example`.

Setelah live, update **Callback URL** webhook di Meta ke domain produksi.

## ✅ Checklist testing sebelum dipakai klien

- [ ] Webhook terverifikasi Meta & bisa terima pesan masuk
- [ ] Balasan rule (jam buka, harga, katalog) sesuai
- [ ] Pertanyaan bebas dijawab AI dengan wajar (tidak ngawur soal harga/stok)
- [ ] Chat & pesanan tersimpan benar di Firestore
- [ ] Status pesanan bisa diubah dari dashboard
- [ ] Bot tetap jalan setelah server restart/redeploy
- [ ] Sudah dites pakai nomor WhatsApp asli, bukan cuma simulator

---

## 🧰 Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
`@anthropic-ai/sdk` (Claude) · `firebase-admin` (Firestore).
