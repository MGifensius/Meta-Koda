export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Day = typeof DAYS[number];

export const DAY_LABELS: Record<Day, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export interface DayHours {
  closed: boolean;
  open: string;  // 'HH:MM' 24-hour
  close: string; // 'HH:MM' 24-hour
}

export type OperatingHours = Record<Day, DayHours>;

export function defaultOperatingHours(): OperatingHours {
  return DAYS.reduce<OperatingHours>((acc, d) => {
    acc[d] = { closed: false, open: '09:00', close: '21:00' };
    return acc;
  }, {} as OperatingHours);
}

/**
 * Serialize to a readable string format that's stored in the DB and
 * readable by humans + AI:
 *
 *   Monday: 09:00-21:00
 *   Tuesday: 09:00-21:00
 *   Wednesday: Closed
 *   ...
 */
export function serializeOperatingHours(hours: OperatingHours): string {
  return DAYS.map((d) => {
    const h = hours[d];
    if (h.closed) return `${DAY_LABELS[d]}: Closed`;
    return `${DAY_LABELS[d]}: ${h.open}-${h.close}`;
  }).join('\n');
}

const LINE_RE = /^([A-Za-z]+):\s*(Closed|(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2}))/i;

export function parseOperatingHours(text: string | null | undefined): OperatingHours {
  const result = defaultOperatingHours();
  if (!text) return result;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(LINE_RE);
    if (!m) continue;
    const dayName = m[1]!.toLowerCase();
    const day = DAYS.find((d) => d === dayName);
    if (!day) continue;
    if (m[2]!.toLowerCase() === 'closed') {
      result[day] = { closed: true, open: '09:00', close: '21:00' };
    } else {
      const open = padTime(m[3]!);
      const close = padTime(m[4]!);
      result[day] = { closed: false, open, close };
    }
  }
  return result;
}

function padTime(t: string): string {
  const [hStr, mStr] = t.split(':');
  const h = String(Number(hStr)).padStart(2, '0');
  const m = (mStr ?? '00').padStart(2, '0');
  return `${h}:${m}`;
}
