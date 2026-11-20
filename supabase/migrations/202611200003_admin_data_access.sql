alter table public.profiles
  add column admin_fee_access boolean not null default true,
  add column admin_student_access boolean not null default true;

create function public.current_school_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', lower(p.role), 'name', p.name, 'is_active', p.is_active,
    'admin_fee_access', p.admin_fee_access, 'admin_student_access', p.admin_student_access
  )
  from public.profiles p where p.id = auth.uid();
$$;
revoke execute on function public.current_school_access() from public, anon;
grant execute on function public.current_school_access() to authenticated;

-- Role changes and access switches use the same profile update. Guard the
-- underlying table so a restricted admin cannot grant their own access back.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
revoke truncate, trigger, references on public.profiles from authenticated;
create policy "Superadmins manage profiles" on public.profiles
  for all to authenticated
  using ((select public.daily_rounds_role()) = 'superadmin')
  with check ((select public.daily_rounds_role()) = 'superadmin');

-- Keep each existing authenticated workflow unless the caller is a restricted admin.
create function public.school_data_allowed(p_domain text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.is_active is not false and case p_domain
      when 'fees' then lower(p.role) is distinct from 'admin' or p.admin_fee_access
      when 'students' then lower(p.role) is distinct from 'admin' or p.admin_student_access
      else false
    end
    from public.profiles p where p.id = auth.uid()
  ), false)
$$;
revoke execute on function public.school_data_allowed(text) from public, anon;
grant execute on function public.school_data_allowed(text) to authenticated;

do $$
declare relation text;
begin
  foreach relation in array array['fee_invoices','fee_invoice_details','fee_payments'] loop
    execute format('revoke all on public.%I from anon', relation);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', relation);
    execute format('alter table public.%I enable row level security', relation);
    execute format('create policy school_fee_access on public.%I for all to authenticated using ((select public.school_data_allowed(''fees''))) with check ((select public.school_data_allowed(''fees'')))', relation);
  end loop;
  foreach relation in array array['students','inquiries'] loop
    execute format('revoke all on public.%I from anon', relation);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', relation);
    execute format('alter table public.%I enable row level security', relation);
    execute format('create policy school_student_access on public.%I for all to authenticated using ((select public.school_data_allowed(''students''))) with check ((select public.school_data_allowed(''students'')))', relation);
  end loop;
end $$;

revoke all on public.active_students from anon;
alter view public.active_students set (security_invoker = true);

-- Public screens intentionally look up one DAS number, with only the fields
-- each screen already displays or uses.
create function public.lookup_public_student(p_das text, p_page text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case p_page
    when 'parents' then jsonb_build_object('name',s.name,'mobilenumber',s.mobilenumber,'class_id',s.class_id)
    when 'datesheets' then jsonb_build_object('studentid',s.studentid,'name',s.name,'fathername',s.fathername,
      'class_id',s.class_id,'classes',jsonb_build_object('name',c.name))
  end
  from public.students s left join public.classes c on c.id = s.class_id
  where s.studentid = btrim(p_das) and (p_page = 'parents' or (p_page = 'datesheets' and s.status = 'active'))
    and (auth.uid() is null or public.school_data_allowed('students'))
$$;
revoke execute on function public.lookup_public_student(text,text) from public;
grant execute on function public.lookup_public_student(text,text) to anon, authenticated;
