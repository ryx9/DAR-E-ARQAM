-- Student leave applications and same-day short-leave records.
-- Leave rows are deliberately one-per-student/per-day so attendance can resolve
-- an approved leave without having to expand date ranges in every client.
create table public.student_leave_applications (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(studentid) on delete cascade,
  class_id bigint not null references public.classes(id),
  start_date date not null,
  end_date date not null,
  reason text not null,
  application_text text not null default '',
  status text not null default 'approved' check (status in ('pending','approved','rejected','cancelled')),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  check (end_date >= start_date),
  check (length(btrim(reason)) between 2 and 1000),
  check (length(application_text) <= 4000)
);

create table public.student_leaves (
  application_id uuid not null references public.student_leave_applications(id) on delete cascade,
  student_id text not null references public.students(studentid) on delete cascade,
  class_id bigint not null references public.classes(id),
  leave_date date not null,
  reason text not null,
  status text not null check (status in ('pending','approved','rejected','cancelled')),
  primary key (student_id, leave_date)
);
create index student_leaves_class_date on public.student_leaves(class_id, leave_date);

create table public.student_short_leaves (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(studentid) on delete cascade,
  class_id bigint not null references public.classes(id),
  leave_date date not null,
  left_at timestamptz not null,
  reason text not null,
  notes text not null default '',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  unique(student_id, leave_date),
  check (length(btrim(reason)) between 2 and 1000),
  check (length(notes) <= 4000)
);
create index student_short_leaves_class_date on public.student_short_leaves(class_id, leave_date desc);

alter table public.student_leave_applications enable row level security;
alter table public.student_leaves enable row level security;
alter table public.student_short_leaves enable row level security;
revoke all on public.student_leave_applications, public.student_leaves, public.student_short_leaves from public, anon, authenticated;
grant select on public.student_leave_applications, public.student_leaves, public.student_short_leaves to authenticated;

create policy student_leave_applications_read on public.student_leave_applications for select to authenticated using (
  coalesce(public.daily_rounds_role(), '') in ('admin','superadmin') or
  (coalesce(public.daily_rounds_role(), '') = 'teacher' and exists (
    select 1 from public.teacher_class_access a where a.teacher_profile = auth.uid() and a.class = class_id
  ))
);
create policy student_leaves_read on public.student_leaves for select to authenticated using (
  coalesce(public.daily_rounds_role(), '') in ('admin','superadmin') or
  (coalesce(public.daily_rounds_role(), '') = 'teacher' and exists (
    select 1 from public.teacher_class_access a where a.teacher_profile = auth.uid() and a.class = class_id
  ))
);
create policy student_short_leaves_read on public.student_short_leaves for select to authenticated using (
  coalesce(public.daily_rounds_role(), '') in ('admin','superadmin') or
  (coalesce(public.daily_rounds_role(), '') = 'teacher' and exists (
    select 1 from public.teacher_class_access a where a.teacher_profile = auth.uid() and a.class = class_id
  ))
);

create function public.student_leave_can_manage(p_class_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.daily_rounds_role(), '') in ('admin','superadmin') or exists (
    select 1 from public.teacher_class_access a
    where a.teacher_profile = auth.uid() and a.class = p_class_id
      and public.daily_rounds_role() = 'teacher'
  )
$$;

create function public.save_student_leave(
  p_student_id text, p_start_date date, p_end_date date, p_reason text,
  p_application_text text default '', p_status text default 'approved', p_application_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  student_row public.students;
  application public.student_leave_applications;
  leave_day date;
  queued integer := 0;
  inserted_count integer := 0;
  payload text;
begin
  if coalesce(public.daily_rounds_role(), '') not in ('admin','superadmin','teacher') then
    raise exception 'Staff access required';
  end if;
  select * into student_row from public.students where studentid = btrim(p_student_id) and status = 'active';
  if not found or not public.student_leave_can_manage(student_row.class_id) then raise exception 'You cannot manage leave for this student'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date or p_end_date - p_start_date > 90 then
    raise exception 'Choose a leave period of up to 91 days';
  end if;
  if p_status not in ('pending','approved','rejected','cancelled') or length(btrim(coalesce(p_reason,''))) not between 2 and 1000
    or length(coalesce(p_application_text,'')) > 4000 then raise exception 'Enter a valid reason, application and status'; end if;
  if p_application_id is not null then
    select * into application from public.student_leave_applications where id = p_application_id for update;
    if not found or application.student_id <> student_row.studentid then raise exception 'Leave application was not found'; end if;
    delete from public.student_leaves where application_id = application.id;
    update public.student_leave_applications set start_date=p_start_date, end_date=p_end_date, reason=btrim(p_reason),
      application_text=coalesce(p_application_text,''), status=p_status, updated_by=actor, updated_at=now(), revision=revision+1
      where id=application.id returning * into application;
  else
    insert into public.student_leave_applications(student_id,class_id,start_date,end_date,reason,application_text,status,created_by,updated_by)
      values(student_row.studentid,student_row.class_id,p_start_date,p_end_date,btrim(p_reason),coalesce(p_application_text,''),p_status,actor,actor)
      returning * into application;
  end if;
  insert into public.student_leaves(application_id,student_id,class_id,leave_date,reason,status)
    select application.id, student_row.studentid, student_row.class_id, d::date, application.reason, application.status
    from generate_series(p_start_date, p_end_date, interval '1 day') d
    on conflict (student_id, leave_date) do update set application_id=excluded.application_id,class_id=excluded.class_id,
      reason=excluded.reason,status=excluded.status;
  -- Future leave notices remain queued until the relevant Pakistan-school day.
  if p_status = 'approved' and nullif(btrim(coalesce(student_row.mobilenumber,'')), '') is not null then
    for leave_day in select leave_date from public.student_leaves where application_id = application.id and leave_date >= (now() at time zone 'Asia/Karachi')::date loop
      payload := format('*Leave marked*\n\nDear Parent/Guardian,\n\nStudent: %s\nDate: %s\nReason: %s\n\nYour child has been marked on approved leave for this date.\n\nDar-e-Arqam School',
        student_row.name, to_char(leave_day, 'DD Mon YYYY'), application.reason);
      insert into public.messages(student_id,class_id,number,text,sent,created_at,type,notice_template,notice_scheduled_for,notice_queued_at)
      select student_row.studentid, student_row.class_id, student_row.mobilenumber, payload, false,
        ((leave_day::timestamp + time '08:00') at time zone 'Asia/Karachi'), 'notice', payload,
        ((leave_day::timestamp + time '08:00') at time zone 'Asia/Karachi'), now()
      where not exists (
        select 1 from public.messages m where m.student_id = student_row.studentid and m.class_id = student_row.class_id
          and m.notice_template = payload and m.notice_scheduled_for = ((leave_day::timestamp + time '08:00') at time zone 'Asia/Karachi')
      );
      get diagnostics inserted_count = row_count;
      queued := queued + inserted_count;
    end loop;
  end if;
  return jsonb_build_object('id', application.id, 'revision', application.revision, 'queued', queued);
end $$;

create function public.save_student_short_leave(
  p_student_id text, p_leave_date date, p_left_at time, p_reason text, p_notes text default '', p_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  student_row public.students;
  record public.student_short_leaves;
  at_time timestamptz;
  payload text;
  queued integer := 0;
  inserted_count integer := 0;
begin
  if coalesce(public.daily_rounds_role(), '') not in ('admin','superadmin','teacher') then raise exception 'Staff access required'; end if;
  select * into student_row from public.students where studentid = btrim(p_student_id) and status = 'active';
  if not found or not public.student_leave_can_manage(student_row.class_id) then raise exception 'You cannot manage short leave for this student'; end if;
  if p_leave_date is null or p_leave_date > (now() at time zone 'Asia/Karachi')::date or p_left_at is null
    or length(btrim(coalesce(p_reason,''))) not between 2 and 1000 or length(coalesce(p_notes,'')) > 4000 then
    raise exception 'Enter a valid date, time and reason';
  end if;
  at_time := ((p_leave_date::timestamp + p_left_at) at time zone 'Asia/Karachi');
  if p_id is not null then
    update public.student_short_leaves set leave_date=p_leave_date,left_at=at_time,reason=btrim(p_reason),notes=coalesce(p_notes,''),
      updated_by=actor,updated_at=now(),revision=revision+1 where id=p_id and student_id=student_row.studentid
      returning * into record;
    if not found then raise exception 'Short leave was not found'; end if;
  else
    insert into public.student_short_leaves(student_id,class_id,leave_date,left_at,reason,notes,created_by,updated_by)
      values(student_row.studentid,student_row.class_id,p_leave_date,at_time,btrim(p_reason),coalesce(p_notes,''),actor,actor)
      on conflict(student_id,leave_date) do update set left_at=excluded.left_at,reason=excluded.reason,notes=excluded.notes,
        updated_by=actor,updated_at=now(),revision=public.student_short_leaves.revision+1 returning * into record;
  end if;
  if nullif(btrim(coalesce(student_row.mobilenumber,'')), '') is not null then
    payload := format('*Short leave notice*\n\nDear Parent/Guardian,\n\nStudent: %s\nDate: %s\nLeft school at: %s\nReason: %s\n\nPlease contact the school office if this needs correction.\n\nDar-e-Arqam School',
      student_row.name, to_char(record.leave_date, 'DD Mon YYYY'), to_char(record.left_at at time zone 'Asia/Karachi', 'HH12:MI AM'), record.reason);
    insert into public.messages(student_id,class_id,number,text,sent,type,notice_template,notice_queued_at)
      values(student_row.studentid,student_row.class_id,student_row.mobilenumber,payload,false,'notice',payload,now());
    get diagnostics inserted_count = row_count;
    queued := inserted_count;
  end if;
  return jsonb_build_object('id',record.id,'revision',record.revision,'queued',queued);
end $$;

revoke all on function public.student_leave_can_manage(bigint), public.save_student_leave(text,date,date,text,text,text,uuid), public.save_student_short_leave(text,date,time,text,text,uuid) from public, anon;
grant execute on function public.save_student_leave(text,date,date,text,text,text,uuid), public.save_student_short_leave(text,date,time,text,text,uuid) to authenticated;
