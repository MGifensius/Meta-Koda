'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

const INTERVAL_MS = 30_000;

export function FloorAutoRefresh() {
  const router = useRouter();
  React.useEffect(() => {
    const handle = setInterval(() => router.refresh(), INTERVAL_MS);
    return () => clearInterval(handle);
  }, [router]);
  return null;
}
