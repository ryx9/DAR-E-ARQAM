-- Routine sampling is a direct rechecker task; the syllabus position is measured in school weeks.
alter table public.rechecking_reviews
  add column if not exists syllabus_week integer check (syllabus_week is null or syllabus_week > 0);

create or replace function public.save_rechecking_duty(p_duty jsonb, p_id uuid default null, p_revision integer default null)
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
      checking_deadline=case when duty_type='routine' then null else nullif(p_duty->>'checking_deadline','')::date end,rechecking_deadline=nullif(p_duty->>'rechecking_deadline','')::date,
      status=case when duty_type='routine' then 'awaiting_recheck' else status end,updated_by=actor,updated_at=now(),revision=revision+1 where id=p_id returning * into duty;
  else
    insert into public.rechecking_duties(duty_type,batch_id,test_id,class_id,subject,title,materials,checker_id,rechecker_id,checking_deadline,rechecking_deadline,status,created_by,updated_by)
    values(duty_type,nullif(p_duty->>'batch_id','')::bigint,nullif(p_duty->>'test_id','')::bigint,duty_class,duty_subject,duty_title,materials,checker,rechecker,
      case when duty_type='routine' then null else nullif(p_duty->>'checking_deadline','')::date end,nullif(p_duty->>'rechecking_deadline','')::date,case when duty_type='routine' then 'awaiting_recheck' else 'checking' end,actor,actor) returning * into duty;
  end if;
  if duty.duty_type='exam' then
    perform public.rechecking_notify(duty.checker_id,format('Rechecking duty assigned\nClass: %s\nSubject: %s\nTask: %s\nChecking deadline: %s\nPlease record completion and handover in Rechecking.',(select name from public.classes where id=duty.class_id),duty.subject,duty.title,coalesce(duty.checking_deadline::text,'Not set')),duty.class_id);
  end if;
  perform public.rechecking_notify(duty.rechecker_id,format('Rechecking duty assigned\nClass: %s\nSubject: %s\nTask: %s\nRechecking deadline: %s\n%s',(select name from public.classes where id=duty.class_id),duty.subject,duty.title,coalesce(duty.rechecking_deadline::text,'Not set'),case when duty.duty_type='routine' then 'This routine sample is ready for your rechecking now.' else 'You will be notified when the bundle is handed over.' end),duty.class_id);
  return jsonb_build_object('id',duty.id,'revision',duty.revision);
end $$;

create or replace function public.submit_rechecking_review(p_id uuid,p_review jsonb)
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
  perform public.rechecking_notify(duty.checker_id,format('Rechecking %s\nClass: %s\nSubject: %s\nVery poor: %s · Poor: %s · Slightly poor: %s · Incomplete/absent: %s\n%s',case when outcome='returned' then 'returned for correction' else 'completed' end,(select name from public.classes where id=duty.class_id),duty.subject,review.very_poor_count,review.poor_count,review.slightly_poor_count,review.incomplete_or_absent_count,case when outcome='returned' then 'Please correct the issues noted in Rechecking.' else 'Open Rechecking to view notes.' end),duty.class_id);
  return jsonb_build_object('status',duty.status,'revision',duty.revision);
end $$;

grant execute on function public.save_rechecking_duty(jsonb,uuid,integer),public.submit_rechecking_review(uuid,jsonb) to authenticated;
