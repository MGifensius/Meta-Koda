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
  /** Local optimistic message that hasn't yet appeared on the server. The
   *  poll/refetch keeps these on screen until the server-stored copy
   *  arrives, then the optimistic one is dropped to avoid a duplicate. */
  pending?: boolean;
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

  // Restore session from localStorage. Only keep `phone` + `name` — the
  // message history comes from the server (single source of truth) so two
  // browsers using the same phone always see the same conversation.
  useEffect(() => {
    if (typeof window === "undefined" || !slug) return;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { phone: string; name: string };
      if (data.phone) setPhone(data.phone);
      if (data.name) setName(data.name);
      if (data.phone) setRegistered(true);
    } catch {
      /* ignore */
    }
  }, [slug, storageKey]);

  // Persist phone+name (NOT messages — server is source of truth)
  useEffect(() => {
    if (typeof window === "undefined" || !registered || !slug) return;
    localStorage.setItem(storageKey, JSON.stringify({ phone, name }));
  }, [registered, phone, name, slug, storageKey]);

  // Fetch messages from the server. Replaces the local list with the
  // server's view, but preserves any still-pending optimistic messages
  // (the user typed them but the POST hasn't reflected on the server yet).
  // This single function is reused for the initial load and the 4s poll.
  const refetchFromServer = async (signal?: AbortSignal): Promise<void> => {
    if (!slug || !phone) return;
    try {
      const res = await fetch(
        `${API_BASE}/demo-chat/${slug}/messages?phone=${encodeURIComponent(phone)}`,
        { signal },
      );
      if (!res.ok) return;
      const j = (await res.json()) as {
        messages: { id: string; content: string; sender: string; timestamp: string }[];
      };
      setMessages((prev) => {
        const fromServer: Msg[] = j.messages.map((m) => ({
          id: m.id,
          role:
            m.sender === "customer" ? ("me" as const) : ("bot" as const),
          text: m.content,
          ts: new Date(m.timestamp).getTime(),
        }));
        // Drop pending optimistic messages whose content already shows on
        // the server (server is now the canonical record). Anything still
        // pending and newer than the latest server message stays.
        const lastServerTs = fromServer.length
          ? fromServer[fromServer.length - 1].ts
          : 0;
        const stillPending = prev.filter(
          (p) => p.pending && (
            p.ts > lastServerTs ||
            !fromServer.some(
              (s) => s.role === p.role && s.text === p.text,
            )
          ),
        );
        return [...fromServer, ...stillPending];
      });
    } catch {
      /* silent */
    }
  };

  // Poll for new messages every 4s (catches marketing pushes / second-
  // device traffic / etc.).
  useEffect(() => {
    if (!registered || !slug || !phone) return;
    const ctrl = new AbortController();
    refetchFromServer(ctrl.signal);
    const t = setInterval(() => refetchFromServer(ctrl.signal), 4000);
    return () => {
      ctrl.abort();
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registered, slug, phone]);

  // Scroll to bottom on every new message / typing indicator. We run
  // the scroll three times — synchronously, after one frame (layout
  // pass complete), and after 100ms (covers async image/font loads).
  // Belt-and-suspenders because new messages from the 4s poll often
  // arrive before React has finished laying out the previous render.
  useEffect(() => {
    const scroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    scroll();
    const raf = requestAnimationFrame(scroll);
    const t = setTimeout(scroll, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
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
    // Optimistic local copy so the user sees their message instantly. Marked
    // `pending` — `refetchFromServer` will drop it once the server-stored
    // copy is fetched (preventing the double-message bug).
    const optimistic: Msg = {
      id: `pending-${crypto.randomUUID()}`,
      role: "me",
      text,
      ts: Date.now(),
      pending: true,
    };
    setMessages((m) => [...m, optimistic]);
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
          ...m.filter((x) => x.id !== optimistic.id),
          optimistic,
          {
            id: `error-${crypto.randomUUID()}`,
            role: "bot",
            text: `[error] ${j.detail || `HTTP ${res.status}`}`,
            ts: Date.now(),
          },
        ]);
        return;
      }
      // Server now has both the user message AND the bot reply. Refetch and
      // replace — both will appear, no duplicates.
      await refetchFromServer();
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: `error-${crypto.randomUUID()}`,
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
    // h-dvh (not min-h-screen) so the outer container is FIXED at the
    // viewport height, which lets the messages div be the actual scroll
    // container instead of the window. With min-h-screen the page grows
    // and the browser scrolls — auto-scroll-to-bottom on a non-scrolling
    // element is a no-op, which is why new messages slid off-screen.
    <div className="h-dvh flex flex-col bg-[#ECE5DD] overflow-hidden">
      {/* WhatsApp-style header */}
      <header className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3 shadow-md z-10 shrink-0">
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
        className="bg-[#F0F0F0] px-3 py-2 flex items-center gap-2 border-t border-gray-200 shrink-0"
      >
        {/* Input stays enabled while the bot is replying so the user
            can keep typing — only the submit is gated. The `if (sending)
            return` guard inside send() prevents queued double-sends. */}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ketik pesan…"
          className="flex-1 bg-white rounded-full px-4 py-2 text-[14px] focus:outline-none"
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
