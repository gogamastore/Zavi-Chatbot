# Sesi 1 — Membangun proyek web

**Tanggal:** 19 September 2026
**Fokus:** Membangun seluruh aplikasi Zavi sebagai proyek web (Next.js), mengikuti roadmap, sebagai fondasi sebelum dicerminkan ke Flutter.

---

## Ringkasan percakapan

1. **Permintaan awal:** buat aplikasi chatbot WhatsApp bernama "Zavi - Wa Assistant" berdasarkan file roadmap `.docx` di folder proyek.
2. **Arahan tambahan:** "buatkan dalam proyek web terlebih dahulu lalu kita cerminkan ke proyek flutter" → build web dulu, lalu mirror ke Flutter.
3. **Membaca roadmap:** roadmap berisi 6 tahap (persiapan, webhook, bot logic, AI, pesanan/Firestore, dashboard, deploy) + prompt siap pakai. Backend awalnya direncanakan FastAPI + dashboard Flutter Web.
4. **Pertanyaan klarifikasi ke user (dijawab):**
   - Stack web → **Next.js full-stack**
   - Database → **Firestore** (dengan fallback lokal supaya jalan sebelum kredensial siap)
   - Simulator WhatsApp di browser → **Ya, disertakan**
5. **Eksekusi build** seluruh aplikasi + verifikasi di browser + dokumentasi.

## Yang dikerjakan

### Setup
- Scaffold Next.js 16.3.5 (React 19, TypeScript, Tailwind v4) di folder `Zavi_Web/`.
- Tambah dependency: `@anthropic-ai/sdk` (Claude), `firebase-admin` (Firestore).
- Baca dokumen Next.js 16 bawaan (breaking changes: async request API, route handlers, Turbopack default) sebelum menulis kode.

### Backend (lib/)
- `lib/types.ts` — model data bersama (ChatMessage, Order, Business, KnowledgeDoc, dll).
- `lib/config.ts` — env + profil bisnis default (contoh: "Sambal Nyonya").
- `lib/db/store.ts` + `lib/db/firestore.ts` — abstraksi penyimpanan: Firestore bila ada kredensial, kalau tidak pakai in-memory (di-seed data demo, tahan hot-reload).
- `lib/bot/rules.ts` — balasan template + menu (Bahasa Indonesia), dari profil bisnis.
- `lib/bot/orders.ts` — deteksi niat order + ringkasan (cocokkan nama menu + jumlah).
- `lib/bot/ai.ts` — panggil Claude, system prompt dari profil+knowledge, penanda `[[ESCALATE]]` untuk eskalasi ke admin.
- `lib/bot/router.ts` — putuskan rule vs AI.
- `lib/bot/engine.ts` — `handleIncoming()`, dipakai bersama oleh webhook & simulator.
- `lib/wa/client.ts` — kirim pesan via WhatsApp Cloud API (no-op bila belum diatur).

### API routes (app/api/)
- `webhook/` (GET verifikasi Meta + POST terima pesan), `simulate/`, `chats/`, `chats/[phone]/`, `orders/`, `orders/[id]/` (PATCH status), `business/`, `knowledge/`, `knowledge/[id]/`, `stats/`.

### Frontend (app/ + components/)
- Layout + Sidebar (tema hijau WhatsApp), halaman: Dashboard, Simulator (mockup HP gaya WhatsApp), Riwayat Chat, Pesanan, Pengaturan (profil bisnis + katalog + knowledge base).

### Deploy & dokumentasi
- `Dockerfile` (Next.js standalone) + `.dockerignore`, `output: "standalone"` di next.config.
- `README.md`, `FLUTTER_MIRROR.md`, `.env.example`, `.env.local`.

## Hasil pengujian (di browser)

- ✅ Dashboard tampil dengan data seed (4 chat, 1 order, dsb).
- ✅ Simulator: klik "Jam buka" → balasan rule; "Menu & harga" → daftar harga; "Mau pesan ayam geprek 2 porsi" → order terdeteksi.
- ✅ Pesanan: order "2x Ayam Geprek Sambal Bawang" terekstrak otomatis; ubah status (Baru→Diproses) via PATCH 200 OK.
- ✅ Riwayat Chat: daftar percakapan + transkrip + tanda "Perlu admin".
- ✅ Pengaturan: form profil bisnis terisi dari data seed; editor katalog & knowledge base tampil.
- ✅ Build produksi bersih (TypeScript lolos; `.next/standalone/server.js` tergenerate).
- ✅ Log dev server tanpa error (semua endpoint 200).

## Bug yang diperbaiki saat sesi

- Kata "menu" tadinya tertangkap grup "salam" dulu (balasan jadi sapaan, bukan daftar harga). Diperbaiki: "menu" dipetakan ke intent harga/katalog. (`lib/bot/rules.ts`)

## Catatan teknis penting

- Menjalankan `npm run build` saat `npm run dev` masih hidup → gagal type-check karena `.next/dev/types` sedang ditulis. Solusi: hentikan dev dulu (atau `rm -rf .next/dev`) sebelum build.
- Model AI default `claude-sonnet-5` (roadmap menulis `claude-sonnet-4-6` yang sudah lama).
- Tanpa `ANTHROPIC_API_KEY`, jawaban AI menampilkan pesan "belum aktif" + tandai perlu admin (rule tetap jalan).

## Keputusan yang menunggu user

- Isi API key (Anthropic/Firebase/WhatsApp) untuk aktifkan fitur penuh.
- Lanjut buat proyek Flutter, atau coba web + AI asli dulu. **(belum diputuskan)**
