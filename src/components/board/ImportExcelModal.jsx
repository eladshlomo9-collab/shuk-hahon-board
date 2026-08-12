import { useState, useMemo, useRef } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { COLUMN_TYPES } from '../../lib/constants'
import { parseSpreadsheet, coerceValue, buildLabelsFromValues, labelMapFromColumn } from '../../lib/importExcel'

// סוגי עמודה נתמכים ליצירה/מיפוי בייבוא (בלי person/formula/timeline — דורשים טיפול מיוחד שלא שווה את המורכבות כאן)
const IMPORT_TYPES = COLUMN_TYPES.filter((t) => !['formula', 'timeline'].includes(t.type))

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export default function ImportExcelModal({ open, onClose, boardId, columns, groups, onImported }) {
  const [step, setStep] = useState('upload') // upload | map | importing
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [mapping, setMapping] = useState([]) // [{ target, newType }]
  const [targetGroupId, setTargetGroupId] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  function reset() {
    setStep('upload')
    setFileName('')
    setHeaders([])
    setRows([])
    setMapping([])
    setTargetGroupId('')
    setError('')
  }

  function close() {
    reset()
    onClose()
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const { headers: h, rows: r, truncated: t } = await parseSpreadsheet(file)
      if (!h.length) {
        setError('לא נמצאו נתונים בקובץ')
        return
      }
      setFileName(file.name)
      setHeaders(h)
      setRows(r)
      setTruncated(t)
      // מיפוי ברירת מחדל: התאמה לפי שם כותרת (שם פריט / קבוצה / עמודה קיימת), אחרת "התעלם"
      setMapping(
        h.map((header) => {
          const norm = header.trim().toLowerCase()
          if (['שם', 'שם הפריט', 'שם פריט', 'name'].includes(norm)) return { target: 'name', newType: 'text' }
          if (['קבוצה', 'group'].includes(norm)) return { target: 'group', newType: 'text' }
          const existing = columns.find((c) => c.name.trim().toLowerCase() === norm)
          if (existing) return { target: `col:${existing.id}`, newType: 'text' }
          return { target: 'skip', newType: 'text' }
        })
      )
      setTargetGroupId(groups[0]?.id || '')
      setStep('map')
    } catch {
      setError('לא הצלחנו לקרוא את הקובץ — ודא/י שזה קובץ Excel (.xlsx) או CSV תקין')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const nameCount = mapping.filter((m) => m.target === 'name').length
  const groupCount = mapping.filter((m) => m.target === 'group').length
  const canImport = nameCount === 1 && groupCount <= 1 && (groupCount === 1 || targetGroupId || groups.length === 0)

  const preview = useMemo(() => rows.slice(0, 3), [rows])

  async function runImport() {
    setStep('importing')
    setError('')
    try {
      const nameIdx = mapping.findIndex((m) => m.target === 'name')
      const groupIdx = mapping.findIndex((m) => m.target === 'group')

      // 1) יצירת עמודות חדשות שנדרשו במיפוי
      const newColDefs = mapping
        .map((m, i) => ({ ...m, i }))
        .filter((m) => m.target === 'new')
      const colIdByIndex = {}
      let posBase = columns.length
      for (const def of newColDefs) {
        const values = rows.map((r) => r[def.i])
        const settings = ['status', 'tags', 'dropdown'].includes(def.newType)
          ? { labels: buildLabelsFromValues(values) }
          : {}
        const { data, error: insErr } = await supabase
          .from('columns')
          .insert({ board_id: boardId, name: headers[def.i], type: def.newType, position: posBase++, settings })
          .select()
          .single()
        if (insErr || !data) throw new Error('יצירת עמודה חדשה נכשלה')
        colIdByIndex[def.i] = data.id
      }

      // אינדקס עמודת אקסל -> { columnId, type, labelMap } לכל עמודה ממופה (קיימת או חדשה)
      const colInfoByIndex = {}
      const allColsById = new Map(columns.map((c) => [c.id, c]))
      mapping.forEach((m, i) => {
        if (m.target === 'new') {
          colInfoByIndex[i] = { id: colIdByIndex[i], type: m.newType, labelMap: null }
        } else if (m.target.startsWith('col:')) {
          const id = m.target.slice(4)
          const col = allColsById.get(id)
          colInfoByIndex[i] = { id, type: col?.type, labelMap: labelMapFromColumn(col) }
        }
      })
      // לעמודות חדשות מסוג status/tags/dropdown צריך גם labelMap (מהתוויות שנוצרו הרגע)
      for (const def of newColDefs) {
        if (['status', 'tags', 'dropdown'].includes(def.newType)) {
          const map = new Map()
          const values = rows.map((r) => r[def.i])
          for (const l of buildLabelsFromValues(values)) map.set(l.label.toLowerCase(), l.id)
          colInfoByIndex[def.i].labelMap = map
        }
      }

      // 2) קבוצות: או שממופה מעמודה, או שהכל הולך לקבוצת יעד אחת (קיימת/חדשה)
      const groupIdByName = new Map(groups.map((g) => [g.name.trim().toLowerCase(), g.id]))
      let posGroups = groups.length
      let fallbackGroupId = targetGroupId
      if (!fallbackGroupId && groups.length === 0) {
        const { data: g } = await supabase
          .from('groups')
          .insert({ board_id: boardId, name: 'מיובא', color: '#3E7BD6', position: 0 })
          .select()
          .single()
        fallbackGroupId = g?.id
        if (g) { groupIdByName.set('מיובא', g.id); posGroups = 1 }
      }
      if (groupIdx >= 0) {
        const names = [...new Set(rows.map((r) => String(r[groupIdx] ?? '').trim()).filter(Boolean))]
        for (const name of names) {
          const key = name.toLowerCase()
          if (groupIdByName.has(key)) continue
          const { data: g } = await supabase
            .from('groups')
            .insert({ board_id: boardId, name, color: '#3E7BD6', position: posGroups++ })
            .select()
            .single()
          if (g) groupIdByName.set(key, g.id)
        }
      }

      // 3) בניית הפריטים לייבוא (מדלגים על שורות בלי שם)
      const groupPositions = {}
      const plannedItems = []
      for (const r of rows) {
        const name = String(r[nameIdx] ?? '').trim()
        if (!name) continue
        let gid = fallbackGroupId
        if (groupIdx >= 0) {
          const gname = String(r[groupIdx] ?? '').trim()
          gid = (gname && groupIdByName.get(gname.toLowerCase())) || fallbackGroupId
        }
        if (!gid) continue
        groupPositions[gid] = (groupPositions[gid] ?? -1) + 1
        plannedItems.push({ row: r, group_id: gid, board_id: boardId, name, position: groupPositions[gid] })
      }
      if (!plannedItems.length) throw new Error('לא נמצאו שורות עם שם פריט תקין לייבוא')

      // 4) הכנסת הפריטים בקבוצות (batches), שמירה על סדר לצורך שיוך תאים
      const createdItems = []
      for (const batch of chunk(plannedItems, 200)) {
        const { data, error: insErr } = await supabase
          .from('items')
          .insert(batch.map(({ row, ...rest }) => rest))
          .select()
        if (insErr || !data) throw new Error('יצירת הפריטים נכשלה')
        data.forEach((d, i) => createdItems.push({ item: d, row: batch[i].row }))
      }

      // 5) בניית תאי-ערך לכל עמודה ממופה
      const cellRows = []
      let unmatched = 0
      for (const { item, row } of createdItems) {
        for (const [idxStr, info] of Object.entries(colInfoByIndex)) {
          const idx = Number(idxStr)
          const raw = row[idx]
          if (raw == null || String(raw).trim() === '') continue
          const val = coerceValue(info.type, raw, { labelMap: info.labelMap })
          if (val == null) {
            if (['status', 'tags', 'dropdown'].includes(info.type)) unmatched++
            continue
          }
          cellRows.push({ item_id: item.id, column_id: info.id, value: val })
        }
      }
      for (const batch of chunk(cellRows, 500)) {
        const { error: cellErr } = await supabase.from('cell_values').insert(batch)
        if (cellErr) throw new Error('שמירת ערכי התאים נכשלה')
      }

      onImported({
        itemCount: createdItems.length,
        newColumns: newColDefs.length,
        unmatched,
      })
      close()
    } catch (e) {
      setError(e.message || 'הייבוא נכשל')
      setStep('map')
    }
  }

  return (
    <Modal open={open} onClose={close} title="ייבוא משימות מאקסל" width="max-w-2xl">
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-[13.5px] text-ink-soft">
            העלה קובץ Excel (.xlsx) או CSV. השורה הראשונה בקובץ צריכה להכיל כותרות עמודות.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onPickFile}
            className="hidden"
            id="import-excel-file"
          />
          <label
            htmlFor="import-excel-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40"
          >
            <span className="text-[14px] font-medium text-ink">לחץ/י לבחירת קובץ</span>
            <span className="text-[12.5px] text-ink-muted">.xlsx, .xls או .csv</span>
          </label>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={close}>ביטול</Button>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <p className="text-[13px] text-ink-muted">
            {fileName} · {rows.length} שורות{truncated ? ' (הוגבל ל-2000 הראשונות)' : ''}
          </p>

          <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-lg ring-1 ring-line">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 bg-surface-2">
                <tr>
                  <th className="px-3 py-2 text-right font-semibold text-ink-soft">עמודה בקובץ</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink-soft">דוגמה</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink-soft">מיפוי ל-</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="max-w-[140px] truncate px-3 py-2 font-medium text-ink" title={h}>{h}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-ink-muted" title={String(preview.map((r) => r[i]).filter(Boolean)[0] ?? '')}>
                      {String(preview.map((r) => r[i]).filter(Boolean)[0] ?? '—')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={mapping[i]?.target || 'skip'}
                          onChange={(e) =>
                            setMapping((prev) => prev.map((m, idx) => (idx === i ? { ...m, target: e.target.value } : m)))
                          }
                          className="rounded-md bg-surface px-2 py-1.5 text-[12.5px] text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="skip">התעלם</option>
                          <option value="name">שם הפריט</option>
                          <option value="group">קבוצה</option>
                          {columns.map((c) => (
                            <option key={c.id} value={`col:${c.id}`}>עמודה: {c.name}</option>
                          ))}
                          <option value="new">עמודה חדשה…</option>
                        </select>
                        {mapping[i]?.target === 'new' && (
                          <select
                            value={mapping[i]?.newType || 'text'}
                            onChange={(e) =>
                              setMapping((prev) => prev.map((m, idx) => (idx === i ? { ...m, newType: e.target.value } : m)))
                            }
                            className="rounded-md bg-surface px-2 py-1.5 text-[12.5px] text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand-500"
                          >
                            {IMPORT_TYPES.map((t) => (
                              <option key={t.type} value={t.type}>{t.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {nameCount !== 1 && (
            <p className="text-[13px] text-danger">חובה למפות בדיוק עמודה אחת ל"שם הפריט".</p>
          )}
          {groupCount > 1 && <p className="text-[13px] text-danger">אפשר למפות לכל היותר עמודה אחת ל"קבוצה".</p>}

          {groupCount === 0 && groups.length > 0 && (
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">קבוצת יעד (כל השורות ייכנסו אליה)</span>
              <select
                value={targetGroupId}
                onChange={(e) => setTargetGroupId(e.target.value)}
                className="w-full rounded-lg bg-surface px-3 py-2.5 text-[14px] text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand-400"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
          {groupCount === 0 && groups.length === 0 && (
            <p className="text-[13px] text-ink-muted">אין עדיין קבוצות בבורד — תיווצר קבוצה בשם "מיובא".</p>
          )}

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>ביטול</Button>
            <Button onClick={runImport} disabled={!canImport}>ייבוא</Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
          <p className="text-[14px] text-ink-soft">מייבא נתונים…</p>
        </div>
      )}
    </Modal>
  )
}
