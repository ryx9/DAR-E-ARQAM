export function canAssignRechecking(role, databasePermission) {
  const normalizedRole = String(role || '').toLowerCase();
  return (
    normalizedRole === 'admin' ||
    normalizedRole === 'superadmin' ||
    (normalizedRole === 'teacher' && databasePermission === true)
  );
}
