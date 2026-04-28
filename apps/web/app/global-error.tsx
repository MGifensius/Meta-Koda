'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body style={{ background: '#f3f3f7', color: '#0a0a0a', fontFamily: 'system-ui, sans-serif', padding: '64px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Something broke at the root</h2>
        <p style={{ fontSize: 12, color: '#737373', maxWidth: 480, margin: '0 auto 16px' }}>{error.message || 'A fatal error occurred. Reload the page.'}</p>
        <button
          onClick={reset}
          style={{ height: 33, padding: '0 12px', fontSize: 12, background: '#fff', border: '1px solid #0a0a0a', borderRadius: 10, cursor: 'pointer' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
