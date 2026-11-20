-- Normalize local and international Pakistani mobile formats.
create function public.teacher_message_phone(value text)
returns text language sql immutable strict set search_path = '' as $$
  select case
    when digits ~ '^03[0-9]{9}$' then '92' || substr(digits, 2)
    when digits ~ '^00923[0-9]{9}$' then substr(digits, 3)
    else digits
  end
  from (select regexp_replace(value, '[^0-9]', '', 'g') as digits) normalized;
$$;

create function public.teacher_message_text_hash(value text)
returns bytea language sql immutable strict set search_path = '' as $$
  select sha256(convert_to(btrim(regexp_replace(normalize(value), '[[:space:]]+', ' ', 'g')), 'UTF8'));
$$;

-- The unique claim covers every queue writer, including concurrent requests.
-- Keep claims for sent messages even after their queue records are deleted.
create table public.teacher_message_dedup (
  recipient text not null,
  text_hash bytea not null,
  message_id bigint not null unique,
  primary key (recipient, text_hash)
);
revoke all on public.teacher_message_dedup from public, anon, authenticated;

lock table public.messages in share row exclusive mode;

with teacher_phones as (
  select distinct public.teacher_message_phone(mobilenumber) as recipient
  from public.profiles
  where lower(role) = 'teacher'
), normalized as (
  select p.recipient, public.teacher_message_text_hash(m.text) as text_hash, m.id, m.sent
  from public.messages m
  join teacher_phones p on p.recipient = public.teacher_message_phone(m.number)
  where m.student_id is null and p.recipient <> ''
)
insert into public.teacher_message_dedup(recipient, text_hash, message_id)
select distinct on (recipient, text_hash) recipient, text_hash, id
from normalized order by recipient, text_hash, (sent is true) desc, id;

create function public.deduplicate_teacher_messages()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  phone text;
begin
  if TG_OP = 'DELETE' then
    if old.sent is not true then
      delete from public.teacher_message_dedup where message_id = old.id;
    end if;
    return old;
  end if;

  -- A student message remains independent even when their contact is a teacher.
  if new.student_id is not null then return new; end if;
  phone := public.teacher_message_phone(new.number);
  if coalesce(phone, '') = '' or not exists (
    select 1 from public.profiles p
    where lower(p.role) = 'teacher'
      and public.teacher_message_phone(p.mobilenumber) = phone
  ) then return new; end if;

  insert into public.teacher_message_dedup(recipient, text_hash, message_id)
  values (phone, public.teacher_message_text_hash(new.text), new.id)
  on conflict (recipient, text_hash) do nothing;
  if not found then return null; end if;
  return new;
end $$;

revoke execute on function public.deduplicate_teacher_messages() from public, anon, authenticated;

create trigger deduplicate_teacher_message_insert
before insert on public.messages for each row
execute function public.deduplicate_teacher_messages();

create trigger release_cancelled_teacher_message
after delete on public.messages for each row
execute function public.deduplicate_teacher_messages();

-- Distinguish later timetable changes from older, already delivered notifications.
create or replace function public.save_school_timetable(p_plan jsonb, p_revision integer, p_publish boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current_row school_timetable; actor text; queued integer := 0; affected integer := 0; reachable integer := 0;
begin
  select lower(role) into actor from profiles where id=auth.uid() and is_active is not false;
  if actor is null or actor not in ('admin','superadmin') then raise exception 'Administrator access required'; end if;
  select * into current_row from school_timetable where id=1 for update;
  if current_row.revision<>p_revision then raise exception 'Another editor saved changes. Reload before saving.'; end if;
  if jsonb_typeof(p_plan->'days') is distinct from 'object' then raise exception 'Invalid timetable'; end if;
  if exists (
    select 1 from jsonb_each(p_plan->'days') d cross join lateral jsonb_array_elements(d.value) s
    where coalesce(s->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(s->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or s->>'start'>=s->>'end'
       or (s->>'kind'='break' and coalesce(s->'lessons','{}')<>'{}'::jsonb)
  ) then raise exception 'Invalid slot times or break assignments'; end if;
  if exists (
    select 1 from jsonb_each(p_plan->'days') d cross join lateral jsonb_array_elements(d.value) s
    cross join lateral jsonb_each(coalesce(s->'lessons','{}')) l
    where not exists(select 1 from class_subjects cs where cs.class_id::text=l.key and cs.subject_id::text=l.value->>'subjectId')
      or jsonb_array_length(coalesce(l.value->'teacherIds','[]'))=0
      or exists(select 1 from jsonb_array_elements_text(l.value->'teacherIds') staff where not exists (
        select 1 from profiles p where p.id::text=staff and lower(p.role) in ('teacher','admin','superadmin') and p.is_active is not false
      ))
  ) then raise exception 'Each lecture must have a class subject and active staff'; end if;
  if actor='admin' and (
    (select coalesce(jsonb_object_agg(d.key, (select coalesce(jsonb_agg(s - 'lessons' order by ord),'[]') from jsonb_array_elements(d.value) with ordinality a(s,ord))),'{}') from jsonb_each(p_plan->'days') d)
    is distinct from
    (select coalesce(jsonb_object_agg(d.key, (select coalesce(jsonb_agg(s - 'lessons' order by ord),'[]') from jsonb_array_elements(d.value) with ordinality a(s,ord))),'{}') from jsonb_each(current_row.draft->'days') d)
  ) then raise exception 'Only superadmins may change day slots or timings'; end if;
  if p_publish then
    with old_schedule as (
      select teacher_id,jsonb_agg(detail order by detail::text) details from timetable_lessons(current_row.published) group by teacher_id
    ), new_schedule as (
      select teacher_id,jsonb_agg(detail order by detail::text) details from timetable_lessons(p_plan) group by teacher_id
    ), changed as (
      select coalesce(o.teacher_id,n.teacher_id) id from old_schedule o full join new_schedule n using(teacher_id) where o.details is distinct from n.details
    ), recipients as (
      select p.* from profiles p join changed c on c.id=p.id::text where p.is_active is not false
    ), inserted as (
      insert into messages(number,sent,text)
      select mobilenumber,false,'Dear ' || coalesce(name,'Teacher') || ', your teaching timetable has changed. Please review the published weekly timetable at /timetable and download your updated teacher timetable. DAR-E-ARQAM School. Schedule revision: ' || (p_revision+1)
      from recipients where nullif(trim(mobilenumber),'') is not null returning 1
    ) select (select count(*) from inserted),(select count(*) from recipients),(select count(*) from recipients where nullif(trim(mobilenumber),'') is not null) into queued,affected,reachable;
  end if;
  update school_timetable set draft=p_plan, published=case when p_publish then p_plan else published end,
    published_at=case when p_publish then now() else published_at end,revision=revision+1,updated_at=now() where id=1;
  return jsonb_build_object('revision',p_revision+1,'queued',queued,'affected',affected,'reachable',reachable);
end $$;
