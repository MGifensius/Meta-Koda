'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea, FormField } from '@buranchi/ui';
import { CustomerPicker, type CustomerPickerValue } from './customer-picker';
import { TableSelect } from './table-select';
import { createBookingAction, updateBookingAction } from '@/lib/actions/bookings';

interface BookingFormProps {
  id?: string;
  organizationId: string;
  defaults?: {
    customer_id?: string;
    customer_label?: string;
    table_id?: string;
    starts_at_local?: string;
    party_size?: number;
    special_request?: string;
    internal_notes?: string;
  };
}

function localDatetimeToIso(local: string): string {
  return new Date(local).toISOString();
}

export function BookingForm({ id, organizationId, defaults }: BookingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>();

  const [customer, setCustomer] = React.useState<CustomerPickerValue>(
    defaults?.customer_id ? { customer_id: defaults.customer_id } : {},
  );
  const [startsAtLocal, setStartsAtLocal] = React.useState(defaults?.starts_at_local ?? '');
  const [partySize, setPartySize] = React.useState(defaults?.party_size ?? 2);
  const [tableId, setTableId] = React.useState(defaults?.table_id ?? '');
  const [specialRequest, setSpecialRequest] = React.useState(defaults?.special_request ?? '');
  const [internalNotes, setInternalNotes] = React.useState(defaults?.internal_notes ?? '');

  const startsAt = startsAtLocal ? new Date(startsAtLocal) : null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!customer.customer_id) {
      setError('Pick or create a customer first.');
      return;
    }
    if (!startsAt) {
      setError('Pick a date and time.');
      return;
    }
    if (!tableId) {
      setError('Pick a table.');
      return;
    }
    const input = {
      customer_id: customer.customer_id,
      table_id: tableId,
      starts_at: localDatetimeToIso(startsAtLocal),
      party_size: partySize,
      ...(specialRequest ? { special_request: specialRequest } : {}),
      ...(internalNotes ? { internal_notes: internalNotes } : {}),
    };
    startTransition(async () => {
      try {
        if (id) {
          await updateBookingAction(id, input);
          router.push(`/bookings/${id}`);
        } else {
          const res = await createBookingAction(input);
          router.push(`/bookings/${res.id}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <FormField id="customer" label="Customer" required>
        <CustomerPicker
          value={customer}
          onChange={setCustomer}
          organizationId={organizationId}
        />
      </FormField>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField id="starts_at" label="Date & time" required>
          <Input
            id="starts_at"
            type="datetime-local"
            value={startsAtLocal}
            onChange={(e) => setStartsAtLocal(e.target.value)}
          />
        </FormField>
        <FormField id="party_size" label="Party size" required>
          <Input
            id="party_size"
            type="number"
            min={1}
            max={50}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
          />
        </FormField>
      </div>
      <FormField id="table_id" label="Table" required>
        <TableSelect
          value={tableId}
          onChange={setTableId}
          startsAt={startsAt}
          partySize={partySize}
          {...(id ? { excludeBookingId: id } : {})}
        />
      </FormField>
      <FormField id="special_request" label="Special request" hint="Allergies, anniversary, etc.">
        <Textarea
          id="special_request"
          value={specialRequest}
          onChange={(e) => setSpecialRequest(e.target.value)}
        />
      </FormField>
      <FormField id="internal_notes" label="Internal notes" hint="Staff-only">
        <Textarea
          id="internal_notes"
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
        />
      </FormField>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : id ? 'Save changes' : 'Create booking'}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
