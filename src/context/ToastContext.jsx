import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext(null)

let idSeq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  // toast({ message, type: 'success'|'error'|'info', action: { label, onClick }, duration })
  const toast = useCallback(
    (opts) => {
      const o = typeof opts === 'string' ? { message: opts } : opts
      const id = ++idSeq
      const duration = o.duration ?? (o.action ? 6000 : 2600)
      setToasts((list) => [...list, { id, type: 'success', ...o }])
      timers.current[id] = setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const styles = {
  success: { dot: 'var(--color-success)', icon: '✓' },
  error: { dot: 'var(--color-danger)', icon: '!' },
  info: { dot: 'var(--color-brand-500)', icon: 'i' },
}

function ToastItem({ toast, onDismiss }) {
  const s = styles[toast.type] || styles.success
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-ink px-3.5 py-2.5 text-sm text-white shadow-lg motion-safe:animate-[toastIn_.2s_cubic-bezier(0.16,1,0.3,1)]">
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: s.dot }}
      >
        {s.icon}
      </span>
      <span className="font-medium">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action.onClick()
            onDismiss()
          }}
          className="mr-1 rounded px-2 py-0.5 text-[13px] font-semibold text-brand-300 transition-colors hover:bg-white/10 hover:text-brand-200 cursor-pointer"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="mr-0.5 text-white/50 transition-colors hover:text-white cursor-pointer"
        aria-label="סגור"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
