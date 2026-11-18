import { ArrowRight, Search, Users } from 'lucide-react';
import { field, card, panel, secondary as btn, primary } from './payrollStyles';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { payrollTotals } from '../../utils/payroll/calculate';
import { reviewWarnings } from '../../utils/payroll/review';
import {
  approvalIssues,
  needsAttendanceRecalculation,
  persistedRow,
  refreshDraft,
} from '../../utils/payroll/workflow';
import { prepareMonth } from '../../utils/payroll/prepare';
import {
  downloadAttendanceExceptions,
  downloadPayrollReport,
  downloadPayrollSummary,
} from '../../utils/payroll/report';
import { payrollUrl } from './PayrollModule';
import AttendanceSummary from './AttendanceSummary';
import EmployeeReview from './EmployeeReview';

const stages = {
  drafts: {
    stage: 'unsaved',
    action: 'draft',
    label: 'Save drafts',
    next: 'approval',
    link: 'Continue to pre-approval',
    empty: 'No employees are waiting for draft preparation.',
  },
  approval: {
    stage: 'draft',
    action: 'approved',
    label: 'Pre-approve',
    next: 'finalise',
    link: 'Continue to finalisation',
    empty: 'No saved drafts are waiting for pre-approval.',
  },
  finalise: {
    stage: 'approved',
    action: 'final',
    label: 'Finalise salaries',
    next: 'payments',
    link: 'Continue to payments',
    empty: 'No pre-approved salaries are waiting for finalisation.',
  },
};
const amount = n =>
  Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SalaryReview({ mode, period, profiles }) {
  const config = stages[mode];
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]),
    [ids, setIds] = useState([]),
    [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [reason, setReason] = useState(''),
    [batchReason, setBatchReason] = useState(''),
    [reload, setReload] = useState(0);
  const [versions, setVersions] = useState([]);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      const reviews = await supabase
        .from('payroll_current_reviews')
        .select('*')
        .eq('period', period + '-01');
      if (reviews.error) throw reviews.error;
      let next = reviews.data.filter(r => r.stage === config.stage).map(persistedRow);
      if (mode === 'drafts') {
        const posted = await supabase
          .from('payroll_run_items')
          .select('profile_id,payroll_runs!inner(period)')
          .eq('payroll_runs.period', period + '-01');
        if (posted.error) throw posted.error;
        const saved = new Set([...reviews.data, ...posted.data].map(r => r.profile_id));
        const eligible = profiles.filter(p => p.is_active && !saved.has(p.id));
        next = eligible.length ? await prepareMonth(period, eligible) : [];
        const legacy = await supabase
          .from('payroll_drafts')
          .select('rows')
          .eq('period', period + '-01')
          .maybeSingle();
        if (legacy.error) throw legacy.error;
        next = next.map(row => {
          const old = legacy.data?.rows?.find(r => r.profile_id === row.profile_id);
          return {
            ...row,
            review_version: 0,
            review_stage: 'unsaved',
            review_visible: false,
            ...(old && old.calculated_days === row.calculated_days
              ? { waived_days: old.waived_days || 0, waiver_reason: old.waiver_reason || '' }
              : {}),
          };
        });
      }
      if (active) {
        setRows(next.sort((a, b) => a.name.localeCompare(b.name)));
        setIds([]);
        setDetail(null);
      }
    }
    load()
      .catch(e => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [mode, period, config.stage, reload, profiles]);
  useEffect(() => {
    let active = true;
    setVersions([]);
    if (detail)
      supabase
        .from('payroll_reviews')
        .select('version,stage,reason,created_at')
        .eq('profile_id', detail)
        .eq('period', period + '-01')
        .order('version', { ascending: false })
        .then(({ data, error }) => {
          if (active) {
            if (error) setError(error.message);
            else setVersions(data);
          }
        });
    return () => {
      active = false;
    };
  }, [detail, period]);
  const selected = rows.filter(row => ids.includes(row.profile_id));
  const editable = mode !== 'finalise';
  const ready = row =>
    mode === 'approval'
      ? !approvalIssues(row).length
      : mode !== 'finalise' || !needsAttendanceRecalculation(row);
  const blocked = selected.filter(row => !ready(row));
  const hasWarnings = selected.some(
    r => reviewWarnings(r).attendance.length && !r.issue_acknowledgement?.trim()
  );
  function update(id, changes) {
    setRows(prev => prev.map(row => (row.profile_id === id ? { ...row, ...changes } : row)));
  }
  function acknowledge() {
    setRows(prev =>
      prev.map(row =>
        ids.includes(row.profile_id) &&
        reviewWarnings(row).attendance.length &&
        !row.issue_acknowledgement?.trim()
          ? { ...row, issue_acknowledgement: batchReason.trim() }
          : row
      )
    );
    setReason(batchReason.trim());
    setBatchReason('');
  }
  async function recalculateSelection() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const calculated = await prepareMonth(
        period,
        selected.map(r => ({ id: r.profile_id, name: r.name, is_active: true }))
      );
      const fresh = new Map(calculated.map(r => [r.profile_id, r]));
      setRows(prev =>
        prev.map(row =>
          fresh.has(row.profile_id) ? refreshDraft(row, fresh.get(row.profile_id)) : row
        )
      );
      setNotice(
        'Recalculated ' +
          selected.length +
          ' salary draft(s). Review the figures, then save edits or pre-approve.'
      );
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action, actionRows = selected) {
    if (busy || !actionRows.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const recordedReason =
        reason.trim() ||
        (action === 'approved'
          ? 'Reviewed salary, waivers and attendance decisions'
          : action === 'final'
            ? 'Finalised approved salaries'
            : action === 'draft'
              ? 'Prepared salary draft'
              : 'Updated employee preview');
      const { error } = await supabase.rpc('payroll_review_action', {
        p_period: period + '-01',
        p_items: actionRows,
        p_action: action,
        p_reason: recordedReason,
      });
      if (error) throw error;
      if (action === 'open' || action === 'close' || (action === 'draft' && mode === 'approval')) {
        setRows(prev =>
          prev.map(r =>
            ids.includes(r.profile_id)
              ? {
                  ...r,
                  review_version: r.review_version + 1,
                  review_visible: action === 'open' || (action === 'draft' && r.review_visible),
                }
              : r
          )
        );
      } else {
        const actionIds = new Set(actionRows.map(row => row.profile_id));
        setRows(prev => prev.filter(r => !actionIds.has(r.profile_id)));
        setIds([]);
        setDetail(null);
      }
      setNotice(
        {
          draft: 'Drafts saved',
          approved: 'Pre-approved',
          final: 'Finalised',
          open: 'Employee preview opened',
          close: 'Employee preview closed',
        }[action] +
          ' for ' +
          actionRows.length +
          ' employee(s).'
      );
      setReason('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function report(kind, reportRows = selected) {
    setBusy(true);
    try {
      if (kind === 'summary') await downloadPayrollSummary(reportRows, period);
      else if (kind === 'exceptions') await downloadAttendanceExceptions(reportRows, period);
      else await downloadPayrollReport(reportRows, period, kind);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const visibleRows = rows.filter(row =>
    row.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const visibleReview = visibleRows.filter(ready);
  if (loading)
    return <p>Loading {config.stage === 'unsaved' ? 'eligible employees' : 'saved salaries'}…</p>;
  return (
    <div className="space-y-4">
      <div aria-live="polite">
        {notice && <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{notice}</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
            {error}{' '}
            <button className="underline" onClick={() => setReload(n => n + 1)}>
              Reload saved records
            </button>
          </p>
        )}
      </div>
      <header className={panel + ' flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5'}>
        <div>
          <h2 className="text-lg font-bold">
            {mode === 'drafts'
              ? 'Eligible employees'
              : mode === 'approval'
                ? 'Drafts awaiting review'
                : 'Approved salaries'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {rows.length} employees · {ids.length} selected
          </p>
        </div>
        <Link className={btn} href={payrollUrl(config.next, period)}>
          {config.link}
          <ArrowRight size={16} />
        </Link>
      </header>
      {!rows.length ? (
        <p className={card + ' text-sm'}>
          {config.empty}{' '}
          {mode !== 'drafts' && (
            <Link
              className="underline"
              href={payrollUrl(mode === 'approval' ? 'drafts' : 'approval', period)}
            >
              Open previous stage
            </Link>
          )}
        </p>
      ) : (
        <div className="min-w-0 space-y-4">
          <section
            className={panel + ' min-w-0 overflow-hidden'}
            aria-label="Employees in this stage"
          >
            <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <h3 className="flex items-center gap-2 font-bold">
                <Users size={17} className="text-indigo-600 dark:text-indigo-400" />
                Employees
              </h3>
              <label className="relative block">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  className={field + ' w-full pl-9'}
                  aria-label="Find employees"
                  placeholder="Find employees"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className={btn}
                  disabled={!visibleRows.length}
                  onClick={() =>
                    setIds(
                      search.trim()
                        ? [...new Set([...ids, ...visibleRows.map(r => r.profile_id)])]
                        : rows.map(r => r.profile_id)
                    )
                  }
                >
                  {search.trim() ? 'Select shown' : 'Select all'} ({visibleRows.length})
                </button>
                {mode === 'approval' && (
                  <button
                    className={btn}
                    disabled={!visibleReview.length}
                    onClick={() => setIds(visibleReview.map(r => r.profile_id))}
                  >
                    Select ready ({visibleReview.length})
                  </button>
                )}
                <button className={btn} disabled={!ids.length} onClick={() => setIds([])}>
                  Clear selection
                </button>
              </div>
            </div>
            {!visibleRows.length && (
              <p className="p-4 text-sm text-slate-500">No employees match your search.</p>
            )}
            <div className="max-h-[37rem] overflow-auto">
              <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="w-12 px-4 py-3">Select</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3 text-right">Monthly salary</th>
                    <th className="px-4 py-3 text-center">Deduction days</th>
                    <th className="px-4 py-3 text-right">Attendance</th>
                    <th className="px-4 py-3 text-right">Advance / loan</th>
                    <th className="px-4 py-3 text-center">Waived days</th>
                    <th className="px-4 py-3 text-right">Receivable</th>
                    <th className="px-4 py-3">Review status</th>
                    <th className="px-4 py-3 text-right">Details</th>
                    <th className="px-4 py-3 text-right">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visibleRows.map(row => {
                    const totals = payrollTotals(row);
                    const issues =
                      mode === 'finalise'
                        ? ready(row)
                          ? ''
                          : 'Recalculate attendance'
                        : approvalIssues(row).join(' · ');
                    const active = detail === row.profile_id;
                    return (
                      <Fragment key={row.profile_id}>
                        <tr
                          className={
                            active
                              ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }
                        >
                          <td className="px-4 py-3 align-top">
                            <input
                              aria-label={'Select ' + row.name}
                              type="checkbox"
                              checked={ids.includes(row.profile_id)}
                              onChange={e =>
                                setIds(
                                  e.target.checked
                                    ? [...ids, row.profile_id]
                                    : ids.filter(id => id !== row.profile_id)
                                )
                              }
                            />
                          </td>
                          <td className="px-4 py-3 align-top font-semibold text-slate-900 dark:text-slate-100">
                            {row.name}
                            {row.review_visible && (
                              <span className="ml-2 text-xs font-normal text-slate-500">
                                Preview open
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right align-top tabular-nums">
                            Rs {amount(row.salary)}
                          </td>
                          <td className="px-4 py-3 text-center align-top tabular-nums">
                            {totals.deductible_days}
                          </td>
                          <td className="px-4 py-3 text-right align-top tabular-nums">
                            Rs {amount(totals.attendance_deduction)}
                          </td>
                          <td className="px-4 py-3 text-right align-top tabular-nums">
                            Rs {amount(totals.advance_deduction + totals.loan_deduction)}
                          </td>
                          <td className="px-4 py-3 text-center align-top">
                            {editable ? (
                              <input
                                aria-label={`Waived days for ${row.name}`}
                                className={
                                  field + ' h-9 min-h-0 w-20 px-2 py-1 text-center tabular-nums'
                                }
                                type="number"
                                min="0"
                                max={row.calculated_days}
                                value={row.waived_days || 0}
                                onChange={e =>
                                  update(row.profile_id, {
                                    waived_days: Math.max(
                                      0,
                                      Math.min(row.calculated_days, Number(e.target.value || 0))
                                    ),
                                    waiver_reason:
                                      Number(e.target.value || 0) > 0 && !row.waiver_reason
                                        ? 'Waived from salary table'
                                        : row.waiver_reason,
                                  })
                                }
                              />
                            ) : (
                              <span className="tabular-nums">{row.waived_days || 0}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right align-top font-bold tabular-nums text-slate-900 dark:text-white">
                            Rs {amount(totals.net)}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className={`inline-block max-w-48 rounded-full px-2.5 py-1 text-xs font-semibold ${issues ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}
                            >
                              {issues || (mode === 'finalise' ? 'Pre-approved' : 'Ready')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <button
                              type="button"
                              className={active ? btn : btn + ' whitespace-nowrap'}
                              onClick={() => {
                                setDetail(active ? null : row.profile_id);
                                if (!window.matchMedia('(min-width: 1024px)').matches)
                                  requestAnimationFrame(() =>
                                    document
                                      .getElementById('employee-review')
                                      ?.scrollIntoView({ block: 'start' })
                                  );
                              }}
                            >
                              {active ? 'Hide details' : 'Details'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <button
                              type="button"
                              className={primary + ' whitespace-nowrap'}
                              disabled={busy || !!issues}
                              title={issues || `Accept and ${config.label.toLowerCase()}`}
                              onClick={() => act(config.action, [row])}
                            >
                              {mode === 'drafts'
                                ? 'Save'
                                : mode === 'approval'
                                  ? 'Accept'
                                  : 'Finalise'}
                            </button>
                          </td>
                        </tr>
                        {active && (
                          <tr className="bg-indigo-50/50 dark:bg-indigo-950/20">
                            <td colSpan={11} className="p-4">
                              {editable ? (
                                <EmployeeReview
                                  key={detail}
                                  row={row}
                                  period={period}
                                  close={() => setDetail(null)}
                                  update={changes => update(detail, changes)}
                                />
                              ) : (
                                <section
                                  id="employee-review"
                                  className={card + ' scroll-mt-24 space-y-2'}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="font-bold">{row.name}</h3>
                                    <button className={btn} onClick={() => setDetail(null)}>
                                      Close review
                                    </button>
                                  </div>
                                  <p>Approved receivable Rs {amount(payrollTotals(row).net)}</p>
                                  {row.issue_acknowledgement && <p>{row.issue_acknowledgement}</p>}
                                  {row.waiver_reason && <p>{row.waiver_reason}</p>}
                                </section>
                              )}
                              {versions.length > 0 && (
                                <details className={card + ' mt-3'}>
                                  <summary className="cursor-pointer font-semibold">
                                    Revision history
                                  </summary>
                                  <div className="mt-2 space-y-1 text-sm">
                                    {versions.map(v => (
                                      <p key={v.version}>
                                        Version {v.version} · {v.stage} · {v.reason}
                                      </p>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <div className="min-w-0 space-y-4">
            <section className={card + ' space-y-4'}>
              <div>
                <h3 className="font-bold">Batch actions</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {ids.length
                    ? `${ids.length} selected · Rs ${amount(selected.reduce((sum, r) => sum + payrollTotals(r).net, 0))} receivable`
                    : 'Select employees to prepare, approve or finalise together.'}
                </p>
              </div>
              {mode === 'approval' && hasWarnings && (
                <div className="grid gap-2 rounded-lg bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
                  <label>
                    Reason for accepting selected employees’ unresolved attendance
                    <input
                      className={field + ' block w-full'}
                      value={batchReason}
                      onChange={e => setBatchReason(e.target.value)}
                    />
                  </label>
                  <p className="text-sm">
                    One-sided or invalid punches require review. Scheduled days with neither punch
                    count as absent.
                  </p>
                  <button disabled={!batchReason.trim()} className={btn} onClick={acknowledge}>
                    Apply acknowledgement to selection
                  </button>
                </div>
              )}
              {blocked.length > 0 && (
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  {blocked.length} selected employee(s) need review. Resolve the issues above or
                  {mode === 'finalise'
                    ? 'return outdated salaries to draft.'
                    : 'choose Select ready.'}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className={primary}
                  disabled={busy || !selected.length || !!blocked.length}
                  onClick={() => act(config.action)}
                >
                  {config.label} ({ids.length})
                </button>
                {mode === 'approval' && (
                  <>
                    <button
                      className={btn}
                      disabled={busy || !ids.length}
                      onClick={() => act('draft')}
                    >
                      Save edits
                    </button>
                    <button
                      className={btn}
                      disabled={busy || !ids.length}
                      onClick={recalculateSelection}
                    >
                      Recalculate selected drafts
                    </button>
                    {['open', 'close'].map(action => (
                      <button
                        className={btn}
                        disabled={busy || !ids.length}
                        key={action}
                        onClick={() => act(action)}
                      >
                        {action === 'open' ? 'Open' : 'Close'} employee preview
                      </button>
                    ))}
                  </>
                )}
                {mode === 'finalise' && (
                  <button
                    className={btn}
                    disabled={busy || !ids.length || !reason.trim()}
                    onClick={() => act('draft')}
                  >
                    Return to draft
                  </button>
                )}
                <button
                  className={btn}
                  disabled={busy || !ids.length}
                  onClick={() => report('attendance')}
                >
                  Attendance PDF
                </button>
                <button
                  className={btn}
                  disabled={busy || !ids.length}
                  onClick={() => report('review')}
                >
                  Salary review PDF
                </button>
                <button
                  className={btn}
                  disabled={busy || !rows.length}
                  onClick={() => report('summary', rows)}
                >
                  Payroll summary PDF
                </button>
                <button
                  className={btn}
                  disabled={busy || !rows.length}
                  onClick={() => report('exceptions', rows)}
                >
                  HR attendance PDF
                </button>
              </div>
              {mode !== 'drafts' && (
                <label className="block text-sm">
                  {mode === 'finalise' ? 'Reason for returning to draft' : 'Review note'}
                  <input
                    className={field + ' mt-1 block w-full'}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </label>
              )}
            </section>
          </div>
        </div>
      )}
      {!!rows.length && <AttendanceSummary rows={rows} period={period} />}
    </div>
  );
}
