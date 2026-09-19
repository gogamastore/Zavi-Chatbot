# Sesi 2 — Menyambung Firestore & merapikan nama folder

**Tanggal:** 19 September 2026
**Fokus:** Memperbaiki aplikasi yang ternyata rusak total, menyambungkan Firestore
sungguhan dengan service account, dan menyeragamkan semua dokumen ke nama folder
resmi `Zavi_Web`.

---

## Ringkasan

1. Sesi dimulai dengan permintaan mempelajari proyek dari dokumen di root.
2. Saat menelusuri kode, ketahuan **aplikasi sedang 500 di semua endpoint** —
   berbeda dengan catatan sesi 1 yang menyatakan semua jalan.
3. User menyerahkan file service account yang sah → dipasang.
4. Muncul error kedua yang lebih halus (nama database) → diperbaiki.
5. Semua dokumen diseragamkan ke `Zavi_Web`.

## Masalah 1 — Semua endpoint 500

**Gejala:** `GET /api/stats` → HTTP 500, body kosong. Dashboard blank.
Log dev: `Error: Failed to parse private key` (38 kali).

**Akar masalah:** `.env.local` diisi nilai dari **halaman konfigurasi web Firebase**,
bukan dari service account:

| Variabel | Isi keliru | Seharusnya |
|---|---|---|
| `FIREBASE_CLIENT_EMAIL` | `zavi-assistant.firebaseapp.com` (authDomain) | `firebase-adminsdk-…@….iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Web API key `AIza…` | Blok PEM `-----BEGIN PRIVATE KEY-----` |

**Kenapa fatal:** `hasFirestore()` hanya mengecek env **tidak kosong**, bukan valid.
Karena terisi (walau salah), `getStore()` memilih FirestoreStore, `cert()` gagal,
dan **fallback in-memory tidak pernah aktif**. Satu salah ketik → seluruh app mati.

## Masalah 2 — `default` ≠ `(default)`

Setelah service account yang benar dipasang, error berubah jadi `5 NOT_FOUND`
(artinya autentikasi sudah lolos). Query ke Firestore Admin API menunjukkan:

```
projects/zavi-assistant/databases/default | FIRESTORE_NATIVE | asia-southeast1
```

Database-nya bernama **`default`** — sebuah *named database*, bukan database bawaan
yang ID-nya literal **`(default)`** (pakai tanda kurung). `firebase-admin` mencari
`(default)` kalau tidak diberi tahu, jadi hasilnya NOT_FOUND.

**Perbaikan:** tambah env `FIREBASE_DATABASE_ID`, dipakai `getFirestore(app, id)`.
Dibuat opsional supaya proyek lain dengan database `(default)` normal tetap jalan.

## Perubahan kode

- `lib/config.ts` — tambah `firebaseDatabaseId` dari env `FIREBASE_DATABASE_ID`.
- `lib/db/firestore.ts` — `getDb()` meneruskan database id ke `getFirestore()`
  bila diisi; kalau kosong tetap pakai perilaku lama.
- `.env.local` — kredensial asli dari service account + `FIREBASE_DATABASE_ID=default`.
- `.env.example` — dokumentasi variabel baru + cara cek nama database.
- `.gitignore` — **tambah pola `*-firebase-adminsdk-*.json` dan `service-account*.json`.**
  Sebelumnya file service account TIDAK terlindungi; sekali commit, private key
  masuk riwayat git permanen.
- `package.json` — `"name"` dari `web` → `zavi_web`.

## Penyeragaman nama folder → `Zavi_Web`

Dokumen masih menyebut folder `web/` (dan sekali `Zavi-Web\`), padahal aslinya
`Zavi_Web`. Semua link relatif jadi mati. Diperbaiki di:

- `CATATAN-PROYEK.md` (11 rujukan) — sekaligus ditambah bagian risiko & jebakan teknis
- `README.md` — struktur folder, Root Directory Vercel, panduan Firestore
- `FLUTTER_MIRROR.md` — diagram struktur folder
- `catatan/2026-09-19-sesi-1-build-web.md` — folder scaffold

## Catatan dipindah ke dalam repo

Sebelumnya `CATATAN-PROYEK.md` ada **dua salinan identik** (di root dan di dalam
`Zavi_Web`), rawan berbeda isi. Diputuskan: acuan tunggal ada **di dalam
`Zavi_Web`**, supaya ikut ter-commit saat repo di-push ke GitHub.

- `CATATAN-PROYEK.md` di root **dihapus**.
- Folder `catatan/` **dipindah** dari root ke `Zavi_Web/catatan/` — kalau tidak,
  link `./catatan/` dari dalam repo akan menunjuk ke luar repo (masalah yang sama
  dengan yang baru saja dibereskan).
- Semua link relatif disesuaikan (`./README.md`, `./FLUTTER_MIRROR.md`, dst).
- File `Zavi Chatbot WhatsApp — Roadmap Prototype.docx` tetap di root sebagai
  dokumen sumber; rujukannya di catatan diubah jadi "di folder induk".

## Hasil verifikasi

- ✅ `GET /api/stats` → HTTP 200, `"storage":"firestore"`
- ✅ Rule: "jam buka berapa?" → balasan template benar, `source: rule`
- ✅ Order: "mau pesan ayam geprek 2 porsi" → `orderCreated: true`,
  ringkasan terekstrak **"2x Ayam Geprek Sambal Bawang"**
- ✅ Data benar-benar mendarat di Firestore (dokumen ID asli dari server,
  mis. `nfVgaNv5WizyycoPhVTz`), bukan memory
- ✅ Statistik terbaca: 4 chat, 1 percakapan, 1 pesanan

- ✅ Build produksi bersih setelah perubahan kode (16 route terkompilasi)
- ✅ Data uji (`628111222333`) sudah dihapus dari Firestore — database mulai kosong

## Masih terbuka

- `ANTHROPIC_API_KEY` belum diisi → pertanyaan bebas dibalas "fitur AI belum aktif".
- Kredensial WhatsApp belum diisi.
- Seluruh kerja Zavi masih belum di-commit (git baru berisi commit scaffold).
- Peringatan git *dubious ownership* di `Zavi_Web` — disk pernah dipakai user
  Windows lain. Perlu `git config --global --add safe.directory "D:/Zavi Wa Assistant/Zavi_Web"`
  sebelum bisa commit normal.
