'use client';

import * as React from 'react';
import { Search, UserPlus } from 'lucide-react';
import { cn } from '@buranchi/ui';
import { formatPhoneDisplay } from '@buranchi/shared';
import { createClient } from '@/lib/supabase/browser';

export interface CustomerPickerValue {
  customer_id?: string;
  customer_full_name?: string;
  customer_phone?: string;
}

interface CustomerPickerProps {
  value: CustomerPickerValue;
  onChange: (next: CustomerPickerValue) => void;
  organizationId: string;
}

interface CustomerSuggestion {
  id: string;
  display_id: string;
  full_name: string;
  phone: string | null;
}

const inputClass =
  'h-[33px] w-full rounded-input border border-border bg-surface px-3 text-[12px] text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent';

export function CustomerPicker({ value, onChange, organizationId }: CustomerPickerProps) {
  const [mode, setMode] = React.useState<'search' | 'new'>(
    value.customer_full_name ? 'new' : 'search',
  );
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<CustomerSuggestion[]>([]);
  const [pickedLabel, setPickedLabel] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  React.useEffect(() => {
    if (mode !== 'search' || query.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    const supabase = createClient();
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, display_id, full_name, phone')
        .eq('organization_id', organizationId)
        .ilike('full_name', `%${query.trim()}%`)
        .limit(8);
      setSuggestions((data ?? []) as CustomerSuggestion[]);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, mode, organizationId]);

  function selectExisting(c: CustomerSuggestion) {
    onChange({ customer_id: c.id });
    setPickedLabel(
      `${c.display_id} · ${c.full_name}${c.phone ? ' · ' + formatPhoneDisplay(c.phone) : ''}`,
    );
    setOpen(false);
    setQuery('');
  }

  function clearPick() {
    onChange({});
    setPickedLabel(null);
  }

  if (mode === 'new') {
    return (
      <div className="space-y-2">
        <input
          aria-label="Customer name"
          className={inputClass}
          placeholder="New customer name"
          value={value.customer_full_name ?? ''}
          onChange={(e) => onChange({ ...value, customer_full_name: e.target.value })}
        />
        <input
          aria-label="Customer phone (optional)"
          className={inputClass}
          placeholder="Phone (optional)"
          value={value.customer_phone ?? ''}
          onChange={(e) => onChange({ ...value, customer_phone: e.target.value })}
        />
        <button
          type="button"
          className="text-[11px] text-accent hover:underline inline-flex items-center gap-1"
          onClick={() => {
            onChange({});
            setMode('search');
          }}
        >
          <Search className="h-3 w-3" /> Pick existing customer instead
        </button>
      </div>
    );
  }

  if (pickedLabel) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn(inputClass, 'inline-flex items-center')}>{pickedLabel}</div>
        <button
          type="button"
          className="text-[11px] text-accent hover:underline"
          onClick={clearPick}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        aria-label="Search customers"
        className={inputClass}
        placeholder="Search by name…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (suggestions.length > 0 || query.trim().length > 0) ? (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-card bg-surface shadow-popover border border-border overflow-hidden">
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-canvas border-b border-row-divider last:border-b-0"
              onClick={() => selectExisting(c)}
            >
              <p className="text-[12px] text-fg font-medium">{c.full_name}</p>
              <p className="text-[11px] text-muted font-mono">
                {c.display_id}
                {c.phone ? ` · ${formatPhoneDisplay(c.phone)}` : ''}
              </p>
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-canvas inline-flex items-center gap-2 text-[12px] text-accent"
            onClick={() => {
              setOpen(false);
              setMode('new');
            }}
          >
            <UserPlus className="h-3.5 w-3.5" /> Create new customer
          </button>
        </div>
      ) : null}
    </div>
  );
}
