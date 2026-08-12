-- ============================================================
-- יומן פעילות + התראות. הרץ את כל הקובץ ב-SQL Editor של Supabase.
-- בטוח להריץ שוב.
-- ============================================================

-- ---------- יומן פעילות ----------
create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  user_id uuid references auth.users(id),
  user_name text,
  action text not null,
  detail text,
  created_at timestamptz default now()
);
create index if not exists activity_board_idx on activity (board_id, created_at desc);

-- ---------- התראות ----------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null, -- הנמען
  org_id uuid,
  board_id uuid,
  item_id uuid,
  type text,
  message text,
  read boolean default false,
  created_at timestamptz default now()
);
create index if not exists notifications_user_idx on notifications (user_id, read, created_at desc);

alter table activity      enable row level security;
alter table notifications enable row level security;

-- מדיניות: פעילות (נראית לצופי הבורד, נכתבת ע"י עורכים)
drop policy if exists act_select on activity;
create policy act_select on activity for select using (auth_can_view_board(board_id));
drop policy if exists act_insert on activity;
create policy act_insert on activity for insert with check (auth_can_edit_board(board_id));

-- מדיניות: התראות (כל אחד רואה/מעדכן/מוחק רק את שלו; יצירה ע"י כל משתמש מחובר)
drop policy if exists notif_select on notifications;
create policy notif_select on notifications for select using (user_id = auth.uid());
drop policy if exists notif_update on notifications;
create policy notif_update on notifications for update using (user_id = auth.uid());
drop policy if exists notif_delete on notifications;
create policy notif_delete on notifications for delete using (user_id = auth.uid());
drop policy if exists notif_insert on notifications;
create policy notif_insert on notifications for insert with check (auth.uid() is not null);
