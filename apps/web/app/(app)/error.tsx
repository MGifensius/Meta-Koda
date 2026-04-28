'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button, Card } from '@buranchi/ui';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid place-items-center min-h-[60vh]">
      <Card className="max-w-md text-center space-y-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-tile border border-border bg-canvas mx-auto">
          <AlertTriangle className="h-5 w-5 text-danger" />
        </div>
        <h2 className="text-title text-fg">Something went wrong</h2>
        <p className="text-[12px] text-muted">{error.message || 'An unexpected error occurred while rendering this page.'}</p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
