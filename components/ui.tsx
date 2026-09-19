import type { OrderStatus, ReplySource } from "@/lib/types";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  baru: "Baru",
  diproses: "Diproses",
  selesai: "Selesai",
  batal: "Batal",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABEL[status]}</span>;
}

const SOURCE_LABEL: Record<ReplySource, string> = {
  ai: "AI",
  rule: "Rule",
  menu: "Menu",
  human: "Admin",
  system: "Sistem",
};

export function SourceBadge({ source }: { source?: ReplySource }) {
  if (!source) return null;
  return <span className={`badge src-${source}`}>{SOURCE_LABEL[source]}</span>;
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="text-center text-sm text-[var(--muted)] py-12">{text}</div>
  );
}
