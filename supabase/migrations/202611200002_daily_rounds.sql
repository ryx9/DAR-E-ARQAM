create table public.daily_rounds (
  id uuid primary key default gen_random_uuid(),
  class_id bigint not null references public.classes(id),
  class_name text not null,
  visit_date date not null,
  lecture text not null,
  subject text not null,
  teacher_id uuid not null references public.profiles(id),
  teacher_name text not null,
  ratings jsonb not null,
  score numeric(3,2) not null check (score between 1 and 5),
  notes text not null default '',
  actionables text[] not null default '{}',
  prior_round_id uuid references public.daily_rounds(id),
  prior_round_date date,
  prior_actionables text[] not null default '{}',
  follow_up text not null default '',
  attendance_average numeric(5,2),
  attendance_days integer not null,
  diary_count integer not null,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
create index daily_rounds_class_order on public.daily_rounds(class_id, visit_date desc, created_at desc);
create index daily_rounds_date_order on public.daily_rounds(visit_date desc, created_at desc);
create index daily_rounds_teacher on public.daily_rounds(teacher_id, visit_date desc);
create index daily_rounds_diary_delivery on public.messages(class_id, created_at)
  where sent is true and student_id is not null;
alter table public.daily_rounds enable row level security;
revoke all on public.daily_rounds from public, anon, authenticated;
grant select on public.daily_rounds to authenticated;

create function public.daily_rounds_role() returns text
language sql stable security definer set search_path = '' as $$
  select lower(role) from public.profiles where id = auth.uid() and is_active is not false
$$;
create policy daily_rounds_staff_read on public.daily_rounds for select to authenticated
using (
  (select public.daily_rounds_role()) in ('admin', 'superadmin')
  or (
    (select public.daily_rounds_role()) = 'teacher'
    and exists (select 1 from public.teacher_class_access a
      where a.teacher_profile = (select auth.uid()) and a.class = daily_rounds.class_id)
  )
);

create function public.daily_round_context(p_class_id bigint, p_visit_date date, p_round_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  previous public.daily_rounds;
  current_visit public.daily_rounds;
  attendance_average numeric;
  attendance_days integer;
  diary_count integer;
begin
  if coalesce(public.daily_rounds_role(), '') not in ('admin', 'superadmin') then
    raise exception 'Administrator access required';
  end if;
  select * into current_visit from public.daily_rounds where id = p_round_id;
  select r.* into previous from public.daily_rounds r
    where r.class_id = p_class_id and r.id is distinct from p_round_id
      and (r.visit_date < p_visit_date or (r.visit_date = p_visit_date
        and (p_round_id is null or (r.created_at, r.id) < (current_visit.created_at, current_visit.id))))
    order by r.visit_date desc, r.created_at desc, r.id desc limit 1;
  select round(avg(d.rate), 2), count(*) into attendance_average, attendance_days
  from (
    select 100.0 * count(*) filter (where lower(status) = 'present') / count(*) as rate
    from public.attendance
    where class_id = p_class_id and date <= p_visit_date and lower(status) in ('present','absent')
    group by date order by date desc limit 7
  ) d;
  select count(*) into diary_count from public.diary d
    where d.class_id = p_class_id and d.date between p_visit_date - 4 and p_visit_date
      and exists (select 1 from public.messages m
        where m.class_id = d.class_id and m.student_id is not null and m.sent is true
          and m.created_at >= (d.date::timestamp at time zone 'Asia/Karachi')
          and m.created_at < ((d.date + 1)::timestamp at time zone 'Asia/Karachi')
          and (m.notice_template = d.diary or m.text = d.diary));
  return jsonb_build_object('attendance_average', attendance_average, 'attendance_days', attendance_days,
    'diary_count', diary_count, 'prior_round_id', previous.id, 'prior_round_date', previous.visit_date,
    'prior_actionables', coalesce(previous.actionables, '{}'));
end $$;

create function public.save_daily_round(p_report jsonb, p_id uuid default null, p_revision integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  prior public.daily_rounds;
  visit public.daily_rounds;
  metrics jsonb;
  selected_class bigint := (p_report->>'class_id')::bigint;
  selected_date date := (p_report->>'visit_date')::date;
  selected_teacher uuid := (p_report->>'teacher_id')::uuid;
  class_title text;
  staff_name text;
  selected_lecture text := nullif(btrim(p_report->>'lecture'), '');
  selected_subject text := nullif(btrim(p_report->>'subject'), '');
  ratings jsonb := p_report->'ratings';
  calculated numeric;
  actions text[];
  queued integer := 0;
  message_body text;
  required_keys constant text[] := array[
    'class_cleanliness','discipline','student_behaviour','student_cleanliness','uniform','nails',
    'syllabus_planning','timetable','student_response','student_learning','books_condition',
    'book_checking','book_rechecking','attendance_register','cms_updates'
  ];
begin
  if coalesce(public.daily_rounds_role(), '') not in ('admin', 'superadmin') then
    raise exception 'Administrator access required';
  end if;
  if selected_date is null or selected_date > (now() at time zone 'Asia/Karachi')::date
      or selected_lecture is null or selected_subject is null then
    raise exception 'Enter a visit date, lecture and subject';
  end if;
  if length(selected_lecture) > 100 or length(selected_subject) > 120 then
    raise exception 'Lecture and subject names are too long';
  end if;
  select name into class_title from public.classes where id = selected_class;
  select coalesce(nullif(btrim(name), ''), 'Staff member') into staff_name
    from public.profiles where id = selected_teacher and lower(role) in ('teacher','admin','superadmin')
      and is_active is not false;
  if p_id is not null then
    select * into prior from public.daily_rounds where id = p_id for update;
    if not found or prior.revision is distinct from p_revision then
      raise exception 'This visit changed. Refresh before editing.';
    end if;
    if staff_name is null and selected_teacher = prior.teacher_id then staff_name := prior.teacher_name; end if;
  end if;
  if class_title is null or staff_name is null then raise exception 'Select a valid class and teacher'; end if;
  if jsonb_typeof(ratings) is distinct from 'object' or not (ratings ?& required_keys) then
    raise exception 'Rate each item or mark it Not observed';
  end if;
  if exists (select 1 from jsonb_each_text(ratings) t where not (t.key = any(required_keys))
      or t.value is null or t.value not in ('1','2','3','4','5','na')) then
    raise exception 'Invalid ratings';
  end if;
  select round(avg(nullif(t.value, 'na')::numeric), 2) into calculated from jsonb_each_text(ratings) t;
  if calculated is null then raise exception 'Rate at least one criterion'; end if;
  select coalesce(array_agg(btrim(a.value) order by a.ordinality), '{}') into actions
    from jsonb_array_elements_text(coalesce(p_report->'actionables', '[]')) with ordinality a(value, ordinality)
    where nullif(btrim(a.value), '') is not null;
  if cardinality(actions) > 20 or exists (select 1 from unnest(actions) a where length(a) > 300)
      or length(coalesce(p_report->>'notes','')) > 4000 or length(coalesce(p_report->>'follow_up','')) > 4000 then
    raise exception 'Actionables and notes exceed the report limits';
  end if;
  if p_id is not null and selected_date = prior.visit_date and selected_class = prior.class_id then
    metrics := to_jsonb(prior);
  else
    metrics := public.daily_round_context(selected_class, selected_date, p_id);
  end if;

  insert into public.daily_rounds (
    id, class_id, class_name, visit_date, lecture, subject, teacher_id, teacher_name, ratings, score,
    notes, actionables, prior_round_id, prior_round_date, prior_actionables, follow_up,
    attendance_average, attendance_days, diary_count, created_by, updated_by
  ) values (
    coalesce(p_id, gen_random_uuid()), selected_class, class_title, selected_date, selected_lecture, selected_subject,
    selected_teacher, staff_name, ratings, calculated, coalesce(p_report->>'notes',''), actions,
    (metrics->>'prior_round_id')::uuid, (metrics->>'prior_round_date')::date,
    array(select jsonb_array_elements_text(metrics->'prior_actionables')), coalesce(p_report->>'follow_up',''),
    (metrics->>'attendance_average')::numeric, (metrics->>'attendance_days')::integer,
    (metrics->>'diary_count')::integer, actor, actor
  ) on conflict (id) do update set
    class_id = excluded.class_id, class_name = excluded.class_name, visit_date = excluded.visit_date,
    lecture = excluded.lecture, subject = excluded.subject, teacher_id = excluded.teacher_id,
    teacher_name = excluded.teacher_name, ratings = excluded.ratings, score = excluded.score,
    notes = excluded.notes, actionables = excluded.actionables, prior_round_id = excluded.prior_round_id,
    prior_round_date = excluded.prior_round_date, prior_actionables = excluded.prior_actionables,
    follow_up = excluded.follow_up, attendance_average = excluded.attendance_average,
    attendance_days = excluded.attendance_days, diary_count = excluded.diary_count,
    updated_by = actor, updated_at = now(), revision = public.daily_rounds.revision + 1
  returning * into visit;

  if p_id is null or (to_jsonb(visit) - array['updated_by','updated_at','revision'])
      is distinct from (to_jsonb(prior) - array['updated_by','updated_at','revision']) then
    message_body := format(E'*Daily Round %s*\nClass: %s\nDate: %s\nLecture: %s · %s\nObserved teacher: %s\nOverall: %s/5\nDiaries in the last 5 days: %s\n\n*Actionables*\n%s\n\nOpen Daily Rounds to review the full report.\nVisit reference: %s',
      case when p_id is null then 'Report' else 'Updated (revision ' || visit.revision || ')' end,
      class_title, selected_date, selected_lecture, selected_subject, staff_name, calculated, visit.diary_count,
      coalesce(nullif(array_to_string(actions, E'\n- ', ''), ''), 'None recorded'), left(visit.id::text, 8));
    insert into public.messages(number, text, sent, class_id)
      select distinct p.mobilenumber, message_body, false, selected_class
      from public.profiles p
      where lower(p.role) = 'teacher' and p.is_active is not false
        and nullif(btrim(p.mobilenumber), '') is not null
        and exists (select 1 from public.teacher_class_access a
          where a.teacher_profile = p.id and a.class = selected_class);
    get diagnostics queued = row_count;
  end if;
  return jsonb_build_object('id', visit.id, 'queued', queued);
end $$;

revoke execute on function public.daily_rounds_role(), public.daily_round_context(bigint,date,uuid),
  public.save_daily_round(jsonb,uuid,integer) from public, anon;
grant execute on function public.daily_rounds_role(), public.daily_round_context(bigint,date,uuid),
  public.save_daily_round(jsonb,uuid,integer) to authenticated;
