"use client";

import { Loader2, Check, Plus, Trash2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useRestaurantSettings,
  type FaqEntry,
  type TrainingExample,
} from "@/lib/use-restaurant-settings";

// /settings/bot — owner-curated knowledge for the AI Bot (gpt-4o-mini).
//
// Three editable surfaces, each fed into the system prompt every turn:
//   1. Welcome message + free-form Instruksi Tambahan (rules, facts).
//   2. FAQ Q/A pairs (bot answers verbatim when asked).
//   3. Training Examples (question + ideal answer + optional anti-pattern)
//      that act as few-shot demonstrations — the bot's tone, edge-case
//      handling, and "house style" track these over time. As the admin
//      keeps adding examples, the bot effectively gets trained on the
//      restaurant's preferences without paying for fine-tuning.
export default function SettingsBotPage() {
  const { settings, setSettings, update, save, loading, saving, saved } =
    useRestaurantSettings();

  const faq: FaqEntry[] = settings.bot_faq ?? [];
  const examples: TrainingExample[] = settings.bot_training_examples ?? [];

  const updateFaq = (i: number, patch: Partial<FaqEntry>) =>
    setSettings((s) => ({
      ...s,
      bot_faq: (s.bot_faq ?? []).map((it, j) =>
        j === i ? { ...it, ...patch } : it,
      ),
    }));

  const updateExample = (i: number, patch: Partial<TrainingExample>) =>
    setSettings((s) => ({
      ...s,
      bot_training_examples: (s.bot_training_examples ?? []).map((it, j) =>
        j === i ? { ...it, ...patch } : it,
      ),
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-xl bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-medium">Welcome Message</h2>
          <p className="text-[12px] text-muted-foreground">
            Pesan pertama bot saat customer baru menyapa.
          </p>
        </div>
        <Input
          value={settings.welcome_message}
          onChange={(e) => update("welcome_message", e.target.value)}
          placeholder="Halo! Selamat datang."
        />
      </div>

      <div className="border rounded-xl bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-medium">Instruksi Tambahan</h2>
          <p className="text-[12px] text-muted-foreground">
            Aturan / pengetahuan khusus restoran. Bot baca ini di setiap
            balasan dan jadi prioritas tertinggi (override default).
          </p>
        </div>
        <Textarea
          value={settings.bot_extra_instructions ?? ""}
          onChange={(e) => update("bot_extra_instructions", e.target.value)}
          rows={6}
          placeholder={
            "Contoh:\n" +
            "Private room minimum charge Rp 500.000 per meja.\n" +
            "Selalu rekomendasi dessert kalau group ≥ 4 orang.\n" +
            "Parking valet gratis di lobby."
          }
        />
      </div>

      <div className="border rounded-xl bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">FAQ Customer</h2>
            <p className="text-[12px] text-muted-foreground">
              Pertanyaan yang sering ditanya — bot akan jawab persis sesuai
              kata-kata Kakak.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSettings((s) => ({
                ...s,
                bot_faq: [...(s.bot_faq ?? []), { question: "", answer: "" }],
              }))
            }
          >
            <Plus className="size-3.5 mr-1" /> Tambah FAQ
          </Button>
        </div>
        <div className="space-y-3">
          {faq.length === 0 && (
            <p className="text-[12px] text-muted-foreground italic">
              Belum ada FAQ. Tambah pertanyaan + jawaban untuk mulai.
            </p>
          )}
          {faq.map((item, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[11px]">Pertanyaan</Label>
                  <Input
                    value={item.question}
                    placeholder="Misal: Ada parkir gratis?"
                    onChange={(e) => updateFaq(i, { question: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 mt-6"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      bot_faq: (s.bot_faq ?? []).filter((_, j) => j !== i),
                    }))
                  }
                >
                  Hapus
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Jawaban</Label>
                <Textarea
                  value={item.answer}
                  rows={2}
                  placeholder="Misal: Iya Kak, parkir gratis di lobby — ada valet."
                  onChange={(e) => updateFaq(i, { answer: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TRAINING — the "semakin sering dipakai semakin pintar" surface */}
      <div className="border rounded-xl bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="size-4 text-amber-500" />
              Training Examples
            </h2>
            <p className="text-[12px] text-muted-foreground">
              Bot pakai gpt-4o-mini. Tiap kali Kakak nemu balasan bot yang
              kurang pas, tambah 1 entry di sini: pertanyaan customer +
              jawaban yang seharusnya. Bot pelan-pelan ngikutin gaya dan
              edge-case handling Kakak. Anti-pattern (opsional) buat
              kasih tahu bot mana yang harus DIHINDARI.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSettings((s) => ({
                ...s,
                bot_training_examples: [
                  ...(s.bot_training_examples ?? []),
                  { question: "", ideal_answer: "", anti_pattern: "" },
                ],
              }))
            }
          >
            <Plus className="size-3.5 mr-1" /> Tambah Example
          </Button>
        </div>
        <div className="space-y-3">
          {examples.length === 0 && (
            <p className="text-[12px] text-muted-foreground italic">
              Belum ada training examples. Idealnya isi 5–20 contoh untuk
              ngebentuk gaya bot.
            </p>
          )}
          {examples.map((item, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[11px]">
                    Pertanyaan / pesan customer
                  </Label>
                  <Input
                    value={item.question}
                    placeholder="Misal: Mau pesen Mie Aceh"
                    onChange={(e) =>
                      updateExample(i, { question: e.target.value })
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 mt-6"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      bot_training_examples: (
                        s.bot_training_examples ?? []
                      ).filter((_, j) => j !== i),
                    }))
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Jawaban Ideal Bot</Label>
                <Textarea
                  value={item.ideal_answer}
                  rows={2}
                  placeholder="Misal: Maaf Kak, kita ga punya Mie Aceh. Tapi Mie Goreng Buranchi mirip — pedasnya juga cocok."
                  onChange={(e) =>
                    updateExample(i, { ideal_answer: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Anti-pattern (opsional) — apa yang JANGAN dilakukan
                </Label>
                <Input
                  value={item.anti_pattern ?? ""}
                  placeholder="Misal: Iya Kak, Mie Aceh tersedia. (kita ga punya menu itu)"
                  onChange={(e) =>
                    updateExample(i, { anti_pattern: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save()} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 mr-1 animate-spin" /> Menyimpan…
            </>
          ) : saved ? (
            <>
              <Check className="size-4 mr-1" /> Tersimpan!
            </>
          ) : (
            "Simpan Perubahan"
          )}
        </Button>
      </div>
    </div>
  );
}
