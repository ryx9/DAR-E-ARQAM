import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { subjectSelection } from '../utils/subjectSelection.mjs';
import AssignedSubjects from './AssignedSubjects';

export default function SubjectManager({ classes = [], subjects = [], classSubjects = {}, onReload, onError }) {
  const [selected, setSelected] = useState([]);
  const [pending, setPending] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState('');
  const rows = subjects.map(subject => ({
    ...subject,
    ...subjectSelection(selected, classSubjects, subject.id),
  }));
  const additions = rows.filter(row => pending.includes(row.id)).flatMap(row => row.additions);
  const button = 'rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50';
  function chooseClasses(ids) {
    setSelected(ids);
    setPending([]);
    setReceipt('');
  }
  async function save(query, message, done) {
    setBusy(true);
    setReceipt('');
    try {
      const { error } = await query;
      if (error) throw error;
      await onReload();
      done?.();
      setReceipt(message);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }
  function toggle(row) {
    if (row.checked && selected.length === 1) {
      if (window.confirm(`Remove ${row.name} from this class?`))
        void save(
          supabase
            .from('class_subjects')
            .delete()
            .eq('class_id', selected[0])
            .eq('subject_id', row.id),
          'Subject removed.'
        );
      return;
    }
    setPending(ids => (ids.includes(row.id) ? ids.filter(id => id !== row.id) : [...ids, row.id]));
    setReceipt('');
  }
  return (
    <fieldset
      disabled={busy}
      className="min-w-0 space-y-5 rounded-xl border bg-white p-5 text-slate-900"
    >
      <h2 className="text-xl font-semibold">Class subject assignments</h2>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={e => {
          e.preventDefault();
          if (name.trim())
            void save(
              supabase.from('subjects').insert({ name: name.trim() }),
              'Subject created.',
              () => setName('')
            );
        }}
      >
        <input
          aria-label="New subject name"
          className="rounded-lg border p-2"
          placeholder="New subject name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <button className={button}>Create subject</button>
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h3 className="font-semibold">Classes ({selected.length} selected)</h3>
          <button
            type="button"
            className="my-2 text-sm text-indigo-700"
            onClick={() =>
              chooseClasses(selected.length === classes.length ? [] : classes.map(c => c.id))
            }
          >
            {selected.length === classes.length ? 'Clear selection' : 'Select all classes'}
          </button>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {classes.map(c => (
              <label key={c.id} className="flex items-start gap-3 rounded p-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={e =>
                    chooseClasses(
                      e.target.checked ? [...selected, c.id] : selected.filter(id => id !== c.id)
                    )
                  }
                />
                <span>
                  {c.name}
                  {selected.includes(c.id) && <AssignedSubjects subjects={classSubjects[c.id]} />}
                </span>
              </label>
            ))}
          </div>
        </section>
        <section className="rounded-lg border p-4">
          <h3 className="font-semibold">Subjects</h3>
          {!selected.length ? (
            <p className="py-3 text-sm text-slate-600">
              Select classes to see their subject assignments.
            </p>
          ) : (
            <>
              <button
                className="my-2 text-sm text-indigo-700"
                type="button"
                onClick={() => setPending(rows.filter(r => !r.checked).map(r => r.id))}
              >
                Select all subjects
              </button>
              <div className="max-h-96 space-y-1 overflow-y-auto">
                {rows.map(row => {
                  const proposed = pending.includes(row.id);
                  return (
                    <label
                      key={row.id}
                      className="flex items-center gap-3 rounded p-2 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={row.checked || proposed}
                        disabled={row.checked && selected.length > 1}
                        ref={el => {
                          if (el) el.indeterminate = row.mixed && !proposed;
                        }}
                        onChange={() => toggle(row)}
                      />
                      <span>
                        {row.name}
                        <small className="block text-slate-600">
                          {row.assigned} of {selected.length} assigned
                          {proposed && !row.checked ? ' · Pending addition' : ''}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={button + ' bg-indigo-700 text-white'}
          disabled={!additions.length}
          onClick={() =>
            void save(
              supabase
                .from('class_subjects')
                .upsert(additions, { onConflict: 'class_id,subject_id', ignoreDuplicates: true }),
              'Subject assignments saved.',
              () => setPending([])
            )
          }
        >
          Apply {additions.length} new assignments
        </button>
        {!!pending.length && (
          <button className={button} onClick={() => setPending([])}>
            Discard pending additions
          </button>
        )}
        <span role="status">{receipt}</span>
      </div>
    </fieldset>
  );
}
