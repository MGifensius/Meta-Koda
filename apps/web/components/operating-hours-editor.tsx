'use client';

import * as React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { DAYS, DAY_LABELS, parseOperatingHours, serializeOperatingHours, type OperatingHours, type Day } from '@buranchi/shared';

const inputClass =
  'h-[33px] rounded-input border border-border bg-surface px-2.5 text-[12px] text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent';

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
                      <input
                        type="time"
                        value={h.open}
                        onChange={(e) => update(day, { open: e.target.value })}
                        className={inputClass}
                      />
                      <span className="text-[12px] text-muted">to</span>
                      <input
                        type="time"
                        value={h.close}
                        onChange={(e) => update(day, { close: e.target.value })}
                        className={inputClass}
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
