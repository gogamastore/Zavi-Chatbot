"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/format";
import type { ReplySource } from "@/lib/types";
import { SourceBadge } from "@/components/ui";
import { TrialBanner } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";

interface Bubble {
  direction: "in" | "out";
  text: string;
  source?: ReplySource;
  needsHuman?: boolean;
  at: number;
}

const QUICK = ["Halo", "Jam buka", "Menu & harga", "Cara order", "Mau pesan ayam geprek 2 porsi"];

export default function SimulatorPage() {
  const [name, setName] = useState("Pengunjung");
  const [phone, setPhone] = useState("6280000000001");
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [businessName, setBusinessName] = useState("Zavi");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<{ business?: { name?: string } }>("/api/business")
      .then((d) => setBusinessName(d.business?.name ?? "Zavi"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    setMessages((m) => [...m, { direction: "in", text: trimmed, at: Date.now() }]);
    setSending(true);
    try {
      const data = await apiFetch<{ reply?: string; source?: ReplySource; needsHuman?: boolean; at?: number }>(
        "/api/simulate",
        { method: "POST", body: JSON.stringify({ phone, name, text: trimmed }) },
      );
      setMessages((m) => [
        ...m,
        {
          direction: "out",
          text: data.reply ?? "(tidak ada balasan)",
          source: data.source,
          needsHuman: data.needsHuman,
          at: data.at ?? Date.now(),
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { direction: "out", text: `⚠️ ${(err as Error).message}`, source: "system", at: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setMessages([]);
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <TrialBanner />
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulator WhatsApp</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Uji bot persis seperti pelanggan, tanpa nomor Meta. Percakapan tersimpan
            & muncul di Dashboard, Riwayat Chat, dan Pesanan.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Phone mockup */}
        <div className="mx-auto w-full max-w-[420px]">
          <div
            className="rounded-[28px] overflow-hidden shadow-xl border border-black/10"
            style={{ background: "#efeae2" }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 text-white"
              style={{ background: "var(--wa-teal)" }}
            >
              <span className="grid place-items-center w-9 h-9 rounded-full bg-white/20 font-bold">
                {businessName.charAt(0)}
              </span>
              <div className="leading-tight">
                <div className="font-semibold text-sm">{businessName}</div>
                <div className="text-[11px] text-white/70">
                  {sending ? "mengetik…" : "online"}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="chat-bg h-[460px] overflow-y-auto px-3 py-4 space-y-2">
              {messages.length === 0 && (
                <div className="text-center text-xs text-[var(--muted)] bg-white/70 rounded-lg py-2 px-3 mx-auto w-fit">
                  Mulai chat — ketik pesan atau pakai tombol cepat di bawah.
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.direction === "in" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm whitespace-pre-wrap break-words"
                    style={{
                      background: m.direction === "in" ? "var(--wa-light)" : "#ffffff",
                    }}
                  >
                    <div>{m.text}</div>
                    <div className="flex items-center gap-1.5 justify-end mt-1">
                      {m.direction === "out" && m.needsHuman && (
                        <span className="badge src-human">Perlu admin</span>
                      )}
                      {m.direction === "out" && <SourceBadge source={m.source} />}
                      <span className="text-[10px] text-black/40">{formatTime(m.at)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white rounded-lg px-3 py-2 text-sm shadow-sm text-[var(--muted)]">
                    mengetik…
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 p-2"
              style={{ background: "#f0f2f5" }}
            >
              <input
                className="flex-1 rounded-full px-4 py-2 text-sm outline-none border border-black/10 bg-white"
                placeholder="Ketik pesan…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="grid place-items-center w-10 h-10 rounded-full text-white disabled:opacity-50"
                style={{ background: "var(--wa-green)" }}
                aria-label="Kirim"
              >
                ➤
              </button>
            </form>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="card p-4">
            <div className="text-sm font-semibold mb-3">Identitas pelanggan</div>
            <label className="label">Nama</label>
            <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="label">Nomor WhatsApp</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="text-xs text-[var(--muted)] mt-2">
              Ganti nomor untuk mensimulasikan pelanggan berbeda.
            </p>
          </div>

          <div className="card p-4">
            <div className="text-sm font-semibold mb-3">Tombol cepat</div>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={sending}
                  className="btn btn-ghost text-xs"
                >
                  {q}
                </button>
              ))}
            </div>
            <button onClick={reset} className="btn btn-ghost w-full mt-3 text-xs">
              🗑️ Bersihkan layar
            </button>
            <p className="text-xs text-[var(--muted)] mt-2">
              &quot;Bersihkan layar&quot; hanya mengosongkan tampilan, riwayat tetap tersimpan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
