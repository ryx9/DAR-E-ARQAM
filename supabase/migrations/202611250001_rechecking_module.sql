-- Examination bundle checking and routine book/notebook/workbook rechecking.
create table public.rechecking_managers (
  class_id bigint not null references public.classes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (class_id, profile_id)
);

create table public.rechecking_duties (
  id uuid primary key default gen_random_uuid(),
  duty_type text not null check (duty_type in ('exam','routine')),
  batch_id bigint references public.datesheet_batches(id) on delete set null,
  test_id bigint references public.tests(id) on delete set null,
  class_id bigint not null references public.classes(id),
  subject text not null,
  title text not null,
  materials text[] not null default '{}',
  checker_id uuid not null references public.profiles(id),
  rechecker_id uuid not null references public.profiles(id),
  checking_deadline date,
  rechecking_deadline date,
  status text not null default 'checking' check (status in ('checking','awaiting_recheck','returned','completed','cancelled')),
  checking_round integer not null default 1,
  total_items integer,
  checking_completed_on date,
  handed_over_at timestamptz,
  checker_notes text not null default '',
  returned_at timestamptz,
  return_reason text not null default '',
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  check (length(btrim(subject)) between 1 and 160),
  check (length(btrim(title)) between 1 and 300),
  check (checker_id <> rechecker_id),
  check (total_items is null or total_items >= 0),
  check (checking_deadline is null or rechecking_deadline is null or rechecking_deadline >= checking_deadline)
);
create unique index rechecking_one_exam_duty on public.rechecking_duties(test_id) where test_id is not null and status <> 'cancelled';
create index rechecking_duties_status on public.rechecking_duties(status, checking_deadline, rechecking_deadline);
create index rechecking_duties_class_subject on public.rechecking_duties(class_id, subject, created_at desc);
create index rechecking_duties_staff on public.rechecking_duties(checker_id, rechecker_id, status);

create table public.rechecking_reviews (
  id uuid primary key default gen_random_uuid(),
  duty_id uuid not null references public.rechecking_duties(id) on delete cascade,
  review_round integer not null,
  reviewer_id uuid not null references public.profiles(id),
  reviewed_on date not null,
  very_poor_count integer not null default 0 check (very_poor_count >= 0),
  poor_count integer not null default 0 check (poor_count >= 0),
  slightly_poor_count integer not null default 0 check (slightly_poor_count >= 0),
  satisfactory_count integer not null default 0 check (satisfactory_count >= 0),
  incomplete_or_absent_count integer not null default 0 check (incomplete_or_absent_count >= 0),
  syllabus_week integer check (syllabus_week is null or syllabus_week > 0),
  notes_to_teacher text not null default '',
  outcome text not null check (outcome in ('completed','returned')),
  created_at timestamptz not null default now(),
  unique(duty_id, review_round)
);
create index rechecking_reviews_duty on public.rechecking_reviews(duty_id, review_round desc);

alter table public.rechecking_managers enable row level security;
alter table public.rechecking_duties enable row level security;
alter table public.rechecking_reviews enable row level security;
revoke all on public.rechecking_managers, public.rechecking_duties, public.rechecking_reviews from public, anon, authenticated;
grant select on public.rechecking_managers, public.rechecking_duties, public.rechecking_reviews to authenticated;

create function public.rechecking_role() returns text language sql stable security definer set search_path = '' as $$
  select lower(role) from public.profiles where id=auth.uid() and is_active is not false
$$;
create function public.rechecking_can_manage(p_class_id bigint) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.rechecking_role(), '') in ('admin','superadmin') or exists (
    select 1 from public.rechecking_managers rm
    where rm.class_id=p_class_id and rm.profile_id=auth.uid() and public.rechecking_role()='teacher'
  )
$$;
create function public.rechecking_can_read(p_class_id bigint, p_checker uuid, p_rechecker uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.rechecking_can_manage(p_class_id) or auth.uid() in (p_checker,p_rechecker)
$$;

create policy rechecking_managers_read on public.rechecking_managers for select to authenticated using (
  public.rechecking_can_manage(class_id) or profile_id=auth.uid()
);
create policy rechecking_duties_read on public.rechecking_duties for select to authenticated using (
  public.rechecking_can_read(class_id,checker_id,rechecker_id)
);
create policy rechecking_reviews_read on public.rechecking_reviews for select to authenticated using (
  exists(select 1 from public.rechecking_duties d where d.id=duty_id and public.rechecking_can_read(d.class_id,d.checker_id,d.rechecker_id))
);

create function public.rechecking_staff_valid(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=p_id and lower(p.role) in ('teacher','admin','superadmin') and p.is_active is not false)
$$;

create function public.rechecking_notify(p_profile uuid, p_text text, p_class bigint default null) returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=p_profile and is_active is not false;
  if found and nullif(btrim(p.mobilenumber),'') is not null then
    insert into public.messages(number,text,sent,class_id) values(p.mobilenumber,p_text,false,p_class);
  end if;
end $$;

create function public.save_rechecking_manager(p_class_id bigint,p_profile_id uuid,p_enabled boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.rechecking_role(),'') not in ('admin','superadmin') then raise exception 'Administrator access required'; end if;
  if not public.rechecking_staff_valid(p_profile_id) then raise exception 'Choose an active staff member'; end if;
  if p_enabled then
    insert into public.rechecking_managers(class_id,profile_id,granted_by) values(p_class_id,p_profile_id,auth.uid()) on conflict do nothing;
  else
    delete from public.rechecking_managers where class_id=p_class_id and profile_id=p_profile_id;
  end if;
end $$;

create function public.save_rechecking_duty(p_duty jsonb, p_id uuid default null, p_revision integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid(); duty public.rechecking_duties; current_duty public.rechecking_duties;
  duty_class bigint:=(p_duty->>'class_id')::bigint; duty_type text:=p_duty->>'duty_type';
  checker uuid:=nullif(p_duty->>'checker_id','')::uuid; rechecker uuid:=nullif(p_duty->>'rechecker_id','')::uuid;
  duty_subject text:=btrim(p_duty->>'subject'); duty_title text:=btrim(p_duty->>'title'); materials text[];
begin
  if not public.rechecking_can_manage(duty_class) then raise exception 'You are not permitted to assign rechecking for this class'; end if;
  if duty_type not in ('exam','routine') or duty_subject='' or duty_title='' or not public.rechecking_staff_valid(checker)
      or not public.rechecking_staff_valid(rechecker) or checker=rechecker then raise exception 'Enter valid duty details and two different active staff members'; end if;
  select coalesce(array_agg(btrim(value)), '{}') into materials from jsonb_array_elements_text(coalesce(p_duty->'materials','[]')) value where btrim(value) in ('book','notebook','workbook');
  if duty_type='exam' and (p_duty->>'test_id' is null or not exists(select 1 from public.tests t where t.id=(p_duty->>'test_id')::bigint and t.class_id=duty_class and t.subject=duty_subject)) then raise exception 'Choose a valid datesheet paper'; end if;
  if duty_type='routine' and cardinality(materials)=0 then raise exception 'Select at least one item to recheck'; end if;
  if p_id is not null then
    select * into current_duty from public.rechecking_duties where id=p_id for update;
    if not found or current_duty.revision is distinct from p_revision then raise exception 'This duty changed. Refresh before editing.'; end if;
    if current_duty.status not in ('checking','returned') then raise exception 'Completed or handed-over duties cannot be reassigned'; end if;
    update public.rechecking_duties set class_id=duty_class,duty_type=duty_type,batch_id=nullif(p_duty->>'batch_id','')::bigint,
      test_id=nullif(p_duty->>'test_id','')::bigint,subject=duty_subject,title=duty_title,materials=materials,checker_id=checker,rechecker_id=rechecker,
      checking_deadline=nullif(p_duty->>'checking_deadline','')::date,rechecking_deadline=nullif(p_duty->>'rechecking_deadline','')::date,
      status=case when duty_type='routine' then 'awaiting_recheck' else status end,updated_by=actor,updated_at=now(),revision=revision+1 where id=p_id returning * into duty;
  else
    insert into public.rechecking_duties(duty_type,batch_id,test_id,class_id,subject,title,materials,checker_id,rechecker_id,checking_deadline,rechecking_deadline,status,created_by,updated_by)
    values(duty_type,nullif(p_duty->>'batch_id','')::bigint,nullif(p_duty->>'test_id','')::bigint,duty_class,duty_subject,duty_title,materials,checker,rechecker,
      nullif(p_duty->>'checking_deadline','')::date,nullif(p_duty->>'rechecking_deadline','')::date,case when duty_type='routine' then 'awaiting_recheck' else 'checking' end,actor,actor) returning * into duty;
  end if;
  if duty.duty_type='exam' then
    perform public.rechecking_notify(duty.checker_id, format('Rechecking duty assigned\nClass: %s\nSubject: %s\nTask: %s\nChecking deadline: %s\nPlease record completion and handover in Rechecking.',(select name from public.classes where id=duty.class_id),duty.subject,duty.title,coalesce(duty.checking_deadline::text,'Not set')),duty.class_id);
  end if;
  perform public.rechecking_notify(duty.rechecker_id, format('Rechecking duty assigned\nClass: %s\nSubject: %s\nTask: %s\nRechecking deadline: %s\n%s',(select name from public.classes where id=duty.class_id),duty.subject,duty.title,coalesce(duty.rechecking_deadline::text,'Not set'),case when duty.duty_type='routine' then 'This routine sample is ready for your rechecking now.' else 'You will be notified when the bundle is handed over.' end),duty.class_id);
  return jsonb_build_object('id',duty.id,'revision',duty.revision);
end $$;

create function public.complete_rechecking_check(p_id uuid,p_total_items integer,p_completed_on date,p_handed_over_at timestamptz,p_notes text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare duty public.rechecking_duties; actor uuid:=auth.uid();
begin
  select * into duty from public.rechecking_duties where id=p_id for update;
  if not found or (actor<>duty.checker_id and not public.rechecking_can_manage(duty.class_id)) then raise exception 'Only the checker or an authorised manager can complete checking'; end if;
  if duty.status not in ('checking','returned') or p_total_items<0 or p_completed_on is null or p_handed_over_at is null then raise exception 'Enter the total, completion date and handover time'; end if;
  update public.rechecking_duties set total_items=p_total_items,checking_completed_on=p_completed_on,handed_over_at=p_handed_over_at,checker_notes=coalesce(p_notes,''),status='awaiting_recheck',updated_by=actor,updated_at=now(),revision=revision+1 where id=p_id returning * into duty;
  perform public.rechecking_notify(duty.rechecker_id,format('Bundle ready for rechecking\nClass: %s\nSubject: %s\nTotal items: %s\nHanded over: %s\nPlease complete the rechecking form.',(select name from public.classes where id=duty.class_id),duty.subject,duty.total_items,to_char(duty.handed_over_at at time zone 'Asia/Karachi','DD Mon YYYY HH12:MI AM')),duty.class_id);
  return jsonb_build_object('status',duty.status,'revision',duty.revision);
end $$;

create function public.submit_rechecking_review(p_id uuid,p_review jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare duty public.rechecking_duties; actor uuid:=auth.uid(); outcome text:=p_review->>'outcome'; review public.rechecking_reviews; syllabus_week integer:=nullif(p_review->>'syllabus_week','')::integer;
begin
  select * into duty from public.rechecking_duties where id=p_id for update;
  if not found or (actor<>duty.rechecker_id and not public.rechecking_can_manage(duty.class_id)) then raise exception 'Only the assigned rechecker or an authorised manager can submit this review'; end if;
  if duty.status<>'awaiting_recheck' or outcome not in ('completed','returned') then raise exception 'This bundle is not ready for rechecking'; end if;
  if duty.duty_type='routine' and (syllabus_week is null or syllabus_week<1) then raise exception 'Enter the syllabus week covered by this routine recheck'; end if;
  insert into public.rechecking_reviews(duty_id,review_round,reviewer_id,reviewed_on,very_poor_count,poor_count,slightly_poor_count,satisfactory_count,incomplete_or_absent_count,syllabus_week,notes_to_teacher,outcome)
  values(p_id,duty.checking_round,actor,coalesce(nullif(p_review->>'reviewed_on','')::date,(now() at time zone 'Asia/Karachi')::date),
    greatest(0,coalesce((p_review->>'very_poor_count')::int,0)),greatest(0,coalesce((p_review->>'poor_count')::int,0)),greatest(0,coalesce((p_review->>'slightly_poor_count')::int,0)),greatest(0,coalesce((p_review->>'satisfactory_count')::int,0)),greatest(0,coalesce((p_review->>'incomplete_or_absent_count')::int,0)),syllabus_week,coalesce(p_review->>'notes_to_teacher',''),outcome) returning * into review;
  update public.rechecking_duties set status=case when outcome='returned' and duty.duty_type='exam' then 'returned' when outcome='returned' then 'awaiting_recheck' else 'completed' end,returned_at=case when outcome='returned' then now() else returned_at end,
    return_reason=case when outcome='returned' then coalesce(p_review->>'notes_to_teacher','') else return_reason end,completed_at=case when outcome='completed' then now() else completed_at end,
    checking_round=case when outcome='returned' then checking_round+1 else checking_round end,updated_by=actor,updated_at=now(),revision=revision+1 where id=p_id returning * into duty;
  perform public.rechecking_notify(duty.checker_id,format('Rechecking %s\nClass: %s\nSubject: %s\nVery poor: %s · Poor: %s · Slightly poor: %s · Incomplete/absent: %s\n%s',case when outcome='returned' then 'returned for correction' else 'completed' end,(select name from public.classes where id=duty.class_id),duty.subject,review.very_poor_count,review.poor_count,review.slightly_poor_count,review.incomplete_or_absent_count,case when outcome='returned' then 'Please check the bundle again and hand it over for rechecking.' else 'Open Rechecking to view notes.' end),duty.class_id);
  return jsonb_build_object('status',duty.status,'revision',duty.revision);
end $$;

create function public.rechecking_catalogue() returns jsonb language sql stable security definer set search_path = '' as $$
  with scope as (
    select c.id,c.name from public.classes c
    where public.rechecking_role() in ('admin','superadmin')
      or exists(select 1 from public.rechecking_managers rm where rm.class_id=c.id and rm.profile_id=auth.uid())
      or exists(select 1 from public.rechecking_duties d where d.class_id=c.id and auth.uid() in (d.checker_id,d.rechecker_id))
  ), lessons as (
    select l.class_id::bigint class_id,s.name subject,array_agg(distinct l.teacher_id) teacher_ids
    from public.school_timetable st cross join lateral public.timetable_lessons(st.published) l
    join public.subjects s on s.id::text=l.detail->>'subject'
    join scope c on c.id=l.class_id::bigint group by l.class_id,s.name
  )
  select jsonb_build_object(
    'classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by id) from scope),'[]'),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',coalesce(name,'Staff member'),'role',role) order by name) from public.profiles where lower(role) in ('teacher','admin','superadmin') and is_active is not false),'[]'),
    'subjects',coalesce((select jsonb_agg(jsonb_build_object('class_id',cs.class_id,'name',s.name) order by s.name) from public.class_subjects cs join public.subjects s on s.id=cs.subject_id join scope c on c.id=cs.class_id),'[]'),
    'lessons',coalesce((select jsonb_agg(jsonb_build_object('class_id',class_id,'subject',subject,'teacher_ids',teacher_ids)) from lessons),'[]'),
    'batches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,'start',b.exam_start_date,'end',b.exam_end_date) order by b.created_at desc) from public.datesheet_batches b),'[]'),
    'tests',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'class_id',t.class_id,'subject',t.subject,'test_name',t.test_name,'date',t.date) order by t.date desc) from public.tests t join scope c on c.id=t.class_id),'[]')
  )
$$;

revoke all on function public.rechecking_role(),public.rechecking_can_manage(bigint),public.rechecking_can_read(bigint,uuid,uuid),public.rechecking_staff_valid(uuid),public.rechecking_notify(uuid,text,bigint),public.save_rechecking_manager(bigint,uuid,boolean),public.save_rechecking_duty(jsonb,uuid,integer),public.complete_rechecking_check(uuid,integer,date,timestamptz,text),public.submit_rechecking_review(uuid,jsonb),public.rechecking_catalogue() from public,anon;
grant execute on function public.rechecking_can_manage(bigint),public.save_rechecking_manager(bigint,uuid,boolean),public.save_rechecking_duty(jsonb,uuid,integer),public.complete_rechecking_check(uuid,integer,date,timestamptz,text),public.submit_rechecking_review(uuid,jsonb) to authenticated;
grant execute on function public.rechecking_catalogue() to authenticated;
