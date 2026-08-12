-- ============================================================================
-- add-ai-work-share.sql — נתח העבודה שמתבצע עם AI, לכל צוות
-- תוסף בטוח להרצה חוזרת (idempotent). בטוח להריץ את כל הקובץ בבת אחת.
--
-- הרקע: "אחוז התייעלות" מודד כמה זמן נחסך *בתוך המשימות שנמדדו עם AI*.
-- אם עבודת ה-AI היא רק חלק מכלל העבודה של הצוות, המספר הזה מטעה כלפי מעלה.
-- כאן מוסיפים לכל צוות שדה "נתח AI" (אחוז מכלל העבודה שמתבצע עם AI),
-- וה-RPC מחזיר בנוסף "התייעלות אפקטיבית" = התייעלות-במשימות-AI × נתח.
-- ============================================================================

alter table teams add column if not exists ai_work_share integer; -- 0..100, null = לא הוגדר

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
    select b.id as board_id, b.workspace_id, w.team_id, t.name as team_name, t.ai_work_share,
           bool_or(c.name = 'כלי AI בשימוש') as has_tool,
           bool_or(c.name = 'זמן עם AI (בדקות)') as has_ai_time,
           bool_or(c.name = 'זמן ידני משוער (בדקות)') as has_manual_time
    from boards b
    join workspaces w on w.id = b.workspace_id
    left join teams t on t.id = w.team_id
    join columns c on c.board_id = b.id
    where w.org_id = p_org
    group by b.id, b.workspace_id, w.team_id, t.name, t.ai_work_share
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
    group by i.id, ab.board_id, ab.team_id, ab.team_name, ab.ai_work_share, i.created_at
  ),
  team_agg as (
    select team_id, team_name, ai_work_share,
      count(*) as cnt,
      sum(greatest(manual_minutes - ai_minutes, 0)) as saved_min,
      sum(manual_minutes) as manual_min
    from item_rows
    where ai_minutes is not null and manual_minutes is not null
    group by team_id, team_name, ai_work_share
  )
  select jsonb_build_object(
    'org_totals', jsonb_build_object(
      'boards_tracked', (select count(*) from ai_boards),
      'items_tracked', (select count(*) from item_rows where ai_minutes is not null and manual_minutes is not null),
      'hours_saved', coalesce((select sum(saved_min) from team_agg), 0) / 60.0,
      'efficiency_pct', case when coalesce((select sum(manual_min) from team_agg), 0) > 0
        then round((select sum(saved_min) from team_agg) / (select sum(manual_min) from team_agg) * 100, 1)
        else 0 end,
      -- התייעלות אפקטיבית ארגונית: משוקללת רק על צוותים שהוגדר להם נתח
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
