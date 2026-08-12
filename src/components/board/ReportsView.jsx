import { useMemo } from 'react'
import { pluralize } from '../../lib/pluralize'
import { getPersonIds } from '../../lib/personIds'

const isDoneLabel = (l) => l && (l.id === 'done' || (l.color || '').toLowerCase() === '#0e9e7c')

// תצוגת דוחות: סטטיסטיקות וגרפי עמודות לבורד.
export default function ReportsView({ items, groups, columns, cells, members, statusLabels, teamShare, onGoToTable }) {
  const statusCol = columns.find((c) => c.type === 'status')
  const personCol = columns.find((c) => c.type === 'person')
  const dateCol = columns.find((c) => c.type === 'date')
  const aiToolCol = columns.find((c) => c.type === 'dropdown' && c.name === 'כלי AI בשימוש')
  const aiTimeCol = columns.find((c) => c.type === 'number' && c.name === 'זמן עם AI (בדקות)')
  const manualTimeCol = columns.find((c) => c.type === 'number' && c.name === 'זמן ידני משוער (בדקות)')
  const hasEfficiencyCols = aiTimeCol && manualTimeCol

  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let overdue = 0
    let dueWeek = 0
    let assigned = 0
    let done = 0
    for (const it of items) {
      let isDone = false
      if (statusCol) {
        const sid = cells[`${it.id}:${statusCol.id}`]?.id
        if (sid) {
          const labels = statusCol.settings?.labels || statusLabels
          isDone = isDoneLabel(labels.find((l) => l.id === sid))
          if (isDone) done++
        }
      }
      if (dateCol) {
        const d = cells[`${it.id}:${dateCol.id}`]?.date
        if (d) {
          const dt = new Date(d)
          if (dt < today) { if (!isDone) overdue++ }
          else if ((dt - today) / 86400000 <= 7) dueWeek++
        }
      }
      if (personCol && getPersonIds(cells[`${it.id}:${personCol.id}`]).length) assigned++
    }
    return { total: items.length, overdue, dueWeek, assigned, done }
  }, [items, cells, dateCol, personCol, statusCol, statusLabels])

  const byStatus = useMemo(() => {
    if (!statusCol) return null
    const labels = statusCol.settings?.labels || statusLabels
    const counts = labels.filter((l) => l.label).map((l) => ({
      label: l.label,
      color: l.color,
      value: items.filter((it) => cells[`${it.id}:${statusCol.id}`]?.id === l.id).length,
    }))
    const none = items.filter((it) => {
      const sid = cells[`${it.id}:${statusCol.id}`]?.id
      return !sid || !labels.some((l) => l.id === sid && l.label)
    }).length
    if (none) counts.push({ label: 'ללא סטטוס', color: 'var(--color-line-strong)', value: none })
    return counts
  }, [items, cells, statusCol, statusLabels])

  const byPerson = useMemo(() => {
    if (!personCol) return null
    const counts = members.map((m) => ({
      label: m.full_name || m.email,
      color: 'var(--color-brand-500)',
      value: items.filter((it) => getPersonIds(cells[`${it.id}:${personCol.id}`]).includes(m.user_id)).length,
    }))
    const none = items.filter((it) => getPersonIds(cells[`${it.id}:${personCol.id}`]).length === 0).length
    if (none) counts.push({ label: 'לא משויך', color: 'var(--color-line-strong)', value: none })
    return counts.filter((c) => c.value > 0)
  }, [items, cells, personCol, members])

  const byGroup = useMemo(
    () =>
      groups.map((g) => ({
        label: g.name,
        color: g.color,
        value: items.filter((it) => it.group_id === g.id).length,
      })),
    [items, groups]
  )

  const efficiency = useMemo(() => {
    if (!hasEfficiencyCols) return null
    let totalAi = 0
    let totalManual = 0
    let tracked = 0
    for (const it of items) {
      const ai = cells[`${it.id}:${aiTimeCol.id}`]?.number
      const manual = cells[`${it.id}:${manualTimeCol.id}`]?.number
      if (ai == null && manual == null) continue
      tracked++
      totalAi += ai || 0
      totalManual += manual || 0
    }
    const savedMinutes = totalManual - totalAi
    const ratio = totalManual ? savedMinutes / totalManual : 0
    const efficiencyPct = Math.round(ratio * 100)
    const effectivePct =
      teamShare != null && teamShare > 0 ? Math.round(ratio * (teamShare / 100) * 100 * 10) / 10 : null
    return { savedHours: Math.round((savedMinutes / 60) * 10) / 10, efficiencyPct, effectivePct, tracked }
  }, [items, cells, aiTimeCol, manualTimeCol, hasEfficiencyCols, teamShare])

  const bySavedByTool = useMemo(() => {
    if (!hasEfficiencyCols || !aiToolCol) return null
    const labels = aiToolCol.settings?.labels || []
    const counts = labels
      .filter((l) => l.label)
      .map((l) => ({
        label: l.label,
        color: l.color,
        value: items.reduce((sum, it) => {
          const tid = cells[`${it.id}:${aiToolCol.id}`]?.ids?.[0]
          if (tid !== l.id) return sum
          const ai = cells[`${it.id}:${aiTimeCol.id}`]?.number || 0
          const manual = cells[`${it.id}:${manualTimeCol.id}`]?.number || 0
          return sum + Math.round(((manual - ai) / 60) * 10) / 10
        }, 0),
      }))
    return counts.filter((c) => c.value !== 0)
  }, [items, cells, aiToolCol, aiTimeCol, manualTimeCol, hasEfficiencyCols])

  const bySavedByPerson = useMemo(() => {
    if (!hasEfficiencyCols || !personCol) return null
    const counts = members.map((m) => ({
      label: m.full_name || m.email,
      color: 'var(--color-brand-500)',
      value: items.reduce((sum, it) => {
        if (!getPersonIds(cells[`${it.id}:${personCol.id}`]).includes(m.user_id)) return sum
        const ai = cells[`${it.id}:${aiTimeCol.id}`]?.number || 0
        const manual = cells[`${it.id}:${manualTimeCol.id}`]?.number || 0
        return sum + Math.round(((manual - ai) / 60) * 10) / 10
      }, 0),
    }))
    return counts.filter((c) => c.value !== 0)
  }, [items, cells, personCol, aiTimeCol, manualTimeCol, hasEfficiencyCols])

  return (
    <div className="space-y-3.5">
      {efficiency ? (
        <div className="grid gap-3.5 lg:grid-cols-[1.1fr_2fr]">
          <div className="rounded-2xl bg-sidebar p-5 text-white">
            <div className="text-[13px] font-semibold text-sidebar-muted">זמן שנחסך סה״כ</div>
            <div className="num mt-3 text-[42px] font-extrabold leading-none tracking-tight text-brand-bright">
              {efficiency.savedHours}
              <span className="ms-1 text-[16px] font-semibold text-sidebar-muted">ש׳</span>
            </div>
            <div className="mt-2.5 text-[12.5px] text-sidebar-muted">
              על פני {efficiency.tracked} {pluralize(efficiency.tracked, 'משימת AI', 'משימות עם AI')}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="סה״כ פריטים" value={stats.total} />
            <MiniStat label="הושלמו" value={stats.done} accent="var(--color-brand-500)" />
            <MiniStat label="באיחור" value={stats.overdue} accent="var(--color-danger)" />
            <MiniStat label="משימות עם AI" value={efficiency.tracked} accent="var(--color-accent-purple)" />
            <MiniStat label="יעד השבוע" value={stats.dueWeek} />
            <MiniStat
              label="התייעלות במשימות AI"
              value={`${efficiency.efficiencyPct}%`}
              accent="var(--color-brand-500)"
              sub={efficiency.effectivePct != null ? `אפקטיבית: ${efficiency.effectivePct}%` : null}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="סה״כ פריטים" value={stats.total} big />
          <MiniStat label="באיחור" value={stats.overdue} accent="var(--color-danger)" big />
          <MiniStat label="יעד השבוע" value={stats.dueWeek} accent="var(--color-warning-strong)" big />
          <MiniStat label="משויכים" value={stats.assigned} accent="var(--color-brand-500)" big />
        </div>
      )}

      <div className="grid gap-3.5 lg:grid-cols-2">
        <ChartCard title="פריטים לפי קבוצה" data={byGroup} onGoToTable={onGoToTable} />
        {bySavedByTool ? (
          <ChartCard title="שעות שנחסכו לפי כלי" data={bySavedByTool} unit=" ש׳" onGoToTable={onGoToTable} />
        ) : byStatus ? (
          <ChartCard title="פריטים לפי סטטוס" data={byStatus} onGoToTable={onGoToTable} />
        ) : null}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        {bySavedByPerson ? (
          <ChartCard title="שעות שנחסכו לפי אחראי" data={bySavedByPerson} unit=" ש׳" onGoToTable={onGoToTable} />
        ) : byPerson ? (
          <ChartCard title="פריטים לפי אחראי" data={byPerson} onGoToTable={onGoToTable} />
        ) : null}
        {bySavedByTool && byStatus && <ChartCard title="פריטים לפי סטטוס" data={byStatus} onGoToTable={onGoToTable} />}
      </div>
    </div>
  )
}

function MiniStat({ label, value, accent = 'var(--color-ink)', big = false, sub = null }) {
  return (
    <div className={`rounded-xl bg-surface ring-1 ring-line ${big ? 'p-4' : 'px-4 py-3.5'}`}>
      <div className={`text-ink-muted ${big ? 'text-[13px] font-semibold' : 'mb-1.5 text-[12.5px] font-semibold'}`}>{label}</div>
      <div className={`num font-extrabold leading-none ${big ? 'mt-2.5 text-[28px]' : 'text-[24px]'}`} style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="num mt-1.5 text-[12px] font-semibold text-ink-soft">{sub}</div>}
    </div>
  )
}

function ChartCard({ title, data, unit = '', onGoToTable }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <h3 className="mb-4 text-[15px] font-bold text-ink">{title}</h3>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-[20px]">📊</div>
          <div className="text-[14px] font-semibold text-ink">אין עדיין מספיק נתונים</div>
          <p className="mx-auto mt-1.5 max-w-[240px] text-[13px] leading-relaxed text-ink-muted">
            הוסיפו נתונים לפריטים בטבלה כדי לראות כאן פילוח.
          </p>
          {onGoToTable && (
            <button
              onClick={onGoToTable}
              className="mt-3.5 rounded-lg bg-brand-50 px-4 py-2 text-[13px] font-semibold text-brand-600 transition-colors hover:bg-brand-100 cursor-pointer"
            >
              מעבר לטבלה
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-[13px] text-ink-soft" title={d.label}>
                {d.label}
              </span>
              <div className="h-[22px] flex-1 overflow-hidden rounded-md bg-track">
                <div
                  className="h-full rounded-md transition-all"
                  style={{ width: `${Math.max(8, (d.value / max) * 100)}%`, background: d.color }}
                />
              </div>
              <span className="num w-9 shrink-0 text-left text-[13px] font-bold text-ink">
                {Math.round(d.value * 10) / 10}{unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
