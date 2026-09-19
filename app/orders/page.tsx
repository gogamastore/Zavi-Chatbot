"use client";

import { useEffect, useState } from "react";
import { PageHeader, StatusBadge, Empty } from "@/components/ui";
import { TrialBanner } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";
import { formatDateTime, formatPhone } from "@/lib/format";
import { ORDER_STATUSES, type Order, type OrderStatus } from "@/lib/types";

const FILTERS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "baru", label: "Baru" },
  { value: "diproses", label: "Diproses" },
  { value: "selesai", label: "Selesai" },
  { value: "batal", label: "Batal" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const q = filter === "all" ? "" : `?status=${filter}`;
    const data = await apiFetch<{ orders: Order[] }>(`/api/orders${q}`).catch(() => ({ orders: [] }));
    setOrders(data.orders ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function changeStatus(id: string, status: OrderStatus) {
    setUpdating(id);
    try {
      await apiFetch(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <TrialBanner />
      <PageHeader title="Pesanan" subtitle="Pesanan yang terdeteksi otomatis dari chat pelanggan.">
        <button className="btn btn-ghost" onClick={load}>↻ Muat ulang</button>
      </PageHeader>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`btn text-xs ${filter === f.value ? "btn-primary" : "btn-ghost"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-[var(--muted)]">Memuat…</div>
        ) : orders.length === 0 ? (
          <Empty text="Belum ada pesanan pada filter ini." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="px-4 py-3 font-medium">Pelanggan</th>
                  <th className="px-4 py-3 font-medium">Pesanan</th>
                  <th className="px-4 py-3 font-medium">Waktu</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ubah</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-[var(--border)] last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.name || "Pelanggan"}</div>
                      <div className="text-xs text-[var(--muted)]">{formatPhone(o.phone)}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="font-medium">{o.summary}</div>
                      <div className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">&ldquo;{o.rawText}&rdquo;</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3">
                      <select
                        className="select text-xs !py-1.5 w-32"
                        value={o.status}
                        disabled={updating === o.id}
                        onChange={(e) => changeStatus(o.id, e.target.value as OrderStatus)}
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
