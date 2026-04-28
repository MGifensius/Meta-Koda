'use client';

import * as React from 'react';
import { Clock } from 'lucide-react';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const selectClass =
  'h-[33px] rounded-input border border-border bg-surface pl-2.5 pr-7 text-[12px] text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent appearance-none cursor-pointer';

interface TimePickerProps {
  /** Value in 24-hour HH:MM format */
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}

export function TimePicker({ value, onChange, ariaLabel }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const initial = parseValue(value);
  const [draft, setDraft] = React.useState(initial);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Reset draft to current value whenever popover opens
  React.useEffect(() => {
    if (open) setDraft(parseValue(value));
  }, [open, value]);

  const display = formatDisplay(value);

  function applyDraft() {
    const hh24 = to24(draft.hour, draft.period);
    const mm = String(draft.minute).padStart(2, '0');
    const hh = String(hh24).padStart(2, '0');
    onChange(`${hh}:${mm}`);
    setOpen(false);
  }

  function cancel() {
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={ariaLabel ?? 'Choose time'}
        onClick={() => setOpen((v) => !v)}
        className="h-[33px] inline-flex items-center gap-1.5 rounded-input border border-border bg-surface px-2.5 text-[12px] text-fg hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
      >
        <Clock className="h-3.5 w-3.5 text-muted" />
        <span>{display}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          className="absolute top-full left-0 mt-1 z-20 w-[260px] rounded-card border border-border bg-surface shadow-popover p-4"
        >
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold text-center mb-2">Set time</p>
          <div className="flex justify-center mb-3">
            <ClockFace hour={draft.hour} minute={draft.minute} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <SelectField
              ariaLabel="Hour"
              value={String(draft.hour)}
              onChange={(v) => setDraft((d) => ({ ...d, hour: Number(v) }))}
            >
              {HOURS.map((h) => (
                <option key={h} value={String(h)}>
                  {String(h).padStart(2, '0')}
                </option>
              ))}
            </SelectField>
            <SelectField
              ariaLabel="Minute"
              value={String(draft.minute)}
              onChange={(v) => setDraft((d) => ({ ...d, minute: Number(v) }))}
            >
              {(MINUTES.includes(draft.minute) ? MINUTES : [...MINUTES, draft.minute].sort((a, b) => a - b)).map((m) => (
                <option key={m} value={String(m)}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </SelectField>
            <SelectField
              ariaLabel="AM or PM"
              value={draft.period}
              onChange={(v) => setDraft((d) => ({ ...d, period: v as 'AM' | 'PM' }))}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </SelectField>
          </div>
          <button
            type="button"
            onClick={applyDraft}
            className="w-full h-[33px] rounded-tile bg-fg text-white text-[12px] font-medium hover:bg-fg/90 transition-colors"
          >
            Set time
          </button>
          <button
            type="button"
            onClick={cancel}
            className="w-full mt-2 text-[12px] text-muted hover:text-fg transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass + ' w-full'}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <polyline points="6 8 10 12 14 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ClockFace({ hour, minute }: { hour: number; minute: number }) {
  // hour: 1-12; minute: 0-59
  const hourAngle = ((hour % 12) * 30) + (minute / 60) * 30; // degrees from 12
  const minuteAngle = minute * 6;
  const size = 110;
  const cx = size / 2;
  const cy = size / 2;
  const hourLen = 26;
  const minLen = 38;
  const hourX = cx + hourLen * Math.sin((hourAngle * Math.PI) / 180);
  const hourY = cy - hourLen * Math.cos((hourAngle * Math.PI) / 180);
  const minX = cx + minLen * Math.sin((minuteAngle * Math.PI) / 180);
  const minY = cy - minLen * Math.cos((minuteAngle * Math.PI) / 180);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={cx} cy={cy} r={cx - 4} fill="var(--color-surface)" stroke="var(--color-fg)" strokeWidth="2" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const x1 = cx + (cx - 8) * Math.sin(a);
        const y1 = cy - (cy - 8) * Math.cos(a);
        const x2 = cx + (cx - 14) * Math.sin(a);
        const y2 = cy - (cy - 14) * Math.cos(a);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-fg)" strokeWidth="1.5" />;
      })}
      {/* Hour hand */}
      <line x1={cx} y1={cy} x2={hourX} y2={hourY} stroke="var(--color-fg)" strokeWidth="3" strokeLinecap="round" />
      {/* Minute hand */}
      <line x1={cx} y1={cy} x2={minX} y2={minY} stroke="var(--color-fg)" strokeWidth="2" strokeLinecap="round" />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r="2.5" fill="var(--color-danger)" />
    </svg>
  );
}

function parseValue(v: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return { hour: 9, minute: 0, period: 'AM' };
  const h24 = Number(m[1]);
  const minute = Number(m[2]);
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  let hour = h24 % 12;
  if (hour === 0) hour = 12;
  return { hour, minute, period };
}

function to24(hour: number, period: 'AM' | 'PM'): number {
  if (period === 'AM') return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

function formatDisplay(v: string): string {
  const { hour, minute, period } = parseValue(v);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}
