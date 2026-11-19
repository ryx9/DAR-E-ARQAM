export function subjectSelection(classes = [], mapping = {}, subjectId) {
  const missing = classes.filter(id => !(mapping[id] || []).some(s => s.id === subjectId));
  const assigned = classes.length - missing.length;
  return {
    assigned,
    checked: assigned > 0 && !missing.length,
    mixed: assigned > 0 && missing.length > 0,
    additions: missing.map(class_id => ({ class_id, subject_id: subjectId })),
  };
}
