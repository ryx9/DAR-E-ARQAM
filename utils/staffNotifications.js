import { supabase } from './supabaseClient';

const activeTeacher = profile =>
  profile?.role?.toLowerCase() === 'teacher' &&
  profile.is_active !== false &&
  Boolean(String(profile.mobilenumber || '').trim());

export async function queueTeacherAlerts(profileIds, createText) {
  const ids = [...new Set((profileIds || []).filter(Boolean).map(String))];
  if (!ids.length) return 0;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,mobilenumber,role,is_active')
    .in('id', ids);
  if (error) throw error;
  const payload = (data || [])
    .filter(activeTeacher)
    .map(profile => ({ number: profile.mobilenumber, sent: false, text: createText(profile) }));
  if (!payload.length) return 0;
  const { error: insertError } = await supabase.from('messages').insert(payload);
  if (insertError) throw insertError;
  return payload.length;
}

export async function queueClassTeacherAlerts(classIds, createText) {
  const ids = [...new Set((classIds || []).filter(Boolean).map(String))];
  if (!ids.length) return 0;
  const { data, error } = await supabase
    .from('teacher_class')
    .select('teacher_profile')
    .in('class', ids);
  if (error) throw error;
  return queueTeacherAlerts(
    (data || []).map(row => row.teacher_profile),
    createText
  );
}
