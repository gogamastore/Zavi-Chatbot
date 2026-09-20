// ---------------------------------------------------------------------------
// Lapis penyimpanan — versi multi-tenant.
//
// Ada DUA store:
//
//   getStore(tenantId)   → data milik satu tenant (chats, orders, business,
//                          knowledge, konfigurasi bot & AI). Semua query sudah
//                          ter-scope; tidak mungkin bocor antar tenant karena
//                          datanya memang berada di subcollection terpisah.
//
//   getPlatformStore()   → data tingkat platform (tenants, langganan,
//                          pembayaran, pemetaan uid→tenant).
//
// Dua implementasi seperti sebelumnya: Firestore bila ada kredensial, kalau
// tidak in-memory (untuk demo tanpa setup).
//
// Tata letak Firestore:
//   tenants/{tid}                    → Tenant
//   tenants/{tid}/chats/{id}         → ChatMessage
//   tenants/{tid}/orders/{id}        → Order
//   tenants/{tid}/knowledge/{id}     → KnowledgeDoc
//   tenants/{tid}/config/business    → Business
//   tenants/{tid}/config/bot         → BotConfig
//   tenants/{tid}/config/ai          → AIConfig
//   subscriptions/{tid}              → Subscription
//   payments/{orderId}               → Payment
//   users/{uid}                      → { tenantId }
// ---------------------------------------------------------------------------
import { hasFirestore, DEFAULT_BUSINESS } from "@/lib/config";
import type {
  AIConfig,
  BotConfig,
  Business,
  ChatMessage,
  Conversation,
  KnowledgeDoc,
  Order,
  OrderStatus,
  Payment,
  Stats,
  Subscription,
  Tenant,
} from "@/lib/types";

/** Tenant bawaan saat berjalan tanpa Firestore (mode demo/simulator). */
export const DEMO_TENANT_ID = "demo";

// ===========================================================================
// Antarmuka
// ===========================================================================

export interface Store {
  readonly kind: "firestore" | "memory";
  readonly tenantId: string;

  addChat(msg: Omit<ChatMessage, "id" | "createdAt"> & { createdAt?: number }): Promise<ChatMessage>;
  listChats(limit?: number): Promise<ChatMessage[]>;
  getChatsByPhone(phone: string, limit?: number): Promise<ChatMessage[]>;
  listConversations(): Promise<Conversation[]>;

  addOrder(order: Omit<Order, "id" | "createdAt" | "updatedAt"> & { createdAt?: number }): Promise<Order>;
  listOrders(status?: OrderStatus): Promise<Order[]>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null>;

  getBusiness(): Promise<Business>;
  saveBusiness(business: Business): Promise<Business>;

  listKnowledge(): Promise<KnowledgeDoc[]>;
  addKnowledge(doc: Omit<KnowledgeDoc, "id" | "createdAt">): Promise<KnowledgeDoc>;
  deleteKnowledge(id: string): Promise<void>;

  getBotConfig(): Promise<BotConfig | null>;
  saveBotConfig(cfg: BotConfig): Promise<BotConfig>;

  getAIConfig(): Promise<AIConfig | null>;
  saveAIConfig(cfg: AIConfig): Promise<AIConfig>;

  getStats(): Promise<Stats>;
}

/** Rincian dari mana satu pemakaian AI diambil. Berguna untuk log & audit. */
export interface KonsumsiKuota {
  /** Diambil dari jatah bulanan paket. */
  dariPaket: number;
  /** Diambil dari kredit top-up. */
  dariKredit: number;
  /** Sisa kredit setelah pemakaian ini. */
  sisaKredit: number;
}

export interface PlatformStore {
  readonly kind: "firestore" | "memory";

  getTenant(tenantId: string): Promise<Tenant | null>;
  getTenantByUid(uid: string): Promise<Tenant | null>;
  /** Dipakai webhook WhatsApp: cari tenant pemilik nomor yang menerima pesan. */
  getTenantByPhoneNumberId(phoneNumberId: string): Promise<Tenant | null>;
  createTenant(tenant: Tenant): Promise<Tenant>;
  updateTenant(tenantId: string, patch: Partial<Tenant>): Promise<Tenant | null>;
  /**
   * Semua tenant — HANYA untuk area owner. Jangan dipakai di API pelanggan:
   * satu pemanggilan yang salah tempat membocorkan daftar klien.
   */
  listTenants(limit?: number): Promise<Tenant[]>;

  getSubscription(tenantId: string): Promise<Subscription | null>;
  /** Semua langganan. Sama seperti listTenants: khusus area owner. */
  listSubscriptions(limit?: number): Promise<Subscription[]>;
  saveSubscription(sub: Subscription): Promise<Subscription>;
  /**
   * Catat pemakaian AI: ambil dari kuota bulanan paket dulu, baru dari kredit
   * top-up. Kuota paket hangus tiap periode, kredit tidak — jadi memakai kuota
   * lebih dulu adalah urutan yang menguntungkan pelanggan.
   */
  konsumsiKuotaAI(
    tenantId: string,
    kuotaPaket: number,
    by?: number,
  ): Promise<KonsumsiKuota>;
  /** Tambah kredit hasil pembelian. Atomik, supaya tidak menimpa data lain. */
  tambahKreditAI(tenantId: string, jumlah: number): Promise<void>;

  createPayment(payment: Payment): Promise<Payment>;
  getPayment(orderId: string): Promise<Payment | null>;
  /** Pembayaran yang belum tuntas, untuk pekerjaan rekonsiliasi. */
  listPendingPayments(maxUmurJam?: number): Promise<Payment[]>;
  updatePayment(orderId: string, patch: Partial<Payment>): Promise<Payment | null>;
}

// ===========================================================================
// Util bersama
// ===========================================================================

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

/**
 * Bagi satu pemakaian AI ke kuota paket lalu kredit. Dipakai kedua store
 * supaya perhitungannya persis sama — memory dan Firestore tidak boleh
 * berbeda dalam hal yang menyangkut uang pelanggan.
 *
 * Kalau kuota dan kredit sama-sama habis, kelebihannya TETAP dicatat di
 * aiRepliesUsed. Pemakaian yang lolos penjagaan tidak boleh hilang dari
 * pembukuan hanya karena tidak ada tempat menaruhnya.
 */
function bagiPemakaian(sub: Subscription, kuotaPaket: number, by: number) {
  const terpakai = sub.aiRepliesUsed ?? 0;
  const kredit = Math.max(0, sub.aiCreditsBalance ?? 0);

  const dariPaket = Math.min(by, Math.max(0, kuotaPaket - terpakai));
  const dariKredit = Math.min(by - dariPaket, kredit);
  const kelebihan = by - dariPaket - dariKredit;
  const sisaKredit = kredit - dariKredit;

  return {
    aiRepliesUsed: terpakai + dariPaket + kelebihan,
    aiCreditsBalance: sisaKredit,
    hasil: { dariPaket, dariKredit, sisaKredit } satisfies KonsumsiKuota,
  };
}

function emptyOrderCounts(): Record<OrderStatus, number> {
  return { baru: 0, diproses: 0, selesai: 0, batal: 0 };
}

function buildConversations(chats: ChatMessage[]): Conversation[] {
  const byPhone = new Map<string, Conversation>();
  for (const c of chats) {
    const existing = byPhone.get(c.phone);
    if (!existing) {
      byPhone.set(c.phone, {
        phone: c.phone,
        name: c.name,
        lastText: c.text,
        lastAt: c.createdAt,
        messageCount: 1,
        needsHuman: Boolean(c.needsHuman),
      });
    } else {
      existing.messageCount += 1;
      existing.lastText = c.text;
      existing.lastAt = c.createdAt;
      if (c.name) existing.name = c.name;
      if (c.needsHuman) existing.needsHuman = true;
    }
  }
  return [...byPhone.values()].sort((a, b) => b.lastAt - a.lastAt);
}

function computeStats(chats: ChatMessage[], orders: Order[]): Stats {
  const ordersByStatus = emptyOrderCounts();
  for (const o of orders) ordersByStatus[o.status] += 1;
  return {
    totalChats: chats.length,
    totalConversations: new Set(chats.map((c) => c.phone)).size,
    ordersByStatus,
    totalOrders: orders.length,
    needsHuman: chats.filter((c) => c.needsHuman).length,
    aiReplies: chats.filter((c) => c.source === "ai").length,
    ruleReplies: chats.filter((c) => c.source === "rule" || c.source === "menu").length,
  };
}

/** Firestore menolak nilai `undefined`; buang dulu. */
function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

// ===========================================================================
// Penyimpanan in-memory (fallback / demo)
// ===========================================================================

interface MemoryTenantState {
  chats: ChatMessage[];
  orders: Order[];
  business: Business;
  knowledge: KnowledgeDoc[];
  botConfig: BotConfig | null;
  aiConfig: AIConfig | null;
}

interface MemoryRoot {
  tenants: Map<string, MemoryTenantState>;
  tenantMeta: Map<string, Tenant>;
  uidToTenant: Map<string, string>;
  subscriptions: Map<string, Subscription>;
  payments: Map<string, Payment>;
}

/** Dipin ke globalThis supaya bertahan melewati hot-reload Next.js. */
function memoryRoot(): MemoryRoot {
  const g = globalThis as unknown as { __zaviMem?: MemoryRoot };
  if (!g.__zaviMem) {
    g.__zaviMem = {
      tenants: new Map(),
      tenantMeta: new Map(),
      uidToTenant: new Map(),
      subscriptions: new Map(),
      payments: new Map(),
    };
  }
  return g.__zaviMem;
}

function memoryTenant(tenantId: string): MemoryTenantState {
  const root = memoryRoot();
  let st = root.tenants.get(tenantId);
  if (!st) {
    st = {
      chats: [],
      orders: [],
      business: structuredClone(DEFAULT_BUSINESS),
      knowledge: [],
      botConfig: null,
      aiConfig: null,
    };
    root.tenants.set(tenantId, st);
  }
  return st;
}

class MemoryStore implements Store {
  readonly kind = "memory" as const;
  constructor(readonly tenantId: string) {}

  private get st() {
    return memoryTenant(this.tenantId);
  }

  async addChat(msg: Omit<ChatMessage, "id" | "createdAt"> & { createdAt?: number }) {
    const chat: ChatMessage = { ...msg, id: newId(), createdAt: msg.createdAt ?? Date.now() };
    this.st.chats.push(chat);
    return chat;
  }
  async listChats(limit = 500) {
    return [...this.st.chats].sort((a, b) => a.createdAt - b.createdAt).slice(-limit);
  }
  async getChatsByPhone(phone: string, limit = 50) {
    return this.st.chats
      .filter((c) => c.phone === phone)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit);
  }
  async listConversations() {
    return buildConversations(await this.listChats());
  }
  async addOrder(order: Omit<Order, "id" | "createdAt" | "updatedAt"> & { createdAt?: number }) {
    const now = Date.now();
    const o: Order = { ...order, id: newId(), createdAt: order.createdAt ?? now, updatedAt: now };
    this.st.orders.push(o);
    return o;
  }
  async listOrders(status?: OrderStatus) {
    let orders = [...this.st.orders].sort((a, b) => b.createdAt - a.createdAt);
    if (status) orders = orders.filter((o) => o.status === status);
    return orders;
  }
  async updateOrderStatus(id: string, status: OrderStatus) {
    const o = this.st.orders.find((x) => x.id === id);
    if (!o) return null;
    o.status = status;
    o.updatedAt = Date.now();
    return o;
  }
  async getBusiness() {
    return this.st.business;
  }
  async saveBusiness(business: Business) {
    this.st.business = business;
    return business;
  }
  async listKnowledge() {
    return [...this.st.knowledge].sort((a, b) => b.createdAt - a.createdAt);
  }
  async addKnowledge(doc: Omit<KnowledgeDoc, "id" | "createdAt">) {
    const k: KnowledgeDoc = { ...doc, id: newId(), createdAt: Date.now() };
    this.st.knowledge.push(k);
    return k;
  }
  async deleteKnowledge(id: string) {
    const st = this.st;
    st.knowledge = st.knowledge.filter((k) => k.id !== id);
  }
  async getBotConfig() {
    return this.st.botConfig;
  }
  async saveBotConfig(cfg: BotConfig) {
    this.st.botConfig = cfg;
    return cfg;
  }
  async getAIConfig() {
    return this.st.aiConfig;
  }
  async saveAIConfig(cfg: AIConfig) {
    this.st.aiConfig = cfg;
    return cfg;
  }
  async getStats() {
    return computeStats(this.st.chats, this.st.orders);
  }
}

class MemoryPlatformStore implements PlatformStore {
  readonly kind = "memory" as const;

  async getTenant(tenantId: string) {
    return memoryRoot().tenantMeta.get(tenantId) ?? null;
  }
  async getTenantByUid(uid: string) {
    const id = memoryRoot().uidToTenant.get(uid);
    return id ? (memoryRoot().tenantMeta.get(id) ?? null) : null;
  }
  async getTenantByPhoneNumberId(phoneNumberId: string) {
    for (const t of memoryRoot().tenantMeta.values()) {
      if (t.whatsappPhoneNumberId === phoneNumberId) return t;
    }
    return null;
  }
  async createTenant(tenant: Tenant) {
    const root = memoryRoot();
    root.tenantMeta.set(tenant.id, tenant);
    root.uidToTenant.set(tenant.ownerUid, tenant.id);
    return tenant;
  }
  async updateTenant(tenantId: string, patch: Partial<Tenant>) {
    const root = memoryRoot();
    const t = root.tenantMeta.get(tenantId);
    if (!t) return null;
    const next = { ...t, ...patch, updatedAt: Date.now() };
    root.tenantMeta.set(tenantId, next);
    return next;
  }
  async listTenants(limit = 500) {
    return [...memoryRoot().tenantMeta.values()].slice(0, limit);
  }
  async getSubscription(tenantId: string) {
    return memoryRoot().subscriptions.get(tenantId) ?? null;
  }
  async listSubscriptions(limit = 500) {
    return [...memoryRoot().subscriptions.values()].slice(0, limit);
  }
  async saveSubscription(sub: Subscription) {
    memoryRoot().subscriptions.set(sub.tenantId, sub);
    return sub;
  }
  async konsumsiKuotaAI(tenantId: string, kuotaPaket: number, by = 1) {
    const sub = memoryRoot().subscriptions.get(tenantId);
    if (!sub) return { dariPaket: 0, dariKredit: 0, sisaKredit: 0 };
    const bagi = bagiPemakaian(sub, kuotaPaket, by);
    sub.aiRepliesUsed = bagi.aiRepliesUsed;
    sub.aiCreditsBalance = bagi.aiCreditsBalance;
    sub.updatedAt = Date.now();
    return bagi.hasil;
  }
  async tambahKreditAI(tenantId: string, jumlah: number) {
    const sub = memoryRoot().subscriptions.get(tenantId);
    if (!sub) return;
    sub.aiCreditsBalance = (sub.aiCreditsBalance ?? 0) + jumlah;
    sub.aiCreditsPurchased = (sub.aiCreditsPurchased ?? 0) + jumlah;
    sub.updatedAt = Date.now();
  }
  async createPayment(payment: Payment) {
    memoryRoot().payments.set(payment.orderId, payment);
    return payment;
  }
  async getPayment(orderId: string) {
    return memoryRoot().payments.get(orderId) ?? null;
  }
  async listPendingPayments(maxUmurJam = 48) {
    const batas = Date.now() - maxUmurJam * 3_600_000;
    return [...memoryRoot().payments.values()].filter(
      (p) => p.status === "pending" && p.createdAt >= batas,
    );
  }
  async updatePayment(orderId: string, patch: Partial<Payment>) {
    const root = memoryRoot();
    const p = root.payments.get(orderId);
    if (!p) return null;
    const next = { ...p, ...patch, updatedAt: Date.now() };
    root.payments.set(orderId, next);
    return next;
  }
}

// ===========================================================================
// Firestore
// ===========================================================================

async function db() {
  const { getDb } = await import("./firestore");
  return getDb();
}

class FirestoreStore implements Store {
  readonly kind = "firestore" as const;
  constructor(readonly tenantId: string) {}

  private async col(name: string) {
    return (await db()).collection("tenants").doc(this.tenantId).collection(name);
  }
  private async configDoc(name: string) {
    return (await db()).collection("tenants").doc(this.tenantId).collection("config").doc(name);
  }

  async addChat(msg: Omit<ChatMessage, "id" | "createdAt"> & { createdAt?: number }) {
    const ref = (await this.col("chats")).doc();
    const chat = { ...stripUndefined(msg), id: ref.id, createdAt: msg.createdAt ?? Date.now() } as ChatMessage;
    await ref.set(chat);
    return chat;
  }
  async listChats(limit = 500) {
    const snap = await (await this.col("chats")).orderBy("createdAt", "asc").limitToLast(limit).get();
    return snap.docs.map((d) => d.data() as ChatMessage);
  }
  async getChatsByPhone(phone: string, limit = 50) {
    // limitToLast + orderBy asc → ambil N pesan TERAKHIR, bukan yang pertama.
    // Penting untuk menahan biaya token AI pada percakapan panjang.
    const snap = await (await this.col("chats"))
      .where("phone", "==", phone)
      .orderBy("createdAt", "asc")
      .limitToLast(limit)
      .get();
    return snap.docs.map((d) => d.data() as ChatMessage);
  }
  async listConversations() {
    return buildConversations(await this.listChats());
  }
  async addOrder(order: Omit<Order, "id" | "createdAt" | "updatedAt"> & { createdAt?: number }) {
    const now = Date.now();
    const ref = (await this.col("orders")).doc();
    const o = {
      ...stripUndefined(order),
      id: ref.id,
      createdAt: order.createdAt ?? now,
      updatedAt: now,
    } as Order;
    await ref.set(o);
    return o;
  }
  async listOrders(status?: OrderStatus) {
    const base = await this.col("orders");
    const q = status
      ? base.where("status", "==", status).orderBy("createdAt", "desc")
      : base.orderBy("createdAt", "desc");
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as Order);
  }
  async updateOrderStatus(id: string, status: OrderStatus) {
    const ref = (await this.col("orders")).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const updatedAt = Date.now();
    await ref.update({ status, updatedAt });
    return { ...(snap.data() as Order), status, updatedAt };
  }
  async getBusiness() {
    const snap = await (await this.configDoc("business")).get();
    return snap.exists ? (snap.data() as Business) : DEFAULT_BUSINESS;
  }
  async saveBusiness(business: Business) {
    await (await this.configDoc("business")).set(stripUndefined(business));
    return business;
  }
  async listKnowledge() {
    const snap = await (await this.col("knowledge")).orderBy("createdAt", "desc").get();
    return snap.docs.map((d) => d.data() as KnowledgeDoc);
  }
  async addKnowledge(doc: Omit<KnowledgeDoc, "id" | "createdAt">) {
    const ref = (await this.col("knowledge")).doc();
    const k = { ...stripUndefined(doc), id: ref.id, createdAt: Date.now() } as KnowledgeDoc;
    await ref.set(k);
    return k;
  }
  async deleteKnowledge(id: string) {
    await (await this.col("knowledge")).doc(id).delete();
  }
  async getBotConfig() {
    const snap = await (await this.configDoc("bot")).get();
    return snap.exists ? (snap.data() as BotConfig) : null;
  }
  async saveBotConfig(cfg: BotConfig) {
    await (await this.configDoc("bot")).set(stripUndefined(cfg));
    return cfg;
  }
  async getAIConfig() {
    const snap = await (await this.configDoc("ai")).get();
    return snap.exists ? (snap.data() as AIConfig) : null;
  }
  async saveAIConfig(cfg: AIConfig) {
    await (await this.configDoc("ai")).set(stripUndefined(cfg));
    return cfg;
  }
  async getStats() {
    const [chats, orders] = await Promise.all([this.listChats(), this.listOrders()]);
    return computeStats(chats, orders);
  }
}

class FirestorePlatformStore implements PlatformStore {
  readonly kind = "firestore" as const;

  async getTenant(tenantId: string) {
    const snap = await (await db()).collection("tenants").doc(tenantId).get();
    return snap.exists ? (snap.data() as Tenant) : null;
  }
  async getTenantByUid(uid: string) {
    const d = await db();
    const link = await d.collection("users").doc(uid).get();
    const tenantId = link.exists ? (link.data()?.tenantId as string | undefined) : undefined;
    if (tenantId) return this.getTenant(tenantId);
    // Cadangan kalau dokumen pemetaan hilang: cari berdasarkan ownerUid.
    const snap = await d.collection("tenants").where("ownerUid", "==", uid).limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as Tenant);
  }
  async getTenantByPhoneNumberId(phoneNumberId: string) {
    const snap = await (await db())
      .collection("tenants")
      .where("whatsappPhoneNumberId", "==", phoneNumberId)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as Tenant);
  }
  async createTenant(tenant: Tenant) {
    const d = await db();
    const batch = d.batch();
    batch.set(d.collection("tenants").doc(tenant.id), stripUndefined(tenant));
    batch.set(d.collection("users").doc(tenant.ownerUid), { tenantId: tenant.id });
    await batch.commit();
    return tenant;
  }
  async updateTenant(tenantId: string, patch: Partial<Tenant>) {
    const ref = (await db()).collection("tenants").doc(tenantId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const next = { ...(snap.data() as Tenant), ...stripUndefined(patch), updatedAt: Date.now() };
    await ref.set(next);
    return next;
  }
  async listTenants(limit = 500) {
    const snap = await (await db()).collection("tenants").limit(limit).get();
    return snap.docs.map((d) => d.data() as Tenant);
  }
  async getSubscription(tenantId: string) {
    const snap = await (await db()).collection("subscriptions").doc(tenantId).get();
    return snap.exists ? (snap.data() as Subscription) : null;
  }
  async listSubscriptions(limit = 500) {
    const snap = await (await db()).collection("subscriptions").limit(limit).get();
    return snap.docs.map((d) => d.data() as Subscription);
  }
  async saveSubscription(sub: Subscription) {
    await (await db()).collection("subscriptions").doc(sub.tenantId).set(stripUndefined(sub));
    return sub;
  }
  async konsumsiKuotaAI(tenantId: string, kuotaPaket: number, by = 1) {
    const d = await db();
    const ref = d.collection("subscriptions").doc(tenantId);
    // Transaksi, bukan sekadar increment: pembagian kuota↔kredit bergantung
    // pada nilai yang sedang tersimpan, jadi dua pesan yang masuk bersamaan
    // harus dibaca-tulis berurutan. Firestore mengulang sendiri saat bentrok.
    return d.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { dariPaket: 0, dariKredit: 0, sisaKredit: 0 };
      const bagi = bagiPemakaian(snap.data() as Subscription, kuotaPaket, by);
      tx.update(ref, {
        aiRepliesUsed: bagi.aiRepliesUsed,
        aiCreditsBalance: bagi.aiCreditsBalance,
        updatedAt: Date.now(),
      });
      return bagi.hasil;
    });
  }
  async tambahKreditAI(tenantId: string, jumlah: number) {
    const { FieldValue } = await import("firebase-admin/firestore");
    const ref = (await db()).collection("subscriptions").doc(tenantId);
    // Increment atomik dan hanya menyentuh dua field kredit. Penting: kalau
    // ditulis lewat saveSubscription (set seluruh dokumen), pembelian kredit
    // yang bersamaan dengan perpanjangan langganan bisa saling menimpa.
    await ref.update({
      aiCreditsBalance: FieldValue.increment(jumlah),
      aiCreditsPurchased: FieldValue.increment(jumlah),
      updatedAt: Date.now(),
    });
  }
  async createPayment(payment: Payment) {
    await (await db()).collection("payments").doc(payment.orderId).set(stripUndefined(payment));
    return payment;
  }
  async getPayment(orderId: string) {
    const snap = await (await db()).collection("payments").doc(orderId).get();
    return snap.exists ? (snap.data() as Payment) : null;
  }
  async listPendingPayments(maxUmurJam = 48) {
    // Batas umur menjaga query tetap kecil: transaksi yang sangat lama
    // hampir pasti sudah kedaluwarsa dan tidak perlu diperiksa lagi.
    const batas = Date.now() - maxUmurJam * 3_600_000;
    const snap = await (await db())
      .collection("payments")
      .where("status", "==", "pending")
      .where("createdAt", ">=", batas)
      .get();
    return snap.docs.map((d) => d.data() as Payment);
  }
  async updatePayment(orderId: string, patch: Partial<Payment>) {
    const ref = (await db()).collection("payments").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const next = { ...(snap.data() as Payment), ...stripUndefined(patch), updatedAt: Date.now() };
    await ref.set(next);
    return next;
  }
}

// ===========================================================================
// Pabrik
// ===========================================================================

const storeCache = new Map<string, Store>();

/** Store untuk satu tenant. Selalu beri tenantId hasil verifikasi token. */
export function getStore(tenantId: string): Store {
  let s = storeCache.get(tenantId);
  if (!s) {
    s = hasFirestore() ? new FirestoreStore(tenantId) : new MemoryStore(tenantId);
    storeCache.set(tenantId, s);
  }
  return s;
}

let platformCache: PlatformStore | null = null;

export function getPlatformStore(): PlatformStore {
  platformCache ??= hasFirestore() ? new FirestorePlatformStore() : new MemoryPlatformStore();
  return platformCache;
}

/** Jenis penyimpanan aktif, untuk ditampilkan di dashboard. */
export function storeKind(): "firestore" | "memory" {
  return hasFirestore() ? "firestore" : "memory";
}
