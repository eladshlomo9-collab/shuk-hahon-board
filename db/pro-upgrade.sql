-- ============================================================
-- שוק ההון בורד — שדרוג "פרו": תיאור לפריט + דיון (תגובות)
-- מיגרציה בטוחה להרצה חוזרת (idempotent).
-- הרץ אותה ב-Supabase SQL Editor.
-- ============================================================

-- --- שדה תיאור חופשי לכל פריט ---
alter table items add column if not exists description text;

-- --- טבלת הדיון: תגובות על פריט ---
create table if not exists item_updates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade not null,
  board_id uuid not null,
  user_id uuid references auth.users(id),
  user_name text,
  body text not null,
  created_at timestamptz default now()
);

-- אינדקס לטעינה מהירה של תגובות פריט לפי סדר כרונולוגי
create index if not exists item_updates_item_idx on item_updates(item_id, created_at);

-- --- אבטחה ברמת שורה (RLS) ---
alter table item_updates enable row level security;

-- צפייה: מותרת למי שיכול לראות את הבורד (הפונקציה כבר קיימת ב-DB)
drop policy if exists item_updates_select on item_updates;
create policy item_updates_select on item_updates
  for select using (auth_can_view_board(board_id));

-- הוספה: מותרת למי שיכול לראות את הבורד
drop policy if exists item_updates_insert on item_updates;
create policy item_updates_insert on item_updates
  for insert with check (auth_can_view_board(board_id));

-- מחיקה: רק הכותב יכול למחוק את התגובה שלו
drop policy if exists item_updates_delete on item_updates;
create policy item_updates_delete on item_updates
  for delete using (user_id = auth.uid());
