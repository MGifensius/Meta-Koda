'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, FormField } from '@buranchi/ui';
import { CustomerPicker, type CustomerPickerValue } from './customer-picker';
import { createWalkInAction } from '@/lib/actions/bookings';

interface SeatWalkInPopoverProps {
  tableId: string;
  organizationId: string;
  open: boolean;
  onClose: () => void;
}

const inputClass =
  'h-[33px] w-full rounded-input border border-border bg-surface px-3 text-[12px] text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent';

export function SeatWalkInPopover({
  tableId,
  organizationId,
  open,
  onClose,
}: SeatWalkInPopoverProps) {
  const router = useRouter();
  const [customer, setCustomer] = React.useState<CustomerPickerValue>({});
  const [partySize, setPartySize] = React.useState(2);
  const [specialRequest, setSpecialRequest] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (open) {
      setCustomer({});
      setPartySize(2);
      setSpecialRequest('');
      setError(undefined);
    }
  }, [open]);

  if (!open) return null;

  function submit() {
    setError(undefined);
    if (!customer.customer_id && !customer.customer_full_name) {
      setError('Pick or create a customer first.');
      return;
    }
    const input = {
      ...(customer.customer_id ? { customer_id: customer.customer_id } : {}),
      ...(customer.customer_full_name
        ? { customer_full_name: customer.customer_full_name }
        : {}),
      ...(customer.customer_phone ? { customer_phone: customer.customer_phone } : {}),
      table_id: tableId,
      party_size: partySize,
      ...(specialRequest ? { special_request: specialRequest } : {}),
    };
    startTransition(async () => {
      try {
        await createWalkInAction(input);
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    });
  }

  return (
    <div className="absolute top-full right-0 mt-1 z-20 w-[300px] rounded-card border border-border bg-surface shadow-popover p-4">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">
        Seat walk-in
      </p>
      <div className="space-y-3">
        <FormField id="walkin-customer" label="Customer" required>
          <CustomerPicker
            value={customer}
            onChange={setCustomer}
            organizationId={organizationId}
          />
        </FormField>
        <FormField id="walkin-party" label="Party size" required>
          <input
            id="walkin-party"
            type="number"
            min={1}
            max={50}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
            className={inputClass}
          />
        </FormField>
        <FormField id="walkin-special" label="Special request">
          <input
            id="walkin-special"
            type="text"
            value={specialRequest}
            onChange={(e) => setSpecialRequest(e.target.value)}
            placeholder="optional"
            className={inputClass}
          />
        </FormField>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? 'Seating…' : 'Seat'}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
