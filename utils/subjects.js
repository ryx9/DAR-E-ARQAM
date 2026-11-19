import { supabase } from './supabaseClient';

export async function loadClassSubjects() {
  const { data, error } = await supabase
    .from('class_subjects')
    .select('class_id,subjects(id,name)')
    .order('subject_id');
  if (error) throw error;
  /** @type {Record<string, {id: number, name: string}[]>} */
  const result = {};
  for (const row of data || []) {
    if (row.subjects) (result[String(row.class_id)] ||= []).push(row.subjects);
  }
  return result;
}
