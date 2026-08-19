-- ============================================================
-- בורד פעילות AI — סכמת בסיס נתונים (Supabase / Postgres)
-- הרץ את כל הקובץ הזה ב-SQL Editor של Supabase.
-- ============================================================

-- ---------- טבלאות ----------

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  email text,
  full_name text,
  role text not null default 'member',      -- 'admin' | 'member'
  is_ai_overseer boolean not null default false,
  created_at timestamptz default now(),
  unique (org_id, user_id)
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  color text default '#0E9E7C',
  ai_work_share integer,   -- 0..100, אחוז מכלל עבודת הצוות שמתבצע עם AI; null = לא הוגדר
  created_at timestamptz default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'member',      -- 'lead' | 'member'
  created_at timestamptz default now(),
  unique (team_id, user_id)
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  team_id uuid references teams(id) on delete set null,
  name text not null,
  color text default '#0073ea',
  position int default 0,
  created_at timestamptz default now()
);

create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  name text not null,
  created_by uuid references auth.users(id) default auth.uid(),
  position int default 0,
  created_at timestamptz default now()
);

create table if not exists board_members (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'viewer',      -- 'owner' | 'editor' | 'viewer'
  created_at timestamptz default now(),
  unique (board_id, user_id)
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  name text not null,
  color text default '#0073ea',
  position int default 0,
  created_at timestamptz default now()
);

create table if not exists columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade not null,
  name text not null,
  type text not null default 'text',        -- text|status|date|number|person
  settings jsonb default '{}'::jsonb,
  position int default 0,
  created_at timestamptz default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade not null,
  board_id uuid references boards(id) on delete cascade not null,
  name text not null default '',
  position int default 0,
  created_at timestamptz default now()
);

create table if not exists cell_values (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade not null,
  column_id uuid references columns(id) on delete cascade not null,
  value jsonb,
  unique (item_id, column_id)
);

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  email text not null,
  org_role text not null default 'member',
  status text not null default 'pending',   -- 'pending' | 'accepted'
  team_id uuid references teams(id) on delete set null,
  team_role text,                           -- 'lead' | 'member', null = לא משויך לצוות
  created_at timestamptz default now()
);

-- ---------- פונקציות עזר (security definer, עוקפות RLS כדי למנוע רקורסיה) ----------

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

-- אדמין-ארגון של הוורקספייס (משמש לחוקי boards בלי self-reference לטבלת boards)
create or replace function auth_is_workspace_org_admin(p_workspace uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from workspaces w join members m on m.org_id = w.org_id
    where w.id = p_workspace and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

create or replace function auth_is_team_member(p_team uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from team_members where team_id = p_team and user_id = auth.uid());
$$;

create or replace function auth_is_team_lead(p_team uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from team_members where team_id = p_team and user_id = auth.uid() and role = 'lead');
$$;

create or replace function auth_is_workspace_team_lead(p_workspace uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from workspaces w join team_members tm on tm.team_id = w.team_id
    where w.id = p_workspace and tm.user_id = auth.uid() and tm.role = 'lead'
  );
$$;

-- וורקספייס נגיש אם: יש לו team_id ואתה חבר באותו צוות, או שאין לו team_id כלל
-- (ואז ההתנהגות היא בדיוק כמו לפני תכונת הצוותים — פתוח לכל חבר בארגון של הוורקספייס).
-- זהו העיקרון "opt-in": שיוך-צוות מגביל רק וורקספייסים שנבחרו במפורש, לא הכל בבת אחת.
create or replace function auth_is_workspace_accessible(p_workspace uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from workspaces w
    where w.id = p_workspace
      and (
        (w.team_id is not null and auth_is_team_member(w.team_id))
        or (w.team_id is null and auth_is_workspace_member(p_workspace))
      )
  );
$$;

-- תפקיד המשתמש בבורד: אדמין-ארגון => owner על כל בורד בארגון;
-- ראש-צוות => owner על בורד בוורקספייס המשויך לצוות שלו; שיוך מפורש ב-board_members
-- גובר על ברירת המחדל; חבר-צוות => editor בוורקספייס המשויך לצוות שלו;
-- וורקספייס בלי שיוך-צוות => editor לכל חבר-ארגון (נפילה-חזרה, בדיוק כמו היום)
create or replace function auth_board_role(p_board uuid)
returns text language sql security definer stable as $$
  select coalesce(
    (select 'owner' where exists (
      select 1 from boards b
      join workspaces w on w.id = b.workspace_id
      join members m on m.org_id = w.org_id
      where b.id = p_board and m.user_id = auth.uid() and m.role = 'admin'
    )),
    (select 'owner' where exists (
      select 1 from boards b
      join workspaces w on w.id = b.workspace_id
      join team_members tm on tm.team_id = w.team_id
      where b.id = p_board and tm.user_id = auth.uid() and tm.role = 'lead'
    )),
    (select role from board_members where board_id = p_board and user_id = auth.uid()),
    (select 'editor' where exists (
      select 1 from boards b
      join workspaces w on w.id = b.workspace_id
      join team_members tm on tm.team_id = w.team_id
      where b.id = p_board and tm.user_id = auth.uid()
    )),
    (select 'editor' where exists (
      select 1 from boards b
      join workspaces w on w.id = b.workspace_id
      join members m on m.org_id = w.org_id
      where b.id = p_board and w.team_id is null and m.user_id = auth.uid()
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

-- ---------- RPC: יצירת ארגון + הוספת היוצר כאדמין ----------

create or replace function create_organization(p_name text)
returns organizations language plpgsql security definer as $$
declare v_org organizations; v_email text; v_name text;
begin
  select email, coalesce(raw_user_meta_data->>'full_name', email)
    into v_email, v_name from auth.users where id = auth.uid();
  insert into organizations(name, created_by) values (p_name, auth.uid()) returning * into v_org;
  insert into members(org_id, user_id, email, full_name, role)
    values (v_org.id, auth.uid(), v_email, v_name, 'admin');
  return v_org;
end; $$;

-- ---------- RPC: קבלת הזמנות ממתינות (מופעל אחרי התחברות) ----------

create or replace function accept_pending_invitations()
returns int language plpgsql security definer as $$
declare v_email text; v_name text; v_cnt int := 0; inv record;
begin
  select email, coalesce(raw_user_meta_data->>'full_name', email)
    into v_email, v_name from auth.users where id = auth.uid();
  for inv in select * from invitations
             where lower(email) = lower(v_email) and status = 'pending' loop
    insert into members(org_id, user_id, email, full_name, role)
      values (inv.org_id, auth.uid(), v_email, v_name, inv.org_role)
      on conflict (org_id, user_id) do nothing;
    if inv.team_id is not null then
      insert into team_members(team_id, user_id, role)
        values (inv.team_id, auth.uid(), coalesce(inv.team_role, 'member'))
        on conflict (team_id, user_id) do nothing;
    end if;
    update invitations set status = 'accepted' where id = inv.id;
    v_cnt := v_cnt + 1;
  end loop;
  return v_cnt;
end; $$;

-- ---------- RPC: המשימות שלי (פריטים המשויכים למשתמש המחובר) ----------

create or replace function my_assigned_items()
returns setof items language sql security definer stable as $$
  select distinct i.* from items i
  join columns c on c.board_id = i.board_id and c.type = 'person'
  join cell_values cv on cv.item_id = i.id and cv.column_id = c.id
  where (cv.value->'user_ids' ? auth.uid()::text or cv.value->>'user_id' = auth.uid()::text)
    and auth_can_view_board(i.board_id);
$$;

-- ---------- RPC: דשבורד מנהל-תחום AI (חוצה-צוותים) ----------
-- security definer: עוקף RLS *בתוך הפונקציה בלבד* — מנהל-התחום לעולם לא
-- שולח שאילתה ישירה לטבלאות boards/items/cell_values (RLS הרגיל ימשיך לחסום אותן).
-- מזהה בורדי-AI לפי אותה מוסכמת שם-עמודה מדויקת כמו ב-DashboardPage.jsx/ReportsView.jsx.

create or replace function ai_overview_summary(p_org uuid)
returns jsonb language plpgsql security definer stable as $$
declare
  v_is_allowed boolean;
  v_result jsonb;
begin
  select auth_is_org_admin(p_org) or exists (
    select 1 from members where org_id = p_org and user_id = auth.uid() and is_ai_overseer = true
  ) into v_is_allowed;

  if not v_is_allowed then
    raise exception 'forbidden';
  end if;

  with ai_boards as (
    select b.id as board_id, b.name as board_name, b.workspace_id, w.team_id, t.name as team_name, t.ai_work_share,
           bool_or(c.name = 'כלי AI בשימוש') as has_tool,
           bool_or(c.name = 'זמן עם AI (בדקות)') as has_ai_time,
           bool_or(c.name = 'זמן ידני משוער (בדקות)') as has_manual_time
    from boards b
    join workspaces w on w.id = b.workspace_id
    left join teams t on t.id = w.team_id
    join columns c on c.board_id = b.id
    where w.org_id = p_org
    group by b.id, b.name, b.workspace_id, w.team_id, t.name, t.ai_work_share
    having bool_or(c.name = 'כלי AI בשימוש')
       and bool_or(c.name = 'זמן עם AI (בדקות)')
       and bool_or(c.name = 'זמן ידני משוער (בדקות)')
  ),
  cols as (
    select c.id, c.board_id, c.name
    from columns c
    join ai_boards ab on ab.board_id = c.board_id
    where c.name in ('כלי AI בשימוש', 'זמן עם AI (בדקות)', 'זמן ידני משוער (בדקות)')
  ),
  item_rows as (
    select
      i.id as item_id,
      ab.board_id,
      ab.board_name,
      ab.team_id,
      ab.team_name,
      ab.ai_work_share,
      i.created_at,
      (array_agg(cv.value->'ids'->>0) filter (where cols.name = 'כלי AI בשימוש'))[1] as tool_label_id,
      (array_agg((cv.value->>'number')::numeric) filter (where cols.name = 'זמן עם AI (בדקות)'))[1] as ai_minutes,
      (array_agg((cv.value->>'number')::numeric) filter (where cols.name = 'זמן ידני משוער (בדקות)'))[1] as manual_minutes
    from items i
    join ai_boards ab on ab.board_id = i.board_id
    join cols on cols.board_id = i.board_id
    left join cell_values cv on cv.item_id = i.id and cv.column_id = cols.id
    where i.parent_item_id is null
    group by i.id, ab.board_id, ab.board_name, ab.team_id, ab.team_name, ab.ai_work_share, i.created_at
  ),
  team_agg as (
    select team_id, team_name, ai_work_share,
      count(*) as cnt,
      sum(greatest(manual_minutes - ai_minutes, 0)) as saved_min,
      sum(manual_minutes) as manual_min
    from item_rows
    where ai_minutes is not null and manual_minutes is not null
    group by team_id, team_name, ai_work_share
  ),
  month_team_agg as (
    select
      to_char(created_at, 'YYYY-MM') as month,
      team_id,
      ai_work_share,
      sum(greatest(manual_minutes - ai_minutes, 0)) as saved_min,
      sum(manual_minutes) as manual_min
    from item_rows
    where ai_minutes is not null and manual_minutes is not null
    group by to_char(created_at, 'YYYY-MM'), team_id, ai_work_share
  )
  board_agg as (
    select board_id, board_name, team_name, ai_work_share,
      count(*) as cnt,
      sum(greatest(manual_minutes - ai_minutes, 0)) as saved_min,
      sum(manual_minutes) as manual_min
    from item_rows
    where ai_minutes is not null and manual_minutes is not null
    group by board_id, board_name, team_name, ai_work_share
  ),
  month_board_agg as (
    select
      to_char(created_at, 'YYYY-MM') as month,
      board_id,
      sum(greatest(manual_minutes - ai_minutes, 0)) as saved_min,
      sum(manual_minutes) as manual_min
    from item_rows
    where ai_minutes is not null and manual_minutes is not null
    group by to_char(created_at, 'YYYY-MM'), board_id
  )
  select jsonb_build_object(
    'org_totals', jsonb_build_object(
      'boards_tracked', (select count(*) from ai_boards),
      'items_tracked', (select count(*) from item_rows where ai_minutes is not null and manual_minutes is not null),
      'hours_saved', coalesce((select sum(saved_min) from team_agg), 0) / 60.0,
      'efficiency_pct', case when coalesce((select sum(manual_min) from team_agg), 0) > 0
        then round((select sum(saved_min) from team_agg) / (select sum(manual_min) from team_agg) * 100, 1)
        else 0 end,
      'effective_pct', (
        select case when coalesce(sum(manual_min * 100.0 / ai_work_share), 0) > 0
          then round(sum(saved_min) / sum(manual_min * 100.0 / ai_work_share) * 100, 1)
          else null end
        from team_agg where ai_work_share is not null and ai_work_share > 0
      ),
      'teams_with_share', (select count(*) from team_agg where ai_work_share is not null and ai_work_share > 0),
      'teams_total', (select count(*) from team_agg)
    ),
    'by_team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_id', team_id,
        'team_name', coalesce(team_name, 'ללא שיוך'),
        'items_tracked', cnt,
        'hours_saved', saved_min / 60.0,
        'efficiency_pct', case when manual_min > 0 then round(saved_min / manual_min * 100, 1) else 0 end,
        'ai_work_share', ai_work_share,
        'effective_pct', case when ai_work_share is not null and ai_work_share > 0 and manual_min > 0
          then round(saved_min / manual_min * 100 * ai_work_share / 100.0, 1) else null end
      ) order by saved_min desc)
      from team_agg
    ), '[]'::jsonb),
    'by_tool', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tool_label_id', tool_label_id,
        'hours_saved', hours_saved
      ))
      from (
        select tool_label_id, sum(greatest(manual_minutes - ai_minutes, 0)) / 60.0 as hours_saved
        from item_rows
        where ai_minutes is not null and manual_minutes is not null and tool_label_id is not null
        group by tool_label_id
      ) t
    ), '[]'::jsonb),
    'monthly_trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', month,
        'hours_saved', hours_saved,
        'efficiency_pct', eff_pct,
        'effective_pct', eff_effective_pct
      ) order by month)
      from (
        select
          month,
          sum(saved_min) / 60.0 as hours_saved,
          case when sum(manual_min) > 0 then round(sum(saved_min) / sum(manual_min) * 100, 1) else 0 end as eff_pct,
          case when coalesce(sum(manual_min * 100.0 / ai_work_share) filter (where ai_work_share is not null and ai_work_share > 0), 0) > 0
            then round(
              sum(saved_min) filter (where ai_work_share is not null and ai_work_share > 0)
              / sum(manual_min * 100.0 / ai_work_share) filter (where ai_work_share is not null and ai_work_share > 0) * 100, 1)
            else null end as eff_effective_pct
        from month_team_agg
        group by month
      ) t
    ), '[]'::jsonb),
    'by_board', coalesce((
      select jsonb_agg(jsonb_build_object(
        'board_id', board_id,
        'board_name', board_name,
        'team_name', coalesce(team_name, 'ללא שיוך'),
        'items_tracked', cnt,
        'hours_saved', saved_min / 60.0,
        'efficiency_pct', case when manual_min > 0 then round(saved_min / manual_min * 100, 1) else 0 end,
        'ai_work_share', ai_work_share,
        'effective_pct', case when ai_work_share is not null and ai_work_share > 0 and manual_min > 0
          then round(saved_min / manual_min * 100 * ai_work_share / 100.0, 1) else null end,
        'monthly_trend', coalesce((
          select jsonb_agg(jsonb_build_object(
            'month', mba.month,
            'hours_saved', mba.saved_min / 60.0,
            'efficiency_pct', case when mba.manual_min > 0 then round(mba.saved_min / mba.manual_min * 100, 1) else 0 end
          ) order by mba.month)
          from month_board_agg mba
          where mba.board_id = board_agg.board_id
        ), '[]'::jsonb)
      ) order by board_name)
      from board_agg
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end; $$;

-- ---------- הפעלת RLS ----------

alter table organizations enable row level security;
alter table members       enable row level security;
alter table teams         enable row level security;
alter table team_members  enable row level security;
alter table workspaces    enable row level security;
alter table boards        enable row level security;
alter table board_members enable row level security;
alter table groups        enable row level security;
alter table columns       enable row level security;
alter table items         enable row level security;
alter table cell_values   enable row level security;
alter table invitations   enable row level security;

-- ---------- מדיניות (Policies) ----------

-- organizations
drop policy if exists org_select on organizations;
create policy org_select on organizations for select using (auth_is_org_member(id));
drop policy if exists org_update on organizations;
create policy org_update on organizations for update using (auth_is_org_admin(id));
drop policy if exists org_delete on organizations;
create policy org_delete on organizations for delete using (auth_is_org_admin(id));
-- הוספה רק דרך RPC create_organization (אין policy ל-insert)

-- members
drop policy if exists mem_select on members;
create policy mem_select on members for select using (auth_is_org_member(org_id));
drop policy if exists mem_update on members;
create policy mem_update on members for update using (auth_is_org_admin(org_id));
drop policy if exists mem_delete on members;
create policy mem_delete on members for delete using (auth_is_org_admin(org_id));
-- הוספה דרך RPC בלבד

-- teams
drop policy if exists team_select on teams;
create policy team_select on teams for select using (auth_is_org_admin(org_id) or auth_is_team_member(id));
drop policy if exists team_insert on teams;
create policy team_insert on teams for insert with check (auth_is_org_admin(org_id));
drop policy if exists team_update on teams;
create policy team_update on teams for update using (auth_is_org_admin(org_id));
drop policy if exists team_delete on teams;
create policy team_delete on teams for delete using (auth_is_org_admin(org_id));

-- team_members
drop policy if exists tmem_select on team_members;
create policy tmem_select on team_members for select using (
  auth_is_team_member(team_id) or exists (select 1 from teams t where t.id = team_members.team_id and auth_is_org_admin(t.org_id))
);
drop policy if exists tmem_cud on team_members;
create policy tmem_cud on team_members for all using (
  auth_is_team_lead(team_id) or exists (select 1 from teams t where t.id = team_members.team_id and auth_is_org_admin(t.org_id))
) with check (
  auth_is_team_lead(team_id) or exists (select 1 from teams t where t.id = team_members.team_id and auth_is_org_admin(t.org_id))
);

-- workspaces — opt-in לפי שיוך-צוות: וורקספייס בלי team_id פתוח לכל חבר-ארגון
-- (בדיוק כמו היום); רק וורקספייס עם team_id מוגבל לחברי/ראש אותו צוות
drop policy if exists ws_select on workspaces;
create policy ws_select on workspaces for select using (
  auth_is_org_admin(org_id)
  or (team_id is not null and auth_is_team_member(team_id))
  or (team_id is null and auth_is_org_member(org_id))
);
drop policy if exists ws_insert on workspaces;
create policy ws_insert on workspaces for insert with check (
  auth_is_org_admin(org_id)
  or (team_id is not null and auth_is_team_lead(team_id))
  or (team_id is null and auth_is_org_member(org_id))
);
drop policy if exists ws_update on workspaces;
create policy ws_update on workspaces for update using (
  auth_is_org_admin(org_id)
  or (team_id is not null and auth_is_team_lead(team_id))
  or (team_id is null and auth_is_org_member(org_id))
);
drop policy if exists ws_delete on workspaces;
create policy ws_delete on workspaces for delete using (
  auth_is_org_admin(org_id)
  or (team_id is not null and auth_is_team_lead(team_id))
  or (team_id is null and auth_is_org_member(org_id))
);

-- boards
-- הערה: חוקי הצפייה/עריכה/מחיקה משתמשים בעמודות השורה (workspace_id, created_by)
-- ולא שואלים את טבלת boards על עצמה — אחרת INSERT...RETURNING נכשל (self-reference).
drop policy if exists bd_select on boards;
create policy bd_select on boards for select using (
  auth_is_workspace_org_admin(workspace_id)
  or created_by = auth.uid()
  or exists (select 1 from board_members bm where bm.board_id = boards.id and bm.user_id = auth.uid())
  or auth_is_workspace_accessible(workspace_id)
);
drop policy if exists bd_insert on boards;
create policy bd_insert on boards for insert with check (
  auth_is_workspace_org_admin(workspace_id) or auth_is_workspace_accessible(workspace_id)
);
drop policy if exists bd_update on boards;
create policy bd_update on boards for update using (
  auth_is_workspace_org_admin(workspace_id)
  or created_by = auth.uid()
  or exists (select 1 from board_members bm
             where bm.board_id = boards.id and bm.user_id = auth.uid() and bm.role in ('owner','editor'))
  or auth_is_workspace_accessible(workspace_id)
);
drop policy if exists bd_delete on boards;
create policy bd_delete on boards for delete using (
  auth_is_workspace_org_admin(workspace_id)
  or created_by = auth.uid()
  or exists (select 1 from board_members bm
             where bm.board_id = boards.id and bm.user_id = auth.uid() and bm.role = 'owner')
  or auth_is_workspace_team_lead(workspace_id)
);

-- board_members
drop policy if exists bm_select on board_members;
create policy bm_select on board_members for select using (auth_can_view_board(board_id));
drop policy if exists bm_insert on board_members;
create policy bm_insert on board_members for insert with check (auth_is_board_owner(board_id));
drop policy if exists bm_update on board_members;
create policy bm_update on board_members for update using (auth_is_board_owner(board_id));
drop policy if exists bm_delete on board_members;
create policy bm_delete on board_members for delete using (auth_is_board_owner(board_id));

-- groups
drop policy if exists gr_select on groups;
create policy gr_select on groups for select using (auth_can_view_board(board_id));
drop policy if exists gr_cud on groups;
create policy gr_cud on groups for all using (auth_can_edit_board(board_id)) with check (auth_can_edit_board(board_id));

-- columns
drop policy if exists col_select on columns;
create policy col_select on columns for select using (auth_can_view_board(board_id));
drop policy if exists col_cud on columns;
create policy col_cud on columns for all using (auth_can_edit_board(board_id)) with check (auth_can_edit_board(board_id));

-- items
drop policy if exists it_select on items;
create policy it_select on items for select using (auth_can_view_board(board_id));
drop policy if exists it_cud on items;
create policy it_cud on items for all using (auth_can_edit_board(board_id)) with check (auth_can_edit_board(board_id));

-- cell_values
drop policy if exists cv_select on cell_values;
create policy cv_select on cell_values for select using (auth_can_view_board(auth_item_board(item_id)));
drop policy if exists cv_cud on cell_values;
create policy cv_cud on cell_values for all using (auth_can_edit_board(auth_item_board(item_id))) with check (auth_can_edit_board(auth_item_board(item_id)));

-- invitations
drop policy if exists inv_select on invitations;
create policy inv_select on invitations for select using (auth_is_org_admin(org_id));
drop policy if exists inv_insert on invitations;
create policy inv_insert on invitations for insert with check (
  auth_is_org_admin(org_id) or (team_id is not null and auth_is_team_lead(team_id) and org_role = 'member')
);
drop policy if exists inv_delete on invitations;
create policy inv_delete on invitations for delete using (auth_is_org_admin(org_id));

-- ---------- הרשאות הרצה ל-RPC ----------
grant execute on function create_organization(text) to authenticated;
grant execute on function accept_pending_invitations() to authenticated;
grant execute on function my_assigned_items() to authenticated;
grant execute on function ai_overview_summary(uuid) to authenticated;
