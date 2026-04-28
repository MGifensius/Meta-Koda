import { Topbar } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { BookingForm } from '@/components/booking-form';

export default async function NewBookingPage() {
  const profile = await requireRole(['admin', 'front_desk']);
  return (
    <>
      <Topbar breadcrumb="Workspace / Bookings" title="New booking" backHref="/bookings" />
      <BookingForm organizationId={profile.organization_id} />
    </>
  );
}
