-- ============================================================
-- שדרוג monday: תת-משימות + אוטומציות. הרץ הכול ב-SQL Editor. בטוח לחזור.
-- ============================================================

-- ---------- תת-משימות: פריט עם הורה ----------
alter table items add column if not exists parent_item_id uuid references items(id) on delete cascade;
create index if not exists items_parent_idx on items (parent_item_id);
-- (RLS על items כבר חל גם על תת-משימות דרך board_id)

-- ---------- אוטומציות ----------
create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  name text,
  trigger jsonb not null,   -- למשל { "type":"status_is", "column_id":"...", "label_id":"done" }
  action jsonb not null,    -- למשל { "type":"notify_assignee" } / { "type":"move_group","group_id":"..." } / { "type":"set_status","column_id":"...","label_id":"..." }
  enabled boolean default true,
  created_at timestamptz default now()
);
create index if not exists automations_board_idx on automations (board_id);

alter table automations enable row level security;

drop policy if exists auto_select on automations;
create policy auto_select on automations for select using (auth_can_view_board(board_id));
drop policy if exists auto_cud on automations;
create policy auto_cud on automations for all using (auth_can_edit_board(board_id)) with check (auth_can_edit_board(board_id));
