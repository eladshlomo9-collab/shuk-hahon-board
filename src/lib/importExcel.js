import { GROUP_COLORS, DEFAULT_STATUS_LABELS, DEFAULT_TAG_LABELS, DEFAULT_DROPDOWN_LABELS } from './constants'

const MAX_ROWS = 2000

// קורא קובץ אקסל/CSV, מחזיר { headers, rows } — rows הן מערכי-מערכים לפי הכותרות.
export async function parseSpreadsheet(file) {
  const XLSXmod = await import('xlsx')
  const XLSX = XLSXmod.default ?? XLSXmod
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false })
  if (!raw.length) return { headers: [], rows: [], truncated: false }
  const headers = raw[0].map((h, i) => (String(h).trim() ? String(h).trim() : `עמודה ${i + 1}`))
  const body = raw.slice(1)
  const truncated = body.length > MAX_ROWS
  return { headers, rows: truncated ? body.slice(0, MAX_ROWS) : body, truncated }
}

// המרת ערך גולמי מהאקסל לצורת הערך של סוג עמודה נתון. מחזיר null אם הערך ריק/לא תקין (מדלגים על התא).
export function coerceValue(type, raw, ctx) {
  const s = raw == null ? '' : raw instanceof Date ? raw : String(raw).trim()
  if (s === '') return null
  switch (type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'))
      return Number.isFinite(n) ? { number: n } : null
    }
    case 'date': {
      const d = raw instanceof Date ? raw : new Date(s)
      if (Number.isNaN(d.getTime())) return null
      return { date: d.toISOString().slice(0, 10) }
    }
    case 'checkbox': {
      const t = String(raw).trim().toLowerCase()
      return { checked: ['כן', 'v', '1', 'true', 'yes', 'x', '✓'].includes(t) }
    }
    case 'status': {
      const id = ctx?.labelMap?.get(String(raw).trim().toLowerCase())
      return id ? { id } : null
    }
    case 'tags':
    case 'dropdown': {
      const parts = String(raw).split(',').map((p) => p.trim()).filter(Boolean)
      const ids = parts.map((p) => ctx?.labelMap?.get(p.toLowerCase())).filter(Boolean)
      return ids.length ? { ids } : null
    }
    default:
      return { text: String(raw).trim() }
  }
}

// בונה תוויות חדשות (status/tags/dropdown) מהערכים הייחודיים שנמצאו בעמודת האקסל
export function buildLabelsFromValues(values) {
  const seen = new Map()
  let i = 0
  for (const raw of values) {
    const parts = String(raw ?? '').split(',').map((p) => p.trim()).filter(Boolean)
    for (const p of parts) {
      const key = p.toLowerCase()
      if (!seen.has(key)) {
        seen.set(key, { id: `imp_${Date.now().toString(36)}_${i}`, label: p, color: GROUP_COLORS[i % GROUP_COLORS.length] })
        i++
      }
    }
  }
  return [...seen.values()]
}

const DEFAULT_LABELS_BY_TYPE = { status: DEFAULT_STATUS_LABELS, tags: DEFAULT_TAG_LABELS, dropdown: DEFAULT_DROPDOWN_LABELS }

// ממפה טקסט->id לפי תוויות קיימות (סטטוס/תגיות/בחירה), להתאמת ערכי אקסל לעמודה קיימת —
// עמודה בלי settings.labels משלה מסתמכת על ברירת המחדל של הסוג (כמו בכל שאר האפליקציה)
export function labelMapFromColumn(column) {
  const labels = column?.settings?.labels || DEFAULT_LABELS_BY_TYPE[column?.type] || []
  const map = new Map()
  for (const l of labels) if (l.label) map.set(l.label.trim().toLowerCase(), l.id)
  return map
}
