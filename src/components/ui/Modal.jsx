import { useEffect, useId, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, children, width = 'max-w-md' }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const previouslyFocused = useRef(null)
  // onClose הוא לרוב פונקציה אינליין חדשה בכל רינדור של ההורה (onClose={() => setX(false)}) —
  // שומרים אותה ב-ref במקום בתלויות ה-effect, כדי שהקשה בשדה טופס בתוך המודל (שמרנדרת את
  // ההורה) לא תפעיל מחדש את ה-effect ותגזול את הפוקוס בחזרה לכפתור הסגירה באמצע הקלדה.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // ניהול פוקוס: בפתיחה — שומרים את האלמנט הפעיל ומעבירים פוקוס לתוך המודל;
  // בסגירה — מחזירים את הפוקוס לאלמנט שפתח את המודל (נגישות מקלדת/קורא-מסך).
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement
    const panel = panelRef.current
    const focusable = panel?.querySelector(FOCUSABLE)
    ;(focusable || panel)?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[40] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] motion-safe:animate-[fadeIn_.15s_ease-out]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${width} z-[50] rounded-xl bg-surface p-6 shadow-lg ring-1 ring-line outline-none motion-safe:animate-[popIn_.18s_cubic-bezier(0.16,1,0.3,1)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="-m-1 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            aria-label="סגור"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  )
}
