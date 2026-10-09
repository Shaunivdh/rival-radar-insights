'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-canvas px-6">
      <div className="card-surface rounded-2xl p-10 text-center max-w-md">
        <h1 className="font-display mb-3 text-3xl font-bold">Something went wrong</h1>
        <p className="mb-6 text-muted-foreground">
          We hit an unexpected problem loading this page. Please try again; if it keeps happening,
          let us know through the contact page.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Return to home</Link>
          </Button>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
