import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { AI_TOOL_LABELS } from '../lib/constants'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { SecondaryChip, EmptyState, ChartCard, AreaTrendChart, MonthlyTrendTable } from '../components/charts/DashboardCharts'
import { pluralize } from '../lib/pluralize'
import { exportAiOverviewToExcel } from '../lib/exportBoard'

// דשבורד "סקירת AI" — חוצה-צוותים, למנהל-תחום AI ולאדמין הארגון בלבד.
// קורא ל-RPC ai_overview_summary שרץ עם security definer ומחזיר אגרגציה
// בלי לחשוף גישה ישירה לטבלאות boards/items/cell_values.
export default function AiOverviewPage() {
  const { currentOrg, currentOrgId, isAiOverseer } = useApp()
  const isAdmin = currentOrg?.role === 'admin'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [selectedBoardId, setSelectedBoardId] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!currentOrgId) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      const { data, error: err } = await supabase.rpc('ai_overview_summary', { p_org: currentOrgId })
      if (!cancelled) {
        if (err) setError(err.message)
        else setSummary(data)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentOrgId])

  const byTool = useMemo(() => {
    if (!summary?.by_tool) return []
    return summary.by_tool
      .map((t) => {
        const lbl = AI_TOOL_LABELS.find((l) => l.id === t.tool_label_id)
        return { label: lbl?.label || t.tool_label_id || 'לא צוין', color: lbl?.color || 'var(--color-line-strong)', value: Math.round(t.hours_saved * 10) / 10 }
      })
      .sort((a, b) => b.value - a.value)
  }, [summary])

  const byTeam = useMemo(() => {
    if (!summary?.by_team) return []
    return summary.by_team
      .map((t) => ({ label: t.team_name, color: 'var(--color-accent-purple)', value: Math.round(t.hours_saved * 10) / 10 }))
      .sort((a, b) => b.value - a.value)
  }, [summary])

  const monthlyTrend = useMemo(() => {
    if (!summary?.monthly_trend) return []
    return summary.monthly_trend.map((m) => {
      const [y, mo] = m.month.split('-')
      const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })
      return {
        label,
        savedHours: Math.round(m.hours_saved * 10) / 10,
        efficiencyPct: m.efficiency_pct,
        effectivePct: m.effective_pct,
      }
    })
  }, [summary])

  // טבלת התייעלות לפי צוות: התייעלות-במשימות-AI, נתח, ואפקטיבית
  const teamTable = useMemo(() => {
    if (!summary?.by_team) return []
    return [...summary.by_team]
      .filter((t) => t.items_tracked > 0)
      .sort((a, b) => b.hours_saved - a.hours_saved)
  }, [summary])

  // רשימת בורדים לסינון — לראות את החיסכון ברמה הפרטנית של בורד בודד
  const byBoard = useMemo(() => summary?.by_board || [], [summary])
  const selectedBoard = useMemo(
    () => byBoard.find((b) => b.board_id === selectedBoardId) || null,
    [byBoard, selectedBoardId]
  )
  const boardMonthlyTrend = useMemo(() => {
    if (!selectedBoard?.monthly_trend) return []
    return selectedBoard.monthly_trend.map((m) => {
      const [y, mo] = m.month.split('-')
      const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })
      const effectivePct =
        selectedBoard.ai_work_share != null ? Math.round(m.efficiency_pct * selectedBoard.ai_work_share) / 100 : null
      return { label, savedHours: Math.round(m.hours_saved * 10) / 10, efficiencyPct: m.efficiency_pct, effectivePct }
    })
  }, [selectedBoard])

  if (!isAdmin && !isAiOverseer) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-9">
        <p className="text-[15px] text-ink-muted">עמוד זה זמין רק לאדמין הארגון או למנהל-תחום AI.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1680px] px-10 py-10">
        <LoadingSpinner label="טוען סקירת AI..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1680px] px-10 py-10">
        <p className="text-[14px] text-danger">שגיאה בטעינת הנתונים: {error}</p>
      </div>
    )
  }

  const totals = summary?.org_totals || { boards_tracked: 0, items_tracked: 0, hours_saved: 0, efficiency_pct: 0 }

  // תצוגת הכרטיסים העליונים ובלוק "אפקטיבית" — נתוני בורד בודד כשמסננים, אחרת סה"כ ארגוני
  const view = selectedBoard
    ? {
        firstCardLabel: 'משימות AI',
        firstCardValue: selectedBoard.items_tracked,
        efficiency_pct: selectedBoard.efficiency_pct,
        hours_saved: selectedBoard.hours_saved,
        items_tracked: selectedBoard.items_tracked,
        effective_pct: selectedBoard.effective_pct,
        shareNote: selectedBoard.ai_work_share == null,
      }
    : {
        firstCardLabel: 'בורדים במעקב',
        firstCardValue: totals.boards_tracked,
        efficiency_pct: totals.efficiency_pct,
        hours_saved: totals.hours_saved,
        items_tracked: totals.items_tracked,
        effective_pct: totals.effective_pct,
        shareNote: totals.teams_with_share < totals.teams_total,
      }

  function handleExport() {
    exportAiOverviewToExcel({ orgName: currentOrg?.name, totals, teamTable, monthlyTrend })
  }

  return (
    <div className="mx-auto max-w-[1680px] px-10 py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-extrabold tracking-tight text-ink">סקירת AI</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">
            {selectedBoard ? `בורד: ${selectedBoard.board_name} (${selectedBoard.team_name})` : `התייעלות AI חוצה כל הצוותים ב${currentOrg?.name || 'הארגון'}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {byBoard.length > 0 && (
            <select
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="h-[42px] rounded-lg bg-surface px-3 text-[14px] text-ink ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="">כל הבורדים</option>
              {byBoard.map((b) => (
                <option key={b.board_id} value={b.board_id}>{b.board_name}</option>
              ))}
            </select>
          )}
          {totals.boards_tracked > 0 && (
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 rounded-lg bg-surface px-4 py-2.5 text-[14px] font-medium text-ink ring-1 ring-line transition-colors hover:bg-surface-2 cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M10 3v9m0 0l-3.2-3.2M10 12l3.2-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 14v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ייצוא לאקסל
            </button>
          )}
        </div>
      </header>

      {totals.boards_tracked === 0 ? (
        <EmptyState title="עדיין אין נתוני AI בארגון" desc="ברגע שצוותים יתחילו למלא בורדי התייעלות-AI, הנתונים המצטברים יופיעו כאן." />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
              <div className="text-[14px] font-semibold text-ink-muted">{view.firstCardLabel}</div>
              <div className="num mt-3 text-[48px] font-extrabold leading-none tracking-tight text-ink">{view.firstCardValue}</div>
            </div>
            <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
              <div className="text-[14px] font-semibold text-ink-muted">התייעלות במשימות AI</div>
              <div className="num mt-3 text-[48px] font-extrabold leading-none tracking-tight text-brand-500">{view.efficiency_pct}%</div>
              <div className="mt-2 text-[12px] text-ink-muted">מתוך המשימות שנמדדו בלבד</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.max(4, Math.min(100, view.efficiency_pct))}%` }} />
              </div>
            </div>
            <div className="rounded-2xl bg-sidebar p-6 text-white">
              <div className="text-[14px] font-semibold text-sidebar-muted">סה״כ שעות שנחסכו ע״י AI</div>
              <div className="num mt-3 text-[48px] font-extrabold leading-none tracking-tight text-brand-bright">
                {Math.round(view.hours_saved * 10) / 10}
                <span className="ms-1.5 text-[20px] font-semibold text-sidebar-muted">ש׳</span>
              </div>
              <div className="mt-2.5 text-[13px] text-sidebar-muted">
                מתוך {view.items_tracked} {pluralize(view.items_tracked, 'משימת AI', 'משימות עם AI')}
              </div>
            </div>
          </div>

          {!selectedBoard && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SecondaryChip label="בורדים במעקב" value={totals.boards_tracked} />
              <SecondaryChip label="משימות AI" value={totals.items_tracked} accent="var(--color-accent-purple)" />
              <SecondaryChip label="צוותים פעילים" value={byTeam.length} />
              <SecondaryChip label="שעות שנחסכו" value={Math.round(totals.hours_saved * 10) / 10} accent="var(--color-brand-500)" />
            </div>
          )}

          {/* התייעלות אפקטיבית מכלל העבודה */}
          {view.effective_pct != null ? (
            <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[14px] font-semibold text-ink-muted">התייעלות אפקטיבית מכלל העבודה</div>
                  <div className="num mt-2 text-[40px] font-extrabold leading-none tracking-tight text-ink">{view.effective_pct}%</div>
                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-muted">
                    מביא בחשבון שעבודת ה-AI היא רק חלק מכלל העבודה — לפי נתח ה-AI שהוגדר לצוות.
                    {view.shareNote && !selectedBoard && (
                      <> מבוסס על {totals.teams_with_share} מתוך {totals.teams_total} צוותים שהוגדר להם נתח.</>
                    )}
                  </p>
                </div>
                <div className="w-full max-w-[220px]">
                  <div className="h-2 overflow-hidden rounded-full bg-track">
                    <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.max(4, Math.min(100, view.effective_pct))}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-surface-2 p-5 ring-1 ring-line">
              <p className="text-[13.5px] leading-relaxed text-ink-soft">
                💡 כדי לראות <span className="font-semibold text-ink">התייעלות אפקטיבית מכלל העבודה</span> (ולא רק מתוך משימות AI),
                הגדירו {selectedBoard ? `לצוות "${selectedBoard.team_name}"` : 'לכל צוות'} את "נתח AI" בעמוד <span className="font-semibold text-ink">צוותים</span>.
              </p>
            </div>
          )}

          {selectedBoard ? (
            boardMonthlyTrend.length > 1 && (
              <>
                <AreaTrendChart title={`מגמת התייעלות חודשית — ${selectedBoard.board_name}`} data={boardMonthlyTrend} />
                <MonthlyTrendTable data={boardMonthlyTrend} />
              </>
            )
          ) : (
          <>
          {/* התייעלות לפי צוות */}
          <div className="rounded-2xl bg-surface p-6 ring-1 ring-line">
            <h3 className="mb-4 text-[16.5px] font-bold text-ink">התייעלות לפי צוות</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-right text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-[12px] font-medium text-ink-muted">
                    <th className="px-3 py-2 font-medium">צוות</th>
                    <th className="px-3 py-2 font-medium">משימות AI</th>
                    <th className="px-3 py-2 font-medium">שעות שנחסכו</th>
                    <th className="px-3 py-2 font-medium">התייעלות במשימות AI</th>
                    <th className="px-3 py-2 font-medium">נתח AI</th>
                    <th className="px-3 py-2 font-medium">אפקטיבית מכלל העבודה</th>
                  </tr>
                </thead>
                <tbody>
                  {teamTable.map((t) => (
                    <tr key={t.team_id || t.team_name} className="border-b border-line last:border-0">
                      <td className="px-3 py-3 font-medium text-ink">{t.team_name}</td>
                      <td className="num px-3 py-3 text-ink-soft">{t.items_tracked}</td>
                      <td className="num px-3 py-3 text-ink-soft">{Math.round(t.hours_saved * 10) / 10} ש׳</td>
                      <td className="num px-3 py-3 font-semibold text-brand-600">{t.efficiency_pct}%</td>
                      <td className="num px-3 py-3 text-ink-soft">{t.ai_work_share == null ? '—' : `${t.ai_work_share}%`}</td>
                      <td className="num px-3 py-3 font-bold text-ink">{t.effective_pct == null ? '—' : `${t.effective_pct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {teamTable.some((t) => t.effective_pct == null) && (
              <p className="mt-3 text-[12px] text-ink-muted">— בעמודת "אפקטיבית" מציין צוות שעדיין לא הוגדר לו נתח AI.</p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="שעות שנחסכו לפי צוות" data={byTeam} unit=" ש׳" />
            <ChartCard title="שעות שנחסכו לפי כלי AI" data={byTool} unit=" ש׳" />
          </div>

          {monthlyTrend.length > 1 && (
            <>
              <AreaTrendChart title="מגמת התייעלות חודשית ארגונית" data={monthlyTrend} />
              <MonthlyTrendTable data={monthlyTrend} />
            </>
          )}
          </>
          )}
        </div>
      )}
    </div>
  )
}
