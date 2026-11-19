export default function AssignedSubjects({ subjects = [] }) {
  return (
    <span className="block break-words text-xs font-normal text-slate-600">
      {subjects.length
        ? 'Assigned subjects: ' +
          subjects
            .map(subject => subject.name)
            .sort((a, b) => a.localeCompare(b))
            .join(', ')
        : 'No subjects assigned'}
    </span>
  );
}
