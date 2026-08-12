-- ============================================================================
-- add-teams.sql — צוותים מרובים, ראשי צוות, מנהל-תחום AI חוצה-צוותים
-- תוסף בטוח להרצה חוזרת (idempotent), לפי מוסכמת db/fix-*.sql
--
-- *** בטוח להריץ את כל הקובץ בבת אחת, בכל זמן ***
-- שיוך-צוות הוא "opt-in" לפי וורקספייס: וורקספייס בלי team_id ממשיך
-- להתנהג בדיוק כמו היום (פתוח לכל חבר-ארגון). רק וורקספייס שאתה
-- בעצמך משייך לצוות (דרך עמוד "צוותים" או "שיוך לצוות" בסיידבר)
-- הופך מוגבל לחברי אותו צוות בלבד. אין סיכון לנעילת אף אחד בטעות,
-- ואין צורך לשייך הכל מראש — תוכל לעשות זאת בהדרגה ובקצב שלך.
-- ============================================================================

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  color text default '#0E9E7C',
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

alter table workspaces add column if not exists team_id uuid references teams(id) on delete set null;
alter table members add column if not exists is_ai_overseer boolean not null default false;
alter table invitations add column if not exists team_id uuid references teams(id) on delete set null;
alter table invitations add column if not exists team_role text; -- 'lead' | 'member', null = לא משויך לצוות

-- --- פונקציות עזר (security definer, stable) ---

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
-- (ואז ההתנהגות היא בדיוק כמו היום — פתוח לכל חבר בארגון של הוורקספייס).
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

-- --- RLS על teams / team_members ---

alter table teams enable row level security;
alter table team_members enable row level security;

drop policy if exists team_select on teams;
create policy team_select on teams for select using (auth_is_org_admin(org_id) or auth_is_team_member(id));
drop policy if exists team_insert on teams;
create policy team_insert on teams for insert with check (auth_is_org_admin(org_id));
drop policy if exists team_update on teams;
create policy team_update on teams for update using (auth_is_org_admin(org_id));
drop policy if exists team_delete on teams;
create policy team_delete on teams for delete using (auth_is_org_admin(org_id));

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

-- --- inv_insert: מאפשר גם לראש-צוות להזמין חברים לצוות שלו (רק כ-org_role='member', לא admin) ---

drop policy if exists inv_insert on invitations;
create policy inv_insert on invitations for insert with check (
  auth_is_org_admin(org_id) or (team_id is not null and auth_is_team_lead(team_id) and org_role = 'member')
);

-- --- accept_pending_invitations: מזרים גם ל-team_members כשיש שיוך-צוות בהזמנה ---

create or replace function accept_pending_invitations()
returns int language plpgsql security definer as $$
declare v_email text; v_name text; v_cnt int := 0; inv record;
begin
  select email, coalesce(raw_user_meta_data->>'full_name', email)
    into v_email, v_name from auth.users where id = auth.uid();
  for inv in select * from invitations where lower(email) = lower(v_email) and status = 'pending' loop
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

-- --- דשבורד מנהל-תחום AI: RPC חוצה-צוותים ---
-- מזהה בורדי-AI לפי אותה המוסכמת הקיימת (שם עמודה מדויק), כמו ב-DashboardPage.jsx/ReportsView.jsx.
-- security definer: עוקף RLS *בתוך הפונקציה בלבד* — מנהל-התחום לעולם לא שולח שאילתה ישירה
-- לטבלאות boards/items/cell_values (אלה יחזירו לו ריק, ה-RLS הרגיל עדיין חוסם).

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
    select b.id as board_id, b.workspace_id, w.team_id, t.name as team_name,
           bool_or(c.name = 'כלי AI בשימוש') as has_tool,
           bool_or(c.name = 'זמן עם AI (בדקות)') as has_ai_time,
           bool_or(c.name = 'זמן ידני משוער (בדקות)') as has_manual_time
    from boards b
    join workspaces w on w.id = b.workspace_id
    left join teams t on t.id = w.team_id
    join columns c on c.board_id = b.id
    where w.org_id = p_org
    group by b.id, b.workspace_id, w.team_id, t.name
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
      ab.team_id,
      ab.team_name,
      i.created_at,
      (array_agg(cv.value->'ids'->>0) filter (where cols.name = 'כלי AI בשימוש'))[1] as tool_label_id,
      (array_agg((cv.value->>'number')::numeric) filter (where cols.name = 'זמן עם AI (בדקות)'))[1] as ai_minutes,
      (array_agg((cv.value->>'number')::numeric) filter (where cols.name = 'זמן ידני משוער (בדקות)'))[1] as manual_minutes
    from items i
    join ai_boards ab on ab.board_id = i.board_id
    join cols on cols.board_id = i.board_id
    left join cell_values cv on cv.item_id = i.id and cv.column_id = cols.id
    where i.parent_item_id is null
    group by i.id, ab.board_id, ab.team_id, ab.team_name, i.created_at
  )
  select jsonb_build_object(
    'org_totals', jsonb_build_object(
      'boards_tracked', (select count(*) from ai_boards),
      'items_tracked', (select count(*) from item_rows where ai_minutes is not null and manual_minutes is not null),
      'hours_saved', coalesce((select sum(greatest(manual_minutes - ai_minutes, 0)) from item_rows), 0) / 60.0,
      'efficiency_pct', case when coalesce((select sum(manual_minutes) from item_rows), 0) > 0
        then round((coalesce((select sum(greatest(manual_minutes - ai_minutes, 0)) from item_rows), 0)
             / (select sum(manual_minutes) from item_rows)) * 100, 1)
        else 0 end
    ),
    'by_team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_id', team_id,
        'team_name', coalesce(team_name, 'ללא שיוך'),
        'items_tracked', cnt,
        'hours_saved', hours_saved,
        'efficiency_pct', eff_pct
      ))
      from (
        select team_id, team_name,
          count(*) as cnt,
          sum(greatest(manual_minutes - ai_minutes, 0)) / 60.0 as hours_saved,
          case when sum(manual_minutes) > 0
            then round((sum(greatest(manual_minutes - ai_minutes, 0)) / sum(manual_minutes)) * 100, 1)
            else 0 end as eff_pct
        from item_rows
        where ai_minutes is not null and manual_minutes is not null
        group by team_id, team_name
      ) t
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
        'efficiency_pct', eff_pct
      ) order by month)
      from (
        select to_char(created_at, 'YYYY-MM') as month,
          sum(greatest(manual_minutes - ai_minutes, 0)) / 60.0 as hours_saved,
          case when sum(manual_minutes) > 0
            then round((sum(greatest(manual_minutes - ai_minutes, 0)) / sum(manual_minutes)) * 100, 1)
            else 0 end as eff_pct
        from item_rows
        where ai_minutes is not null and manual_minutes is not null
        group by to_char(created_at, 'YYYY-MM')
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end; $$;

-- --- auth_board_role: מוסיף ענפי owner/editor לפי צוות, עם נפילה-חזרה לוורקספייס בלי שיוך ---

create or replace function auth_board_role(p_board uuid)
returns text language sql security definer stable as $$
  select coalesce(
    (select 'owner' where exists (   -- אדמין-ארגון => owner בכל מקום
      select 1 from boards b join workspaces w on w.id = b.workspace_id
      join members m on m.org_id = w.org_id
      where b.id = p_board and m.user_id = auth.uid() and m.role = 'admin'
    )),
    (select 'owner' where exists (   -- ראש צוות = owner על בורד בוורקספייס המשויך לצוות שלו
      select 1 from boards b join workspaces w on w.id = b.workspace_id
      join team_members tm on tm.team_id = w.team_id
      where b.id = p_board and tm.user_id = auth.uid() and tm.role = 'lead'
    )),
    (select role from board_members where board_id = p_board and user_id = auth.uid()),
    (select 'editor' where exists (   -- חבר-צוות = editor על בורד בוורקספייס המשויך לצוות שלו
      select 1 from boards b join workspaces w on w.id = b.workspace_id
      join team_members tm on tm.team_id = w.team_id
      where b.id = p_board and tm.user_id = auth.uid()
    )),
    (select 'editor' where exists (   -- וורקספייס בלי שיוך-צוות: פתוח לכל חבר-ארגון, בדיוק כמו היום
      select 1 from boards b join workspaces w on w.id = b.workspace_id
      join members m on m.org_id = w.org_id
      where b.id = p_board and w.team_id is null and m.user_id = auth.uid()
    ))
  );
$$;

-- --- workspaces: opt-in לפי שיוך-צוות ---

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

-- --- boards: opt-in לפי שיוך-צוות (דרך auth_is_workspace_accessible) ---

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
  or exists (select 1 from board_members bm where bm.board_id = boards.id and bm.user_id = auth.uid() and bm.role in ('owner','editor'))
  or auth_is_workspace_accessible(workspace_id)
);
drop policy if exists bd_delete on boards;
create policy bd_delete on boards for delete using (
  auth_is_workspace_org_admin(workspace_id)
  or created_by = auth.uid()
  or exists (select 1 from board_members bm where bm.board_id = boards.id and bm.user_id = auth.uid() and bm.role = 'owner')
  or auth_is_workspace_team_lead(workspace_id)   -- ראש צוות יכול למחוק כל בורד בוורקספייס המשויך לצוות שלו
);

-- ============================================================================
-- ROLLBACK (אם משהו נראה שגוי, להריץ את זה כדי לחזור לראייה גורפת-ארגון על הכל):
--
-- create or replace function auth_is_workspace_accessible(p_workspace uuid)
-- returns boolean language sql security definer stable as $$
--   select auth_is_workspace_member(p_workspace);
-- $$;
--
-- (משתמש בפונקציה auth_is_workspace_member הקיימת מ-fix-member-board-access.sql
--  כדי להחזיר את הראייה הגורפת בלי לגעת שוב במדיניות bd_select/bd_update עצמן.
--  לביטול מלא גם ל-ws_*, יש להריץ מחדש את הגרסה הישנה מ-schema.sql המקורי.)
-- ============================================================================
