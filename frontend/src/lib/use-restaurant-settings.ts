"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export type TrainingExample = {
  question: string;
  ideal_answer: string;
  anti_pattern?: string;
};

export type FaqEntry = {
  question: string;
  answer: string;
};

export type RestaurantSettings = {
  name: string;
  tagline: string;
  opening_hours: string;
  last_order: string;
  days_open: string;
  location: string;
  phone: string;
  instagram: string;
  promo_text: string;
  welcome_message: string;
  bot_extra_instructions?: string;
  bot_faq?: FaqEntry[];
  bot_training_examples?: TrainingExample[];
};

const DEFAULTS: RestaurantSettings = {
  name: "",
  tagline: "",
  opening_hours: "11:00 - 22:00",
  last_order: "21:30",
  days_open: "Setiap hari",
  location: "",
  phone: "",
  instagram: "",
  promo_text: "",
  welcome_message: "",
  bot_extra_instructions: "",
  bot_faq: [],
  bot_training_examples: [],
};

// Single source of truth for restaurant settings I/O. Each settings
// sub-page (General, Bot, Tables…) calls useRestaurantSettings() to
// load + save against the same /api/settings endpoint, with a unified
// saving / saved indicator. Avoids the previous one-mega-page that
// held every tab in a single component.
export function useRestaurantSettings() {
  const [settings, setSettings] = useState<RestaurantSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await apiFetch("/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings({ ...DEFAULTS, ...data });
      }
    } catch {
      // Ignore — defaults stay in place; UI will show empty state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(
    async (override?: Partial<RestaurantSettings>) => {
      setSaving(true);
      setSaved(false);
      try {
        const payload = { ...settings, ...override };
        const res = await apiFetch("/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
          // Reflect any server-side normalization back into local state.
          const fresh = await res.json().catch(() => null);
          if (fresh && typeof fresh === "object") {
            setSettings({ ...DEFAULTS, ...fresh });
          }
        }
      } catch {
        // Surfaces as: button stays "Simpan", no toast — caller can
        // wrap and show its own error UI if needed.
      } finally {
        setSaving(false);
      }
    },
    [settings],
  );

  const update = <K extends keyof RestaurantSettings>(
    field: K,
    value: RestaurantSettings[K],
  ) => {
    setSettings((s) => ({ ...s, [field]: value }));
  };

  return {
    settings,
    setSettings,
    update,
    save,
    refetch,
    loading,
    saving,
    saved,
  };
}
