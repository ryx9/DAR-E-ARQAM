alter table public.profiles
  add column admin_page_access jsonb not null default '{}'::jsonb
    check (jsonb_typeof(admin_page_access) = 'object');

create or replace function public.current_school_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', lower(p.role), 'name', p.name, 'is_active', p.is_active,
    'admin_operations_access', p.admin_operations_access,
    'admin_fee_access', p.admin_fee_access,
    'admin_student_access', p.admin_student_access,
    'admin_academics_access', p.admin_academics_access,
    'admin_communication_access', p.admin_communication_access,
    'admin_staff_access', p.admin_staff_access,
    'admin_page_access', p.admin_page_access
  )
  from public.profiles p where p.id = auth.uid();
$$;
