-- ============================================================
-- monday-pro: חברים וירטואליים, קבצים, תלויות, מעקב זמן, קישור ציבורי.
-- הרץ הכול ב-SQL Editor. בטוח לחזור.
-- (מסתמך על הפונקציות הקיימות: auth_can_view_board, auth_can_edit_board,
--  auth_is_org_member, auth_is_org_admin)
-- ============================================================

-- ---------- חברים וירטואליים (לשיוך בלבד, ללא התחברות) ----------
create table if not exists virtual_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  full_name text not null,
  color text default '#0073ea',
  created_at timestamptz default now()
);
alter table virtual_members enable row level security;
drop policy if exists vm_select on virtual_members;
create policy vm_select on virtual_members for select using (auth_is_org_member(org_id));
drop policy if exists vm_cud on virtual_members;
create policy vm_cud on virtual_members for all using (auth_is_org_member(org_id)) with check (auth_is_org_member(org_id));

-- ---------- קבצים מצורפים לפריט ----------
create table if not exists item_files (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade not null,
  board_id uuid not null,
  name text not null,
  path text not null,
  size bigint,
  mime text,
  user_id uuid references auth.users(id),
  user_name text,
  created_at timestamptz default now()
);
create index if not exists item_files_item_idx on item_files (item_id, created_at);
alter table item_files enable row level security;
drop policy if exists if_select on item_files;
create policy if_select on item_files for select using (auth_can_view_board(board_id));
drop policy if exists if_insert on item_files;
create policy if_insert on item_files for insert with check (auth_can_edit_board(board_id));
drop policy if exists if_delete on item_files;
create policy if_delete on item_files for delete using (auth_can_edit_board(board_id) or user_id = auth.uid());

-- Storage bucket לקבצים (ציבורי לקריאה דרך URL)
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

drop policy if exists att_read on storage.objects;
create policy att_read on storage.objects for select using (bucket_id = 'attachments');
drop policy if exists att_write on storage.objects;
create policy att_write on storage.objects for insert to authenticated with check (bucket_id = 'attachments');
drop policy if exists att_delete on storage.objects;
create policy att_delete on storage.objects for delete to authenticated using (bucket_id = 'attachments');

-- ---------- תלויות בין משימות ----------
create table if not exists item_dependencies (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade not null,        -- הפריט שתלוי
  depends_on_id uuid references items(id) on delete cascade not null,  -- במה הוא תלוי
  board_id uuid not null,
  created_at timestamptz default now(),
  unique (item_id, depends_on_id)
);
create index if not exists item_deps_idx on item_dependencies (board_id);
alter table item_dependencies enable row level security;
drop policy if exists dep_select on item_dependencies;
create policy dep_select on item_dependencies for select using (auth_can_view_board(board_id));
drop policy if exists dep_cud on item_dependencies;
create policy dep_cud on item_dependencies for all using (auth_can_edit_board(board_id)) with check (auth_can_edit_board(board_id));

-- ---------- מעקב זמן ----------
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade not null,
  board_id uuid not null,
  user_id uuid references auth.users(id),
  user_name text,
  seconds integer not null default 0,
  note text,
  created_at timestamptz default now()
);
create index if not exists time_entries_item_idx on time_entries (item_id, created_at);
alter table time_entries enable row level security;
drop policy if exists te_select on time_entries;
create policy te_select on time_entries for select using (auth_can_view_board(board_id));
drop policy if exists te_insert on time_entries;
create policy te_insert on time_entries for insert with check (auth_can_edit_board(board_id));
drop policy if exists te_delete on time_entries;
create policy te_delete on time_entries for delete using (user_id = auth.uid() or auth_can_edit_board(board_id));

-- ---------- קישור ציבורי לצפייה בבורד ----------
alter table boards add column if not exists public_token uuid;
create index if not exists boards_public_token_idx on boards (public_token);

-- RPC ציבורי: מחזיר את כל נתוני הבורד אם הטוקן תקף (ללא צורך בהתחברות)
create or replace function public_board(p_token uuid)
returns jsonb language plpgsql security definer stable as $$
declare b boards; res jsonb;
begin
  if p_token is null then return null; end if;
  select * into b from boards where public_token = p_token;
  if b.id is null then return null; end if;
  select jsonb_build_object(
    'board', jsonb_build_object('id', b.id, 'name', b.name),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'color',g.color,'position',g.position) order by g.position), '[]'::jsonb) from groups g where g.board_id = b.id),
    'columns', (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'type',c.type,'settings',c.settings,'position',c.position) order by c.position), '[]'::jsonb) from columns c where c.board_id = b.id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'group_id',i.group_id,'position',i.position) order by i.position), '[]'::jsonb) from items i where i.board_id = b.id and i.parent_item_id is null),
    'cells', (select coalesce(jsonb_agg(jsonb_build_object('item_id',cv.item_id,'column_id',cv.column_id,'value',cv.value)), '[]'::jsonb) from cell_values cv join items i on i.id = cv.item_id where i.board_id = b.id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'full_name',m.full_name,'email',m.email)), '[]'::jsonb) from members m join workspaces w on w.id = b.workspace_id where m.org_id = w.org_id)
  ) into res;
  return res;
end; $$;
grant execute on function public_board(uuid) to anon, authenticated;
