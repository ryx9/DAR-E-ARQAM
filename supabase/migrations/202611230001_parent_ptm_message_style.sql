create or replace function public.ptm_queue_messages(p_meeting_id bigint, p_kind text)
returns jsonb language plpgsql set search_path = public as $$
declare
  meeting ptm_meetings%rowtype;
  recipient record;
  message_text text;
  meeting_date text;
  message_id bigint;
  queued integer := 0;
  missing integer := 0;
  already integer := 0;
  signature constant text := E'\n\nDar-e-Arqam School';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_kind not in ('scheduled','present','absent') then raise exception 'Invalid message type'; end if;

  select * into strict meeting from ptm_meetings where id = p_meeting_id for update;
  meeting_date := to_char(meeting.starts_at at time zone 'Asia/Karachi', 'FMDD Mon YYYY, FMHH12:MI AM') || ' PKT';

  for recipient in
    select pp.id as participant_id, s.studentid, s.name, s.mobilenumber, s.class_id, c.name as class_name
    from ptm_participants pp
    join students s on s.studentid = pp.student_id
    left join classes c on c.id = coalesce(meeting.class_id, s.class_id)
    where pp.meeting_id = p_meeting_id and (p_kind = 'scheduled' or pp.attendance = p_kind)
    order by pp.id
  loop
    if exists (select 1 from ptm_message_history h where h.participant_id = recipient.participant_id and h.kind = p_kind) then
      already := already + 1;
      continue;
    end if;
    if nullif(btrim(recipient.mobilenumber), '') is null then
      missing := missing + 1;
      continue;
    end if;

    if p_kind = 'scheduled' then
      message_text := format(
        E'*Parent-teacher meeting invitation*\n\nDear Parent/Guardian,\n\nStudent: %s%s\nDate and time: %s\nLocation: %s\nAgenda: %s%s\n\nPlease arrive on time. Contact the school office if you cannot attend.',
        recipient.name, coalesce(' · ' || recipient.class_name, ''), meeting_date,
        btrim(meeting.location), btrim(meeting.agenda),
        case when nullif(btrim(meeting.instructions), '') is not null
          then E'\nInstructions: ' || btrim(meeting.instructions) else '' end
      );
    elsif p_kind = 'present' then
      message_text := format(
        E'*Parent-teacher meeting follow-up*\n\nDear Parent/Guardian,\n\nThank you for attending the meeting for %s on %s. Please contact the school office if you have questions about the agreed next steps.',
        recipient.name, meeting_date
      );
    else
      message_text := format(
        E'*Parent-teacher meeting follow-up*\n\nDear Parent/Guardian,\n\nWe missed you at the meeting for %s on %s. Please contact the school office to arrange a follow-up.',
        recipient.name, meeting_date
      );
    end if;

    -- Remove emoji from free-text meeting details as well as the template.
    message_text := regexp_replace(message_text,
      U&'[0-9#*]\FE0F?\20E3|[\+01F000-\+01FAFF\2600-\27BF\FE0F\200D\+0E0020-\+0E007F]',
      '', 'g') || signature;
    insert into messages(student_id, class_id, number, text, type)
      values (recipient.studentid, recipient.class_id, recipient.mobilenumber, message_text, 'ptm')
      returning id into message_id;
    insert into ptm_message_history(participant_id, message_id, kind, created_by)
      values (recipient.participant_id, message_id, p_kind, auth.uid());
    queued := queued + 1;
  end loop;
  return jsonb_build_object('queued', queued, 'missing_phone', missing, 'already_queued', already);
end $$;
