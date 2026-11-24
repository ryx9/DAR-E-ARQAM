import type { SupabaseClient } from '@supabase/supabase-js';

export type SchoolAccess = {
  role: string | null;
  name?: string | null;
  is_active?: boolean | null;
  admin_operations_access?: boolean;
  admin_fee_access?: boolean;
  admin_student_access?: boolean;
  admin_academics_access?: boolean;
  admin_communication_access?: boolean;
  admin_staff_access?: boolean;
  admin_page_access?: Record<string, boolean>;
};

export const ADMIN_MODULES = [
  {
    key: 'operations',
    accessField: 'admin_operations_access',
    label: 'Administration',
    pages: [
      { key: 'operations.overview', label: 'Admin overview', routes: ['/admin'] },
      {
        key: 'operations.datesheets',
        label: 'Datesheet builder',
        routes: ['/admin/datesheet-builder'],
      },
      {
        key: 'operations.complaints',
        label: 'Manage complaints',
        routes: ['/admin/complaint'],
      },
      {
        key: 'operations.advances',
        label: 'Staff advances',
        routes: ['/admin/advances'],
      },
    ],
  },
  {
    key: 'fees',
    accessField: 'admin_fee_access',
    label: 'Fees',
    pages: [
      {
        key: 'fees.invoices',
        label: 'Fee invoices',
        routes: ['/admin/invoices'],
      },
      {
        key: 'fees.invoice-print',
        label: 'Print invoice',
        routes: ['/admin/invoice/print'],
      },
      { key: 'fees.receipts', label: 'Fee receipts', routes: ['/admin/receipts'] },
      {
        key: 'fees.receipt-edit',
        label: 'Edit receipt',
        routes: ['/admin/receipts/edit'],
      },
      { key: 'fees.reports', label: 'Fee reports', routes: ['/admin/report'] },
      {
        key: 'fees.generate',
        label: 'Generate fees',
        routes: ['/admin/fee/generate'],
      },
      {
        key: 'fees.collect',
        label: 'Collect payment',
        routes: ['/admin/fee/pay'],
      },
      { key: 'fees.summary', label: 'Fee summary', routes: ['/admin/feesummary'] },
      {
        key: 'fees.monthly-report',
        label: 'Monthly fee report',
        routes: ['/admin/monthly-fee-report'],
      },
      {
        key: 'fees.student-statement',
        label: 'Student fee statements',
        routes: ['/admin/student-statement'],
      },
      {
        key: 'fees.defaulters',
        label: 'Fee defaulters',
        routes: ['/admin/defaulters'],
      },
    ],
  },
  {
    key: 'students',
    accessField: 'admin_student_access',
    label: 'Students and admissions',
    pages: [
      {
        key: 'students.manage',
        label: 'Manage students',
        routes: ['/admin/crud'],
      },
      {
        key: 'students.lists',
        label: 'Student lists',
        routes: ['/admin/studentslist'],
      },
      {
        key: 'students.admissions',
        label: 'Admissions',
        routes: ['/admin/managestudent'],
      },
      {
        key: 'students.inquiries',
        label: 'Inquiries',
        routes: ['/admin/inquiries'],
      },
      {
        key: 'students.new-inquiry',
        label: 'New inquiry',
        routes: ['/admin/inquiries/add'],
      },
      {
        key: 'students.inquiry-detail',
        label: 'Inquiry details',
        routes: ['/admin/inquiries/:id'],
      },
    ],
  },
  {
    key: 'academics',
    accessField: 'admin_academics_access',
    label: 'Academics',
    pages: [
      { key: 'academics.classes', label: 'Classes', routes: ['/dashboard'] },
      {
        key: 'academics.class-detail',
        label: 'Class details',
        routes: ['/class/:id'],
      },
      { key: 'academics.timetable', label: 'Timetable', routes: ['/timetable'] },
      {
        key: 'academics.daily-rounds',
        label: 'Daily rounds',
        routes: ['/daily-rounds'],
      },
      {
        key: 'academics.marks',
        label: 'Marks dashboard',
        routes: ['/marks'],
      },
      {
        key: 'academics.new-test',
        label: 'Create test',
        routes: ['/marks/new-test'],
      },
      {
        key: 'academics.test-detail',
        label: 'Test details',
        routes: ['/marks/:testId'],
      },
      {
        key: 'academics.reports',
        label: 'Academic reports',
        routes: ['/reports'],
      },
      {
        key: 'academics.attendance',
        label: 'Class attendance',
        routes: ['/attendance-record/:id'],
      },
      {
        key: 'academics.attendance-report',
        label: 'Attendance report',
        routes: ['/attendance-record/report'],
      },
      { key: 'academics.leaves', label: 'Leaves', routes: ['/leaves'] },
      { key: 'academics.syllabus', label: 'Syllabus', routes: ['/syllabus'] },
      {
        key: 'academics.activities',
        label: 'Activities list',
        routes: ['/activities'],
      },
      {
        key: 'academics.activity-detail',
        label: 'Activity details',
        routes: ['/activities/:id'],
      },
    ],
  },
  {
    key: 'communication',
    accessField: 'admin_communication_access',
    label: 'Parent communication',
    pages: [
      {
        key: 'communication.overview',
        label: 'Communication overview',
        routes: ['/parent-communication'],
      },
      {
        key: 'communication.notices',
        label: 'Compose notice',
        routes: ['/notice'],
      },
      {
        key: 'communication.messages',
        label: 'Message queue',
        routes: ['/messages'],
      },
      { key: 'communication.diary', label: 'Class diary', routes: ['/diary'] },
      {
        key: 'communication.ptm',
        label: 'Parent-teacher meetings',
        routes: ['/ptm'],
      },
      {
        key: 'communication.ptm-new',
        label: 'Plan a parent-teacher meeting',
        routes: ['/ptm/new'],
      },
      {
        key: 'communication.ptm-detail',
        label: 'Meeting details',
        routes: ['/ptm/:id'],
      },
    ],
  },
  {
    key: 'staff',
    accessField: 'admin_staff_access',
    label: 'Staff tools',
    pages: [
      {
        key: 'staff.office-orders',
        label: 'Office orders',
        routes: ['/office-orders'],
      },
      {
        key: 'staff.complaints',
        label: 'My complaints',
        routes: ['/mycomplaint'],
      },
      { key: 'staff.salary', label: 'My salary', routes: ['/my-salary'] },
      {
        key: 'staff.advance',
        label: 'Request an advance',
        routes: ['/advance'],
      },
    ],
  },
] as const;

type AdminModuleKey = (typeof ADMIN_MODULES)[number]['key'];
type AdminPageRoute = {
  key: string;
  moduleKey: AdminModuleKey;
  routes: readonly string[];
};

const adminPageRoutes: AdminPageRoute[] = ADMIN_MODULES.flatMap(module =>
  module.pages.map(page => ({
    key: page.key,
    moduleKey: module.key,
    routes: page.routes,
  }))
);

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
          admin_operations_access: true,
          admin_fee_access: true,
          admin_student_access: true,
          admin_academics_access: true,
          admin_communication_access: true,
          admin_staff_access: true,
          admin_page_access: {},
        }
      : null,
    error,
  };
}

const matchesRoute = (pathname: string, route: string) => {
  const pathSegments = pathname.split('/').filter(Boolean);
  const routeSegments = route.split('/').filter(Boolean);
  return (
    pathSegments.length === routeSegments.length &&
    routeSegments.every(
      (segment, index) => segment.startsWith(':') || segment === pathSegments[index]
    )
  );
};

const routeSpecificity = (route: string) =>
  route.split('/').filter(Boolean).reduce((score, segment) => score + (segment.startsWith(':') ? 1 : 2), 0);

function moduleEnabled(moduleKey: AdminModuleKey, access: SchoolAccess) {
  const definition = ADMIN_MODULES.find(candidate => candidate.key === moduleKey);
  return definition ? access[definition.accessField] !== false : true;
}

export function adminCanOpen(pathname: string, access: SchoolAccess | null) {
  if (access?.role !== 'admin') return true;

  const page = adminPageRoutes
    .flatMap(candidate =>
      candidate.routes
        .filter(route => matchesRoute(pathname, route))
        .map(route => ({ ...candidate, route }))
    )
    .sort(
      (a, b) => routeSpecificity(b.route) - routeSpecificity(a.route)
    )[0];
  if (!page) return !pathname.startsWith('/admin/');

  const pageAccess = access.admin_page_access?.[page.key] !== false;
  const moduleAccess = moduleEnabled(page.moduleKey, access);
  if (!pageAccess || !moduleAccess) return false;

  if (page.moduleKey === 'fees' || page.key === 'students.admissions') {
    return moduleEnabled('fees', access) && moduleEnabled('students', access);
  }
  return true;
}
