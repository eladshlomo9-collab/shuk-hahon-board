import { Fragment, useState } from 'react'

export function SecondaryChip({ label, value, accent = 'var(--color-ink)' }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface px-5 py-4 ring-1 ring-line">
      <span className="text-[14px] text-ink-soft">{label}</span>
      <span className="num text-[25px] font-extrabold" style={{ color: accent }}>
        {value}
      </span>
    </div>
  )
}

export function EmptyState({ title, desc, cta, onCta }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-surface px-6 py-14 text-center ring-1 ring-line">
      <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-[22px]">📊</div>
      <div className="text-[15.5px] font-semibold text-ink">{title}</div>
      {desc && <p className="mx-auto mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-muted">{desc}</p>}
      {cta && (
        <button
          onClick={onCta}
          className="mt-4 rounded-lg bg-brand-50 px-4 py-2.5 text-[14px] font-semibold text-brand-600 transition-colors hover:bg-brand-100 cursor-pointer"
        >
          {cta}
        </button>
      )}
    </div>
  )
}

export function ChartCard({ title, data, unit = '' }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
      <h3 className="mb-5 text-[16.5px] font-bold text-ink">{title}</h3>
      {data.length === 0 ? (
        <EmptyState title="אין עדיין מספיק נתונים" desc="ברגע שתתחילו למלא נתונים בבורדים, הפילוח יופיע כאן." />
      ) : (
        <div className="space-y-3.5">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-3.5">
              <span className="w-24 shrink-0 truncate text-[14px] text-ink-soft sm:w-36 md:w-44" title={d.label}>
                {d.label}
              </span>
              <div className="h-[26px] flex-1 overflow-hidden rounded-md bg-track">
                <div
                  className="h-full rounded-md transition-all"
                  style={{ width: `${Math.max(8, (d.value / max) * 100)}%`, background: d.color }}
                />
              </div>
              <span className="num w-10 shrink-0 text-left text-[14px] font-bold" style={{ color: d.value > 0 ? undefined : 'var(--color-ink-muted)' }}>
                {Math.round(d.value * 10) / 10}{unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DonutCard({ title, data }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  let acc = 0
  const stops = data.map((d) => {
    const from = total ? (acc / total) * 360 : 0
    acc += d.value
    const to = total ? (acc / total) * 360 : 0
    return `${d.color} ${from}deg ${to}deg`
  })
  return (
    <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
      <h3 className="mb-5 text-[16.5px] font-bold text-ink">{title}</h3>
      {total === 0 ? (
        <EmptyState title="אין עדיין מספיק נתונים" desc="הוסיפו סטטוס לפריטים בטבלה כדי לראות כאן פילוח." />
      ) : (
        <div className="flex items-center gap-7">
          <div
            className="flex h-[136px] w-[136px] shrink-0 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(${stops.join(',')})` }}
          >
            <div className="flex h-[86px] w-[86px] flex-col items-center justify-center rounded-full bg-surface">
              <span className="num text-[25px] font-extrabold leading-none text-ink">{total}</span>
              <span className="mt-1 text-[11px] text-ink-muted">פריטים</span>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            {data.map((d) => (
              <div key={d.label} className="flex items-center gap-2.5">
                <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: d.color }} />
                <span className="flex-1 truncate text-[14px] text-ink-soft" title={d.label}>{d.label}</span>
                <span className="num text-[14px] font-bold text-ink">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AreaTrendChart({ title, data }) {
  const max = Math.max(1, ...data.map((d) => d.savedHours))
  const w = 640
  const h = 96
  const step = data.length > 1 ? w / (data.length - 1) : w
  const points = data.map((d, i) => [i * step, h - (d.savedHours / max) * (h - 10)])
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
  const area = `${line} L${points[points.length - 1][0]} ${h} L0 ${h} Z`
  return (
    <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16.5px] font-bold text-ink">{title}</h3>
        <span className="text-[13px] text-ink-muted">שעות שנחסכו · {data.length} חודשים אחרונים</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-28 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="dashTrendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-brand-500)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--color-brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#dashTrendGradient)" />
        <path d={line} fill="none" stroke="var(--color-brand-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 flex justify-between text-[12px] text-ink-muted">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  )
}

// טבלת פירוט חודשי — אותן עמודות שמופיעות בייצוא לאקסל (חודש, שעות, התייעלות, אפקטיבית),
// כדי שהתצוגה בדשבורד תתאים לתצוגה בקובץ המיוצא. כשיש topItems (רק בתצוגת בורד
// מסונן — לא בתצוגה הארגונית) אפשר להרחיב שורת חודש ולראות אילו משימות בודדות
// תרמו הכי הרבה לחיסכון של אותו חודש.
export function MonthlyTrendTable({ data }) {
  const [expanded, setExpanded] = useState(() => new Set())
  if (!data.length) return null
  const hasTopItems = data.some((m) => m.topItems?.length)

  function toggle(label) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
      <h3 className="mb-4 text-[16.5px] font-bold text-ink">פירוט חודשי</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-right text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-[12px] font-medium text-ink-muted">
              {hasTopItems && <th className="w-8 px-3 py-2 font-medium" />}
              <th className="px-3 py-2 font-medium">חודש</th>
              <th className="px-3 py-2 font-medium">שעות שנחסכו</th>
              <th className="px-3 py-2 font-medium">התייעלות</th>
              <th className="px-3 py-2 font-medium">אפקטיבית</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => {
              const isOpen = expanded.has(m.label)
              const canExpand = m.topItems?.length > 0
              return (
                <Fragment key={m.label}>
                  <tr
                    className={`border-b border-line last:border-0 ${canExpand ? 'cursor-pointer hover:bg-surface-2' : ''}`}
                    onClick={canExpand ? () => toggle(m.label) : undefined}
                  >
                    {hasTopItems && (
                      <td className="px-3 py-3 text-ink-muted">
                        {canExpand && <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>}
                      </td>
                    )}
                    <td className="px-3 py-3 font-medium text-ink">{m.label}</td>
                    <td className="num px-3 py-3 text-ink-soft">{m.savedHours} ש׳</td>
                    <td className="num px-3 py-3 font-semibold text-brand-600">{m.efficiencyPct}%</td>
                    <td className="num px-3 py-3 font-bold text-ink">{m.effectivePct == null ? '—' : `${m.effectivePct}%`}</td>
                  </tr>
                  {isOpen && canExpand && (
                    <tr className="border-b border-line bg-surface-2 last:border-0">
                      <td colSpan={hasTopItems ? 5 : 4} className="px-3 py-3">
                        <div className="text-[12px] font-medium text-ink-muted">המשימות שתרמו הכי הרבה לחיסכון של החודש</div>
                        <ul className="mt-2 space-y-1.5">
                          {m.topItems.map((t, i) => (
                            <li key={i} className="flex items-center justify-between gap-3 text-[13px]">
                              <span className="truncate text-ink-soft">{t.name}</span>
                              <span className="num shrink-0 font-semibold text-ink">{t.hours} ש׳</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {data.some((m) => m.effectivePct == null) && (
        <p className="mt-3 text-[12px] text-ink-muted">— בעמודת "אפקטיבית" מציין חודש שעדיין לא הוגדר לו נתח AI.</p>
      )}
    </div>
  )
}
