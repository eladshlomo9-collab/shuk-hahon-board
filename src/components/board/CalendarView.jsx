import { useState, useMemo } from 'react'

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

// תצוגת לוח שנה חודשי: פריטים מוצגים לפי עמודת תאריך.
export default function CalendarView({ items, dateColumn, statusColumn, statusLabels, cells }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const byDate = useMemo(() => {
    const map = {}
    if (!dateColumn) return map
    for (const it of items) {
      const d = cells[`${it.id}:${dateColumn.id}`]?.date
      if (d) (map[d] = map[d] || []).push(it)
    }
    return map
  }, [items, dateColumn, cells])

  if (!dateColumn) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-8 py-16 text-center text-ink-muted">
        תצוגת לוח שנה מציגה פריטים לפי <b className="text-ink-soft">עמודת תאריך</b>.
        <br />
        הוסף עמודה מסוג "תאריך" לבורד כדי להשתמש בה.
      </div>
    )
  }

  const labels = statusColumn?.settings?.labels || statusLabels || []
  const statusColor = (it) => {
    if (!statusColumn) return null
    const sid = cells[`${it.id}:${statusColumn.id}`]?.id
    return labels.find((l) => l.id === sid)?.color || null
  }

  const first = new Date(cursor.y, cursor.m, 1)
  const startWeekday = first.getDay() // 0=Sun
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const todayStr = new Date().toISOString().slice(0, 10)

  const cellsArr = []
  for (let i = 0; i < startWeekday; i++) cellsArr.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cellsArr.push({ d, ds })
  }
  while (cellsArr.length % 7 !== 0) cellsArr.push(null)

  const monthName = first.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })

  function shift(delta) {
    setCursor((c) => {
      const nm = c.m + delta
      return { y: c.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }
    })
  }

  return (
    <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line shadow-xs">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-[15px] font-semibold text-ink">{monthName}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer" title="חודש קודם">
            ›
          </button>
          <button
            onClick={() => {
              const d = new Date()
              setCursor({ y: d.getFullYear(), m: d.getMonth() })
            }}
            className="rounded-md px-2.5 py-1 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            היום
          </button>
          <button onClick={() => shift(1)} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer" title="חודש הבא">
            ‹
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-line bg-surface-2/40 text-center text-[12px] font-medium text-ink-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cellsArr.map((cell, i) => {
          if (!cell) return <div key={i} className="min-h-[104px] border-b border-l border-line bg-surface-2/30" />
          const dayItems = byDate[cell.ds] || []
          const isToday = cell.ds === todayStr
          return (
            <div key={i} className="min-h-[104px] border-b border-l border-line p-1.5 last:border-l-0">
              <div className="mb-1 flex justify-start px-1">
                <span
                  className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-medium ${
                    isToday ? 'bg-brand-500 text-white' : 'text-ink-soft'
                  }`}
                >
                  {cell.d}
                </span>
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, 3).map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-1.5 rounded-md bg-surface-2 px-1.5 py-1 text-[11.5px] text-ink"
                    title={it.name}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusColor(it) || 'var(--color-brand-400)' }} />
                    <span className="truncate">{it.name || 'ללא שם'}</span>
                  </div>
                ))}
                {dayItems.length > 3 && (
                  <div className="px-1.5 text-[11px] text-ink-muted">+{dayItems.length - 3} נוספים</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
