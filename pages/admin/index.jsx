import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../utils/supabaseClient';
import Navbar from '../../components/Navbar';
import SchoolTools from '../../components/SchoolTools';
import { useSchoolSession } from '../../utils/schoolSession';
import Breadcrumbs from '../../components/Breadcrumbs';
import {
  Users,
  UserPlus,
  FileText,
  Banknote,
  HelpCircle,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../hooks/use-toast';
import { adminCanOpen } from '../../utils/adminDataAccess';

export default function AdminDashboard() {
  const router = useRouter();
  const { toast } = useToast();

  const { access } = useSchoolSession();
  const showStudents = access && adminCanOpen('/admin/crud', access);
  const showFees = access && adminCanOpen('/admin/invoices', access);
  const userName = access?.name?.trim();
  const [isLoading, setIsLoading] = useState(true);
  const [daysFilter, setDaysFilter] = useState(30); // <-- TS removed

  const [stats, setStats] = useState({
    totalStudents: 0,
    newAdmissions: 0,
    recentInquiries: 0,
    unresolvedComplaints: 0,
    recentInvoices: 0,
    uniquePayments: 0,
  });

  // Refetch when daysFilter changes
  useEffect(() => {
    if (access) fetchAdminStats();
  }, [daysFilter, access]);

  const fetchAdminStats = async () => {
    setIsLoading(true);

    // Calculate dynamically based on selected days
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysFilter);
    const targetDateStr = targetDate.toISOString();

    try {
      // 1. Total number of students
      const { count: totalStudents } = showStudents
        ? await supabase.from('active_students').select('*', { count: 'exact', head: true })
        : { count: 0 };

      // 2. Admissions in the timeframe
      const { count: newAdmissions } = showStudents
        ? await supabase
            .from('active_students')
            .select('*', { count: 'exact', head: true })
            .gte('joining_date', targetDateStr)
        : { count: 0 };

      // 3. Inquiries in the timeframe
      const { count: recentInquiries } = showStudents
        ? await supabase
            .from('inquiries')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', targetDateStr)
        : { count: 0 };

      // 4. Unresolved complaints in the timeframe
      const { count: unresolvedComplaints } = await supabase
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', targetDateStr)
        .neq('status', 'Resolved')
        .neq('status', 'Closed');

      // 5. Total invoices generated in the timeframe
      const { count: recentInvoices } = showFees
        ? await supabase
            .from('fee_invoices')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', targetDateStr)
        : { count: 0 };

      // 6. Distinct invoice payments in the timeframe
      let allPayments = [];
      let hasMore = Boolean(showFees);
      let page = 0;
      const limit = 1000;

      while (hasMore) {
        const { data, error } = await supabase
          .from('fee_payments')
          .select('invoice_id')
          .gte('paid_at', targetDateStr)
          .range(page * limit, (page + 1) * limit - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allPayments.push(...data);
          page++;
          if (data.length < limit) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      const uniquePayments = new Set(allPayments.map(p => p.invoice_id)).size;

      setStats({
        totalStudents: totalStudents || 0,
        newAdmissions: newAdmissions || 0,
        recentInquiries: recentInquiries || 0,
        unresolvedComplaints: unresolvedComplaints || 0,
        recentInvoices: recentInvoices || 0,
        uniquePayments: uniquePayments || 0,
      });
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      toast({ variant: 'destructive', title: 'Data Error', description: 'Failed to load stats.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-500 font-sans selection:bg-indigo-500/30">
      <Navbar />

      <main className="container mx-auto px-4 py-6 md:py-10 space-y-8 md:space-y-10 pb-20">
        <Breadcrumbs items={[{ label: 'Admin Dashboard', href: '/admin' }]} />
        {router.query.restricted === '1' && (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            Your account does not have access to that data. A superadmin can change your access in
            Manage Teachers.
          </p>
        )}

        {/* HEADER & FILTER */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-slate-200 dark:border-gray-800/50 pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
              Welcome back{userName ? `, ${userName}` : ''}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4" /> Admin overview · Tracking data for the last{' '}
              {daysFilter} days
            </p>
          </div>

          {/* Days Filter Widget */}
          <div className="flex items-center bg-white dark:bg-slate-900 rounded-full p-1 border border-slate-200 dark:border-slate-800 shadow-sm">
            {[7, 30, 90, 365].map(days => (
              <button
                key={days}
                onClick={() => setDaysFilter(days)}
                className={`
                  px-3 py-1.5 md:px-4 md:py-1.5 text-xs font-bold rounded-full transition-all duration-300
                  ${
                    daysFilter === days
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }
                `}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        {/* STATS WIDGETS */}
        {isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading dashboard figures…
          </p>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4"
          >
            <AnimatePresence mode="popLayout">
              {showStudents && (
                <StatsCard
                  key="total"
                  icon={Users}
                  label="Total Students"
                  value={stats.totalStudents}
                  color="blue"
                />
              )}
              {showStudents && (
                <StatsCard
                  key="new"
                  icon={UserPlus}
                  label="New Admissions"
                  value={stats.newAdmissions}
                  color="indigo"
                />
              )}
              {showStudents && (
                <StatsCard
                  key="inq"
                  icon={HelpCircle}
                  label="New Inquiries"
                  value={stats.recentInquiries}
                  color="amber"
                />
              )}
              <StatsCard
                key="comp"
                icon={AlertCircle}
                label="Active Complaints"
                value={stats.unresolvedComplaints}
                color="rose"
              />
              {showFees && (
                <StatsCard
                  key="inv"
                  icon={FileText}
                  label="Invoices Generated"
                  value={stats.recentInvoices}
                  color="orange"
                />
              )}
              {showFees && (
                <StatsCard
                  key="paid"
                  icon={Banknote}
                  label="Invoices Paid"
                  value={stats.uniquePayments}
                  color="emerald"
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}

        <section aria-label="School tools">
          <h2 className="mb-3 text-base font-bold text-foreground">School tools</h2>
          <SchoolTools exclude={['/admin']} />
        </section>
      </main>
    </div>
  );
}

// --- SUB-COMPONENT: Re-Styled Stats Card ---
function StatsCard({ icon: Icon, label, value, color }) {
  const styles = {
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 group-hover:border-blue-200 dark:group-hover:border-blue-800',
    indigo:
      'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 group-hover:border-indigo-200 dark:group-hover:border-indigo-800',
    orange:
      'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 group-hover:border-orange-200 dark:group-hover:border-orange-800',
    emerald:
      'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 group-hover:border-emerald-200 dark:group-hover:border-emerald-800',
    rose: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 group-hover:border-rose-200 dark:group-hover:border-rose-800',
    amber:
      'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 group-hover:border-amber-200 dark:group-hover:border-amber-800',
  };

  const activeStyle = styles[color];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={`
        group relative overflow-hidden rounded-2xl p-4 md:p-5
        bg-white dark:bg-transparent dark:bg-gradient-to-br dark:from-white/[0.05] dark:to-transparent backdrop-blur-2xl
        border border-slate-100 dark:border-white/10
        shadow-sm hover:shadow-lg transition-all duration-300 ease-out hover:-translate-y-1
        ${activeStyle.split(' ')[2]} // Apply hover border color dynamically
      `}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-xl flex items-center justify-center ${activeStyle}`}>
          <Icon size={16} className="md:w-[18px] md:h-[18px]" />
        </div>
      </div>
      <div>
        <h3 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight mb-0.5">
          {value.toLocaleString()}
        </h3>
        <p className="text-[10px] md:text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">
          {label}
        </p>
      </div>
    </motion.div>
  );
}
