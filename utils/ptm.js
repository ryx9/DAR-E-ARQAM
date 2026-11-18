import { supabase } from './supabaseClient';
import { getClassAccess } from './classAccess';

export const staffRoles = ['admin', 'superadmin', 'teacher'];

export async function loadPTMClasses() {
  const access = await getClassAccess();
  if (!staffRoles.includes(access.role) || (access.role === 'teacher' && !access.classIds.length)) {
    return { access, classes: [] };
  }
  let query = supabase.from('classes').select('id,name').order('id');
  if (access.role === 'teacher') query = query.in('id', access.classIds);
  const { data, error } = await query;
  if (error) throw error;
  return { access, classes: data };
}

export const meetingDate = value =>
  new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export const matchesSearch = (query, ...values) =>
  values
    .filter(value => value != null)
    .join(' ')
    .toLowerCase()
    .includes(query.trim().toLowerCase());
