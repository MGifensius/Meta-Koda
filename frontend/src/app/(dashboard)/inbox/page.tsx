"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Send, Bot, User, Headphones, RefreshCw, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/format";
import { apiFetch } from "@/lib/api-client";

type Conversation = {
  id: string;
  customer_id: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  status: string;
  platform: string;
  customers: { name: string; phone: string };
};

type Message = {
  id: string;
  conversation_id: string;
  customer_id: string;
  content: string;
  sender: string;
  timestamp: string;
  read: boolean;
};

export default function InboxPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaWrapRef = useRef<HTMLDivElement>(null);
  const lastScrolledConvRef = useRef<string>("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadNew, setUnreadNew] = useState(0);
  const prevMessageCountRef = useRef(0);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiFetch("/chat/conversations");
      const data = await res.json();
      setConvs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await apiFetch(`/chat/conversations/${convId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const markAsRead = useCallback(async (convId: string) => {
    try {
      await apiFetch(`/chat/conversations/${convId}/read`, { method: "POST" });
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      fetchMessages(selectedConvId);
      markAsRead(selectedConvId);
      const interval = setInterval(() => fetchMessages(selectedConvId), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedConvId, fetchMessages, markAsRead]);

  const getViewport = useCallback((): HTMLElement | null => {
    return (
      scrollAreaWrapRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null
    );
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const vp = getViewport();
      if (!vp) return;
      vp.scrollTo({ top: vp.scrollHeight, behavior });
      setIsAtBottom(true);
      setUnreadNew(0);
    },
    [getViewport]
  );

  // Track whether the user is near the bottom of the messages pane.
  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const handleScroll = () => {
      const distanceFromBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
      const atBottom = distanceFromBottom < 80;
      setIsAtBottom(atBottom);
      if (atBottom) setUnreadNew(0);
    };
    vp.addEventListener("scroll", handleScroll, { passive: true });
    return () => vp.removeEventListener("scroll", handleScroll);
  }, [selectedConvId, getViewport]);

  // When switching conversations: reset counters and jump to bottom instantly.
  useEffect(() => {
    if (!selectedConvId) return;
    if (lastScrolledConvRef.current !== selectedConvId) {
      lastScrolledConvRef.current = selectedConvId;
      prevMessageCountRef.current = 0;
      setUnreadNew(0);
      // Delay to next tick so messages state has rendered.
      requestAnimationFrame(() => scrollToBottom("auto"));
    }
  }, [selectedConvId, scrollToBottom]);

  // When new messages arrive in the active conversation: only auto-scroll
  // if the user is still at the bottom. Otherwise, track an unread counter
  // so we can surface a "jump to latest" button.
  useEffect(() => {
    const prev = prevMessageCountRef.current;
    const next = messages.length;
    prevMessageCountRef.current = next;
    if (next <= prev) return; // no new messages
    const delta = next - prev;
    if (isAtBottom) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    } else {
      setUnreadNew((n) => n + delta);
    }
  }, [messages, isAtBottom, scrollToBottom]);

  const selectedConv = convs.find((c) => c.id === selectedConvId);

  const filtered = convs.filter((c) =>
    (c.customers?.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.customers?.phone || "").includes(search)
  );

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConvId) return;
    try {
      await apiFetch("/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: selectedConvId,
          content: newMessage,
          sender: "agent",
        }),
      });
      setNewMessage("");
      await fetchMessages(selectedConvId);
      await fetchConversations();
    } catch (err) {
      console.error(err);
    }
  };

  const senderIcon = (sender: string) => {
    if (sender === "bot") return <Bot className="size-3.5" />;
    if (sender === "agent") return <Headphones className="size-3.5" />;
    return <User className="size-3.5" />;
  };

  const bubbleClass = (sender: string) => {
    if (sender === "customer") return "bg-muted text-foreground";
    if (sender === "bot") return "bg-blue-50 text-blue-900 border border-blue-100";
    return "bg-primary text-primary-foreground";
  };

  const statusLabel: Record<string, string> = {
    active: "Aktif",
    resolved: "Selesai",
    bot: "Bot",
  };

  const statusColor: Record<string, string> = {
    active: "text-green-700 bg-green-50",
    resolved: "text-gray-500 bg-gray-100",
    bot: "text-blue-700 bg-blue-50",
  };

  return (
    // Dashboard header is 56px (h-14), content wrapper adds py-5 (40px) →
    // carve out exactly the viewport remainder so the inbox never grows
    // beyond the screen and the input bar stays pinned to the bottom.
    <div className="flex flex-col h-[calc(100svh-theme(spacing.14)-theme(spacing.10))] min-h-0 gap-4">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <Button variant="outline" size="sm" onClick={fetchConversations}>
          <RefreshCw className="size-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-[340px_1fr] gap-4 flex-1 min-h-0">
        {/* Left: Conversation list */}
        <div className="border rounded-xl bg-card flex flex-col min-h-0">
          <div className="p-3 border-b shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Cari percakapan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            {loading && (
              <p className="text-[13px] text-muted-foreground text-center py-8">
                Loading...
              </p>
            )}
            {filtered.map((conv) => (
              <div
                key={conv.id}
                className={`px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedConvId === conv.id ? "bg-muted/50" : ""
                }`}
                onClick={() => setSelectedConvId(conv.id)}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[13px] font-medium">
                    {conv.customers?.name || conv.customers?.phone || "Unknown"}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(conv.last_message_time)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] text-muted-foreground truncate max-w-52">
                    {conv.last_message}
                  </p>
                  {conv.unread_count > 0 && (
                    <span className="text-[11px] font-medium bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-5 text-center">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {!loading && filtered.length === 0 && (
              <p className="text-[13px] text-muted-foreground text-center py-8">
                Tidak ada percakapan.
              </p>
            )}
          </ScrollArea>
        </div>

        {/* Right: Chat */}
        <div className="border rounded-xl bg-card flex flex-col min-h-0">
          {selectedConv ? (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
                <div>
                  <p className="text-[13px] font-medium">
                    {selectedConv.customers?.name || "Unknown"}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {selectedConv.customers?.phone} · {selectedConv.platform}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    statusColor[selectedConv.status] ?? ""
                  }`}
                >
                  {statusLabel[selectedConv.status] ?? selectedConv.status}
                </span>
              </div>

              {/* Messages — only this area scrolls */}
              <div ref={scrollAreaWrapRef} className="flex-1 min-h-0 relative">
                <ScrollArea className="h-full p-4">
                  <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.sender === "customer"
                          ? "justify-start"
                          : "justify-end"
                      }`}
                    >
                      <div
                        className={`max-w-[70%] rounded-xl px-3 py-2 ${bubbleClass(
                          msg.sender
                        )}`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {senderIcon(msg.sender)}
                          <span className="text-[11px] font-medium capitalize">
                            {msg.sender}
                          </span>
                        </div>
                        <p className="text-[13px] whitespace-pre-line">{msg.content}</p>
                        <p className="text-[11px] mt-1 opacity-60">
                          {formatRelativeTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <p className="text-[13px] text-muted-foreground text-center py-8">
                      Belum ada pesan.
                    </p>
                  )}
                  <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
                {!isAtBottom && (
                  <button
                    type="button"
                    onClick={() => scrollToBottom("smooth")}
                    className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-primary text-primary-foreground shadow-lg px-3 py-2 text-[12px] font-medium hover:opacity-90 transition-opacity"
                    aria-label="Scroll to latest message"
                  >
                    <ChevronDown className="size-4" />
                    {unreadNew > 0 && (
                      <span className="min-w-4 text-center">
                        {unreadNew > 99 ? "99+" : unreadNew}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Input bar — always visible */}
              <div className="px-4 py-3 border-t flex items-center gap-2 shrink-0">
                <Input
                  placeholder="Ketik pesan sebagai agent..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newMessage.trim()) {
                      sendMessage();
                    }
                  }}
                />
                <Button size="icon" onClick={sendMessage}>
                  <Send className="size-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-0">
              <p className="text-[13px] text-muted-foreground">
                Pilih percakapan untuk mulai chat.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
