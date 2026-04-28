import { Topbar } from '@buranchi/ui';
import { requireRole } from '@/lib/auth/server';
import { CustomerForm } from './customer-form';

export default async function NewCustomerPage() {
  await requireRole(['admin', 'front_desk', 'customer_service']);
  return (
    <>
      <Topbar breadcrumb="Workspace / Customers" title="New customer" />
      <CustomerForm />
    </>
  );
}
