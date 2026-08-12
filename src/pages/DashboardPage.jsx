import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { DEFAULT_STATUS_LABELS, AI_TOOL_LABELS } from '../lib/constants'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { SecondaryChip, EmptyState, ChartCard, DonutCard, AreaTrendChart } from '../components/charts/DashboardCharts'
import { pluralize } from '../lib/pluralize'
import { getPersonIds } from '../lib/personIds'

// שולף את *כל* השורות בעמוד-אחר-עמוד, לעקוף את תקרת 1000 השורות של Supabase.
// buildQuery(from, to) מחזיר שאילתת supabase עם .range(from,to).
async function fetchAllRows(buildQuery, pageSize = 1000) {
  const all = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
  }
  return all
}

// דשבורד ארגוני — אגרגציה של נתונים מכל הבורדים שהמשתמש רואה בארגון הנוכחי.
export default function DashboardPage() {
  const { currentOrgId, currentOrg, members } = useApp()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ boards: [], items: [], columns: [], cells: {}, workspaces: [], teams: [] })

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!currentOrgId) {
        if (!cancelled) {
          setData({ boards: [], items: [], columns: [], cells: {}, workspaces: [], teams: [] })
          setLoading(false)
        }
        return
      }
      setLoading(true)

      // 1. וורקספייסים של הארגון → בורדים של אותם וורקספייסים (RLS מגביל לנראים בלבד)
      const { data: wss } = await supabase
        .from('workspaces')
        .select('id, name, team_id')
        .eq('org_id', currentOrgId)
      const workspaces = wss || []
      const wsIds = workspaces.map((w) => w.id)

      // צוותים + נתח AI (עמודה עשויה עדיין לא להתקיים לפני מיגרציה — ניפול חזרה)
      let teams = []
      let tmsRes = await supabase.from('teams').select('id, ai_work_share').eq('org_id', currentOrgId)
      if (tmsRes.error) tmsRes = await supabase.from('teams').select('id').eq('org_id', currentOrgId)
      teams = tmsRes.data || []

      let boards = []
      if (wsIds.length) {
        const { data: bs } = await supabase
          .from('boards')
          .select('id, name, workspace_id')
          .in('workspace_id', wsIds)
        boards = bs || []
      }
      const boardIds = boards.map((b) => b.id)

      if (!boardIds.length) {
        if (!cancelled) {
          setData({ boards: [], items: [], columns: [], cells: {}, workspaces: [], teams })
          setLoading(false)
        }
        return
      }

      // 2. פריטים, עמודות ו-cell_values — עם עימוד, כדי לא להיחתך ב-1000 שורות
      //    כשיש הרבה נתונים שנצברו (זו הייתה הסיבה שהדשבורד הראה נתונים חלקיים).
      const [its, cols] = await Promise.all([
        fetchAllRows((f, t) =>
          supabase
            .from('items')
            .select('id, board_id, group_id, parent_item_id, created_at')
            .in('board_id', boardIds)
            .range(f, t)
        ),
        supabase
          .from('columns')
          .select('id, board_id, name, type, settings')
          .in('board_id', boardIds)
          .in('type', ['status', 'date', 'person', 'number', 'dropdown'])
          .then((r) => r.data || []),
      ])
      // תתי-משימות לא נספרות בסטטיסטיקות הראשיות — עקבי עם כותרת הקבוצה/Kanban בבורד עצמו.
      const items = (its || []).filter((it) => !it.parent_item_id)
      const columns = cols || []
      const colIds = columns.map((c) => c.id)

      const cells = {}
      if (colIds.length) {
        // שולפים לפי column_id בלבד (רשימה קטנה) ולא לפי item_id — נמנע גם מ-URL ענק
        // עם אלפי מזהי-פריטים, וגם מתקרת השורות דרך עימוד.
        const cv = await fetchAllRows((f, t) =>
          supabase.from('cell_values').select('item_id, column_id, value').in('column_id', colIds).range(f, t)
        )
        for (const c of cv) cells[`${c.item_id}:${c.column_id}`] = c.value
      }

      if (!cancelled) {
        setData({ boards, items, columns, cells, workspaces, teams })
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentOrgId])

  const { boards, items, columns, cells, workspaces, teams } = data

  // עמודה ראשונה מכל סוג, לכל בורד
  const firstColByBoard = useMemo(() => {
    const map = {}
    for (const c of columns) {
      const m = (map[c.board_id] = map[c.board_id] || {})
      if (c.type === 'status' && !m.status) m.status = c
      if (c.type === 'date' && !m.date) m.date = c
      if (c.type === 'person' && !m.person) m.person = c
      if (c.type === 'dropdown' && c.name === 'כלי AI בשימוש' && !m.aiTool) m.aiTool = c
      if (c.type === 'number' && c.name === 'זמן עם AI (בדקות)' && !m.aiTime) m.aiTime = c
      if (c.type === 'number' && c.name === 'זמן ידני משוער (בדקות)' && !m.manualTime) m.manualTime = c
    }
    return map
  }, [columns])

  // האם תווית סטטוס נחשבת "הושלם" — צבע ירוק או id 'done'
  const isDoneLabel = (l) =>
    l && (l.id === 'done' || (l.color || '').toLowerCase() === '#0e9e7c')

  // --- סטטיסטיקות עליונות ---
  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let overdue = 0
    let done = 0
    for (const it of items) {
      const fc = firstColByBoard[it.board_id]
      if (!fc) continue
      let isDone = false
      if (fc.status) {
        const sid = cells[`${it.id}:${fc.status.id}`]?.id
        if (sid) {
          const labels = fc.status.settings?.labels || DEFAULT_STATUS_LABELS
          const lbl = labels.find((l) => l.id === sid)
          isDone = isDoneLabel(lbl)
          if (isDone) done++
        }
      }
      if (fc.date && !isDone) {
        const d = cells[`${it.id}:${fc.date.id}`]?.date
        if (d && new Date(d) < today) overdue++
      }
    }
    return { total: items.length, overdue, done, boards: boards.length }
  }, [items, cells, firstColByBoard, boards])

  // --- גרף: פריטים לפי סטטוס (מיזוג לפי שם התווית בלבד, חוצה בורדים) ---
  const byStatus = useMemo(() => {
    const map = new Map() // key: label → { label, color, value }
    let none = 0
    for (const it of items) {
      const fc = firstColByBoard[it.board_id]
      const statusCol = fc?.status
      if (!statusCol) {
        none++
        continue
      }
      const sid = cells[`${it.id}:${statusCol.id}`]?.id
      const labels = statusCol.settings?.labels || DEFAULT_STATUS_LABELS
      const lbl = sid ? labels.find((l) => l.id === sid && l.label) : null
      if (!lbl) {
        none++
        continue
      }
      const cur = map.get(lbl.label) || { label: lbl.label, color: lbl.color, value: 0 }
      cur.value++
      map.set(lbl.label, cur)
    }
    const arr = [...map.values()].sort((a, b) => b.value - a.value)
    if (none) arr.push({ label: 'ללא סטטוס', color: 'var(--color-line-strong)', value: none })
    return arr
  }, [items, cells, firstColByBoard])

  // --- גרף: עומס לפי אחראי ---
  const byPerson = useMemo(() => {
    const counts = members.map((m) => ({
      label: m.full_name || m.email,
      color: 'var(--color-brand-500)',
      value: 0,
    }))
    const byId = new Map(members.map((m, i) => [m.user_id, counts[i]]))
    let none = 0
    for (const it of items) {
      const personCol = firstColByBoard[it.board_id]?.person
      const uids = personCol ? getPersonIds(cells[`${it.id}:${personCol.id}`]) : []
      if (uids.length) {
        for (const uid of uids) if (byId.has(uid)) byId.get(uid).value++
      } else {
        none++
      }
    }
    const arr = counts.filter((c) => c.value > 0).sort((a, b) => b.value - a.value)
    if (none) arr.push({ label: 'לא משויך', color: 'var(--color-line-strong)', value: none })
    return arr
  }, [items, cells, firstColByBoard, members])

  // --- גרף: פריטים לפי בורד ---
  // כשכמה בורדים חולקים אותו שם (למשל כולם נוצרו מתבנית "מעקב התייעלות AI"),
  // מוסיפים את שם הוורקספייס כדי להבדיל ביניהם, ואם עדיין זהים — ממספרים אותם
  const byBoard = useMemo(() => {
    const wsById = new Map(workspaces.map((w) => [w.id, w.name]))
    const nameCounts = new Map()
    for (const b of boards) nameCounts.set(b.name, (nameCounts.get(b.name) || 0) + 1)

    const seenLabels = new Map()
    const counts = boards.map((b) => {
      let label = b.name
      if (nameCounts.get(b.name) > 1) {
        const wsName = wsById.get(b.workspace_id)
        label = wsName ? `${b.name} · ${wsName}` : b.name
      }
      const n = (seenLabels.get(label) || 0) + 1
      seenLabels.set(label, n)
      if (n > 1) label = `${label} (${n})`
      return {
        label,
        color: 'var(--color-accent-purple)',
        value: items.filter((it) => it.board_id === b.id).length,
      }
    })
    return counts.sort((a, b) => b.value - a.value)
  }, [items, boards, workspaces])

  // --- התייעלות AI: זמן עם AI מול זמן ידני משוער, חוצה בורדים ---
  function savedHoursFor(it) {
    const fc = firstColByBoard[it.board_id]
    if (!fc?.aiTime || !fc?.manualTime) return null
    const ai = cells[`${it.id}:${fc.aiTime.id}`]?.number
    const manual = cells[`${it.id}:${fc.manualTime.id}`]?.number
    if (ai == null && manual == null) return null
    return { ai: ai || 0, manual: manual || 0 }
  }

  const efficiency = useMemo(() => {
    let totalAi = 0
    let totalManual = 0
    let tracked = 0
    for (const it of items) {
      const v = savedHoursFor(it)
      if (!v) continue
      tracked++
      totalAi += v.ai
      totalManual += v.manual
    }
    const savedMinutes = totalManual - totalAi
    const efficiencyPct = totalManual ? Math.round((savedMinutes / totalManual) * 100) : 0
    return {
      hasData: tracked > 0,
      savedHours: Math.round((savedMinutes / 60) * 10) / 10,
      efficiencyPct,
      tracked,
    }
  }, [items, cells, firstColByBoard])

  // --- התייעלות אפקטיבית מכלל העבודה: מביא בחשבון את נתח ה-AI של הצוות ---
  // board → workspace → team → נתח. משוקלל רק על צוותים שהוגדר להם נתח.
  const effective = useMemo(() => {
    const wsTeam = new Map(workspaces.map((w) => [w.id, w.team_id]))
    const boardTeam = new Map(boards.map((b) => [b.id, wsTeam.get(b.workspace_id)]))
    const shareByTeam = new Map(teams.map((t) => [t.id, t.ai_work_share]))
    let numeratorSaved = 0 // דקות שנחסכו (על צוותים עם נתח)
    let denomWork = 0 // סך העבודה בדקות = manual / (share/100)
    const teamsWithAi = new Set()
    const teamsWithShare = new Set()
    for (const it of items) {
      const v = savedHoursFor(it)
      if (!v) continue
      const teamId = boardTeam.get(it.board_id) || null
      teamsWithAi.add(teamId)
      const share = teamId != null ? shareByTeam.get(teamId) : null
      if (share == null || share <= 0) continue
      teamsWithShare.add(teamId)
      numeratorSaved += Math.max(v.manual - v.ai, 0)
      denomWork += (v.manual * 100) / share
    }
    if (denomWork <= 0) {
      return { hasData: false, teamsWithShare: teamsWithShare.size, teamsTotal: teamsWithAi.size }
    }
    return {
      hasData: true,
      pct: Math.round((numeratorSaved / denomWork) * 100 * 10) / 10,
      teamsWithShare: teamsWithShare.size,
      teamsTotal: teamsWithAi.size,
    }
  }, [items, cells, firstColByBoard, boards, workspaces, teams])

  // --- גרף: שעות שנחסכו לפי כלי AI, חוצה בורדים ---
  const bySavedByTool = useMemo(() => {
    if (!efficiency.hasData) return null
    const map = new Map()
    for (const it of items) {
      const v = savedHoursFor(it)
      if (!v) continue
      const fc = firstColByBoard[it.board_id]
      const tid = cells[`${it.id}:${fc.aiTool?.id}`]?.ids?.[0]
      const labels = fc.aiTool?.settings?.labels || AI_TOOL_LABELS
      const lbl = tid ? labels.find((l) => l.id === tid) : null
      const label = lbl?.label || 'לא צוין'
      const color = lbl?.color || 'var(--color-line-strong)'
      // ממזגים לפי שם הכלי בלבד — לא לפי צבע, כדי שלא ייספר כ"כלי" נפרד אם
      // מישהו שינה ידנית את הצבע של התווית בבורד מסוים
      const cur = map.get(label) || { label, color, value: 0 }
      cur.value += Math.round(((v.manual - v.ai) / 60) * 10) / 10
      map.set(label, cur)
    }
    return [...map.values()].filter((d) => d.value !== 0).sort((a, b) => b.value - a.value)
  }, [items, cells, firstColByBoard, efficiency.hasData])

  // --- מגמה חודשית: שעות שנחסכו + % התייעלות, 6 חודשים אחרונים ---
  const monthlyTrend = useMemo(() => {
    if (!efficiency.hasData) return null
    const buckets = new Map() // 'YYYY-MM' -> { ai, manual }
    for (const it of items) {
      const v = savedHoursFor(it)
      if (!v || !it.created_at) continue
      const key = it.created_at.slice(0, 7)
      const cur = buckets.get(key) || { ai: 0, manual: 0 }
      cur.ai += v.ai
      cur.manual += v.manual
      buckets.set(key, cur)
    }
    const months = [...buckets.keys()].sort().slice(-6)
    return months.map((key) => {
      const { ai, manual } = buckets.get(key)
      const saved = manual - ai
      const [y, m] = key.split('-')
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('he-IL', {
        month: 'short',
        year: '2-digit',
      })
      return {
        label,
        savedHours: Math.round((saved / 60) * 10) / 10,
        efficiencyPct: manual ? Math.round((saved / manual) * 100) : 0,
      }
    })
  }, [items, cells, firstColByBoard, efficiency.hasData])

  if (loading) {
    return (
      <div className="mx-auto max-w-[1680px] px-10 py-10">
        <LoadingSpinner label="טוען דשבורד..." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1680px] px-10 py-10">
      <header className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-extrabold tracking-tight text-ink">דשבורד</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">{currentOrg?.name || 'סקירה כללית'}</p>
        </div>
      </header>

      {boards.length === 0 ? (
        <EmptyState
          title="אין עדיין בורדים בארגון הזה"
          desc="צור וורקספייס ובורד ראשון כדי להתחיל לראות כאן נתונים."
          cta="+ יצירת וורקספייס ראשון"
          onCta={() => window.dispatchEvent(new Event('open-create-workspace'))}
        />
      ) : (
        <div className="space-y-4">
          {/* Hero KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
              <div className="text-[14px] font-semibold text-ink-muted">סה״כ פריטים</div>
              <div className="num mt-3 text-[48px] font-extrabold leading-none tracking-tight text-ink">{stats.total}</div>
              <div className="mt-2.5 text-[13px] font-semibold text-brand-600">▲ פעילים על פני {stats.boards} {pluralize(stats.boards, 'בורד', 'בורדים')}</div>
            </div>
            <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
              <div className="text-[14px] font-semibold text-ink-muted">התייעלות במשימות AI</div>
              <div className="num mt-3 text-[48px] font-extrabold leading-none tracking-tight text-brand-500">
                {efficiency.hasData ? `${efficiency.efficiencyPct}%` : '—'}
              </div>
              {effective.hasData ? (
                <div className="mt-2 text-[13px] text-ink-soft">
                  אפקטיבית מכלל העבודה: <span className="num font-bold text-ink">{effective.pct}%</span>
                </div>
              ) : (
                <div className="mt-2 text-[12px] text-ink-muted">מתוך המשימות שנמדדו בלבד</div>
              )}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${Math.max(4, Math.min(100, efficiency.efficiencyPct))}%` }}
                />
              </div>
            </div>
            <div className="rounded-2xl bg-sidebar p-6 text-white">
              <div className="text-[14px] font-semibold text-sidebar-muted">שעות שנחסכו ע״י AI</div>
              <div className="num mt-3 text-[48px] font-extrabold leading-none tracking-tight text-brand-bright">
                {efficiency.hasData ? efficiency.savedHours : 0}
                <span className="ms-1.5 text-[20px] font-semibold text-sidebar-muted">ש׳</span>
              </div>
              <div className="mt-2.5 text-[13px] text-sidebar-muted">
                {efficiency.hasData
                  ? `מתוך ${efficiency.tracked} ${pluralize(efficiency.tracked, 'משימת AI', 'משימות עם AI')}`
                  : 'עדיין אין נתוני AI'}
              </div>
            </div>
          </div>

          {/* Secondary chips */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SecondaryChip label="בורדים" value={stats.boards} />
            <SecondaryChip label="הושלמו" value={stats.done} accent="var(--color-brand-500)" />
            <SecondaryChip label="באיחור" value={stats.overdue} accent="var(--color-danger)" />
            <SecondaryChip label="משימות AI" value={efficiency.tracked} accent="var(--color-accent-purple)" />
          </div>

          {/* Charts row 1 */}
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <ChartCard title="פריטים לפי בורד" data={byBoard} />
            <DonutCard title="פריטים לפי סטטוס" data={byStatus} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="עומס לפי אחראי" data={byPerson} />
            {bySavedByTool && <ChartCard title="שעות שנחסכו לפי כלי AI" data={bySavedByTool} unit=" ש׳" />}
          </div>

          {/* Trend */}
          {monthlyTrend && monthlyTrend.length > 1 && <AreaTrendChart title="מגמת התייעלות חודשית" data={monthlyTrend} />}
        </div>
      )}
    </div>
  )
}
