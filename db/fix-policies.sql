-- ============================================================
-- תיקון/השלמת חוקי ההרשאה (RLS) — בטוח להריץ שוב, לא נוגע בנתונים.
-- הרץ את כל הקובץ ב-SQL Editor של Supabase ובדוק שמופיע "Success".
-- ============================================================

-- ---------- פונקציות עזר (ליתר ביטחון, יוצר מחדש) ----------

create or replace function auth_is_org_member(p_org uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from members where org_id = p_org and user_id = auth.uid());
$$;

create or replace function auth_is_org_admin(p_org uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from members where org_id = p_org and user_id = auth.uid() and role = 'admin');
$$;

create or replace function auth_is_workspace_member(p_workspace uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from workspaces w join members m on m.org_id = w.org_id
    where w.id = p_workspace and m.user_id = auth.uid()
  );
$$;

create or replace function auth_board_role(p_board uuid)
returns text language sql security definer stable as $$
  select coalesce(
    (select 'owner' where exists (
      select 1 from boards b
      join workspaces w on w.id = b.workspace_id
      join members m on m.org_id = w.org_id
      where b.id = p_board and m.user_id = auth.uid() and m.role = 'admin'
    )),
    (select role from board_members where board_id = p_board and user_id = auth.uid()),
    (select 'editor' where exists (
      select 1 from boards b
      join workspaces w on w.id = b.workspace_id
      join members m on m.org_id = w.org_id
      where b.id = p_board and m.user_id = auth.uid()
    ))
  );
$$;

create or replace function auth_can_view_board(p_board uuid)
returns boolean language sql security definer stable as $$
  select auth_board_role(p_board) is not null;
$$;

create or replace function auth_can_edit_board(p_board uuid)
returns boolean language sql security definer stable as $$
  select auth_board_role(p_board) in ('owner','editor');
$$;

create or replace function auth_is_board_owner(p_board uuid)
returns boolean language sql security definer stable as $$
  select auth_board_role(p_board) = 'owner';
$$;

create or replace function auth_item_board(p_item uuid)
returns uuid language sql security definer stable as $$
  select board_id from items where id = p_item;
$$;

-- ---------- טריגר: יוצר הבורד הופך אוטומטית ל-owner ----------

create or replace function add_board_owner() returns trigger
language plpgsql security definer as $$
begin
  insert into board_members(board_id, user_id, role)
  values (new.id, auth.uid(), 'owner')
  on conflict (board_id, user_id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_board_owner on boards;
create trigger trg_board_owner after insert on boards
for each row execute function add_board_owner();

-- ---------- הפעלת RLS (ליתר ביטחון) ----------

alter table organizations enable row level security;
alter table members       enable row level security;
alter table workspaces    enable row level security;
alter table boards        enable row level security;
alter table board_members enable row level security;
alter table groups        enable row level security;
alter table columns       enable row level security;
alter table items         enable row level security;
alter table cell_values   enable row level security;
alter table invitations   enable row level security;

-- ---------- מדיניות (Policies) ----------

drop policy if exists org_select on organizations;
create policy org_select on organizations for select using (auth_is_org_member(id));
drop policy if exists org_update on organizations;
create policy org_update on organizations for update using (auth_is_org_admin(id));
drop policy if exists org_delete on organizations;
create policy org_delete on organizations for delete using (auth_is_org_admin(id));

drop policy if exists mem_select on members;
create policy mem_select on members for select using (auth_is_org_member(org_id));
drop policy if exists mem_update on members;
create policy mem_update on members for update using (auth_is_org_admin(org_id));
drop policy if exists mem_delete on members;
create policy mem_delete on members for delete using (auth_is_org_admin(org_id));

drop policy if exists ws_select on workspaces;
create policy ws_select on workspaces for select using (auth_is_org_member(org_id));
drop policy if exists ws_insert on workspaces;
create policy ws_insert on workspaces for insert with check (auth_is_org_member(org_id));
drop policy if exists ws_update on workspaces;
create policy ws_update on workspaces for update using (auth_is_org_member(org_id));
drop policy if exists ws_delete on workspaces;
create policy ws_delete on workspaces for delete using (auth_is_org_member(org_id));

drop policy if exists bd_select on boards;
create policy bd_select on boards for select using (auth_can_view_board(id));
drop policy if exists bd_insert on boards;
create policy bd_insert on boards for insert with check (auth_is_workspace_member(workspace_id));
drop policy if exists bd_update on boards;
create policy bd_update on boards for update using (auth_can_edit_board(id));
drop policy if exists bd_delete on boards;
create policy bd_delete on boards for delete using (auth_is_board_owner(id));

drop policy if exists bm_select on board_members;
create policy bm_select on board_members for select using (auth_can_view_board(board_id));
drop policy if exists bm_insert on board_members;
create policy bm_insert on board_members for insert with check (auth_is_board_owner(board_id));
drop policy if exists bm_update on board_members;
create policy bm_update on board_members for update using (auth_is_board_owner(board_id));
drop policy if exists bm_delete on board_members;
create policy bm_delete on board_members for delete using (auth_is_board_owner(board_id));

drop policy if exists gr_select on groups;
create policy gr_select on groups for select using (auth_can_view_board(board_id));
drop policy if exists gr_cud on groups;
create policy gr_cud on groups for all using (auth_can_edit_board(board_id)) with check (auth_can_edit_board(board_id));

drop policy if exists col_select on columns;
create policy col_select on columns for select using (auth_can_view_board(board_id));
drop policy if exists col_cud on columns;
create policy col_cud on columns for all using (auth_can_edit_board(board_id)) with check (auth_can_edit_board(board_id));

drop policy if exists it_select on items;
create policy it_select on items for select using (auth_can_view_board(board_id));
drop policy if exists it_cud on items;
create policy it_cud on items for all using (auth_can_edit_board(board_id)) with check (auth_can_edit_board(board_id));

drop policy if exists cv_select on cell_values;
create policy cv_select on cell_values for select using (auth_can_view_board(auth_item_board(item_id)));
drop policy if exists cv_cud on cell_values;
create policy cv_cud on cell_values for all using (auth_can_edit_board(auth_item_board(item_id))) with check (auth_can_edit_board(auth_item_board(item_id)));

drop policy if exists inv_select on invitations;
create policy inv_select on invitations for select using (auth_is_org_admin(org_id));
drop policy if exists inv_insert on invitations;
create policy inv_insert on invitations for insert with check (auth_is_org_admin(org_id));
drop policy if exists inv_delete on invitations;
create policy inv_delete on invitations for delete using (auth_is_org_admin(org_id));

-- ---------- הרשאות הרצה ל-RPC ----------
grant execute on function create_organization(text) to authenticated;
grant execute on function accept_pending_invitations() to authenticated;
grant execute on function my_assigned_items() to authenticated;

-- בדיקה: כמה policies קיימות על הבורדים? (אמור להחזיר 4)
select count(*) as boards_policies from pg_policies where tablename = 'boards';
