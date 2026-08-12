-- ============================================================
-- תיקון: חברי ארגון רגילים (לא רק אדמין) רואים אוטומטית את כל
-- בורדי הארגון שלהם, בלי צורך בהוספה ידנית ל-board_members.
-- שינוי בטוח: משנה פונקציה אחת בלבד (CREATE OR REPLACE), לא נוגע בנתונים.
-- הרץ את כל הקובץ ב-SQL Editor של Supabase ובדוק שמופיע "Success".
-- ============================================================

create or replace function auth_board_role(p_board uuid)
returns text language sql security definer stable as $$
  select coalesce(
    -- 1) אדמין-ארגון => owner על כל בורד בארגון
    (select 'owner' where exists (
      select 1 from boards b
      join workspaces w on w.id = b.workspace_id
      join members m on m.org_id = w.org_id
      where b.id = p_board and m.user_id = auth.uid() and m.role = 'admin'
    )),
    -- 2) שיוך מפורש לבורד (board_members) — מאפשר לאדמין להתאים תפקיד ספציפי
    --    (owner/editor/viewer) לחבר מסוים בבורד מסוים, גובר על ברירת המחדל
    (select role from board_members where board_id = p_board and user_id = auth.uid()),
    -- 3) ברירת מחדל חדשה: כל חבר ארגון (member) רואה ועורך את בורדי הארגון שלו
    (select 'editor' where exists (
      select 1 from boards b
      join workspaces w on w.id = b.workspace_id
      join members m on m.org_id = w.org_id
      where b.id = p_board and m.user_id = auth.uid()
    ))
  );
$$;

-- ---------- תיקון קריטי נוסף ----------
-- הפונקציה למעלה לא מספיקה לבד: לטבלת boards יש policies משלה על
-- select/update (נכתבו בעבר כדי למנוע באג self-reference), שבודקות
-- ישירות עמודות בשורה ולא קוראות ל-auth_board_role בכלל. בלי לעדכן גם
-- אותן, חבר ארגון רגיל עדיין לא יראה שום בורד. משתמשים כאן ב-
-- auth_is_workspace_member שכבר קיימת ובודקת חברות-ארגון דרך workspace_id
-- (עמודה בשורה עצמה) — בלי לגעת בטבלת boards, כך שאין סיכון להחזרת הבאג הישן.

drop policy if exists bd_select on boards;
create policy bd_select on boards for select using (
  auth_is_workspace_org_admin(workspace_id)
  or created_by = auth.uid()
  or exists (select 1 from board_members bm where bm.board_id = boards.id and bm.user_id = auth.uid())
  or auth_is_workspace_member(workspace_id)
);

drop policy if exists bd_update on boards;
create policy bd_update on boards for update using (
  auth_is_workspace_org_admin(workspace_id)
  or created_by = auth.uid()
  or exists (select 1 from board_members bm
             where bm.board_id = boards.id and bm.user_id = auth.uid()
               and bm.role in ('owner','editor'))
  or auth_is_workspace_member(workspace_id)
);

-- בדיקה: הפונקציה קיימת ותקינה, וה-policies על boards תקינות
select proname from pg_proc where proname = 'auth_board_role';
select policyname, cmd from pg_policies where tablename = 'boards' order by policyname;
