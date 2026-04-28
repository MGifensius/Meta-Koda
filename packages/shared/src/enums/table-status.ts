import { z } from 'zod';

export const TableStatusSchema = z.enum([
  'available',
  'reserved',
  'occupied',
  'cleaning',
  'unavailable',
]);
export type TableStatus = z.infer<typeof TableStatusSchema>;

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  unavailable: 'Unavailable',
};

export const MANUAL_TABLE_STATUSES: readonly TableStatus[] = [
  'available',
  'cleaning',
  'unavailable',
];

export function isManualTableStatus(s: TableStatus): boolean {
  return (MANUAL_TABLE_STATUSES as readonly string[]).includes(s);
}
