export function staffName(profile, fallback = 'Unnamed staff member') {
  return profile?.name?.trim() || fallback;
}

export function hasNoBlockedStaff({ assigned_to, against_user }) {
  return assigned_to?.is_active !== false && against_user?.is_active !== false;
}

export function complaintTeacherMessage(
  teacher,
  { assignedTo, against, title, studentName, isUpdate }
) {
  const roles = [];
  if (String(teacher.id) === String(assignedTo)) roles.push('Assigned to investigate');
  if (String(teacher.id) === String(against)) roles.push('Staff member the complaint is about');

  const heading = isUpdate ? 'Complaint Assignment Updated' : 'New Complaint Received';
  return [
    `*${heading}*`,
    `\nDear ${staffName(teacher, 'Teacher')},`,
    isUpdate
      ? 'Your involvement in a complaint has been updated.'
      : 'A new complaint has been received.',
    `\n*Your role:* ${roles.join(' and ')}`,
    `*Title:* ${title}`,
    `*Student:* ${studentName}`,
    '\nPlease sign in and open My Complaints to review the details.',
  ].join('\n');
}
