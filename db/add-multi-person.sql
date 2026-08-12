-- ============================================================================
-- add-multi-person.sql — עמודת "אחראי" תומכת בכמה אנשים לאותה משימה
-- (למשל: 2 בודקים כותבים תסריטים על מסכים שונים לאותו פיצ'ר).
--
-- שינוי צורת הערך: { user_id } (יחיד) → { user_ids: [...] } (מערך).
-- כדי לא לשבור נתונים קיימים בזמן הפריסה, my_assigned_items() בודק את שתי
-- הצורות (ישן וחדש) — לא צריך תיאום-זמנים בין הרצת ה-SQL הזה לפריסת ה-frontend.
-- הצד-לקוח כבר תמיד קורא את שתי הצורות (src/lib/personIds.js) וכותב רק חדשה.
--
-- כלול גם מיגרציית ניקוי אופציונלית (idempotent) שממירה את הנתונים הקיימים
-- לצורה החדשה בפועל — לא חובה להריץ אותה כדי שהכל יעבוד, אבל מומלץ בשביל
-- אחידות (ואם לא תרוץ, שום דבר לא נשבר — הקוד תומך בשתי הצורות תמיד).
-- בטוח להריץ את כל הקובץ בבת אחת, גם כמה פעמים.
-- ============================================================================

create or replace function my_assigned_items()
returns setof items language sql security definer stable as $$
  select distinct i.* from items i
  join columns c on c.board_id = i.board_id and c.type = 'person'
  join cell_values cv on cv.item_id = i.id and cv.column_id = c.id
  where (cv.value->'user_ids' ? auth.uid()::text or cv.value->>'user_id' = auth.uid()::text)
    and auth_can_view_board(i.board_id);
$$;

grant execute on function my_assigned_items() to authenticated;

-- מיגרציית ניקוי אופציונלית: ממירה { user_id: X } ל-{ user_ids: [X] } בפועל,
-- רק בתאי עמודות מסוג person שעדיין בצורה הישנה.
update cell_values cv
set value = jsonb_build_object('user_ids', jsonb_build_array(cv.value->>'user_id'))
from columns c
where c.id = cv.column_id
  and c.type = 'person'
  and cv.value ? 'user_id'
  and not (cv.value ? 'user_ids');
