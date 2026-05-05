"use client";

/**
 * Public WhatsApp-style chat widget. Anyone with the URL
 * `/chat/<tenant-slug>` can chat with the tenant's AI bot, no auth needed.
 *
 * Used for demos when the live WhatsApp Business number isn't connected
 * yet. Conversations land in the same `conversations` / `messages` tables
 * the real WhatsApp integration uses, so they show up in the tenant's
 * `/inbox` dashboard view immediately.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Send, Loader2, MessageCircle } from "lucide-react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

type TenantInfo = {
  tenant_id: string;
  business_name: string;
  tagline: string;
  welcome_message: string;
  opening_hours: string;
};

type Msg = {
  id: string;
  role: "bot" | "me";
  text: string;
  ts: number;
};

const STORAGE_KEY_PREFIX = "meta-koda-chat:";

export default function PublicChatPage() {
  const params = useParams<{ tenant: string }>();
  const slug = params?.tenant ?? "";
  const storageKey = `${STORAGE_KEY_PREFIX}${slug}`;

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [tenantError, setTenantError] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [registered, setRegistered] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch tenant info
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/demo-chat/${slug}`);
        if (!res.ok) {
          setTenantError(
            res.status === 404
              ? "Restoran tidak ditemukan. Cek URL kamu."
              : `Error ${res.status}`,
          );
          return;
        }
        setTenant(await res.json());
      } catch {
        setTenantError("Tidak bisa terhubung ke server.");
      }
    })();
  }, [slug]);

  // Restore session from localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !slug) return;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as {
        phone: string;
        name: string;
        messages: Msg[];
      };
      setPhone(data.phone || "");
      setName(data.name || "");
      setMessages(data.messages || []);
      setRegistered(!!data.phone);
    } catch {
      /* ignore */
    }
  }, [slug, storageKey]);

  // Persist on every change
  useEffect(() => {
    if (typeof window === "undefined" || !registered || !slug) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ phone, name, messages }),
    );
  }, [registered, phone, name, messages, slug, storageKey]);

  // Poll the backend for new messages so the customer can receive replies
  // pushed from outside this chat session (e.g. marketing campaigns sent
  // by the tenant to all members / non-members). We merge by id so user
  // messages sent locally aren't duplicated when they show up server-side.
  useEffect(() => {
    if (!registered || !slug || !phone) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/demo-chat/${slug}/messages?phone=${encodeURIComponent(phone)}`,
        );
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as {
          messages: { id: string; content: string; sender: string; timestamp: string }[];
        };
        if (cancelled) return;
        setMessages((prev) => {
          // Map server messages to widget shape; preserve any local-only ids
          // we already have (not strictly needed since backend stores both
          // sides — but defensive).
          const serverIds = new Set(j.messages.map((m) => m.id));
          const localOnly = prev.filter((m) => !serverIds.has(m.id));
          const fromServer = j.messages.map((m) => ({
            id: m.id,
            role:
              m.sender === "customer" ? ("me" as const) : ("bot" as const),
            text: m.content,
            ts: new Date(m.timestamp).getTime(),
          }));
          // Sort all together by timestamp ascending
          const merged = [...fromServer, ...localOnly].sort(
            (a, b) => a.ts - b.ts,
          );
          return merged;
        });
      } catch {
        /* silent — keep polling */
      }
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [registered, slug, phone]);

  // Scroll to bottom on every new message / typing indicator. Use a
  // microtask so the DOM has rendered before we measure scrollHeight.
  useEffect(() => {
    const scroll = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    scroll();
    // Run again after layout settles — fixes mobile browsers where
    // the first scroll fires before the new message is laid out.
    const t = setTimeout(scroll, 50);
    return () => clearTimeout(t);
  }, [messages, sending]);

  const startChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !name.trim()) return;
    setRegistered(true);
    // Don't pre-populate a bot greeting — the customer should send the
    // first message, exactly like real WhatsApp. Bot will reply when
    // they do.
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const myMsg: Msg = {
      id: crypto.randomUUID(),
      role: "me",
      text,
      ts: Date.now(),
    };
    setMessages((m) => [...m, myMsg]);
    setDraft("");
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/demo-chat/${slug}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { detail?: string }));
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "bot",
            text: `[error] ${j.detail || `HTTP ${res.status}`}`,
            ts: Date.now(),
          },
        ]);
        return;
      }
      const j = await res.json();
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "bot",
          text: j.reply || "(no reply)",
          ts: Date.now(),
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "bot",
          text: "[error] Tidak bisa kirim pesan. Coba lagi.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  // ---------- Render ----------

  if (tenantError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#ECE5DD] px-4">
        <div className="bg-white rounded-2xl px-8 py-10 max-w-sm text-center shadow-md">
          <p className="text-[14px] text-red-600">{tenantError}</p>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#ECE5DD]">
        <Loader2 className="size-6 animate-spin text-[#075E54]" />
      </div>
    );
  }

  if (!registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#ECE5DD] px-4">
        <form
          onSubmit={startChat}
          className="bg-white rounded-2xl px-7 py-7 w-full max-w-sm shadow-md space-y-4"
        >
          <div className="text-center">
            <div className="size-14 rounded-full bg-[#25D366] mx-auto flex items-center justify-center mb-2">
              <MessageCircle className="size-7 text-white" />
            </div>
            <h1 className="text-[18px] font-semibold text-[#075E54]">
              {tenant.business_name}
            </h1>
            {tenant.tagline && (
              <p className="text-[12px] text-gray-500 mt-1">{tenant.tagline}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block">
              <span className="text-[12px] font-medium text-gray-700">
                Nama kamu
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="contoh: Andi"
                required
                minLength={2}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#25D366]"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-gray-700">
                Nomor WhatsApp
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\s+/g, ""))}
                placeholder="08xxxxxxxxxx"
                required
                pattern="[0-9+\-]{8,20}"
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#25D366]"
              />
              <span className="text-[11px] text-gray-500 block mt-1">
                Untuk identifikasi membership / poin loyalitas.
              </span>
            </label>
          </div>

          <button
            type="submit"
            className="w-full bg-[#25D366] hover:bg-[#1faa53] text-white font-medium py-2.5 rounded-md transition-colors text-[14px]"
          >
            Mulai Chat
          </button>

          <p className="text-[10px] text-gray-400 text-center">
            Demo — pesan akan dijawab oleh asisten AI {tenant.business_name}.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#ECE5DD]">
      {/* WhatsApp-style header */}
      <header className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3 shadow-md sticky top-0 z-10">
        <div className="size-10 rounded-full bg-[#25D366] flex items-center justify-center font-semibold">
          {tenant.business_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[15px] truncate">{tenant.business_name}</p>
          <p className="text-[11px] text-white/70 truncate">
            {sending ? "mengetik…" : "online"}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-2"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M10 0 L20 10 L10 20 L0 10 Z' fill='%23d6cdc1' fill-opacity='0.15'/%3E%3C/svg%3E\")",
        }}
      >
        {messages.length === 0 && !sending && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="bg-white/80 rounded-lg px-4 py-3 max-w-xs text-center text-[12px] text-gray-600 shadow-sm">
              Mulai chat dengan mengetik pesan di bawah 👇
              <br />
              <span className="text-[11px] text-gray-500">
                Tanya menu, jadwal buka, atau langsung reservasi.
              </span>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "me" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[78%] rounded-lg px-3 py-2 shadow-sm whitespace-pre-wrap text-[14px] leading-snug ${
                m.role === "me"
                  ? "bg-[#DCF8C6] text-gray-900 rounded-tr-none"
                  : "bg-white text-gray-900 rounded-tl-none"
              }`}
            >
              {m.text}
              <div className="text-[10px] text-gray-500 text-right mt-1">
                {new Date(m.ts).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg px-3 py-2 shadow-sm flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
              <span className="size-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:120ms]" />
              <span className="size-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:240ms]" />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="bg-[#F0F0F0] px-3 py-2 flex items-center gap-2 border-t border-gray-200"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ketik pesan…"
          disabled={sending}
          className="flex-1 bg-white rounded-full px-4 py-2 text-[14px] focus:outline-none disabled:opacity-50"
          autoFocus
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="size-10 rounded-full bg-[#25D366] hover:bg-[#1faa53] disabled:opacity-40 flex items-center justify-center transition-colors"
        >
          {sending ? (
            <Loader2 className="size-5 text-white animate-spin" />
          ) : (
            <Send className="size-5 text-white" />
          )}
        </button>
      </form>
    </div>
  );
}
