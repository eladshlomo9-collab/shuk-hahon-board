// שורת כלים לבורד: חיפוש, סינון לפי סטטוס/אחראי, ומיון לפי עמודה.
export default function BoardToolbar({
  search,
  setSearch,
  filterStatus,
  setFilterStatus,
  filterPerson,
  setFilterPerson,
  sortBy,
  setSortBy,
  statusLabels,
  members,
  columns,
  onClear,
}) {
  const hasStatus = statusLabels.length > 0
  const active = search.trim() || filterStatus !== 'all' || filterPerson !== 'all' || sortBy !== 'none'
  const selectCls =
    'h-9 rounded-md bg-surface px-2.5 text-[13px] text-ink-soft ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500 cursor-pointer'

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {/* חיפוש */}
      <div className="relative">
        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="15" height="15" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש פריט..."
          className="h-9 w-56 rounded-md bg-surface pr-8 pl-3 text-[13px] text-ink ring-1 ring-line outline-none transition-shadow placeholder:text-ink-muted hover:ring-line-strong focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {hasStatus && (
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectCls} title="סינון לפי סטטוס">
          <option value="all">כל הסטטוסים</option>
          {statusLabels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      )}

      {members.length > 0 && (
        <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} className={selectCls} title="סינון לפי אחראי">
          <option value="all">כל האחראים</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name || m.email}
            </option>
          ))}
        </select>
      )}

      <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={selectCls} title="מיון">
        <option value="none">ללא מיון</option>
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            מיון לפי {c.name}
          </option>
        ))}
      </select>

      {active && (
        <button onClick={onClear} className="h-9 rounded-md px-3 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer">
          נקה
        </button>
      )}
    </div>
  )
}
