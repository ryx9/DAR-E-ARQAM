-- Adds activity workflow status to databases where activities_workflow.sql
-- was already applied before this feature was introduced.
alter table public.school_activities
  add column if not exists status text not null default 'planned';

update public.school_activities
set status = 'planned'
where status is null or status not in ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'school_activities_status_check'
      and conrelid = 'public.school_activities'::regclass
  ) then
    alter table public.school_activities
      add constraint school_activities_status_check
      check (status in ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled'));
  end if;
end;
$$;
