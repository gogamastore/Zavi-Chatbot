# Mencerminkan Zavi ke Flutter

Rencana memindahkan proyek web ini ke Flutter. Kunci strateginya: **backend
tidak ditulis ulang**. API routes Next.js (`/api/*`) tetap jadi backend; app
Flutter cukup jadi klien baru yang memanggil endpoint yang sama.

```
                 ┌────────────────────────────┐
                 │  Backend (tetap): Next.js   │
                 │  /api/webhook  /api/simulate │
                 │  /api/chats /api/orders …    │
                 └───────────────┬─────────────┘
                                 │  REST/JSON (sama persis)
                 ┌───────────────┴─────────────┐
                 ▼                              ▼
        Web dashboard (sudah ada)      Flutter app (akan dibuat)
```

## Struktur folder target

```
D:\Zavi Wa Assistant\
├── Zavi_Web/   ← proyek Next.js (sudah jadi)
└── flutter/    ← app Flutter (admin dashboard + simulator)
```

## 1. Model data → Dart

Setiap tipe di [`lib/types.ts`](./lib/types.ts) dicerminkan jadi class Dart
dengan `fromJson`/`toJson`. Contoh:

```dart
class Order {
  final String id;
  final String phone;
  final String? name;
  final String summary;
  final String rawText;
  final String status; // baru | diproses | selesai | batal
  final int createdAt;
  final int updatedAt;

  Order.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        phone = j['phone'],
        name = j['name'],
        summary = j['summary'],
        rawText = j['rawText'],
        status = j['status'],
        createdAt = j['createdAt'],
        updatedAt = j['updatedAt'];
}
```

Tipe yang perlu dimirror: `ChatMessage`, `Order`, `Business`, `CatalogItem`,
`KnowledgeDoc`, `Conversation`, `Stats`, dan tipe lapis SaaS: `Tenant`,
`Plan`, `Subscription`, `Entitlement`, `Payment`, `BotTemplate`, `BotRule`,
`BotConfig`, `AIConfig`.

## 2. Layar (screen) → Flutter

| Web (Next.js)          | Flutter screen            |
|------------------------|---------------------------|
| `app/page.tsx`         | `DashboardScreen`         |
| `app/simulator/page`   | `SimulatorScreen`         |
| `app/chats/page`       | `ChatsScreen`             |
| `app/orders/page`      | `OrdersScreen`            |
| `app/settings/page`    | `SettingsScreen`          |
| `components/Sidebar`   | `NavigationRail` / `Drawer` |

## 3. Autentikasi (WAJIB dibaca lebih dulu)

Sejak Zavi jadi SaaS multi-tenant, **setiap** endpoint di bawah butuh ID token
Firebase:

```
Authorization: Bearer <ID token>
```

Di Flutter, pakai `firebase_auth` dengan **project Firebase yang sama**
(`zavi-assistant`), lalu ambil tokennya:

```dart
final token = await FirebaseAuth.instance.currentUser?.getIdToken();
```

Tiga hal yang harus ditangani `ApiClient`:

1. **Pasang token di setiap request.** Ambil ulang tiap panggilan —
   `getIdToken()` menyegarkan sendiri kalau sudah dekat kedaluwarsa.
2. **HTTP 401** → sesi berakhir, arahkan ke layar login.
3. **HTTP 402** → fitur terkunci karena langganan, bukan bug. Body-nya berisi
   `{error, locked, feature, entitlement}` — tampilkan ajakan berlangganan.

`tenantId` **tidak pernah dikirim dari klien**; server menurunkannya dari token.

## 4. Endpoint yang dipanggil

| Aksi | Method + path |
|---|---|
| Akun + langganan + hak akses | `GET /api/me` |
| Selesaikan pendaftaran | `POST /api/register` `{businessName,templateId,phone}` |
| Daftar template bot | `GET /api/templates` |
| Ringkasan dashboard | `GET /api/stats` |
| Kirim pesan simulator | `POST /api/simulate` `{phone,name,text}` |
| Daftar percakapan | `GET /api/chats` |
| Pesan per nomor | `GET /api/chats/{phone}` |
| Daftar pesanan | `GET /api/orders?status=` |
| Ubah status pesanan | `PATCH /api/orders/{id}` `{status}` |
| Profil bisnis | `GET/PUT /api/business` |
| Konfigurasi bot | `GET/PUT /api/bot-config` |
| Pengaturan AI | `GET/PUT /api/ai-config` |
| Knowledge base | `GET/POST /api/knowledge`, `DELETE /api/knowledge/{id}` |

`GET /api/me` adalah panggilan pertama setiap kali app dibuka — dari sana app
tahu harus ke layar login, layar onboarding (`needsRegistration`), atau
dashboard. Padanan `useSubscription()` di web.

Buat satu `ApiClient` (pakai paket `http` atau `dio`) dengan `baseUrl` yang
menunjuk ke server web (mis. `https://api.zavi.app`). Semua screen memanggil
lewat client itu.

## 5. Paket Flutter yang disarankan

- `http` atau `dio` — panggil REST API.
- `provider` / `riverpod` — state management.
- `intl` — format tanggal/waktu (padanan `lib/format.ts`).
- `firebase_auth` — **wajib**, bukan lagi opsional. Semua endpoint butuh ID token.

## 6. Langkah eksekusi

1. `flutter create flutter` di `D:\Zavi Wa Assistant`.
2. Salin model dari `lib/types.ts` → `lib/models/*.dart`.
3. Buat `ApiClient` + `.env` untuk `baseUrl`.
4. Bangun screen satu per satu mengikuti tabel di atas.
5. Untuk simulator, panggil `POST /api/simulate` dan render bubble chat.
6. (Opsional) tambahkan Firebase Auth untuk login admin.

> Catatan: kalau nanti ingin backend juga di-porting ke Dart (mis. server
> `dart_frog`), kontrak JSON di atas tetap jadi acuan agar web & Flutter
> konsisten.
