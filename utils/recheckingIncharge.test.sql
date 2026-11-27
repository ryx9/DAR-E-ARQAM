-- Run only inside a transaction which is rolled back after this script.
-- Uses existing active staff/classes, but does not commit duties or notifications.
do $$
declare
  admin_id uuid;
  teacher_id uuid;
  other_id uuid;
  class_id bigint;
  v_duty_id uuid;
  duty_revision integer;
  payload jsonb;
  result jsonb;
begin
  select id into admin_id from public.profiles where lower(role) in ('admin','superadmin') and is_active is not false order by id limit 1;
  select id into teacher_id from public.profiles where lower(role) = 'teacher' and is_active is not false order by id limit 1;
  select id into other_id from public.profiles where lower(role) = 'teacher' and is_active is not false and id <> teacher_id order by id limit 1;
  select id into class_id from public.classes order by id limit 1;
  if admin_id is null or teacher_id is null or other_id is null or class_id is null then raise exception 'Test requires an active admin, two teachers and a class'; end if;

  perform set_config('request.jwt.claim.sub', teacher_id::text, true);
  if public.rechecking_can_manage(class_id) then raise exception 'Teacher must not manage duties without global incharge access'; end if;
  begin
    perform public.set_rechecking_incharge(teacher_id, true);
    raise exception 'Teacher unexpectedly granted incharge access';
  exception when others then
    if sqlerrm <> 'Administrator access required' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.set_rechecking_incharge(teacher_id, true);
  perform set_config('request.jwt.claim.sub', teacher_id::text, true);
  if not public.rechecking_can_manage(class_id) then raise exception 'Assigned incharge must manage duties'; end if;
  if jsonb_array_length(public.rechecking_catalogue()->'classes') <> (select count(*) from public.classes) then raise exception 'Global incharge must see every class'; end if;
  payload := jsonb_build_object('duty_type','routine','class_id',class_id,'subject','Test subject',
    'title','Test duty','checker_id',admin_id,'rechecker_id',teacher_id,
    'materials',jsonb_build_array('book'),'rechecking_deadline','2027-01-01');
  result := public.save_rechecking_duty(payload);
  v_duty_id := (result->>'id')::uuid;
  duty_revision := (result->>'revision')::integer;
  payload := payload || jsonb_build_object('materials',jsonb_build_array('notebook'),'rechecking_deadline','2027-02-01');
  result := public.save_rechecking_duty(payload, v_duty_id, duty_revision);
  duty_revision := (result->>'revision')::integer;
  if not exists(select 1 from public.rechecking_duties where id=v_duty_id and materials=array['notebook'] and rechecking_deadline='2027-02-01'::date and status='awaiting_recheck') then raise exception 'Routine edit did not persist'; end if;
  insert into public.rechecking_reviews(duty_id,review_round,reviewer_id,reviewed_on,outcome)
    values(v_duty_id,1,teacher_id,'2027-01-01','returned');
  begin
    perform public.save_rechecking_duty(payload || jsonb_build_object('checker_id',other_id), v_duty_id, duty_revision);
    raise exception 'Checker unexpectedly changed after review';
  exception when others then
    if sqlerrm <> 'The checker cannot be changed after handover or review; remove this duty and create a new one' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  begin
    perform public.cancel_rechecking_duty(v_duty_id, duty_revision);
    raise exception 'Unauthorised teacher unexpectedly removed a duty';
  exception when others then
    if sqlerrm <> 'Only an administrator or rechecking incharge can remove duties' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', teacher_id::text, true);
  perform public.cancel_rechecking_duty(v_duty_id, duty_revision);
  if not exists(select 1 from public.rechecking_duties where id=v_duty_id and status='cancelled') then raise exception 'Duty was not cancelled'; end if;
  if not exists(select 1 from public.rechecking_reviews where duty_id=v_duty_id) then raise exception 'Cancellation must preserve review history'; end if;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.set_rechecking_incharge(teacher_id, false);
  perform set_config('request.jwt.claim.sub', teacher_id::text, true);
  if public.rechecking_can_manage(class_id) then raise exception 'Revoked incharge must not manage duties'; end if;
end $$;
