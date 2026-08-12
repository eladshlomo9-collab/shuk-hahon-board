-- אבחון קפיצת "סה״כ שעות" בצוות "שוק ההון". קריאה בלבד, בטוח להריץ.
-- מריצים כל בלוק בנפרד (Supabase SQL Editor מציג רק תוצאה אחרונה כשמריצים הכל ביחד).

-- 1) פירוט לפי בורד: כמה פריטים, כמה דקות AI/ידני, כמה שעות נחסכו — לכל בורד של הצוות
select
  b.id as board_id,
  b.name as board_name,
  w.name as workspace_name,
  count(distinct i.id) as items_total,
  count(distinct i.id) filter (where cv_ai.value is not null and cv_manual.value is not null) as items_tracked,
  sum((cv_ai.value->>'number')::numeric) as ai_minutes_sum,
  sum((cv_manual.value->>'number')::numeric) as manual_minutes_sum,
  round(sum(greatest((cv_manual.value->>'number')::numeric - (cv_ai.value->>'number')::numeric, 0)) / 60.0, 1) as hours_saved
from boards b
join workspaces w on w.id = b.workspace_id
join items i on i.board_id = b.id and i.parent_item_id is null
left join columns col_ai on col_ai.board_id = b.id and col_ai.name = 'זמן עם AI (בדקות)'
left join columns col_manual on col_manual.board_id = b.id and col_manual.name = 'זמן ידני משוער (בדקות)'
left join cell_values cv_ai on cv_ai.item_id = i.id and cv_ai.column_id = col_ai.id
left join cell_values cv_manual on cv_manual.item_id = i.id and cv_manual.column_id = col_manual.id
where w.team_id = '1b22ea2d-b010-46f7-b670-e4225ea14fbb'
group by b.id, b.name, w.name
order by hours_saved desc nulls last;

-- 2) בדיקת עמודות כפולות (אם מישהו הוסיף בטעות עמודה נוספת עם אותו שם על אותו בורד)
select board_id, name, count(*) as how_many
from columns
where board_id in (select b.id from boards b join workspaces w on w.id = b.workspace_id where w.team_id = '1b22ea2d-b010-46f7-b670-e4225ea14fbb')
  and name in ('זמן עם AI (בדקות)', 'זמן ידני משוער (בדקות)', 'כלי AI בשימוש')
group by board_id, name
having count(*) > 1;
