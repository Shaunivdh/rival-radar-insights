'use client';

import { useEffect } from 'react';

// Replaces the root layout when it crashes, so globals.css and fonts may be missing:
// keep styling inline and self-contained.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f5f3fa',
          color: '#1f1a2e',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#6b6580', margin: '0 0 24px' }}>
            Scoutly hit an unexpected problem. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              background: '#8354D4',
              color: '#fff',
              border: 0,
              borderRadius: 12,
              padding: '10px 20px',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: 24, fontSize: 12, color: '#6b6580' }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
