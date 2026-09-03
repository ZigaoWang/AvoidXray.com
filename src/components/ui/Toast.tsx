'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

/**
 * How long a message stays up.
 *
 * Was three seconds, which is under the time it takes to read a sentence like
 * "Could not change who can see this photo" if you were not already looking at
 * the corner of the screen when it appeared.
 */
const DISMISS_AFTER_MS = 5000

/**
 * Most of what this reports is the outcome of something the reader just did.
 * More than a few at once means the oldest is still being read while the
 * newest arrives, so the stack is capped and the oldest is dropped.
 */
const MAX_VISIBLE = 3

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Held so dismissing by hand also cancels the timer, and so nothing is left
  // pending on unmount.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const nextId = useRef(0)

  const remove = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      // A counter rather than Math.random(): ids only have to be unique within
      // this provider, and a counter cannot collide.
      const id = String(nextId.current++)
      setToasts(prev => [...prev, { id, message, type }].slice(-MAX_VISIBLE))
      timers.current.set(id, setTimeout(() => remove(id), DISMISS_AFTER_MS))
    },
    [remove]
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/*
        Every outcome on this site is reported here and nowhere else: a comment
        posted, a photo that would not delete, a rate limit. None of it was
        announced. A screen reader user pressed Post and was told nothing,
        either way.

        Two regions, because the two urgencies differ. A failure interrupts —
        the thing the reader asked for did not happen. A confirmation waits its
        turn. Both wrappers stay mounted whether or not they hold anything: a
        live region inserted at the same moment as its content is not reliably
        announced, because the screen reader was not already watching it.

        The stack itself ignores pointer events and each message takes them
        back, so an empty container cannot sit over the corner of the page
        swallowing clicks.
      */}
      <div className="pointer-events-none fixed z-[60] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2
                      bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]">
        <div role="status" aria-live="polite" className="contents">
          {toasts.filter(t => t.type !== 'error').map(t => (
            <ToastRow key={t.id} toast={t} onDismiss={remove} />
          ))}
        </div>
        <div role="alert" aria-live="assertive" className="contents">
          {toasts.filter(t => t.type === 'error').map(t => (
            <ToastRow key={t.id} toast={t} onDismiss={remove} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Tone colours.
 *
 * Success and error were Tailwind's `green-600` and `red-600`, neither of
 * which appears anywhere else on the site — so the one red the reader has been
 * taught to read as "AvoidXray" was not the red used to tell them something
 * had failed.
 */
const TONE: Record<ToastType, string> = {
  error: 'bg-[#D32F2F] text-white',
  success: 'bg-[#1B5E20] text-white border border-[#2E7D32]',
  info: 'bg-neutral-800 text-white border border-neutral-700',
}

/**
 * One message.
 *
 * The row used to be a div with an onClick: not focusable, not operable from a
 * keyboard, and announcing nothing about being clickable — so the only way to
 * clear a toast was to wait it out. The close control is a real button now,
 * and the message itself is no longer clickable, because a stray click near
 * the corner of the page should not discard something still being read.
 */
function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <div
      className={`animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3
                  text-sm font-medium shadow-lg shadow-black/50 ${TONE[toast.type]}`}
    >
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="-mr-1 mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center opacity-70
                   transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline
                   focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
