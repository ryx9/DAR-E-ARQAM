import {
  Banknote,
  BarChart2,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FilePlus,
  FileText,
  HelpCircle,
  LayoutGrid,
  MessageCircle,
  MessageSquareWarning,
  NotebookPen,
  ScrollText,
  Send,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { adminCanOpen, type SchoolAccess } from './adminDataAccess';

export type SchoolLink = { href: string; label: string; icon: LucideIcon; hue: number };
type Section = { title: string; links: SchoolLink[] };

const classes = { href: '/dashboard', label: 'Classes', icon: LayoutGrid, hue: 217 };
const timetable = { href: '/timetable', label: 'Timetable', icon: CalendarDays, hue: 250 };
const rounds = { href: '/daily-rounds', label: 'Daily Rounds', icon: ClipboardCheck, hue: 173 };
const officeOrders = { href: '/office-orders', label: 'Office orders', icon: FileText, hue: 262 };
const invoices = { href: '/admin/invoices', label: 'Fee invoices', icon: FileText, hue: 173 };
const feeReports = { href: '/admin/report', label: 'Fee reports', icon: BarChart2, hue: 188 };
const receipts = { href: '/admin/receipts', label: 'Fee receipts', icon: Wallet, hue: 142 };
const students = { href: '/admin/crud', label: 'Manage students', icon: Users, hue: 239 };
const adminHome = { href: '/admin', label: 'Admin overview', icon: LayoutGrid, hue: 217 };

const academics: Section = {
  title: 'Academics',
  links: [
    classes,
    timetable,
    rounds,
    { href: '/marks', label: 'Tests and marks', icon: ScrollText, hue: 160 },
    { href: '/reports', label: 'Academic reports', icon: BarChart2, hue: 239 },
    { href: '/attendance-record/report', label: 'Attendance', icon: UserCheck, hue: 173 },
    { href: '/syllabus', label: 'Syllabus', icon: BookOpenCheck, hue: 262 },
    { href: '/activities', label: 'Activities', icon: Sparkles, hue: 292 },
  ],
};
const communication: Section = {
  title: 'Parent communication',
  links: [
    {
      href: '/parent-communication',
      label: 'Communication overview',
      icon: MessageCircle,
      hue: 330,
    },
    { href: '/notice', label: 'Compose message', icon: MessageCircle, hue: 248 },
    { href: '/messages', label: 'Message queue', icon: Send, hue: 217 },
    { href: '/diary', label: 'Class diary', icon: NotebookPen, hue: 163 },
    { href: '/ptm', label: 'Parent-teacher meetings', icon: Users, hue: 210 },
    { href: '/ptm/new', label: 'Plan a parent-teacher meeting', icon: CalendarDays, hue: 219 },
  ],
};
const staff: Section = {
  title: 'Staff tools',
  links: [
    officeOrders,
    { href: '/mycomplaint', label: 'My complaints', icon: ShieldAlert, hue: 347 },
    { href: '/my-salary', label: 'My salary', icon: Banknote, hue: 220 },
    { href: '/advance', label: 'Request an advance', icon: Wallet, hue: 142 },
  ],
};
const fees: Section = {
  title: 'Fees',
  links: [
    invoices,
    receipts,
    feeReports,
    { href: '/admin/fee/generate', label: 'Generate fees', icon: FilePlus, hue: 160 },
    { href: '/admin/fee/pay', label: 'Collect payment', icon: CreditCard, hue: 158 },
    { href: '/admin/feesummary', label: 'Fee summary', icon: BarChart2, hue: 198 },
    {
      href: '/admin/monthly-fee-report',
      label: 'Monthly fee report',
      icon: CalendarDays,
      hue: 210,
    },
    { href: '/admin/student-statement', label: 'Student fee statements', icon: FileText, hue: 224 },
    { href: '/admin/defaulters', label: 'Fee defaulters', icon: ShieldAlert, hue: 32 },
  ],
};
const studentRecords: Section = {
  title: 'Students',
  links: [
    students,
    { href: '/admin/studentslist', label: 'Student lists', icon: Users, hue: 229 },
    { href: '/admin/managestudent', label: 'Admissions', icon: FilePlus, hue: 217 },
    { href: '/admin/inquiries', label: 'Inquiries', icon: HelpCircle, hue: 40 },
    { href: '/admin/inquiries/add', label: 'New inquiry', icon: FilePlus, hue: 42 },
  ],
};
const operations: SchoolLink[] = [
  { href: '/admin/datesheet-builder', label: 'Datesheet builder', icon: CalendarDays, hue: 210 },
  { href: '/admin/complaint', label: 'Manage complaints', icon: MessageSquareWarning, hue: 347 },
  { href: '/admin/advances', label: 'Staff advances', icon: Banknote, hue: 275 },
];
const superadminTools: SchoolLink[] = [
  { href: '/admin/profiles', label: 'Manage teachers', icon: UserCheck, hue: 262 },
  { href: '/admin/payroll', label: 'Payroll', icon: Banknote, hue: 220 },
];

export function schoolNavigation(access: SchoolAccess | null): Section[] {
  if (!access?.role || access.is_active === false) return [];
  if (access.role === 'user')
    return [academics, staff].map(section => ({
      ...section,
      links: section.links.filter(link => !['/daily-rounds', '/my-salary'].includes(link.href)),
    }));
  const isAdmin = ['admin', 'superadmin'].includes(access.role);
  const sections = isAdmin
    ? [
        {
          title: 'Administration',
          links: [
            adminHome,
            ...operations,
            ...(access.role === 'superadmin' ? superadminTools : []),
          ],
        },
        fees,
        studentRecords,
        academics,
        communication,
        staff,
      ]
    : [
        academics,
        communication,
        {
          ...staff,
          links: staff.links.filter(
            link => link.href !== '/my-salary' || access.role === 'teacher'
          ),
        },
      ];
  return sections
    .map(section => ({
      ...section,
      links: section.links.filter(link => adminCanOpen(link.href, access)),
    }))
    .filter(section => section.links.length > 0);
}

export function desktopSchoolLinks(access: SchoolAccess | null) {
  if (!access?.role) return [];
  const links = ['admin', 'superadmin'].includes(access.role)
    ? [invoices, feeReports, receipts, students]
    : [classes, timetable];
  return links.filter(link => adminCanOpen(link.href, access));
}

export function drawerSchoolNavigation(access: SchoolAccess | null): Section[] {
  const sections = schoolNavigation(access);
  if (access?.role !== 'admin' && access?.role !== 'superadmin') return sections;

  const available = new Map(
    sections.flatMap(section => section.links.map(link => [link.href, link] as const))
  );
  // Each admin workflow has one entry in the drawer. Report variants and
  // creation shortcuts are available from their respective landing pages.
  const groups: { title: string; routes: string[] }[] = [
    {
      title: 'School operations',
      routes: ['/admin', '/daily-rounds', '/office-orders', '/admin/complaint'],
    },
    {
      title: 'Students and admissions',
      routes: ['/admin/crud', '/admin/studentslist', '/admin/managestudent', '/admin/inquiries'],
    },
    {
      title: 'Fees and collections',
      routes: [
        '/admin/invoices',
        '/admin/fee/generate',
        '/admin/fee/pay',
        '/admin/receipts',
        '/admin/report',
      ],
    },
    {
      title: 'Academics',
      routes: [
        '/dashboard',
        '/timetable',
        '/attendance-record/report',
        '/syllabus',
        '/marks',
        '/admin/datesheet-builder',
        '/reports',
        '/activities',
      ],
    },
    { title: 'Parent communication', routes: ['/notice', '/messages', '/diary', '/ptm'] },
    {
      title: 'Staff administration',
      routes: ['/admin/profiles', '/admin/payroll', '/admin/advances'],
    },
    { title: 'My account', routes: ['/my-salary', '/advance', '/mycomplaint'] },
  ];

  return groups
    .map(({ title, routes }) => ({
      title,
      links: routes.flatMap(route => {
        const link = available.get(route);
        if (!link) return [];
        available.delete(route);
        return [link];
      }),
    }))
    .filter(section => section.links.length > 0);
}
