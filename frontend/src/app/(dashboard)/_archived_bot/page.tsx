"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function BotPage() {
  const [botEnabled, setBotEnabled] = useState(true);
  const [greeting, setGreeting] = useState("Halo! Ada yang bisa saya bantu?");
  const [personality, setPersonality] = useState("Ramah, helpful, dan menggunakan bahasa Indonesia yang sopan. Gunakan emoji secukupnya.");
  const [autoBooking, setAutoBooking] = useState(true);
  const [autoLoyalty, setAutoLoyalty] = useState(true);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [escalateKeywords, setEscalateKeywords] = useState("komplain, manager, marah, refund");

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-lg font-semibold">AI Bot</h1>

      {/* Status */}
      <div className="border rounded-lg bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Bot Status</h2>
            <p className="text-[13px] text-muted-foreground">Bot akan otomatis merespon pesan masuk dari customer</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${botEnabled ? "text-green-700 bg-green-50" : "text-gray-500 bg-gray-100"}`}>
              {botEnabled ? "Aktif" : "Nonaktif"}
            </span>
            <Switch checked={botEnabled} onCheckedChange={setBotEnabled} />
          </div>
        </div>
      </div>

      {/* Personality */}
      <div className="border rounded-lg bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium">Personality</h2>
        <div className="space-y-1.5">
          <Label>Greeting Message</Label>
          <Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={2} />
          <p className="text-[11px] text-muted-foreground">Pesan pertama yang dikirim bot saat customer baru memulai percakapan</p>
        </div>
        <div className="space-y-1.5">
          <Label>System Prompt</Label>
          <Textarea value={personality} onChange={(e) => setPersonality(e.target.value)} rows={3} />
          <p className="text-[11px] text-muted-foreground">Instruksi kepribadian dan gaya bahasa bot. Bot menggunakan Gemini API dan memahami Bahasa Indonesia + slang.</p>
        </div>
      </div>

      {/* Capabilities */}
      <div className="border rounded-lg bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium">Kemampuan</h2>
        <div className="space-y-3">
          {[
            { label: "Auto Booking", desc: "Bot bisa membuat booking otomatis dari percakapan", checked: autoBooking, set: setAutoBooking },
            { label: "Auto Loyalty Check", desc: "Bot bisa cek dan informasikan poin loyalty customer", checked: autoLoyalty, set: setAutoLoyalty },
            { label: "Reminder Reservasi", desc: "Bot kirim reminder H-1 dan H-3 jam sebelum reservasi", checked: reminderEnabled, set: setReminderEnabled },
            { label: "Feedback Request", desc: "Bot minta feedback 5 jam setelah reservasi selesai", checked: feedbackEnabled, set: setFeedbackEnabled },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">{item.label}</p>
                <p className="text-[13px] text-muted-foreground">{item.desc}</p>
              </div>
              <Switch checked={item.checked} onCheckedChange={item.set} />
            </div>
          ))}
        </div>
      </div>

      {/* Escalation */}
      <div className="border rounded-lg bg-white p-5 space-y-4">
        <h2 className="text-sm font-medium">Eskalasi</h2>
        <div className="space-y-1.5">
          <Label>Keyword Eskalasi ke Agent</Label>
          <Input value={escalateKeywords} onChange={(e) => setEscalateKeywords(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">Pisahkan dengan koma. Jika customer menyebut kata-kata ini, bot akan eskalasi ke agent manusia.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button>Simpan Perubahan</Button>
      </div>
    </div>
  );
}
