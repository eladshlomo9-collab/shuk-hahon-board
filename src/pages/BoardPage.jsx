import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { COLUMN_TYPES, DEFAULT_STATUS_LABELS, DEFAULT_TAG_LABELS, DEFAULT_DROPDOWN_LABELS, GROUP_COLORS, BOARD_VIEWS } from '../lib/constants'
import Cell from '../components/board/Cell'
import ItemPanel from '../components/board/ItemPanel'
import BoardMembersModal from '../components/board/BoardMembersModal'
import BoardToolbar from '../components/board/BoardToolbar'
import AutomationsModal from '../components/board/AutomationsModal'
import { exportBoardToExcel } from '../lib/exportBoard'
import { computeFormula } from '../lib/formula'
import { runAutomations } from '../lib/automations'
import { getPersonIds } from '../lib/personIds'

// טעינה עצלה לתצוגות הכבדות
const KanbanView = lazy(() => import('../components/board/KanbanView'))
const CalendarView = lazy(() => import('../components/board/CalendarView'))
const ReportsView = lazy(() => import('../components/board/ReportsView'))
const GanttView = lazy(() => import('../components/board/GanttView'))
import LabelEditorModal from '../components/board/LabelEditorModal'
import ShortcutsModal from '../components/board/ShortcutsModal'
import ActivityModal from '../components/board/ActivityModal'
import { logActivity, notifyAssignment } from '../lib/activity'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import LoadingSpinner from '../components/ui/LoadingSpinner'

// שולף את *כל* השורות בעימוד, לעקוף את תקרת 1000 השורות של Supabase (חשוב לבורדים עם הרבה נתונים)
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

export default function BoardPage() {
  const { boardId } = useParams()
  const { members, currentOrg, user } = useApp()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [board, setBoard] = useState(null)
  const [groups, setGroups] = useState([])
  const [columns, setColumns] = useState([])
  const [items, setItems] = useState([])
  const [cells, setCells] = useState({})
  const [myRole, setMyRole] = useState(null)
  const [teamShare, setTeamShare] = useState(null) // נתח AI של צוות הבורד (לדוחות)

  const [shareOpen, setShareOpen] = useState(false)
  const [colModal, setColModal] = useState(false)
  const [colName, setColName] = useState('')
  const [colType, setColType] = useState('text')
  const [colFormula, setColFormula] = useState('')
  const [autoOpen, setAutoOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [labelCol, setLabelCol] = useState(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [panelItemId, setPanelItemId] = useState(null)
  const [dragCol, setDragCol] = useState(null)
  const [dependencies, setDependencies] = useState([])

  // תצוגה: טבלה / קנבן / לוח שנה
  const [view, setView] = useState('table')

  // כלים: חיפוש / סינון / מיון
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPerson, setFilterPerson] = useState('all')
  const [sortBy, setSortBy] = useState('none')

  const editable = myRole === 'owner' || myRole === 'editor'
  const isOwner = myRole === 'owner'

  const load = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true)
    const { data: b } = await supabase.from('boards').select('*').eq('id', boardId).single()
    setBoard(b)

    // נתח AI של הצוות שהבורד שייך אליו (לחישוב "אפקטיבית" בדוחות) — נטען ברענון מלא בלבד
    if (!opts.silent && b?.workspace_id) {
      try {
        const { data: ws } = await supabase.from('workspaces').select('team_id').eq('id', b.workspace_id).maybeSingle()
        if (ws?.team_id) {
          const { data: tm } = await supabase.from('teams').select('ai_work_share').eq('id', ws.team_id).maybeSingle()
          setTeamShare(tm?.ai_work_share ?? null)
        } else {
          setTeamShare(null)
        }
      } catch {
        setTeamShare(null)
      }
    }

    const versionBeforeFetch = mutationVersionRef.current
    const [{ data: gr }, { data: cols }, its, { data: bm }] = await Promise.all([
      supabase.from('groups').select('*').eq('board_id', boardId).order('position'),
      supabase.from('columns').select('*').eq('board_id', boardId).order('position'),
      fetchAllRows((f, t) =>
        supabase.from('items').select('*').eq('board_id', boardId).order('position').range(f, t)
      ),
      supabase.from('board_members').select('user_id, role').eq('board_id', boardId),
    ])
    // אם התבצע שינוי מקומי אופטימי (הוספה/מחיקה/שינוי שם וכו') תוך כדי המשיכה הזו,
    // הנתונים שנשלפו כאן בהכרח ישנים ממנו — מוותרים על החלתם כדי לא לדרוס אותו.
    if (mutationVersionRef.current === versionBeforeFetch) {
      setGroups(gr || [])
      setColumns(cols || [])
      setItems(its || [])
    }

    const colIds = (cols || []).map((c) => c.id)
    if (colIds.length) {
      // שולפים cell_values לפי column_id (רשימה קטנה) עם עימוד — מונע גם URL ענק וגם חיתוך ב-1000
      const cv = await fetchAllRows((f, t) =>
        supabase.from('cell_values').select('item_id, column_id, value').in('column_id', colIds).range(f, t)
      )
      const map = {}
      for (const c of cv) map[`${c.item_id}:${c.column_id}`] = c.value
      // תא עם כתיבה שעדיין באוויר (ראו pendingCellSavesRef) שומר את הערך המקומי-אופטימי —
      // הפולינג הזה בהכרח שלף נתונים ישנים יותר מהכתיבה, אז דריסה כאן תמיד תהיה נסיגה לערך הישן
      setCells((prev) => {
        if (pendingCellSavesRef.current.size === 0) return map
        const merged = { ...map }
        for (const key of pendingCellSavesRef.current) if (key in prev) merged[key] = prev[key]
        return merged
      })
    } else {
      setCells({})
    }

    const { data: deps } = await supabase
      .from('item_dependencies')
      .select('item_id, depends_on_id')
      .eq('board_id', boardId)
    setDependencies(deps || [])

    if (currentOrg?.role === 'admin') setMyRole('owner')
    else {
      const mine = (bm || []).find((m) => m.user_id === user?.id)
      // ברירת מחדל: כל חבר ארגון עורך את בורדי הארגון שלו (תואם ל-auth_board_role ב-DB),
      // אלא אם יש שיוך מפורש ב-board_members שקובע אחרת (viewer מוגבל למשל)
      setMyRole(mine?.role || 'editor')
    }
    setLoading(false)
  }, [boardId, currentOrg, user])

  useEffect(() => {
    load()
  }, [load])

  // התקנה-עצמית: בורד עם קבוצת "הושלם" מקבל אוטומטית את חוק
  // "סטטוס הושלם ← העבר לקבוצת הושלם" (ובבורד מעקב-AI בלי עמודת סטטוס —
  // נוצרת גם עמודת סטטוס). בנוסף, "סריקת השלמה": פריטים שכבר בסטטוס הושלם
  // אבל יושבים בקבוצה אחרת (סומנו לפני שהחוק היה קיים / ע"י משתמש אחר)
  // מועברים לקבוצת הושלם בפתיחת הבורד — כי האוטומציה עצמה רצה רק בשינוי סטטוס.
  // רץ פעם אחת לכל בורד, רק אצל מי שמורשה לערוך, ולעולם לא חוסם את הטעינה.
  const ensuredDoneAutoRef = useRef(null)
  // מפתחות "itemId:columnId" עם כתיבה לשרת שעוד לא הסתיימה — טעינה שקטה (פולינג/פוקוס)
  // שנופלת באמצע לא תדרוס אותם בחזרה לערך הישן, כי היא בהכרח שלפה נתונים לפני שהכתיבה נחתה.
  const pendingCellSavesRef = useRef(new Set())
  // אותה בעיה קיימת גם ב-items/groups/columns (השינוי המקומי שם הוא מערך שלם, לא תא בודד,
  // אז אין "מפתח" למעקב פר-שדה — במקום זה סופרים גרסה: כל שינוי מקומי אופטימי מקדם אותה,
  // וטעינה שקטה שהתחילה למשוך נתונים *לפני* שינוי כזה מוותרת על ההחלה שלה (במקום לדרוס).
  const mutationVersionRef = useRef(0)
  useEffect(() => {
    if (loading || !editable || !boardId) return
    if (ensuredDoneAutoRef.current === boardId) return
    ensuredDoneAutoRef.current = boardId
    ;(async () => {
      try {
        const doneGroup = groups.find((g) => (g.name || '').trim() === 'הושלם')
        if (!doneGroup) return
        let statusCol = columns.find((c) => c.type === 'status')
        if (!statusCol) {
          const isAiBoard =
            columns.some((c) => c.name === 'זמן עם AI (בדקות)') &&
            columns.some((c) => c.name === 'זמן ידני משוער (בדקות)')
          if (!isAiBoard) return
          // בדיקה טרייה מול השרת ממש לפני ההכנסה — סוגרת את חלון-המירוץ שבו שתי
          // לשוניות/מכשירים פותחים את הבורד בו-זמנית ושניהם רואים "אין עמודת סטטוס"
          // בסטייט המקומי (שנטען קודם), וכל אחד מכניס עמודה משלו.
          const { data: freshCols } = await supabase.from('columns').select('*').eq('board_id', boardId).eq('type', 'status')
          if (freshCols?.length) {
            statusCol = freshCols[0]
            mutationVersionRef.current++
            setColumns((p) => (p.some((c) => c.id === statusCol.id) ? p : [...p, statusCol]))
          } else {
            const { data: created } = await supabase
              .from('columns')
              .insert({
                board_id: boardId,
                name: 'סטטוס',
                type: 'status',
                position: columns.length,
                settings: { labels: DEFAULT_STATUS_LABELS },
              })
              .select()
              .single()
            if (!created) return
            statusCol = created
            mutationVersionRef.current++
            setColumns((p) => [...p, created])
          }
        }
        const labels = statusCol.settings?.labels || DEFAULT_STATUS_LABELS
        const doneLabel = labels.find((l) => l.id === 'done') || labels.find((l) => (l.label || '').trim() === 'הושלם')
        if (!doneLabel) return
        const { data: autos, error } = await supabase.from('automations').select('id, action, enabled').eq('board_id', boardId)
        if (error) return
        const existing = (autos || []).find((a) => a.action?.type === 'move_group' && a.action?.group_id === doneGroup.id)
        if (!existing) {
          await supabase.from('automations').insert({
            board_id: boardId,
            name: 'סטטוס "הושלם" מעביר לקבוצת "הושלם"',
            trigger: { type: 'status_is', column_id: statusCol.id, label_id: doneLabel.id },
            action: { type: 'move_group', group_id: doneGroup.id },
            enabled: true,
          })
        } else if (!existing.enabled) {
          return // המשתמש כיבה את החוק בכוונה — לא סורקים ולא מעבירים
        }
        // סריקת השלמה: פריטים בסטטוס הושלם שלא בקבוצת הושלם
        const toMove = items.filter(
          (i) =>
            !i.parent_item_id &&
            i.group_id !== doneGroup.id &&
            cells[`${i.id}:${statusCol.id}`]?.id === doneLabel.id
        )
        if (!toMove.length) return
        const ids = toMove.map((i) => i.id)
        const { error: mvErr } = await supabase.from('items').update({ group_id: doneGroup.id }).in('id', ids)
        if (mvErr) return
        mutationVersionRef.current++
        setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, group_id: doneGroup.id } : i)))
        toast(`${toMove.length} משימות שהושלמו הועברו לקבוצת "הושלם"`)
      } catch {
        /* לעולם לא חוסם את טעינת הבורד */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, editable, boardId, groups, columns, items, cells])

  // רענון שקט (בלי מסך טעינה) כשחוזרים לטאב, וכל 20 שניות ברקע —
  // כדי לראות עדכונים של חברי צוות אחרים בלי לרענן ידנית.
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === 'visible') load({ silent: true })
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    const interval = setInterval(() => load({ silent: true }), 20000)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [load])

  // --- כלים: תוויות סטטוס זמינות, וסינון/מיון ---
  const statusLabels = useMemo(() => {
    const seen = new Map()
    for (const c of columns)
      if (c.type === 'status')
        for (const l of c.settings?.labels || DEFAULT_STATUS_LABELS)
          if (l.label && !seen.has(l.id)) seen.set(l.id, l)
    return [...seen.values()]
  }, [columns])

  const statusCols = useMemo(() => columns.filter((c) => c.type === 'status'), [columns])
  const personCols = useMemo(() => columns.filter((c) => c.type === 'person'), [columns])
  const filtersActive = search.trim() || filterStatus !== 'all' || filterPerson !== 'all' || sortBy !== 'none'

  const visibleFor = useCallback(
    (groupId) => {
      let list = items.filter((i) => i.group_id === groupId && !i.parent_item_id)
      const q = search.trim().toLowerCase()
      if (q) {
        list = list.filter((it) => {
          const parts = [it.name]
          for (const c of columns) {
            const v = cells[`${it.id}:${c.id}`]
            if (!v) continue
            if (c.type === 'text') parts.push(v.text)
            else if (c.type === 'number') parts.push(v.number)
            else if (c.type === 'status') parts.push(statusLabels.find((l) => l.id === v.id)?.label)
            else if (c.type === 'person') {
              for (const uid of getPersonIds(v)) {
                const m = members.find((mm) => mm.user_id === uid)
                parts.push(m?.full_name || m?.email)
              }
            }
          }
          return parts.filter(Boolean).join(' ').toLowerCase().includes(q)
        })
      }
      if (filterStatus !== 'all') {
        list = list.filter((it) => statusCols.some((c) => cells[`${it.id}:${c.id}`]?.id === filterStatus))
      }
      if (filterPerson !== 'all') {
        list = list.filter((it) => personCols.some((c) => getPersonIds(cells[`${it.id}:${c.id}`]).includes(filterPerson)))
      }
      if (sortBy !== 'none') {
        const col = columns.find((c) => c.id === sortBy)
        if (col) list = [...list].sort((a, b) => sortVal(col, cells[`${a.id}:${col.id}`], cells[`${b.id}:${col.id}`], members, statusLabels))
      }
      return list
    },
    [items, search, filterStatus, filterPerson, sortBy, columns, cells, members, statusCols, personCols, statusLabels]
  )

  // התאמת פריט לחיפוש/סינון (לשימוש בקנבן/לוח שנה)
  const matchItem = useCallback(
    (it, useStatus) => {
      if (it.parent_item_id) return false
      const q = search.trim().toLowerCase()
      if (q) {
        const parts = [it.name]
        for (const c of columns) {
          const v = cells[`${it.id}:${c.id}`]
          if (!v) continue
          if (c.type === 'text' || c.type === 'phone' || c.type === 'email' || c.type === 'link') parts.push(v.text)
          else if (c.type === 'number') parts.push(v.number)
          else if (c.type === 'status') parts.push(statusLabels.find((l) => l.id === v.id)?.label)
          else if (c.type === 'person') {
            for (const uid of getPersonIds(v)) {
              const m = members.find((mm) => mm.user_id === uid)
              parts.push(m?.full_name || m?.email)
            }
          }
        }
        if (!parts.filter(Boolean).join(' ').toLowerCase().includes(q)) return false
      }
      if (filterPerson !== 'all' && !personCols.some((c) => getPersonIds(cells[`${it.id}:${c.id}`]).includes(filterPerson))) return false
      if (useStatus && filterStatus !== 'all' && !statusCols.some((c) => cells[`${it.id}:${c.id}`]?.id === filterStatus)) return false
      return true
    },
    [search, filterPerson, filterStatus, columns, cells, members, statusLabels, statusCols, personCols]
  )

  // --- פעולות ---
  async function addItem(groupId) {
    const count = items.filter((i) => i.group_id === groupId).length
    const { data } = await supabase
      .from('items')
      .insert({ group_id: groupId, board_id: boardId, name: 'פריט חדש', position: count })
      .select()
      .single()
    if (data) {
      mutationVersionRef.current++
      setItems((p) => [...p, data])
      toast('פריט נוסף')
      logActivity(boardId, 'create_item', 'הוסיף/ה פריט חדש', user)
    }
  }

  async function updateItemName(itemId, name) {
    const prev = items.find((i) => i.id === itemId)
    await supabase.from('items').update({ name }).eq('id', itemId)
    mutationVersionRef.current++
    setItems((p) => p.map((i) => (i.id === itemId ? { ...i, name } : i)))
    if (prev && prev.name !== name) {
      logActivity(boardId, 'rename_item', `שינה/תה את שם הפריט מ-"${prev.name || 'פריט'}" ל-"${name}"`, user)
    }
  }

  async function addSubitem(parent) {
    const { data } = await supabase
      .from('items')
      .insert({ group_id: parent.group_id, board_id: boardId, name: 'תת-משימה', parent_item_id: parent.id, position: 0 })
      .select()
      .single()
    if (data) {
      mutationVersionRef.current++
      setItems((p) => [...p, data])
      logActivity(boardId, 'create_subitem', `הוסיף/ה תת-משימה בפריט "${parent.name || 'פריט'}"`, user)
    }
  }

  function deleteItemWithUndo(item) {
    const itemCells = Object.entries(cells)
      .filter(([k]) => k.startsWith(item.id + ':'))
      .map(([k, v]) => ({ column_id: k.split(':')[1], value: v }))
    supabase.from('items').delete().eq('id', item.id).then(() => {})
    mutationVersionRef.current++
    setItems((p) => p.filter((i) => i.id !== item.id))
    toast({
      message: 'הפריט נמחק',
      type: 'info',
      action: { label: 'ביטול', onClick: () => restoreItem(item, itemCells) },
    })
    logActivity(boardId, 'delete_item', `מחק/ה את "${item.name || 'פריט'}"`, user)
  }

  async function restoreItem(item, itemCells) {
    const { data } = await supabase
      .from('items')
      .insert({ group_id: item.group_id, board_id: boardId, name: item.name, position: item.position })
      .select()
      .single()
    if (data) {
      mutationVersionRef.current++
      setItems((p) => [...p, data])
      if (itemCells.length) {
        const rows = itemCells.map((c) => ({ item_id: data.id, column_id: c.column_id, value: c.value }))
        await supabase.from('cell_values').insert(rows)
        setCells((prev) => {
          const next = { ...prev }
          for (const c of itemCells) next[`${data.id}:${c.column_id}`] = c.value
          return next
        })
      }
      toast('הפריט שוחזר')
    }
  }

  async function addGroup() {
    const { data } = await supabase
      .from('groups')
      .insert({ board_id: boardId, name: 'קבוצה חדשה', color: GROUP_COLORS[groups.length % GROUP_COLORS.length], position: groups.length })
      .select()
      .single()
    if (data) {
      mutationVersionRef.current++
      setGroups((p) => [...p, data])
      toast('קבוצה נוספה')
      logActivity(boardId, 'create_group', 'הוסיף/ה קבוצה', user)
    }
  }

  async function updateGroupName(groupId, name) {
    await supabase.from('groups').update({ name }).eq('id', groupId)
    mutationVersionRef.current++
    setGroups((p) => p.map((g) => (g.id === groupId ? { ...g, name } : g)))
  }

  async function deleteGroup(groupId) {
    await supabase.from('groups').delete().eq('id', groupId)
    mutationVersionRef.current++
    setGroups((p) => p.filter((g) => g.id !== groupId))
    setItems((p) => p.filter((i) => i.group_id !== groupId))
    toast({ message: 'הקבוצה נמחקה', type: 'info' })
    logActivity(boardId, 'delete_group', 'מחק/ה קבוצה', user)
  }

  async function addColumn() {
    if (!colName.trim()) return
    const settings =
      colType === 'status'
        ? { labels: DEFAULT_STATUS_LABELS }
        : colType === 'tags'
          ? { labels: DEFAULT_TAG_LABELS }
          : colType === 'dropdown'
            ? { labels: DEFAULT_DROPDOWN_LABELS }
            : colType === 'formula'
              ? { formula: colFormula.trim() }
              : {}
    const { data } = await supabase
      .from('columns')
      .insert({ board_id: boardId, name: colName.trim(), type: colType, settings, position: columns.length })
      .select()
      .single()
    if (data) {
      mutationVersionRef.current++
      setColumns((p) => [...p, data])
      toast('עמודה נוספה')
      logActivity(boardId, 'create_column', `הוסיף/ה עמודה "${data.name}"`, user)
    }
    setColName('')
    setColType('text')
    setColFormula('')
    setColModal(false)
  }

  async function deleteColumn(columnId) {
    await supabase.from('columns').delete().eq('id', columnId)
    mutationVersionRef.current++
    setColumns((p) => p.filter((c) => c.id !== columnId))
    if (sortBy === columnId) setSortBy('none')
    toast({ message: 'העמודה נמחקה', type: 'info' })
    logActivity(boardId, 'delete_column', 'מחק/ה עמודה', user)
  }

  async function saveCell(itemId, columnId, value) {
    const cellKey = `${itemId}:${columnId}`
    const prevValue = cells[cellKey]
    setCells((p) => ({ ...p, [cellKey]: value }))
    pendingCellSavesRef.current.add(cellKey)
    try {
      await supabase
        .from('cell_values')
        .upsert({ item_id: itemId, column_id: columnId, value }, { onConflict: 'item_id,column_id' })
    } finally {
      pendingCellSavesRef.current.delete(cellKey)
    }
    const col = columns.find((c) => c.id === columnId)
    const item = items.find((i) => i.id === itemId)
    if (col?.type === 'person') {
      // מתריעים רק על אנשים שהתווספו עכשיו (לא מי שכבר היה משויך קודם)
      const prevIds = getPersonIds(prevValue)
      const newlyAdded = getPersonIds(value).filter((uid) => !prevIds.includes(uid))
      for (const uid of newlyAdded) {
        if (uid === user?.id) continue
        notifyAssignment({
          recipientId: uid,
          orgId: currentOrg?.id,
          boardId,
          itemId,
          itemName: item?.name,
          fromName: user?.user_metadata?.full_name || user?.email,
        })
      }
    }
    logActivity(boardId, 'update_cell', `עדכן/ה את "${col?.name || 'שדה'}" בפריט "${item?.name || ''}"`, user)
    if (col?.type === 'status' && item) {
      runAutomations({
        boardId,
        item,
        columns,
        cells: { ...cells, [`${itemId}:${columnId}`]: value },
        members,
        user,
        setCells,
        setItems,
        pendingCellSavesRef,
        bumpMutationVersion: () => { mutationVersionRef.current++ },
      })
    }
  }

  async function updateColumnSettings(columnId, settings) {
    mutationVersionRef.current++
    setColumns((p) => p.map((c) => (c.id === columnId ? { ...c, settings } : c)))
    await supabase.from('columns').update({ settings }).eq('id', columnId)
    toast('התוויות עודכנו')
  }

  async function updateItemDesc(itemId, description) {
    mutationVersionRef.current++
    setItems((p) => p.map((i) => (i.id === itemId ? { ...i, description } : i)))
    await supabase.from('items').update({ description }).eq('id', itemId)
  }

  async function updateColumnName(columnId, name) {
    if (!name.trim()) return
    mutationVersionRef.current++
    setColumns((p) => p.map((c) => (c.id === columnId ? { ...c, name: name.trim() } : c)))
    await supabase.from('columns').update({ name: name.trim() }).eq('id', columnId)
  }

  async function reorderColumns(draggedId, targetId) {
    if (draggedId === targetId) return
    const arr = [...columns]
    const from = arr.findIndex((c) => c.id === draggedId)
    const to = arr.findIndex((c) => c.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    mutationVersionRef.current++
    setColumns(arr)
    await Promise.all(arr.map((c, i) => supabase.from('columns').update({ position: i }).eq('id', c.id)))
  }

  // קיצורי מקלדת (כשלא מקלידים בשדה)
  useEffect(() => {
    function onKey(e) {
      const el = e.target
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (typing) return
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      } else if (e.key === '/') {
        e.preventDefault()
        document.querySelector('input[placeholder="חיפוש פריט..."]')?.focus()
      } else if (e.key === 'n' && editable && view === 'table' && groups[0]) {
        e.preventDefault()
        addItem(groups[0].id)
      } else if ((e.key === '1' || e.key === '2' || e.key === '3')) {
        setView(['table', 'kanban', 'calendar'][Number(e.key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, view, groups])

  if (loading)
    return (
      <div className="px-8 py-9">
        <LoadingSpinner />
      </div>
    )
  if (!board)
    return <div className="px-8 py-16 text-center text-ink-muted">הבורד לא נמצא או שאין לך גישה אליו.</div>

  return (
    <div className="px-8 py-7">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 w-full sm:w-auto">
          <h1 className="truncate font-display text-[24px] font-bold tracking-tight text-ink">{board.name}</h1>
          {!editable && (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-ink-muted ring-1 ring-line">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 3C4.5 3 2 8 2 8s2.5 5 6 5 6-5 6-5-2.5-5-6-5z" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              צפייה בלבד
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <button
            onClick={async () => {
              try {
                await exportBoardToExcel({ board, groups, columns, items, cells, members })
                toast('הבורד יוצא לאקסל')
              } catch {
                toast({ message: 'הייצוא נכשל', type: 'error' })
              }
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted ring-1 ring-line transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            title="ייצוא לאקסל"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v9m0 0l-3.2-3.2M10 12l3.2-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 14v1.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => setActivityOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted ring-1 ring-line transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            title="יומן פעילות"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 6v4l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => setShortcutsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted ring-1 ring-line transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            title="קיצורי מקלדת (?)"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5.5 8h.01M8 8h.01M10.5 8h.01M13 8h.01M6.5 11h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          {editable && (
            <button
              onClick={() => setAutoOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted ring-1 ring-line transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
              title="אוטומציות"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M11 2L4 11h5l-1 7 7-9h-5l1-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {isOwner && (
            <Button variant="secondary" size="sm" onClick={() => setShareOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10.3 5.1L5.7 6.9M5.7 9.1l4.6 1.8" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              שיתוף
            </Button>
          )}
          {editable && (
            <Button size="sm" onClick={addGroup}>
              + קבוצה
            </Button>
          )}
        </div>
      </header>

      <ViewSwitcher view={view} setView={setView} />

      <BoardToolbar
        search={search}
        setSearch={setSearch}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterPerson={filterPerson}
        setFilterPerson={setFilterPerson}
        sortBy={sortBy}
        setSortBy={setSortBy}
        statusLabels={statusLabels}
        members={members}
        columns={columns}
        onClear={() => {
          setSearch('')
          setFilterStatus('all')
          setFilterPerson('all')
          setSortBy('none')
        }}
      />

      {view !== 'table' && (
        <Suspense fallback={<div className="py-16"><LoadingSpinner /></div>}>
          {view === 'kanban' && (
            <KanbanView
              items={items.filter((it) => matchItem(it, false))}
              statusColumn={statusCols[0] || null}
              statusLabels={statusLabels}
              groups={groups}
              columns={columns}
              cells={cells}
              members={members}
              editable={editable}
              onSaveCell={saveCell}
              onOpenItem={(it) => setPanelItemId(it.id)}
            />
          )}
          {view === 'calendar' && (
            <CalendarView
              items={items.filter((it) => matchItem(it, true))}
              dateColumn={columns.find((c) => c.type === 'date') || null}
              statusColumn={statusCols[0] || null}
              statusLabels={statusLabels}
              cells={cells}
            />
          )}
          {view === 'gantt' && (
            <GanttView
              items={items.filter((it) => !it.parent_item_id)}
              columns={columns}
              cells={cells}
              groups={groups}
              statusLabels={statusLabels}
              dependencies={dependencies}
              onOpenItem={(it) => setPanelItemId(it.id)}
            />
          )}
          {view === 'reports' && (
            <ReportsView
              items={items.filter((it) => !it.parent_item_id)}
              groups={groups}
              columns={columns}
              cells={cells}
              members={members}
              statusLabels={statusLabels}
              teamShare={teamShare}
              onGoToTable={() => setView('table')}
            />
          )}
        </Suspense>
      )}

      {view === 'table' && (
      <div className="space-y-7">
        {groups.map((group) => {
          const vis = visibleFor(group.id)
          const total = items.filter((i) => i.group_id === group.id && !i.parent_item_id).length
          if (filtersActive && vis.length === 0) return null
          return (
            <GroupTable
              key={group.id}
              group={group}
              columns={columns}
              items={vis}
              total={total}
              filtered={filtersActive}
              cells={cells}
              members={members}
              editable={editable}
              onAddItem={() => addItem(group.id)}
              onRenameGroup={(name) => updateGroupName(group.id, name)}
              onDeleteGroup={() =>
                setConfirm({ message: `למחוק את הקבוצה "${group.name}" וכל הפריטים שבה?`, onConfirm: () => deleteGroup(group.id) })
              }
              onUpdateItemName={updateItemName}
              onDeleteItem={(it) => deleteItemWithUndo(it)}
              onOpenItem={(it) => setPanelItemId(it.id)}
              onSaveCell={saveCell}
              onAddColumn={() => setColModal(true)}
              onEditLabels={(col) => setLabelCol(col)}
              onUpdateColumnName={updateColumnName}
              onReorderColumn={reorderColumns}
              dragCol={dragCol}
              setDragCol={setDragCol}
              onDeleteColumn={(id, name) =>
                setConfirm({ message: `למחוק את העמודה "${name}"? כל הנתונים בעמודה יימחקו.`, onConfirm: () => deleteColumn(id) })
              }
            />
          )
        })}

        {groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-8 py-16 text-center text-ink-muted">
            אין עדיין קבוצות בבורד.
            {editable && (
              <div className="mt-4">
                <Button onClick={addGroup}>+ הוספת קבוצה ראשונה</Button>
              </div>
            )}
          </div>
        )}

        {groups.length > 0 && !filtersActive && items.filter((i) => !i.parent_item_id).length === 0 && (
          <div className="flex flex-col items-center rounded-2xl bg-surface px-6 py-14 text-center ring-1 ring-line">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-[20px]">📋</div>
            <div className="text-[15px] font-semibold text-ink">הבורד עוד ריק</div>
            <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-ink-muted">
              הוסיפו את הפריט הראשון כדי להתחיל לעקוב אחרי משימות, נתונים ודוחות בבורד הזה.
            </p>
            {editable && (
              <button
                onClick={() => addItem(groups[0].id)}
                className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 cursor-pointer"
              >
                + הוספת פריט ראשון
              </button>
            )}
          </div>
        )}

        {groups.length > 0 && filtersActive && groups.every((g) => visibleFor(g.id).length === 0) && (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/50 px-8 py-12 text-center text-ink-muted">
            אין פריטים שתואמים לחיפוש/סינון.
          </div>
        )}
      </div>
      )}

      <Modal open={colModal} onClose={() => setColModal(false)} title="עמודה חדשה">
        <div className="space-y-4">
          <Input
            label="שם העמודה"
            value={colName}
            onChange={(e) => setColName(e.target.value)}
            placeholder="לדוגמה: עדיפות, טלפון, סכום"
            autoFocus
          />
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">סוג העמודה</span>
            <div className="grid grid-cols-2 gap-2">
              {COLUMN_TYPES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => {
                    setColType(t.type)
                    setColName(t.label)
                  }}
                  className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors ${
                    colType === t.type ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'text-ink-soft ring-1 ring-line hover:bg-surface-2'
                  }`}
                >
                  <span className="text-base">{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          </div>
          {colType === 'formula' && (
            <Input
              label="נוסחה"
              value={colFormula}
              onChange={(e) => setColFormula(e.target.value)}
              placeholder="לדוגמה: {כמות} * {מחיר} * 1.17"
              hint="הפנה לעמודות מספר בשם בתוך סוגריים מסולסלים, עם + - * / וסוגריים."
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setColModal(false)}>ביטול</Button>
            <Button onClick={addColumn}>הוספה</Button>
          </div>
        </div>
      </Modal>

      <AutomationsModal open={autoOpen} onClose={() => setAutoOpen(false)} boardId={boardId} columns={columns} groups={groups} />

      <BoardMembersModal open={shareOpen} onClose={() => setShareOpen(false)} boardId={boardId} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.onConfirm()}
        message={confirm?.message}
      />
      <LabelEditorModal
        open={!!labelCol}
        column={labelCol}
        onClose={() => setLabelCol(null)}
        onSave={(settings) => {
          updateColumnSettings(labelCol.id, settings)
          setLabelCol(null)
        }}
      />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ActivityModal open={activityOpen} onClose={() => setActivityOpen(false)} boardId={boardId} />

      {panelItemId && items.find((i) => i.id === panelItemId) && (
        <ItemPanel
          item={items.find((i) => i.id === panelItemId)}
          columns={columns}
          cells={cells}
          members={members}
          editable={editable}
          subitems={items.filter((i) => i.parent_item_id === panelItemId)}
          boardItems={items.filter((i) => !i.parent_item_id).map((i) => ({ id: i.id, name: i.name }))}
          onAddSubitem={() => addSubitem(items.find((i) => i.id === panelItemId))}
          onDeleteSubitem={(it) => deleteItemWithUndo(it)}
          onClose={() => setPanelItemId(null)}
          onSaveCell={saveCell}
          onUpdateName={updateItemName}
          onUpdateDesc={updateItemDesc}
        />
      )}
    </div>
  )
}

// פתרון ערך מספרי של עמודה לפי שם (לנוסחאות)
function resolveNumber(name, item, columns, cells) {
  const c = columns.find((cc) => cc.name === name)
  if (!c) return 0
  const v = cells[`${item.id}:${c.id}`]
  if (!v) return 0
  if (c.type === 'number') return Number(v.number) || 0
  if (c.type === 'formula') {
    const r = computeFormula(c.settings?.formula || '', (n) => resolveNumber(n, item, columns, cells))
    return Number(r) || 0
  }
  const n = parseFloat(v.text)
  return Number.isFinite(n) ? n : 0
}

function formatFormula(r) {
  if (r === '' || r == null || Number.isNaN(Number(r))) return ''
  return Number(r).toLocaleString('he-IL', { maximumFractionDigits: 2 })
}

function sortVal(col, a, b, members, statusLabels) {
  const key = (v) => {
    if (!v) return ''
    if (col.type === 'number') return v.number ?? -Infinity
    if (col.type === 'date') return v.date || '9999'
    if (col.type === 'status') return statusLabels.findIndex((l) => l.id === v.id)
    if (col.type === 'person') {
      const names = getPersonIds(v)
        .map((uid) => members.find((mm) => mm.user_id === uid))
        .map((m) => m?.full_name || m?.email || '')
        .filter(Boolean)
      return names.join(', ').toLowerCase()
    }
    return (v.text || '').toLowerCase()
  }
  const ka = key(a)
  const kb = key(b)
  if (typeof ka === 'number' && typeof kb === 'number') return ka - kb
  return String(ka).localeCompare(String(kb), 'he')
}

function GroupTable({
  group,
  columns,
  items,
  total,
  filtered,
  cells,
  members,
  editable,
  onAddItem,
  onRenameGroup,
  onDeleteGroup,
  onUpdateItemName,
  onDeleteItem,
  onOpenItem,
  onSaveCell,
  onAddColumn,
  onEditLabels,
  onUpdateColumnName,
  onReorderColumn,
  dragCol,
  setDragCol,
  onDeleteColumn,
}) {
  const [name, setName] = useState(group.name)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => setName(group.name), [group.name])

  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-5 w-5 items-center justify-center text-[11px] text-ink-muted transition-transform cursor-pointer"
          style={{ transform: collapsed ? 'rotate(90deg)' : 'none' }}
          title={collapsed ? 'הרחב' : 'כווץ'}
        >
          ▾
        </button>
        <input
          disabled={!editable}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== group.name && onRenameGroup(name)}
          className="min-w-0 rounded bg-transparent px-1 py-0.5 text-[15px] font-bold outline-none transition-colors focus:bg-surface-2 disabled:cursor-default"
          style={{ color: group.color }}
        />
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
          {filtered ? `${items.length}/${total}` : total}
        </span>
        {editable && (
          <button
            onClick={onDeleteGroup}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-muted opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100 cursor-pointer"
            title="מחיקת קבוצה"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {!collapsed && (
        <div
          className="overflow-x-auto rounded-lg bg-surface ring-1 ring-line shadow-xs"
          style={{ borderInlineStart: `4px solid ${group.color}` }}
        >
          <table className="w-full border-collapse text-right">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-[12px] font-medium text-ink-soft">
                <th className="px-4 py-2.5 text-right font-medium" style={{ minWidth: 240 }}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: group.color }} />
                    פריט
                  </span>
                </th>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    draggable={editable}
                    onDragStart={(e) => {
                      setDragCol(col.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => editable && dragCol && dragCol !== col.id && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragCol) onReorderColumn(dragCol, col.id)
                      setDragCol(null)
                    }}
                    onDragEnd={() => setDragCol(null)}
                    className={`group/col border-r border-line px-3 py-2.5 text-center font-medium ${dragCol === col.id ? 'opacity-40' : ''} ${
                      editable ? 'cursor-grab' : ''
                    }`}
                    style={{ minWidth: 132 }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {editable ? <ColName col={col} onSave={(n) => onUpdateColumnName(col.id, n)} /> : col.name}
                      {editable && (col.type === 'status' || col.type === 'tags' || col.type === 'dropdown') && (
                        <button
                          onClick={() => onEditLabels(col)}
                          className="text-ink-muted opacity-0 transition-opacity hover:text-brand-600 group-hover/col:opacity-100 cursor-pointer"
                          title="עריכת תוויות"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                      {editable && (
                        <button
                          onClick={() => onDeleteColumn(col.id, col.name)}
                          className="text-ink-muted opacity-0 transition-opacity hover:text-danger group-hover/col:opacity-100 cursor-pointer"
                          title="מחיקת עמודה"
                        >
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </span>
                  </th>
                ))}
                {editable && (
                  <th className="border-r border-line px-2 py-2.5 text-center" style={{ width: 46 }}>
                    <button
                      onClick={onAddColumn}
                      className="flex h-6 w-6 items-center justify-center rounded text-base text-ink-muted transition-colors hover:bg-surface-2 hover:text-brand-600 cursor-pointer"
                      title="עמודה חדשה"
                    >
                      +
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className={`group/row transition-colors hover:bg-surface-2/50 ${idx !== items.length - 1 ? 'border-b border-line' : ''}`}>
                  <td className="px-2" style={{ minWidth: 240 }}>
                    <div className="flex items-center">
                      <ItemName item={item} editable={editable} onSave={(n) => onUpdateItemName(item.id, n)} />
                      <button
                        onClick={() => onOpenItem(item)}
                        className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-ink-muted opacity-0 transition-all hover:bg-surface-2 hover:text-brand-600 group-hover/row:opacity-100 cursor-pointer"
                        title="פתיחת פרטים ודיון"
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M9.5 2.5H13.5V6.5M13.5 2.5L8.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M11 9.5V12a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 012 12V6a1.5 1.5 0 011.5-1.5H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        פתח
                      </button>
                      {editable && (
                        <button
                          onClick={() => onDeleteItem(item)}
                          className="flex h-6 w-6 items-center justify-center rounded text-ink-muted opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover/row:opacity-100 cursor-pointer"
                          title="מחיקת פריט"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col.id} className="border-r border-line p-0 text-center">
                      {col.type === 'formula' ? (
                        <div className="flex h-11 items-center justify-center px-3 text-sm tabular-nums text-ink-soft" title="ערך מחושב">
                          {formatFormula(computeFormula(col.settings?.formula || '', (n) => resolveNumber(n, item, columns, cells)))}
                        </div>
                      ) : (
                        <Cell column={col} value={cells[`${item.id}:${col.id}`]} members={members} editable={editable} onChange={(v) => onSaveCell(item.id, col.id, v)} />
                      )}
                    </td>
                  ))}
                  {editable && <td className="border-r border-line" />}
                </tr>
              ))}
            </tbody>
          </table>

          {editable && (
            <button
              onClick={onAddItem}
              className="flex w-full items-center gap-1.5 border-t border-line px-4 py-2.5 text-right text-[13px] text-ink-muted transition-colors hover:bg-surface-2/60 hover:text-brand-600 cursor-pointer"
            >
              <span className="text-base leading-none">+</span> הוספת פריט
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function ColName({ col, onSave }) {
  const [name, setName] = useState(col.name)
  useEffect(() => setName(col.name), [col.name])
  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => name.trim() && name !== col.name && onSave(name)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onDragStart={(e) => e.preventDefault()}
      style={{ width: `${Math.min(22, Math.max(4, name.length + 1))}ch` }}
      className="rounded bg-transparent text-center font-medium text-ink-soft outline-none transition-colors focus:bg-surface-2 focus:text-ink"
      title="שינוי שם עמודה"
    />
  )
}

function ItemName({ item, editable, onSave }) {
  const [name, setName] = useState(item.name)
  useEffect(() => setName(item.name), [item.name])
  return (
    <input
      disabled={!editable}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => name !== item.name && onSave(name)}
      className="flex-1 rounded bg-transparent px-1.5 py-3 text-sm font-medium text-ink outline-none transition-colors focus:bg-surface-2 disabled:cursor-default"
    />
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 4.5h10M6.5 4.5V3.5a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ViewSwitcher({ view, setView }) {
  return (
    <div className="mb-4 inline-flex rounded-lg bg-surface-2 p-0.5 ring-1 ring-line">
      {BOARD_VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
            view === v.id ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
