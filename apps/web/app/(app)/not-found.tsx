import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button, Card } from '@buranchi/ui';

export default function AppNotFound() {
  return (
    <div className="grid place-items-center min-h-[60vh]">
      <Card className="max-w-md text-center space-y-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-tile border border-border bg-canvas mx-auto">
          <Compass className="h-5 w-5 text-muted" />
        </div>
        <h2 className="text-title text-fg">Page not found</h2>
        <p className="text-[12px] text-muted">The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.</p>
        <div className="pt-2">
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
