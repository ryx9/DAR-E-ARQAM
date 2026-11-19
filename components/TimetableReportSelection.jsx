export default function TimetableReportSelection({ label, items, ids, onChange }) {
  const selected = items.filter(item => ids === null || ids.includes(String(item.id)));
  return (
    <details>
      <summary>
        {label} · {selected.length} selected
      </summary>
      <div className="mt-2 space-y-1">
        <div className="flex gap-3">
          <button onClick={() => onChange(null)}>Select all</button>
          <button onClick={() => onChange([])}>Clear</button>
        </div>
        {items.map(item => (
          <label key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(item)}
              onChange={e => {
                const next = new Set(selected.map(i => String(i.id)));
                if (e.target.checked) next.add(String(item.id));
                else next.delete(String(item.id));
                onChange([...next]);
              }}
            />
            {item.name}
          </label>
        ))}
      </div>
    </details>
  );
}
