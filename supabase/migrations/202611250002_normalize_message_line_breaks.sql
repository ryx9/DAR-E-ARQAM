-- Queue writers may receive text from JSON, templates, or manual input. Normalize
-- escaped newline sequences here so every delivery integration receives real lines.
create or replace function public.normalize_queued_message_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.text := replace(coalesce(new.text, ''), E'\r\n', E'\n');
  new.text := replace(new.text, E'\\r\\n', E'\n');
  new.text := replace(new.text, E'\\n', E'\n');
  new.text := replace(new.text, E'\\r', E'\n');
  return new;
end;
$$;

revoke execute on function public.normalize_queued_message_text() from public, anon, authenticated;

-- Alphabetically before the existing teacher-message deduplication trigger, so it
-- hashes the same normalized text that is ultimately delivered.
drop trigger if exists aa_normalize_queued_message_text on public.messages;
create trigger aa_normalize_queued_message_text
before insert or update of text on public.messages
for each row execute function public.normalize_queued_message_text();

-- Repair messages still waiting in the queue without altering the sent archive.
update public.messages
set text = text
where sent is not true
  and (position(E'\\n' in text) > 0 or position(E'\\r' in text) > 0);
