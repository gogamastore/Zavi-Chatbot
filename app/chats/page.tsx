"use client";

import { useEffect, useState } from "react";
import { PageHeader, SourceBadge, Empty } from "@/components/ui";
import { TrialBanner } from "@/components/Gate";
import { apiFetch } from "@/lib/api/client";
import { formatTime, relativeTime, formatPhone } from "@/lib/format";
import type { ChatMessage, Conversation } from "@/lib/types";

export default function ChatsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadConversations() {
    const data = await apiFetch<{ conversations: Conversation[] }>("/api/chats").catch(() => ({ conversations: [] }));
    setConversations(data.conversations ?? []);
    setLoading(false);
    if (!selected && data.conversations?.length) {
      setSelected(data.conversations[0].phone);
    }
  }

  async function loadMessages(phone: string) {
    const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/chats/${encodeURIComponent(phone)}`).catch(() => ({ messages: [] }));
    setMessages(data.messages ?? []);
  }

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) loadMessages(selected);
  }, [selected]);

  const current = conversations.find((c) => c.phone === selected);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <TrialBanner />
      <PageHeader title="Riwayat Chat" subtitle="Semua percakapan pelanggan dengan bot." >
        <button className="btn btn-ghost" onClick={() => loadConversations()}>
          ↻ Muat ulang
        </button>
      </PageHeader>

      <div className="card grid md:grid-cols-[300px_1fr] overflow-hidden" style={{ height: "70vh" }}>
        {/* Conversation list */}
        <div className="border-r border-[var(--border)] overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-[var(--muted)]">Memuat…</div>
          ) : conversations.length === 0 ? (
            <Empty text="Belum ada percakapan. Coba Simulator dulu." />
          ) : (
            conversations.map((c) => (
              <button
                key={c.phone}
                onClick={() => setSelected(c.phone)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--border)] transition-colors ${
                  selected === c.phone ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm truncate">
                    {c.name || formatPhone(c.phone)}
                  </span>
                  <span className="text-[10px] text-[var(--muted)] shrink-0">
                    {relativeTime(c.lastAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {c.needsHuman && <span className="badge src-human">Perlu admin</span>}
                  <span className="text-xs text-[var(--muted)] truncate">{c.lastText}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Transcript */}
        <div className="flex flex-col min-h-0">
          {current ? (
            <>
              <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                  <div className="font-semibold">{current.name || "Pelanggan"}</div>
                  <div className="text-xs text-[var(--muted)]">{formatPhone(current.phone)}</div>
                </div>
                <span className="text-xs text-[var(--muted)]">{current.messageCount} pesan</span>
              </div>
              <div className="chat-bg flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
                    <div
                      className="max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm whitespace-pre-wrap break-words"
                      style={{ background: m.direction === "in" ? "#ffffff" : "var(--wa-light)" }}
                    >
                      <div>{m.text}</div>
                      <div className="flex items-center gap-1.5 justify-end mt-1">
                        {m.direction === "out" && m.needsHuman && (
                          <span className="badge src-human">Perlu admin</span>
                        )}
                        {m.direction === "out" && <SourceBadge source={m.source} />}
                        <span className="text-[10px] text-black/40">{formatTime(m.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty text="Pilih percakapan di kiri." />
          )}
        </div>
      </div>
    </div>
  );
}
