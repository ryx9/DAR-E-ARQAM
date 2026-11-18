import { field, card, panel, secondary, primary as button } from './payrollStyles';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { payrollUrl } from './PayrollModule';
import * as XLSX from 'xlsx';
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  History,
  UsersRound,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { hasAnyPunch } from '../../utils/payroll/calculate';
import { COLUMNS, parseAttendance } from '../../utils/payroll/import';

const formatDate = date => (date ? date.split('-').reverse().join('/') : '—');
const displayCell = (row, column) => {
  if (column === 'Date') return formatDate(row.date);
  const value = row.source[column];
  if ((column.startsWith('Clock ') || column === 'Total in time') && typeof value === 'number') {
    const minutes = Math.round(value * 24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  return String(value ?? '');
};

export default function PayrollImport({ period, profiles }) {
  const [savedMappings, setSavedMappings] = useState({});
  const [mappings, setMappings] = useState({});
  const [existing, setExisting] = useState([]);
  const [history, setHistory] = useState([]);
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [filename, setFilename] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadVersion, setUploadVersion] = useState(0);

  async function load() {
    const [m, h] = await Promise.all([
      supabase.from('payroll_biometric_mappings').select('biometric_id,profile_id'),
      supabase
        .from('payroll_imports')
        .select('*')
        .order('imported_at', { ascending: false })
        .limit(25),
    ]);
    const problem = m.error || h.error;
    if (problem) {
      setMessage(
        `Could not load import data: ${problem.message}. Apply the payroll migration first.`
      );
      return;
    }
    const known = Object.fromEntries(
      (m.data || []).map(item => [item.biometric_id, item.profile_id])
    );
    setSavedMappings(known);
    setMappings(known);
    setHistory(h.data || []);
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!period) return;
    let cancelled = false;
    const end = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1))
      .toISOString()
      .slice(0, 10);
    supabase
      .from('payroll_attendance_logs')
      .select('profile_id,attendance_date,source_row')
      .gte('attendance_date', `${period}-01`)
      .lt('attendance_date', end)
      .then(({ data, error }) => {
        if (!cancelled) {
          if (error) setMessage(error.message);
          else setExisting(data || []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [period, history]);
  const activeProfiles = profiles.filter(profile => profile.is_active === true);
  const ids = useMemo(
    () => [...new Set(rows.map(row => row.biometric_id).filter(Boolean))],
    [rows]
  );
  const conflicts = useMemo(() => {
    const found = [],
      assigned = new Map();
    rows.forEach(row => {
      const profile = mappings[row.biometric_id];
      if (!profile || !row.date) return;
      const identity = `${profile}|${row.date}`;
      if (assigned.has(identity))
        found.push(`Multiple rows map to the same employee on ${row.date}.`);
      assigned.set(identity, true);
      const previous = existing.find(
        item => item.profile_id === profile && item.attendance_date === row.date
      );
      if (previous && JSON.stringify(previous.source_row) !== JSON.stringify(row.source)) {
        // jsonb object key order is not stable, so compare each source column instead.
        if (
          COLUMNS.some(
            column =>
              String(previous.source_row?.[column] ?? '') !== String(row.source[column] ?? '')
          )
        )
          found.push(`Existing attendance differs for ${row.biometric_id} on ${row.date}.`);
      }
    });
    return [...new Set(found)];
  }, [rows, mappings, existing]);
  async function readFile(event) {
    const file = event.target.files?.[0];
    setRows([]);
    setErrors([]);
    setMessage('');
    setFilename(file?.name || '');
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        raw: true,
        cellDates: false,
      });
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
        header: 1,
        defval: '',
        raw: true,
      });
      const parsed = parseAttendance(matrix, period, !!workbook.Workbook?.WBProps?.date1904);
      setRows(parsed.rows);
      setErrors(parsed.errors);
    } catch (error) {
      setErrors([`Could not read file: ${error.message}`]);
    }
  }
  async function commit() {
    const mappedRows = rows.filter(row => mappings[row.biometric_id]);
    const skipped = rows.length - mappedRows.length;
    if (!mappedRows.length) {
      setMessage('Map at least one employee before importing.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.rpc('payroll_commit_import', {
      p_period: `${period}-01`,
      p_filename: filename,
      p_mappings: ids
        .filter(id => mappings[id])
        .map(id => ({ biometric_id: id, profile_id: mappings[id] })),
      p_rows: mappedRows,
    });
    setBusy(false);
    if (error) {
      setMessage(`Import failed: ${error.message}`);
      return;
    }
    setMessage(
      `Import complete: ${data.inserted} rows added, ${data.duplicates} identical rows already present, ${skipped} unmapped rows skipped. Re-import the file after mapping more employees.`
    );
    setRows([]);
    setFilename('');
    setUploadVersion(version => version + 1);
    await load();
  }
  const unmapped = ids.filter(id => !mappings[id]).length;
  const matchedRows = rows.filter(row => mappings[row.biometric_id]).length;
  return (
    <div className="space-y-5">
      {message && (
        <div
          role="status"
          className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
        >
          {message}
        </div>
      )}
      <section className={`${card} min-w-0 space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Upload biometric attendance</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload the first worksheet of the export for {period}. Use DD/MM/YYYY for text dates.
            </p>
          </div>
          <Link className={secondary} href={payrollUrl('drafts', period)}>
            Prepare salary drafts →
          </Link>
        </div>
        <label className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-800 dark:bg-indigo-950/30 sm:flex-row sm:items-center sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            <FileSpreadsheet size={19} />
          </span>
          <span className="grid min-w-0 flex-1 gap-2 text-sm font-semibold">
            Attendance file
            <input
              key={uploadVersion}
              className={
                field +
                ' w-full file:mr-3 file:border-0 file:bg-transparent file:font-semibold file:text-indigo-600 dark:file:text-indigo-300'
              }
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={readFile}
              disabled={busy}
            />
            {filename && (
              <span className="break-words text-xs text-slate-500 dark:text-slate-400">
                {filename}
              </span>
            )}
          </span>
        </label>
        <p className="text-sm text-slate-500">
          A scheduled workday with no check-in and no check-out counts as absent. Review the file
          before preparing salaries.
        </p>
      </section>
      {errors.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          <h2 className="flex items-center gap-2 font-bold">
            <AlertCircle size={18} /> Check your file
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </section>
      )}
      {rows.length > 0 && (
        <>
          <dl
            className={panel + ' grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800'}
          >
            {[
              ['Rows in file', rows.length],
              ['Matched rows', matchedRows],
              ['IDs to match', unmapped],
            ].map(([label, total]) => (
              <div key={label} className="p-3 sm:p-4">
                <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">{total}</dd>
              </div>
            ))}
          </dl>
          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section className={`${card} min-w-0 space-y-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="mt-1 text-lg font-bold">Match your employees</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Saved matches are reused. Match any remaining biometric IDs to include their
                    rows.
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {unmapped ? `${unmapped} to match` : 'All matched'}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {ids.map(id => (
                  <label
                    key={id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="flex items-center gap-3">
                      <span className="rounded-xl bg-slate-100 p-2 text-slate-500 dark:bg-slate-800">
                        <UsersRound size={17} />
                      </span>
                      <span>
                        <span className="block text-sm font-bold">
                          {rows.find(row => row.biometric_id === id)?.source.Name ||
                            'Unnamed employee'}
                        </span>
                        <span className="text-xs text-slate-500">Emp No. {id}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <select
                        className={field}
                        value={mappings[id] || ''}
                        disabled={!!savedMappings[id]}
                        onChange={e => setMappings({ ...mappings, [id]: e.target.value })}
                      >
                        <option value="">Select employee</option>
                        {savedMappings[id] &&
                          !activeProfiles.some(p => p.id === savedMappings[id]) && (
                            <option value={savedMappings[id]}>
                              {profiles.find(p => p.id === savedMappings[id])?.name ||
                                savedMappings[id]}{' '}
                              (inactive)
                            </option>
                          )}
                        {activeProfiles.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name || p.id}
                          </option>
                        ))}
                      </select>
                      {savedMappings[id] && <CheckCircle2 size={17} className="text-emerald-500" />}
                    </span>
                  </label>
                ))}
              </div>
            </section>
            <section className={`${card} min-w-0 space-y-4`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="mt-1 text-lg font-bold">Review attendance</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {rows.length} rows ready to review
                    {rows.length > 100 ? ' · showing first 100' : ''}.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {period}
                </span>
              </div>
              {conflicts.length > 0 && (
                <ul className="list-disc rounded-xl bg-red-50 p-4 pl-9 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
                  {conflicts.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              )}
              <div className="overflow-auto rounded-xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                    {' '}
                    <tr>
                      {['Name', 'Emp No.', 'Date', 'Check-ins', 'Check-outs'].map(column => (
                        <th className="whitespace-nowrap px-4 py-3" key={column}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((row, i) => (
                      <tr className="border-t border-slate-100 dark:border-slate-800" key={i}>
                        {['Name', 'Emp No.', 'Date'].map(column => (
                          <td className="whitespace-nowrap px-4 py-3" key={column}>
                            {displayCell(row, column)}
                          </td>
                        ))}
                        {hasAnyPunch(row.source) ? (
                          ['In', 'Out'].map(kind => (
                            <td className="whitespace-nowrap px-4 py-3" key={kind}>
                              {Array.from({ length: 5 }, (_, i) =>
                                displayCell(row, `Clock ${kind} ${i + 1}`).trim()
                              )
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </td>
                          ))
                        ) : (
                          <td colSpan={2} className="px-4 py-3 text-slate-500">
                            No punches
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Unmapped rows will be skipped. Existing identical records won’t be added again.
                </p>
                <button
                  className={button}
                  disabled={
                    busy ||
                    !!errors.length ||
                    !!conflicts.length ||
                    !rows.some(row => mappings[row.biometric_id])
                  }
                  onClick={commit}
                >
                  {busy ? 'Importing…' : 'Import attendance'} <ArrowRight size={16} />
                </button>
              </div>
            </section>
          </div>
        </>
      )}
      <section className={card}>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-slate-100 p-2.5 text-slate-500 dark:bg-slate-800">
            <History size={19} />
          </span>
          <div>
            <h2 className="font-bold">Recent imports</h2>
            <p className="text-sm text-slate-500">Your latest attendance uploads.</p>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No imports yet. Your history will appear here.
          </p>
        ) : (
          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-3">Imported</th>
                  <th>Month</th>
                  <th>File</th>
                  <th>Added</th>
                  <th>Already present</th>
                </tr>
              </thead>
              <tbody>
                {history.map(item => (
                  <tr className="border-t border-slate-100 dark:border-slate-800" key={item.id}>
                    <td className="py-3">{new Date(item.imported_at).toLocaleString()}</td>
                    <td>{item.period.slice(0, 7)}</td>
                    <td>{item.filename}</td>
                    <td>{item.inserted_count}</td>
                    <td>{item.duplicate_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
