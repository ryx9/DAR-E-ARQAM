import type { SupabaseClient } from '@supabase/supabase-js';

export type SchoolAccess = {
  role: string | null;
  name?: string | null;
  is_active?: boolean | null;
  admin_fee_access?: boolean;
  admin_student_access?: boolean;
};

// Deploy the new pages before activating the row policies in Supabase.
export const accessMigrationPending = (error?: { code?: string } | null) =>
  error?.code === 'PGRST202' || error?.code === '42883';

export async function loadSchoolAccess(client: SupabaseClient, userId?: string) {
  const result = await client.rpc('current_school_access');
  if (!accessMigrationPending(result.error)) {
    return { data: result.data as SchoolAccess | null, error: result.error };
  }
  if (!userId) {
    const auth = await client.auth.getUser();
    if (!auth.data.user) return { data: null, error: auth.error };
    userId = auth.data.user.id;
  }
  const { data, error } = await client
    .from('profiles')
    .select('role,name,is_active')
    .eq('id', userId)
    .maybeSingle();
  return {
    data: data
      ? {
          ...data,
          role: data.role?.toLowerCase() ?? null,
          admin_fee_access: true,
          admin_student_access: true,
        }
      : null,
    error,
  };
}

const feeRoutes = [
  '/admin/fee',
  '/admin/invoices',
  '/admin/invoice',
  '/admin/receipts',
  '/admin/report',
  '/admin/feesummary',
  '/admin/defaulters',
  '/admin/monthly-fee-report',
  '/admin/student-statement',
];
const studentRoutes = [
  '/admin/crud',
  '/admin/managestudent',
  '/admin/studentslist',
  '/admin/inquiries',
];

const matchesRoute = (pathname: string, paths: string[]) =>
  paths.some(path => pathname === path || pathname.startsWith(path + '/'));

export function adminCanOpen(pathname: string, access: SchoolAccess | null) {
  if (access?.role !== 'admin') return true;
  if (matchesRoute(pathname, feeRoutes)) {
    return access.admin_fee_access === true && access.admin_student_access === true;
  }
  if (pathname === '/admin/managestudent') {
    // The admission form generates a mandatory invoice when creating a record.
    return access.admin_student_access === true && access.admin_fee_access === true;
  }
  if (matchesRoute(pathname, studentRoutes)) return access.admin_student_access === true;
  return true;
}
