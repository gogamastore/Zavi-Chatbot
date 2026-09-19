"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { useSubscription } from "@/lib/hooks/useSubscription";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/simulator", label: "Simulator", icon: "💬" },
  { href: "/chats", label: "Riwayat Chat", icon: "🗂️" },
  { href: "/orders", label: "Pesanan", icon: "🛒" },
];

/** Pengaturan kini terpisah per topik, bukan satu halaman gabungan. */
const NAV_PENGATURAN = [
  { href: "/settings/bisnis", label: "Profil Bisnis", icon: "🏪" },
  { href: "/settings/bot", label: "Bot Template", icon: "🤖" },
  { href: "/settings/ai", label: "Pengaturan AI", icon: "✨" },
  { href: "/settings/whatsapp", label: "Sambungan WhatsApp", icon: "📱" },
];

const NAV_AKUN = [{ href: "/langganan", label: "Langganan", icon: "💳" }];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { user, authEnabled, logout } = useAuth();
  const { tenant, entitlement, isDemo } = useSubscription();

  // Halaman auth tampil penuh tanpa sidebar.
  if (pathname === "/login" || pathname === "/daftar") return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function keluar() {
    await logout();
    router.push("/login");
  }

  return (
    <>
      {/* Bar atas untuk layar kecil */}
      <div
        className="md:hidden flex items-center justify-between px-4 h-14 text-white"
        style={{ background: "var(--wa-teal)" }}
      >
        <Brand compact />
        <button
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          className="text-2xl leading-none"
        >
          ☰
        </button>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } md:flex md:flex-col w-full md:w-64 shrink-0 text-white md:h-screen md:sticky md:top-0 overflow-y-auto`}
        style={{ background: "var(--wa-teal)" }}
      >
        <div className="hidden md:flex items-center gap-2 px-5 h-16 border-b border-white/10">
          <Brand />
        </div>

        <nav className="flex md:flex-col gap-1 p-3">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} onGo={() => setOpen(false)} />
          ))}

          <Divider>Pengaturan</Divider>
          {NAV_PENGATURAN.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} onGo={() => setOpen(false)} />
          ))}

          <Divider>Akun</Divider>
          {NAV_AKUN.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} onGo={() => setOpen(false)} />
          ))}
        </nav>

        <div className="mt-auto p-3 border-t border-white/10 text-xs">
          {isDemo ? (
            <div className="text-white/60 px-2 py-1">Mode demo (tanpa login)</div>
          ) : user ? (
            <div className="px-2 py-1">
              <div className="font-medium truncate">{tenant?.businessName ?? "Bisnis saya"}</div>
              <div className="text-white/50 truncate">{user.email}</div>
              {entitlement && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-white/70">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: entitlement.locked ? "#f87171" : "var(--wa-green)" }}
                  />
                  {labelStatus(entitlement.status)}
                </div>
              )}
              <button onClick={keluar} className="mt-2 w-full text-left text-white/70 hover:text-white">
                Keluar
              </button>
            </div>
          ) : authEnabled ? (
            <Link href="/login" className="block px-2 py-1 text-white/80 hover:text-white">
              Masuk →
            </Link>
          ) : (
            <div className="text-white/50 px-2 py-1">Zavi · WA Assistant</div>
          )}
        </div>
      </aside>
    </>
  );
}

function labelStatus(s: string): string {
  return (
    {
      trial: "Masa percobaan",
      trial_ended: "Percobaan habis",
      pending: "Menunggu pembayaran",
      active: "Langganan aktif",
      past_due: "Jatuh tempo",
      expired: "Langganan berakhir",
    }[s] ?? s
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
  onGo,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  onGo(): void;
}) {
  return (
    <Link
      href={href}
      onClick={onGo}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function Divider({ children }: { children: string }) {
  return (
    <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-white/40">
      {children}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid place-items-center w-9 h-9 rounded-xl text-lg font-bold"
        style={{ background: "var(--wa-green)", color: "#053d36" }}
      >
        Z
      </span>
      <div className="leading-tight">
        <div className="font-bold">Zavi</div>
        {!compact && <div className="text-[11px] text-white/60">WA Assistant</div>}
      </div>
    </div>
  );
}
