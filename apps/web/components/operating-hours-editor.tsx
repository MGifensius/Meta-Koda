'use client';

import * as React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { DAYS, DAY_LABELS, parseOperatingHours, serializeOperatingHours, type OperatingHours, type Day } from '@buranchi/shared';

const selectClass =
  'h-[33px] rounded-input border border-border bg-surface pl-2.5 pr-7 text-[12px] text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent appearance-none cursor-pointer bg-no-repeat bg-[right_0.5rem_center]';

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
})();

function ensureOption(time: string): string[] {
  if (TIME_OPTIONS.includes(time)) return TIME_OPTIONS;
  return [...TIME_OPTIONS, time].sort();
}

interface OperatingHoursEditorProps {
  /** form field name in the parent form (a string field that holds the serialized text) */
  name: string;
}

/**
 * Wraps a hidden RHF field of type `string`, but exposes a structured editor.
 * On any sub-field change we re-serialize and call onChange with the new string.
 */
export function OperatingHoursEditor({ name }: OperatingHoursEditorProps) {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const hours: OperatingHours = parseOperatingHours(typeof field.value === 'string' ? field.value : '');
        function update(day: Day, patch: Partial<{ closed: boolean; open: string; close: string }>) {
          const next = { ...hours, [day]: { ...hours[day], ...patch } };
          field.onChange(serializeOperatingHours(next));
        }
        return (
          <div className="rounded-input border border-border bg-surface divide-y divide-row-divider overflow-hidden">
            {DAYS.map((day) => {
              const h = hours[day];
              const openOptions = ensureOption(h.open);
              const closeOptions = ensureOption(h.close);
              return (
                <div key={day} className="grid grid-cols-[110px_70px_1fr] items-center gap-3 px-3 py-2.5">
                  <span className="text-[12px] font-medium text-fg">{DAY_LABELS[day]}</span>
                  <button
                    type="button"
                    onClick={() => update(day, { closed: !h.closed })}
                    className={`h-6 inline-flex items-center justify-center rounded-pill text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      h.closed
                        ? 'bg-row-divider text-muted hover:bg-fg/10'
                        : 'bg-success-soft text-success hover:bg-success/15'
                    }`}
                    aria-pressed={!h.closed}
                  >
                    {h.closed ? 'Closed' : 'Open'}
                  </button>
                  {h.closed ? (
                    <span className="text-[11px] text-muted">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <TimeSelect
                        value={h.open}
                        options={openOptions}
                        onChange={(v) => update(day, { open: v })}
                        ariaLabel={`${DAY_LABELS[day]} open time`}
                      />
                      <span className="text-[12px] text-muted">to</span>
                      <TimeSelect
                        value={h.close}
                        options={closeOptions}
                        onChange={(v) => update(day, { close: v })}
                        ariaLabel={`${DAY_LABELS[day]} close time`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }}
    />
  );
}

function TimeSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="relative inline-flex">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        {options.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <polyline points="6 8 10 12 14 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
