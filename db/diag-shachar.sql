-- אבחון בעיית שחר שמש: רואה בחירה בין "שוק ההון" ל"צוות שוק ההון".
-- קריאה בלבד, בטוח להריץ. מחפש לפי שם — עדכן את התבנית אם צריך.

select o.id as org_id, o.name as org_name, m.role, m.user_id
from members m
join organizations o on o.id = m.org_id
where m.full_name ilike '%שחר%' and m.full_name ilike '%שמש%';

select t.id as team_id, t.name as team_name, tm.role, tm.user_id, t.org_id
from team_members tm
join teams t on t.id = tm.team_id
join members m on m.user_id = tm.user_id and m.org_id = t.org_id
where m.full_name ilike '%שחר%' and m.full_name ilike '%שמש%';

-- הוורקספייסים/בורדים שהצוות שלה אמור לראות
select w.id as workspace_id, w.name as workspace_name, w.team_id, b.id as board_id, b.name as board_name
from workspaces w
left join boards b on b.workspace_id = w.id
where w.team_id in (
  select t.id from team_members tm
  join teams t on t.id = tm.team_id
  join members m on m.user_id = tm.user_id and m.org_id = t.org_id
  where m.full_name ilike '%שחר%' and m.full_name ilike '%שמש%'
);
