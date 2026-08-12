import { DEFAULT_STATUS_LABELS, DEFAULT_TAG_LABELS, DEFAULT_DROPDOWN_LABELS } from './constants'
import { computeFormula } from './formula'
import { getPersonIds } from './personIds'

// ערך תצוגה של תא לפי סוג העמודה (לטקסט/אקסל/דוחות)
export function displayCellValue(col, value, members) {
  if (value == null) return ''
  switch (col.type) {
    case 'number':
      return value.number ?? ''
    case 'date':
      return value.date || ''
    case 'checkbox':
      return value.checked ? 'כן' : ''
    case 'status': {
      const labels = col.settings?.labels || DEFAULT_STATUS_LABELS
      return labels.find((l) => l.id === value.id)?.label || ''
    }
    case 'tags': {
      const labels = col.settings?.labels || DEFAULT_TAG_LABELS
      return (value.ids || []).map((id) => labels.find((l) => l.id === id)?.label).filter(Boolean).join(', ')
    }
    case 'dropdown': {
      const labels = col.settings?.labels || DEFAULT_DROPDOWN_LABELS
      return (value.ids || []).map((id) => labels.find((l) => l.id === id)?.label).filter(Boolean).join(', ')
    }
    case 'timeline': {
      if (!value.start && !value.end) return ''
      return `${value.start || ''} – ${value.end || ''}`
    }
    case 'person': {
      return getPersonIds(value)
        .map((uid) => members.find((mm) => mm.user_id === uid))
        .filter(Boolean)
        .map((m) => m.full_name || m.email)
        .join(', ')
    }
    default:
      return value.text || ''
  }
}

// ייצוא בורד לקובץ Excel (.xlsx)
export async function exportBoardToExcel({ board, groups, columns, items, cells, members }) {
  const XLSXmod = await import('xlsx')
  const XLSX = XLSXmod.default ?? XLSXmod
  const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]))
  // המרת ערך תא למספר (לצורך נוסחאות)
  const cellNumber = (col, value) => {
    if (value == null) return 0
    if (col.type === 'number') return Number(value.number) || 0
    const n = parseFloat(displayCellValue(col, value, members))
    return Number.isFinite(n) ? n : 0
  }

  const rows = items.map((it) => {
    const row = { קבוצה: groupName[it.group_id] || '', שם: it.name || '' }
    for (const col of columns) {
      if (col.type === 'formula') {
        row[col.name] = computeFormula(col.settings?.formula || '', (name) => {
          const target = columns.find((c) => c.name === name)
          if (!target) return 0
          return cellNumber(target, cells[`${it.id}:${target.id}`])
        })
      } else {
        row[col.name] = displayCellValue(col, cells[`${it.id}:${col.id}`], members)
      }
    }
    return row
  })

  const headers = ['קבוצה', 'שם', ...columns.map((c) => c.name)]
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 4) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'בורד')
  const safe = (board.name || 'board').replace(/[\\/:*?"<>|]/g, '_')
  XLSX.writeFile(wb, `${safe}.xlsx`)
}

// ייצוא דשבורד "סקירת AI" (ארגוני, חוצה-צוותים) לקובץ Excel — סיכום + טבלת צוותים.
// משתמש ב-exceljs (לא xlsx) כי xlsx הקהילתי לא כותב עיצוב תאים חזרה לקובץ —
// כאן העיצוב (צבעים, הדגשות, קווי רשת) הוא בדיוק הנקודה, אז זה לא ויתור אפשרי.
export async function exportAiOverviewToExcel({ orgName, totals, teamTable, monthlyTrend = [] }) {
  const ExcelJSmod = await import('exceljs')
  const ExcelJS = ExcelJSmod.default ?? ExcelJSmod

  const dateLabel = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
  const pct = (n) => (n == null ? '—' : `${n}%`)
  const hours = (n) => `${Math.round((n ?? 0) * 10) / 10} ש׳`

  // פלטה — תואמת למוקאפ שאושר
  const BRAND = 'FF0073EA'
  const BRAND_TINT = 'FFEAF2FF'
  const HEADER_BG = 'FF12294D'
  const HEADER_TEXT = 'FFDBE6F7'
  const GREEN = 'FF00854D'
  const INK = 'FF1F2733'
  const INK_SOFT = 'FF5B6B82'
  const INK_FAINT = 'FF8B96A8'
  const GRID = 'FFD7DEEA'
  const ROW_ALT = 'FFF3F6FB'

  const thinGrid = { style: 'thin', color: { argb: GRID } }
  const allBorders = { top: thinGrid, bottom: thinGrid, left: thinGrid, right: thinGrid }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('סיכום AI', { views: [{ rightToLeft: true }] })
  ws.columns = [{ width: 22 }, { width: 14 }, { width: 16 }, { width: 20 }, { width: 14 }, { width: 22 }]

  function addRow(values, { merge, font, fill, align = 'right', border } = {}) {
    const row = ws.addRow(values)
    if (merge) ws.mergeCells(`A${row.number}:${merge}${row.number}`)
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (font) cell.font = font
      if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      cell.alignment = { horizontal: align, vertical: 'middle' }
      if (border) cell.border = allBorders
    })
    return row
  }

  addRow([`סקירת AI — ${orgName || 'ארגון'}`], { merge: 'F', font: { bold: true, size: 15, color: { argb: INK } } })
  addRow([`הופק ב-${dateLabel} · חוצה את כל הצוותים בארגון`], { merge: 'F', font: { size: 10.5, color: { argb: INK_FAINT } } })
  ws.addRow([])

  addRow(
    ['בורדים במעקב', 'משימות AI', 'שעות שנחסכו', 'התייעלות במשימות AI', 'אפקטיבית מכלל העבודה', ''],
    { font: { bold: true, size: 10, color: { argb: BRAND } }, fill: BRAND_TINT }
  )
  const orgValuesRow = addRow(
    [
      totals.boards_tracked ?? 0,
      totals.items_tracked ?? 0,
      hours(totals.hours_saved),
      pct(totals.efficiency_pct),
      pct(totals.effective_pct),
      '',
    ],
    { font: { bold: true, size: 15, color: { argb: INK } }, fill: BRAND_TINT }
  )
  orgValuesRow.getCell(5).font = { bold: true, size: 15, color: { argb: GREEN } }
  addRow(
    [`התייעלות אפקטיבית מבוססת על ${totals.teams_with_share ?? 0} מתוך ${totals.teams_total ?? 0} צוותים שהוגדר להם נתח AI`],
    { merge: 'F', font: { size: 10, color: { argb: INK_FAINT } }, fill: BRAND_TINT }
  )
  ws.addRow([])

  addRow(
    ['צוות', 'משימות AI', 'שעות שנחסכו', 'התייעלות במשימות AI', 'נתח AI', 'אפקטיבית מכלל העבודה'],
    { font: { bold: true, size: 10.5, color: { argb: HEADER_TEXT } }, fill: HEADER_BG, border: true }
  )
  teamTable.forEach((t, i) => {
    const row = addRow(
      [
        t.team_name,
        t.items_tracked,
        hours(t.hours_saved),
        pct(t.efficiency_pct),
        t.ai_work_share == null ? '—' : pct(t.ai_work_share),
        pct(t.effective_pct),
      ],
      { font: { color: { argb: INK } }, fill: i % 2 === 1 ? ROW_ALT : undefined, border: true }
    )
    row.getCell(1).font = { bold: true, color: { argb: INK } }
    row.getCell(6).font = { bold: true, color: { argb: t.effective_pct == null ? INK_FAINT : GREEN } }
  })
  const totalsRow = addRow(
    [
      'סה״כ / משוקלל',
      teamTable.reduce((s, t) => s + (t.items_tracked || 0), 0),
      hours(teamTable.reduce((s, t) => s + (t.hours_saved || 0), 0)),
      pct(totals.efficiency_pct),
      '—',
      pct(totals.effective_pct),
    ],
    { font: { bold: true, color: { argb: INK } }, fill: 'FFE4EAF3', border: true }
  )
  totalsRow.getCell(6).font = { bold: true, color: { argb: GREEN } }
  ws.addRow([])
  addRow(['"—" בעמודות נתח AI / אפקטיבית מציין צוות שעדיין לא הוגדר לו נתח AI בעמוד "צוותים".'], {
    merge: 'F',
    font: { italic: true, size: 9.5, color: { argb: INK_SOFT } },
  })

  if (monthlyTrend.length) {
    ws.addRow([])
    addRow(['התייעלות חודשית'], { merge: 'D', font: { bold: true, size: 13, color: { argb: INK } } })
    ws.addRow([])
    addRow(['חודש', 'שעות שנחסכו', 'התייעלות במשימות AI', 'אפקטיבית מכלל העבודה'], {
      font: { bold: true, size: 10.5, color: { argb: HEADER_TEXT } },
      fill: HEADER_BG,
      border: true,
    })
    monthlyTrend.forEach((m, i) => {
      const row = addRow(
        [m.label, hours(m.savedHours), pct(m.efficiencyPct), m.effectivePct == null ? '—' : pct(m.effectivePct)],
        {
          font: { color: { argb: INK } },
          fill: i % 2 === 1 ? ROW_ALT : undefined,
          border: true,
        }
      )
      row.getCell(1).font = { bold: true, color: { argb: INK } }
      row.getCell(4).font = { bold: true, color: { argb: m.effectivePct == null ? INK_FAINT : GREEN } }
    })
    ws.addRow([])
    addRow(
      [
        `מבוסס על ${monthlyTrend.length} ${monthlyTrend.length === 1 ? 'חודש' : 'חודשים'} של נתונים בלבד — תצוגה רבעונית / חצי-שנתית / שנתית תתווסף ככל שיצטבר מספיק מידע.`,
      ],
      { merge: 'D', font: { italic: true, size: 9.5, color: { argb: INK_SOFT } } }
    )
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const safe = (orgName || 'ארגון').replace(/[\\/:*?"<>|]/g, '_')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `סקירת_AI_${safe}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
