import { useState, useEffect } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { DEFAULT_STATUS_LABELS } from '../../lib/constants'

const selectCls =
  'h-9 rounded-md bg-surface px-2.5 text-sm text-ink ring-1 ring-line transition-[box-shadow] duration-150 ease-out hover:ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500'

const ACTION_TYPES = [
  { value: 'notify_assignee', label: 'שלח התראה לאחראי' },
  { value: 'set_status', label: 'שנה סטטוס בעמודה אחרת' },
  { value: 'move_group', label: 'העבר לקבוצה' },
]

function labelsOf(col) {
  return col?.settings?.labels || DEFAULT_STATUS_LABELS
}

export default function AutomationsModal({ open, onClose, boardId, columns, groups }) {
  const { toast } = useToast()
  const statusCols = (columns || []).filter((c) => c.type === 'status')

  const [list, setList] = useState([])
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)

  // בונה מתכון חדש
  const [trigColId, setTrigColId] = useState('')
  const [trigLabelId, setTrigLabelId] = useState('')
  const [actionType, setActionType] = useState('notify_assignee')
  const [setColId, setSetColId] = useState('')
  const [setLabelId, setSetLabelId] = useState('')
  const [moveGroupId, setMoveGroupId] = useState('')

  async function load() {
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at')
    if (error) {
      setLoadError(true)
      setList([])
      return
    }
    setLoadError(false)
    setList(data || [])
  }

  useEffect(() => {
    if (open && boardId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boardId])

  const trigCol = statusCols.find((c) => c.id === trigColId)
  const setCol = statusCols.find((c) => c.id === setColId)

  function colName(id) {
    return (columns || []).find((c) => c.id === id)?.name || 'עמודה'
  }
  function labelText(colId, labelId) {
    const col = (columns || []).find((c) => c.id === colId)
    return labelsOf(col).find((l) => l.id === labelId)?.label || 'תווית'
  }
  function groupName(id) {
    return (groups || []).find((g) => g.id === id)?.name || 'קבוצה'
  }

  function actionText(action) {
    if (!action) return ''
    if (action.type === 'notify_assignee') return 'שלח התראה לאחראי'
    if (action.type === 'set_status')
      return `קבע "${colName(action.column_id)}" ל-"${labelText(action.column_id, action.label_id)}"`
    if (action.type === 'move_group') return `העבר לקבוצה "${groupName(action.group_id)}"`
    return ''
  }

  function sentence(auto) {
    const t = auto.trigger
    const trig =
      t?.type === 'status_is'
        ? `כאשר ${colName(t.column_id)} = ${labelText(t.column_id, t.label_id)}`
        : 'כאשר ...'
    return `${trig} → ${actionText(auto.action)}`
  }

  async function toggleEnabled(auto) {
    const next = !auto.enabled
    setList((p) => p.map((a) => (a.id === auto.id ? { ...a, enabled: next } : a)))
    const { error } = await supabase.from('automations').update({ enabled: next }).eq('id', auto.id)
    if (error) {
      setList((p) => p.map((a) => (a.id === auto.id ? { ...a, enabled: auto.enabled } : a)))
      toast({ message: 'העדכון נכשל', type: 'error' })
    }
  }

  async function remove(auto) {
    const { error } = await supabase.from('automations').delete().eq('id', auto.id)
    if (error) {
      toast({ message: 'המחיקה נכשלה', type: 'error' })
      return
    }
    setList((p) => p.filter((a) => a.id !== auto.id))
    toast({ message: 'האוטומציה נמחקה', type: 'info' })
  }

  function resetBuilder() {
    setTrigColId('')
    setTrigLabelId('')
    setActionType('notify_assignee')
    setSetColId('')
    setSetLabelId('')
    setMoveGroupId('')
  }

  function buildAction() {
    if (actionType === 'notify_assignee') return { type: 'notify_assignee' }
    if (actionType === 'set_status') {
      if (!setColId || !setLabelId) return null
      return { type: 'set_status', column_id: setColId, label_id: setLabelId }
    }
    if (actionType === 'move_group') {
      if (!moveGroupId) return null
      return { type: 'move_group', group_id: moveGroupId }
    }
    return null
  }

  async function add() {
    if (!trigColId || !trigLabelId) {
      toast({ message: 'בחר/י עמודת סטטוס ותווית', type: 'error' })
      return
    }
    const action = buildAction()
    if (!action) {
      toast({ message: 'השלם/י את פרטי הפעולה', type: 'error' })
      return
    }
    setSaving(true)
    const trigger = { type: 'status_is', column_id: trigColId, label_id: trigLabelId }
    const { error } = await supabase.from('automations').insert({
      board_id: boardId,
      name: '',
      trigger,
      action,
      enabled: true,
    })
    setSaving(false)
    if (error) {
      toast({ message: 'ההוספה נכשלה', type: 'error' })
      return
    }
    toast('האוטומציה נוספה')
    resetBuilder()
    load()
  }

  return (
    <Modal open={open} onClose={onClose} title="אוטומציות" width="max-w-lg">
      {loadError ? (
        <div className="rounded-md bg-surface-2 p-4 text-sm text-ink-soft ring-1 ring-line">
          האוטומציות יופעלו אחרי הרצת db/monday-upgrade.sql
        </div>
      ) : (
        <div className="space-y-5">
          {/* רשימת אוטומציות קיימות */}
          <div className="space-y-2">
            {list.length === 0 ? (
              <p className="text-sm text-ink-muted">עדיין אין אוטומציות.</p>
            ) : (
              list.map((auto) => (
                <div
                  key={auto.id}
                  className="flex items-center gap-3 rounded-md bg-surface px-3 py-2.5 ring-1 ring-line"
                >
                  <button
                    onClick={() => toggleEnabled(auto)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer ${
                      auto.enabled ? 'bg-brand-500' : 'bg-line-strong'
                    }`}
                    title={auto.enabled ? 'פעיל' : 'כבוי'}
                    aria-pressed={auto.enabled}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                        auto.enabled ? 'right-0.5' : 'right-4'
                      }`}
                    />
                  </button>
                  <span className={`flex-1 text-[13px] ${auto.enabled ? 'text-ink' : 'text-ink-muted'}`}>
                    {sentence(auto)}
                  </span>
                  <button
                    onClick={() => remove(auto)}
                    className="-m-1 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-danger cursor-pointer"
                    aria-label="מחק"
                    title="מחק"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* בונה מתכון חדש */}
          <div className="space-y-3 rounded-md bg-surface-2 p-3.5 ring-1 ring-line">
            <p className="text-[13px] font-semibold text-ink">מתכון חדש</p>

            {statusCols.length === 0 ? (
              <p className="text-[13px] text-ink-muted">צריך לפחות עמודת סטטוס אחת בבורד.</p>
            ) : (
              <>
                {/* טריגר */}
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
                  <span>כאשר</span>
                  <select
                    value={trigColId}
                    onChange={(e) => {
                      setTrigColId(e.target.value)
                      setTrigLabelId('')
                    }}
                    className={selectCls}
                  >
                    <option value="">בחר עמודה</option>
                    {statusCols.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span>=</span>
                  <select
                    value={trigLabelId}
                    onChange={(e) => setTrigLabelId(e.target.value)}
                    className={selectCls}
                    disabled={!trigCol}
                  >
                    <option value="">בחר תווית</option>
                    {labelsOf(trigCol).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label || 'ריק'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* פעולה */}
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
                  <span>אז</span>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className={selectCls}
                  >
                    {ACTION_TYPES.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>

                  {actionType === 'set_status' && (
                    <>
                      <select
                        value={setColId}
                        onChange={(e) => {
                          setSetColId(e.target.value)
                          setSetLabelId('')
                        }}
                        className={selectCls}
                      >
                        <option value="">בחר עמודה</option>
                        {statusCols.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={setLabelId}
                        onChange={(e) => setSetLabelId(e.target.value)}
                        className={selectCls}
                        disabled={!setCol}
                      >
                        <option value="">בחר תווית</option>
                        {labelsOf(setCol).map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label || 'ריק'}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  {actionType === 'move_group' && (
                    <select
                      value={moveGroupId}
                      onChange={(e) => setMoveGroupId(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">בחר קבוצה</option>
                      {(groups || []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={add} disabled={saving}>
                    הוספה
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
