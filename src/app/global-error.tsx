'use client'

/**
 * The last resort: an error thrown by the root layout itself, where the normal
 * error page cannot render because its surrounding chrome is what failed. This
 * one has to supply its own <html> and <body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#0a0a0a', color: '#e5e5e5', fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '1.5rem', textAlign: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', margin: '0 0 0.75rem' }}>Something went wrong</h1>
            <p style={{ color: '#737373', margin: '0 0 1.5rem' }}>The site failed to start rendering.</p>
            <button
              onClick={reset}
              style={{
                background: '#D32F2F', color: '#fff', border: 0, padding: '0.6rem 1.25rem',
                textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Try again
            </button>
            {error.digest && (
              <p style={{ marginTop: '2rem', fontSize: 11, color: '#404040', fontFamily: 'monospace' }}>
                Reference: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
