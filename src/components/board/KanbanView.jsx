import { useState } from 'react'
import { getPersonIds } from '../../lib/personIds'

// תצוגת קנבן: לוח עמודות לפי עמודת סטטוס, עם גרירת כרטיסים בין עמודות.
export default function KanbanView({ items, statusColumn, statusLabels, groups, columns, cells, members, editable, onSaveCell, onOpenItem }) {
  const [dragId, setDragId] = useState(null)
  const [overLane, setOverLane] = useState(null)

  if (!statusColumn) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-8 py-16 text-center text-ink-muted">
        תצוגת קנבן מסדרת פריטים לפי <b className="text-ink-soft">עמודת סטטוס</b>.
        <br />
        הוסף עמודה מסוג "סטטוס" לבורד כדי להשתמש בה.
      </div>
    )
  }

  const labels = statusColumn.settings?.labels || statusLabels
  // עמודות הקנבן: כל תווית עם שם + עמודת "ללא סטטוס"
  const lanes = [
    ...labels.filter((l) => l.label),
    { id: '__none__', label: 'ללא סטטוס', color: 'var(--color-line-strong)' },
  ]

  const groupColor = Object.fromEntries(groups.map((g) => [g.id, g.color]))
  const personCol = columns.find((c) => c.type === 'person')
  const dateCol = columns.find((c) => c.type === 'date')

  function itemsForLane(laneId) {
    return items.filter((it) => {
      const v = cells[`${it.id}:${statusColumn.id}`]
      const sid = v?.id
      if (laneId === '__none__') return !sid || !labels.some((l) => l.id === sid && l.label)
      return sid === laneId
    })
  }

  function onDrop(laneId) {
    if (!editable || !dragId) return
    onSaveCell(dragId, statusColumn.id, laneId === '__none__' ? {} : { id: laneId })
    setDragId(null)
    setOverLane(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {lanes.map((lane) => {
        const laneItems = itemsForLane(lane.id)
        return (
          <div
            key={lane.id}
            onDragOver={(e) => {
              if (editable) {
                e.preventDefault()
                setOverLane(lane.id)
              }
            }}
            onDragLeave={() => setOverLane((l) => (l === lane.id ? null : l))}
            onDrop={() => onDrop(lane.id)}
            className={`flex max-h-[calc(100vh-230px)] w-[280px] shrink-0 flex-col rounded-xl bg-surface-2/60 ring-1 transition-colors ${
              overLane === lane.id ? 'ring-2 ring-brand-400' : 'ring-line'
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: lane.color }} />
              <span className="text-[13px] font-semibold text-ink">{lane.label}</span>
              <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-line">
                {laneItems.length}
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {laneItems.map((it) => (
                <Card
                  key={it.id}
                  item={it}
                  color={groupColor[it.group_id]}
                  people={personCol ? getPersonIds(cells[`${it.id}:${personCol.id}`]).map((uid) => members.find((m) => m.user_id === uid)).filter(Boolean) : []}
                  due={dateCol ? cells[`${it.id}:${dateCol.id}`]?.date : null}
                  editable={editable}
                  onDragStart={() => setDragId(it.id)}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverLane(null)
                  }}
                  onOpen={() => onOpenItem?.(it)}
                />
              ))}
              {laneItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-line py-6 text-center text-[12px] text-ink-muted/70">
                  ריק
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Card({ item, color, people, due, editable, onDragStart, onDragEnd, onOpen }) {
  const nameOf = (m) => m.full_name || m.email || '?'
  return (
    <div
      draggable={editable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`rounded-lg bg-surface p-3 shadow-xs ring-1 ring-line transition-shadow hover:shadow-sm hover:ring-brand-500/40 ${
        editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color || 'var(--color-line-strong)' }} />
        <span className="flex-1 text-[13.5px] font-medium leading-snug text-ink">{item.name || 'ללא שם'}</span>
      </div>
      {(people?.length > 0 || due) && (
        <div className="mt-2.5 flex items-center justify-between">
          {due ? (
            <span className="text-[11.5px] text-ink-muted">
              {new Date(due).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
            </span>
          ) : (
            <span />
          )}
          {people?.length > 0 && (
            <span className="flex items-center">
              {people.slice(0, 3).map((p, i) => (
                <span
                  key={p.user_id}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[10px] font-bold text-white ring-2 ring-surface"
                  style={{ marginInlineStart: i === 0 ? 0 : -6 }}
                  title={nameOf(p)}
                >
                  {nameOf(p).slice(0, 2).toUpperCase()}
                </span>
              ))}
              {people.length > 3 && (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[9px] font-bold text-ink-soft ring-2 ring-surface"
                  style={{ marginInlineStart: -6 }}
                >
                  +{people.length - 3}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
