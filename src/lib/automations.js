import { supabase } from './supabase'
import { notifyAssignment } from './activity'

// מריץ אוטומציות עבור פריט אחרי שינוי סטטוס.
// נקרא מ-BoardPage.saveCell אחרי ששמרנו תא סטטוס.
// בטוח לחלוטין: עוטף הכל ב-try/catch ואף פעם לא זורק.
export async function runAutomations({ boardId, item, columns, cells, members, user, setCells, setItems, pendingCellSavesRef, bumpMutationVersion }) {
  try {
    if (!boardId || !item) return

    const { data: automations, error } = await supabase
      .from('automations')
      .select('*')
      .eq('board_id', boardId)
      .eq('enabled', true)

    // טבלה עדיין לא קיימת או שגיאת RLS — לצאת בשקט
    if (error || !Array.isArray(automations)) return

    for (const auto of automations) {
      try {
        const trigger = auto?.trigger
        const action = auto?.action
        if (!trigger || !action) continue

        // טריגר: ערך סטטוס נוכחי בעמודה תואם לתווית
        if (trigger.type !== 'status_is') continue
        const cur = cells?.[`${item.id}:${trigger.column_id}`]
        if (!cur || cur.id !== trigger.label_id) continue

        if (action.type === 'notify_assignee') {
          // למצוא את עמודת האנשים הראשונה ולקרוא את האחראי
          const personCol = (columns || []).find((c) => c.type === 'person')
          if (!personCol) continue
          const personCell = cells?.[`${item.id}:${personCol.id}`]
          const recipientId = personCell?.user_id
          if (!recipientId) continue
          await notifyAssignment({
            recipientId,
            orgId: null,
            boardId,
            itemId: item.id,
            itemName: item.name,
            fromName: user?.user_metadata?.full_name || user?.email,
          })
        } else if (action.type === 'set_status') {
          if (!action.column_id || !action.label_id) continue
          // לא לכתוב על עמודה שכבר נמחקה
          const targetCol = (columns || []).find((c) => c.id === action.column_id)
          if (!targetCol) continue
          const value = { id: action.label_id }
          const key = `${item.id}:${action.column_id}`
          pendingCellSavesRef?.current?.add(key)
          try {
            await supabase
              .from('cell_values')
              .upsert(
                { item_id: item.id, column_id: action.column_id, value },
                { onConflict: 'item_id,column_id' }
              )
          } finally {
            pendingCellSavesRef?.current?.delete(key)
          }
          if (typeof setCells === 'function') {
            setCells((prev) => ({ ...prev, [key]: value }))
          }
        } else if (action.type === 'move_group') {
          if (!action.group_id) continue
          await supabase.from('items').update({ group_id: action.group_id }).eq('id', item.id)
          if (typeof bumpMutationVersion === 'function') bumpMutationVersion()
          if (typeof setItems === 'function') {
            setItems((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, group_id: action.group_id } : i))
            )
          }
        }
      } catch {
        /* אוטומציה בודדת נכשלה — להמשיך לבאות */
      }
    }
  } catch {
    /* לעולם לא לזרוק */
  }
}
