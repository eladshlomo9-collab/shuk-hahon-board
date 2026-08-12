import { supabase } from './supabase'

// רישום פעילות ביומן הבורד. שקט בכישלון (אם הטבלה עדיין לא נוצרה).
export async function logActivity(boardId, action, detail, user) {
  if (!boardId) return
  try {
    await supabase.from('activity').insert({
      board_id: boardId,
      user_id: user?.id || null,
      user_name: user?.user_metadata?.full_name || user?.email || null,
      action,
      detail,
    })
  } catch {
    /* table may not exist yet */
  }
}

// יצירת התראה למשתמש אחר (למשל שיוך משימה). שקט בכישלון.
export async function notifyAssignment({ recipientId, orgId, boardId, itemId, itemName, fromName }) {
  if (!recipientId) return
  try {
    await supabase.from('notifications').insert({
      user_id: recipientId,
      org_id: orgId || null,
      board_id: boardId || null,
      item_id: itemId || null,
      type: 'assigned',
      message: `${fromName || 'מישהו'} שייך/ה אליך את "${itemName || 'משימה'}"`,
    })
  } catch {
    /* ignore */
  }
}
