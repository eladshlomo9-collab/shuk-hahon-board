import Modal from '../ui/Modal'

const SHORTCUTS = [
  { keys: ['/'], desc: 'מעבר לשורת החיפוש' },
  { keys: ['N'], desc: 'הוספת פריט חדש (בתצוגת טבלה)' },
  { keys: ['1'], desc: 'תצוגת טבלה' },
  { keys: ['2'], desc: 'תצוגת קנבן' },
  { keys: ['3'], desc: 'תצוגת לוח שנה' },
  { keys: ['?'], desc: 'פתיחת/סגירת חלון זה' },
]

export default function ShortcutsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="קיצורי מקלדת">
      <div className="space-y-1">
        {SHORTCUTS.map((s) => (
          <div key={s.desc} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-surface-2">
            <span className="text-sm text-ink-soft">{s.desc}</span>
            <span className="flex gap-1">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="min-w-7 rounded-md bg-surface-2 px-2 py-1 text-center text-[12px] font-semibold text-ink ring-1 ring-line"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-muted">הקיצורים פעילים כשאינך מקליד בתוך שדה.</p>
    </Modal>
  )
}
