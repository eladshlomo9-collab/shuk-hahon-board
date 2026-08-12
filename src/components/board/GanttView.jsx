import { useMemo } from 'react'

const DAY_MS = 24 * 60 * 60 * 1000
const ROW_H = 40 // גובה שורה בפיקסלים
const NAME_W = 200 // רוחב עמודת שמות הפריטים

// המרת מחרוזת YYYY-MM-DD לתאריך UTC נקי (חצות), עמיד לערכים חסרים/שגויים
function parseDay(s) {
  if (!s || typeof s !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return isNaN(d.getTime()) ? null : d
}

function dayDiff(a, b) {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

function fmtMonth(d) {
  return d.toLocaleDateString('he-IL', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// תצוגת גאנט / ציר זמן: סרגלים אופקיים לפי טווח תאריכים, עם תלויות.
export default function GanttView({ items, columns, cells, groups, statusLabels, dependencies = [], onOpenItem }) {
  // --- איתור מקור ציר הזמן: עדיפות לעמודת timeline, אחרת עמודת date ---
  const timelineCol = columns?.find((c) => c.type === 'timeline')
  const dateCol = !timelineCol ? columns?.find((c) => c.type === 'date') : null
  const statusCol = columns?.find((c) => c.type === 'status')

  const hasSource = !!timelineCol || !!dateCol

  // --- חישוב טווח התאריכים לכל פריט ---
  const rows = useMemo(() => {
    if (!hasSource) return []
    const out = []
    for (const it of items || []) {
      let start = null
      let end = null
      if (timelineCol) {
        const v = cells?.[`${it.id}:${timelineCol.id}`]
        start = parseDay(v?.start)
        end = parseDay(v?.end)
        if (start && !end) end = start
        if (end && !start) start = end
      } else if (dateCol) {
        const v = cells?.[`${it.id}:${dateCol.id}`]
        const d = parseDay(v?.date)
        if (d) {
          start = d
          end = d // סרגל של יום אחד
        }
      }
      out.push({ item: it, start, end })
    }
    return out
  }, [items, cells, timelineCol, dateCol, hasSource])

  const dated = rows.filter((r) => r.start && r.end)

  // --- טווח כולל + צירי זמן ---
  const axis = useMemo(() => {
    if (dated.length === 0) return null
    let min = dated[0].start
    let max = dated[0].end
    for (const r of dated) {
      if (r.start < min) min = r.start
      if (r.end > max) max = r.end
    }
    // ריווח של מספר ימים בכל קצה כדי שהסרגלים לא ייצמדו לשוליים
    const startD = new Date(min.getTime() - 2 * DAY_MS)
    const endD = new Date(max.getTime() + 3 * DAY_MS)
    const totalDays = Math.max(1, dayDiff(endD, startD))
    const shortRange = totalDays <= 31
    const pxPerDay = shortRange ? 34 : 14
    const chartW = totalDays * pxPerDay

    // עמודות רשת: ימים (לטווח קצר) או שבועות
    const ticks = []
    if (shortRange) {
      for (let i = 0; i <= totalDays; i++) {
        const d = new Date(startD.getTime() + i * DAY_MS)
        ticks.push({ x: i * pxPerDay, date: d, label: String(d.getUTCDate()) })
      }
    } else {
      // התחל מתחילת השבוע (יום ראשון) שלפני startD
      let cur = new Date(startD)
      cur.setUTCDate(cur.getUTCDate() - cur.getUTCDay())
      while (cur <= endD) {
        const x = dayDiff(cur, startD) * pxPerDay
        ticks.push({ x, date: new Date(cur), label: String(cur.getUTCDate()) })
        cur = new Date(cur.getTime() + 7 * DAY_MS)
      }
    }

    // תוויות חודשים — בתחילת כל חודש בתוך הטווח
    const months = []
    let mc = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1))
    while (mc <= endD) {
      const clamped = mc < startD ? startD : mc
      months.push({ x: dayDiff(clamped, startD) * pxPerDay, label: fmtMonth(mc) })
      mc = new Date(Date.UTC(mc.getUTCFullYear(), mc.getUTCMonth() + 1, 1))
    }

    const today = parseDay(new Date().toISOString().slice(0, 10))
    const todayX = today && today >= startD && today <= endD ? dayDiff(today, startD) * pxPerDay : null

    return { startD, endD, totalDays, pxPerDay, chartW, ticks, months, todayX, shortRange }
  }, [dated])

  // --- מיפוי צבע לקבוצה ---
  const groupColor = useMemo(
    () => Object.fromEntries((groups || []).map((g) => [g.id, g.color])),
    [groups]
  )
  const statusLabelList = statusCol?.settings?.labels || statusLabels || []
  function barColor(it) {
    if (statusCol) {
      const sid = cells?.[`${it.id}:${statusCol.id}`]?.id
      const c = statusLabelList.find((l) => l.id === sid)?.color
      if (c) return c
    }
    return groupColor[it.group_id] || 'var(--color-brand-500)'
  }

  // --- מיקום אופקי של פריט על הציר ---
  function barGeom(r) {
    if (!axis || !r.start || !r.end) return null
    const x = dayDiff(r.start, axis.startD) * axis.pxPerDay
    const days = Math.max(1, dayDiff(r.end, r.start) + 1)
    const w = days * axis.pxPerDay
    return { x, w }
  }

  // --- אינדקס שורות לפי item.id לציור התלויות ---
  const rowIndex = useMemo(() => {
    const map = {}
    rows.forEach((r, i) => {
      map[r.item.id] = i
    })
    return map
  }, [rows])

  // --- מצב ריק ---
  if (!hasSource) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-8 py-16 text-center text-ink-muted">
        תצוגת גאנט דורשת <b className="text-ink-soft">עמודת ציר זמן או תאריך</b> — הוסף אחת לבורד.
      </div>
    )
  }
  if (dated.length === 0 || !axis) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-8 py-16 text-center text-ink-muted">
        אין עדיין תאריכים בפריטים. הוסף ערכי תאריך כדי לראות את ציר הזמן.
      </div>
    )
  }

  const chartH = rows.length * ROW_H

  return (
    <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line shadow-xs">
      <div className="flex">
        {/* עמודת שמות פריטים — דביקה (בצד ימין ב-RTL) */}
        <div className="shrink-0 border-l border-line bg-surface" style={{ width: NAME_W }}>
          <div className="flex items-center border-b border-line bg-surface-2/40 px-3 text-[12px] font-medium text-ink-muted" style={{ height: 44 }}>
            פריט
          </div>
          {rows.map((r) => (
            <button
              key={r.item.id}
              onClick={() => onOpenItem?.(r.item)}
              className="flex w-full items-center gap-2 border-b border-line px-3 text-right transition-colors hover:bg-surface-2/60 cursor-pointer"
              style={{ height: ROW_H }}
              title={r.item.name || 'ללא שם'}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: barColor(r.item) }} />
              <span className={`truncate text-[13px] ${r.start ? 'text-ink' : 'text-ink-muted'}`}>
                {r.item.name || 'ללא שם'}
              </span>
            </button>
          ))}
        </div>

        {/* אזור התרשים — נגלל אופקית, מוצג שמאל-לימין לבהירות */}
        <div className="flex-1 overflow-x-auto" dir="ltr">
          <div className="relative" style={{ width: axis.chartW, minWidth: '100%' }}>
            {/* כותרת ציר הזמן: חודשים + ימים/שבועות */}
            <div className="relative border-b border-line bg-surface-2/40" style={{ height: 44 }}>
              {axis.months.map((m, i) => (
                <span
                  key={`m${i}`}
                  className="absolute top-1 text-[11.5px] font-semibold text-ink-soft"
                  style={{ left: m.x + 4 }}
                >
                  {m.label}
                </span>
              ))}
              {axis.ticks.map((t, i) => (
                <span
                  key={`t${i}`}
                  className="absolute bottom-1 -translate-x-1/2 text-[10px] text-ink-muted"
                  style={{ left: t.x }}
                >
                  {t.label}
                </span>
              ))}
            </div>

            {/* גוף התרשים */}
            <div className="relative" style={{ height: chartH }}>
              {/* קווי רשת אנכיים */}
              {axis.ticks.map((t, i) => (
                <div
                  key={`g${i}`}
                  className="absolute top-0 bottom-0 border-l border-line/60"
                  style={{ left: t.x }}
                />
              ))}

              {/* קו "היום" */}
              {axis.todayX != null && (
                <div
                  className="absolute top-0 bottom-0 z-10 w-px"
                  style={{ left: axis.todayX, background: 'var(--color-brand-500)' }}
                  title="היום"
                >
                  <span className="absolute -top-px h-1.5 w-1.5 -translate-x-1/2 rounded-full" style={{ background: 'var(--color-brand-500)' }} />
                </div>
              )}

              {/* פסי שורות + סרגלים */}
              {rows.map((r, i) => {
                const g = barGeom(r)
                return (
                  <div
                    key={r.item.id}
                    className="absolute right-0 left-0 border-b border-line"
                    style={{ top: i * ROW_H, height: ROW_H }}
                  >
                    {g && (
                      <button
                        onClick={() => onOpenItem?.(r.item)}
                        className="group absolute flex items-center overflow-hidden rounded-md px-2 shadow-xs ring-1 ring-black/5 transition-transform hover:-translate-y-px hover:shadow-sm cursor-pointer"
                        style={{
                          left: g.x,
                          width: g.w,
                          top: 7,
                          height: ROW_H - 14,
                          background: barColor(r.item),
                        }}
                        title={r.item.name || 'ללא שם'}
                      >
                        <span className="truncate text-[11.5px] font-medium text-white/95" dir="rtl">
                          {r.item.name || 'ללא שם'}
                        </span>
                      </button>
                    )}
                  </div>
                )
              })}

              {/* חיצי תלויות — SVG מעל התרשים */}
              <svg
                className="pointer-events-none absolute inset-0 z-20"
                width={axis.chartW}
                height={chartH}
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <marker
                    id="gantt-arrow"
                    viewBox="0 0 8 8"
                    refX="6"
                    refY="4"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L8,4 L0,8 z" fill="var(--color-ink-muted)" />
                  </marker>
                </defs>
                {(dependencies || []).map((dep, i) => {
                  const fromIdx = rowIndex[dep.depends_on_id]
                  const toIdx = rowIndex[dep.item_id]
                  if (fromIdx == null || toIdx == null) return null
                  const fromG = barGeom(rows[fromIdx])
                  const toG = barGeom(rows[toIdx])
                  if (!fromG || !toG) return null
                  const x1 = fromG.x + fromG.w
                  const y1 = fromIdx * ROW_H + ROW_H / 2
                  const x2 = toG.x
                  const y2 = toIdx * ROW_H + ROW_H / 2
                  const midX = Math.max(x1 + 12, (x1 + x2) / 2)
                  return (
                    <path
                      key={`d${i}`}
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="var(--color-ink-muted)"
                      strokeWidth="1.25"
                      strokeOpacity="0.6"
                      markerEnd="url(#gantt-arrow)"
                    />
                  )
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
