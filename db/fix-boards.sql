-- ============================================================
-- תיקון באג RLS בטבלת הבורדים (self-reference ב-INSERT...RETURNING).
-- כותב מחדש את חוקי bd_select / bd_update / bd_delete כך שישתמשו
-- בעמודות השורה עצמה במקום לשאול את טבלת הבורדים על עצמה.
-- בטוח להריץ שוב. הרץ את כל הקובץ ב-SQL Editor.
-- ============================================================

-- פונקציה: האם המשתמש הוא אדמין-ארגון של הוורקספייס הזה (בלי לגעת בטבלת boards)
create or replace function auth_is_workspace_org_admin(p_workspace uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from workspaces w join members m on m.org_id = w.org_id
    where w.id = p_workspace and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

-- צפייה בבורד: אדמין-ארגון, יוצר הבורד, משויך ב-board_members, או כל חבר ארגון
drop policy if exists bd_select on boards;
create policy bd_select on boards for select using (
  auth_is_workspace_org_admin(workspace_id)
  or created_by = auth.uid()
  or exists (select 1 from board_members bm where bm.board_id = boards.id and bm.user_id = auth.uid())
  or auth_is_workspace_member(workspace_id)
);

-- עריכת בורד: אדמין-ארגון, יוצר, owner/editor ב-board_members, או כל חבר ארגון
drop policy if exists bd_update on boards;
create policy bd_update on boards for update using (
  auth_is_workspace_org_admin(workspace_id)
  or created_by = auth.uid()
  or exists (select 1 from board_members bm
             where bm.board_id = boards.id and bm.user_id = auth.uid()
               and bm.role in ('owner','editor'))
  or auth_is_workspace_member(workspace_id)
);

-- מחיקת בורד: אדמין-ארגון, יוצר, או owner ב-board_members
drop policy if exists bd_delete on boards;
create policy bd_delete on boards for delete using (
  auth_is_workspace_org_admin(workspace_id)
  or created_by = auth.uid()
  or exists (select 1 from board_members bm
             where bm.board_id = boards.id and bm.user_id = auth.uid() and bm.role = 'owner')
);

-- bd_insert נשאר כפי שהוא (עובד): with check (auth_is_workspace_member(workspace_id))
