-- School-wide rechecking incharges are independent of class assignments.
create table public.rechecking_incharges (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.rechecking_incharges enable row level security;
revoke all on public.rechecking_incharges from public, anon, authenticated;
grant select on public.rechecking_incharges to authenticated;
create policy rechecking_incharges_read on public.rechecking_incharges for select to authenticated
  using (profile_id = auth.uid() or public.rechecking_can_manage(0));

create or replace function public.rechecking_can_manage(p_class_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.rechecking_role(), '') in ('admin', 'superadmin')
    or (public.rechecking_role() = 'teacher' and exists (
      select 1 from public.rechecking_incharges where profile_id = auth.uid()
    ));
$$;

create function public.set_rechecking_incharge(p_profile_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.rechecking_role(), '') not in ('admin', 'superadmin') then
    raise exception 'Administrator access required';
  end if;
  if p_enabled then
    if not exists (select 1 from public.profiles where id = p_profile_id and lower(role) = 'teacher' and is_active is not false) then
      raise exception 'Choose an active teacher';
    end if;
    insert into public.rechecking_incharges(profile_id, granted_by) values (p_profile_id, auth.uid()) on conflict do nothing;
  else
    delete from public.rechecking_incharges where profile_id = p_profile_id;
  end if;
end $$;
revoke all on function public.set_rechecking_incharge(uuid, boolean) from public, anon;
grant execute on function public.set_rechecking_incharge(uuid, boolean) to authenticated;

create or replace function public.rechecking_catalogue() returns jsonb language sql stable security definer set search_path = '' as $$
  with scope as (
    select c.id,c.name from public.classes c
    where public.rechecking_can_manage(c.id)
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

create or replace function public.save_rechecking_duty(p_duty jsonb, p_id uuid default null, p_revision integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); duty public.rechecking_duties; old_duty public.rechecking_duties;
  duty_class bigint := (p_duty->>'class_id')::bigint; v_duty_type text := p_duty->>'duty_type';
  checker uuid := nullif(p_duty->>'checker_id','')::uuid; rechecker uuid := nullif(p_duty->>'rechecker_id','')::uuid;
  duty_subject text := btrim(p_duty->>'subject'); duty_title text := btrim(p_duty->>'title'); v_materials text[];
begin
  if not public.rechecking_can_manage(duty_class) then raise exception 'Only an administrator or rechecking incharge can assign duties'; end if;
  if v_duty_type not in ('exam','routine') or coalesce(duty_subject,'')='' or coalesce(duty_title,'')='' or not public.rechecking_staff_valid(checker)
      or not public.rechecking_staff_valid(rechecker) or checker=rechecker then raise exception 'Enter valid duty details and two different active staff members'; end if;
  select coalesce(array_agg(btrim(value)), '{}') into v_materials from jsonb_array_elements_text(coalesce(p_duty->'materials','[]')) value where btrim(value) in ('book','notebook','workbook');
  if v_duty_type='exam' and (p_duty->>'test_id' is null or not exists(select 1 from public.tests t where t.id=(p_duty->>'test_id')::bigint and t.class_id=duty_class and t.subject=duty_subject)) then raise exception 'Choose a valid datesheet paper'; end if;
  if v_duty_type='routine' and cardinality(v_materials)=0 then raise exception 'Select at least one item to recheck'; end if;
  if p_id is not null then
    select * into old_duty from public.rechecking_duties where id=p_id for update;
    if not found or old_duty.revision is distinct from p_revision then raise exception 'This duty changed. Refresh before editing.'; end if;
    if old_duty.status not in ('checking','returned','awaiting_recheck') then raise exception 'Completed or cancelled duties cannot be edited'; end if;
    if old_duty.class_id is distinct from duty_class or old_duty.duty_type is distinct from v_duty_type or old_duty.test_id is distinct from nullif(p_duty->>'test_id','')::bigint or old_duty.subject is distinct from duty_subject then raise exception 'A duty cannot be moved to another class, subject or paper'; end if;
    if old_duty.checker_id is distinct from checker and (old_duty.handed_over_at is not null or exists(select 1 from public.rechecking_reviews where duty_id=p_id)) then raise exception 'The checker cannot be changed after handover or review; remove this duty and create a new one'; end if;
    update public.rechecking_duties set title=duty_title,materials=v_materials,checker_id=checker,rechecker_id=rechecker,
      checking_deadline=case when v_duty_type='routine' then null else nullif(p_duty->>'checking_deadline','')::date end,
      rechecking_deadline=nullif(p_duty->>'rechecking_deadline','')::date,
      updated_by=actor,updated_at=now(),revision=revision+1 where id=p_id returning * into duty;
  else
    insert into public.rechecking_duties(duty_type,batch_id,test_id,class_id,subject,title,materials,checker_id,rechecker_id,checking_deadline,rechecking_deadline,status,created_by,updated_by)
    values(v_duty_type,nullif(p_duty->>'batch_id','')::bigint,nullif(p_duty->>'test_id','')::bigint,duty_class,duty_subject,duty_title,v_materials,checker,rechecker,
      case when v_duty_type='routine' then null else nullif(p_duty->>'checking_deadline','')::date end,nullif(p_duty->>'rechecking_deadline','')::date,case when v_duty_type='routine' then 'awaiting_recheck' else 'checking' end,actor,actor) returning * into duty;
  end if;
  if duty.duty_type='exam' then
    perform public.rechecking_notify(duty.checker_id,format('Rechecking duty assigned\nClass: %s\nSubject: %s\nTask: %s\nChecking deadline: %s\nPlease record completion and handover in Rechecking.',(select name from public.classes where id=duty.class_id),duty.subject,duty.title,coalesce(duty.checking_deadline::text,'Not set')),duty.class_id);
  end if;
  perform public.rechecking_notify(duty.rechecker_id,format('Rechecking duty assigned\nClass: %s\nSubject: %s\nTask: %s\nRechecking deadline: %s\n%s',(select name from public.classes where id=duty.class_id),duty.subject,duty.title,coalesce(duty.rechecking_deadline::text,'Not set'),case when duty.duty_type='routine' then 'This routine sample is ready for your rechecking now.' else 'Open Rechecking for the current status.' end),duty.class_id);
  return jsonb_build_object('id',duty.id,'revision',duty.revision);
end $$;

-- Remove from the active planner while retaining reviews and historical attribution.
create function public.cancel_rechecking_duty(p_id uuid, p_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare duty public.rechecking_duties;
begin
  select * into duty from public.rechecking_duties where id=p_id for update;
  if not found or duty.revision is distinct from p_revision then raise exception 'This duty changed. Refresh before removing it.'; end if;
  if not public.rechecking_can_manage(duty.class_id) then raise exception 'Only an administrator or rechecking incharge can remove duties'; end if;
  if duty.status not in ('checking','returned','awaiting_recheck') then raise exception 'Only active duties can be removed'; end if;
  update public.rechecking_duties set status='cancelled',updated_by=auth.uid(),updated_at=now(),revision=revision+1 where id=p_id;
end $$;
revoke all on function public.cancel_rechecking_duty(uuid, integer) from public, anon;
grant execute on function public.cancel_rechecking_duty(uuid, integer) to authenticated;
