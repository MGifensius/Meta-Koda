// Operating-hours math, mirrored from backend/app/services/bot.py:operating_hours.
// Closing time is the source of truth:
//   • last order   = closing − 30 minutes
//   • last booking = closing − 60 minutes  (= last order − 30)
// `opening_hours` arrives as "HH:MM - HH:MM"; everything else is derived.

export type OperatingHours = {
  openMin: number;
  closeMin: number;
  lastOrderMin: number;
  lastBookingMin: number;
  openStr: string;
  closeStr: string;
  lastOrderStr: string;
  lastBookingStr: string;
  hoursStr: string;
};

function parseHHMM(s: string | null | undefined, fallback: number): number {
  if (!s) return fallback;
  const [h, m] = s.trim().split(":");
  const hh = Number(h);
  const mm = m == null ? 0 : Number(m);
  if (!Number.isFinite(hh)) return fallback;
  return hh * 60 + (Number.isFinite(mm) ? mm : 0);
}

function formatHHMM(totalMinutes: number): string {
  const h = ((totalMinutes / 60) | 0) % 24;
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function deriveOperatingHours(
  openingHours: string | null | undefined,
): OperatingHours {
  const raw = (openingHours || "11:00 - 22:00").trim();
  let openStr = "11:00";
  let closeStr = "22:00";
  if (raw.includes(" - ")) {
    const [a, b] = raw.split(" - ", 2);
    openStr = a.trim();
    closeStr = b.trim();
  }
  const openMin = parseHHMM(openStr, 11 * 60);
  const closeMin = parseHHMM(closeStr, 22 * 60);
  const lastOrderMin = closeMin - 30;
  const lastBookingMin = closeMin - 60;
  return {
    openMin,
    closeMin,
    lastOrderMin,
    lastBookingMin,
    openStr: formatHHMM(openMin),
    closeStr: formatHHMM(closeMin),
    lastOrderStr: formatHHMM(lastOrderMin),
    lastBookingStr: formatHHMM(lastBookingMin),
    hoursStr: `${formatHHMM(openMin)} - ${formatHHMM(closeMin)}`,
  };
}

// Time slots customers can book — every 30 min from open to last_booking,
// inclusive of last_booking (since last_booking is the policy maximum).
export function bookingTimeSlots(openingHours: string | null | undefined): string[] {
  const hrs = deriveOperatingHours(openingHours);
  const out: string[] = [];
  for (let t = hrs.openMin; t <= hrs.lastBookingMin; t += 30) {
    out.push(formatHHMM(t));
  }
  return out;
}
