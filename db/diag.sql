-- שאילתת אבחון זעירה: יוצרת פונקציה שמחזירה את חוקי ההרשאה על טבלת הבורדים.
-- הרץ את כל הקובץ ב-SQL Editor. בטוח לחלוטין.

create or replace function debug_boards_policies()
returns table(policyname text, cmd text, permissive text, qual text, with_check text)
language sql security definer stable as $$
  select policyname::text, cmd::text, permissive::text,
         coalesce(qual, '')::text, coalesce(with_check, '')::text
  from pg_policies
  where schemaname = 'public' and tablename = 'boards';
$$;

grant execute on function debug_boards_policies() to authenticated, anon;

select * from debug_boards_policies();
