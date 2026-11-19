import { supabase } from './supabaseClient';
import { timetableRows } from './timetable.mjs';

const activeTeacher = profile =>
  profile?.role?.toLowerCase() === 'teacher' &&
  profile.is_active !== false &&
  Boolean(String(profile.mobilenumber || '').trim());

async function loadActiveTeachers(profileIds) {
  const ids = [...new Set((profileIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id,name,mobilenumber,role,is_active')
    .in('id', ids);
  if (error) throw error;
  return (data || []).filter(activeTeacher);
}

export async function queueTeacherAlerts(profileIds, createText) {
  const payload = (await loadActiveTeachers(profileIds)).map(profile => ({
    number: profile.mobilenumber,
    sent: false,
    text: createText(profile),
  }));
  if (!payload.length) return 0;
  const { error: insertError } = await supabase.from('messages').insert(payload);
  if (insertError) throw insertError;
  return payload.length;
}

export async function queueClassTeacherAlerts(classIds, createText) {
  const ids = [...new Set((classIds || []).filter(Boolean).map(String))];
  if (!ids.length) return 0;
  const { data, error } = await supabase
    .from('teacher_class_access')
    .select('teacher_profile')
    .in('class', ids);
  if (error) throw error;
  return queueTeacherAlerts(
    (data || []).map(row => row.teacher_profile),
    createText
  );
}

async function specialAssignments(classIds) {
  if (!classIds.length) return [];
  const { data, error } = await supabase
    .from('teacher_class')
    .select('class,teacher_profile')
    .in('class', classIds);
  if (error) throw error;
  return data || [];
}

export async function queueSpecialClassTeacherAlerts(classId, createText) {
  const assignments = await specialAssignments([classId]);
  return queueTeacherAlerts(
    assignments.map(row => row.teacher_profile),
    createText
  );
}

// Keep each teacher copy in a separate batch from the student messages.
export async function classMessageTeacherCopies(
  messages,
  template,
  classNames,
  { due, queuedAt, scheduledFor = null }
) {
  const recipientsByClass = new Map();
  for (const message of messages) {
    if (message.class_id == null || message.student_id == null) continue;
    const id = String(message.class_id);
    if (!recipientsByClass.has(id)) {
      recipientsByClass.set(id, { classId: message.class_id, students: new Set() });
    }
    recipientsByClass.get(id).students.add(String(message.student_id));
  }
  const assignments = await specialAssignments([...recipientsByClass.keys()]);
  const teachers = await loadActiveTeachers(assignments.map(row => row.teacher_profile));
  return [...recipientsByClass].flatMap(([id, { classId, students }]) => {
    const assigned = new Set(
      assignments.filter(row => String(row.class) === id).map(row => String(row.teacher_profile))
    );
    const summary = `*MESSAGE SENT TO STUDENTS*\nClass: ${classNames.get(id) || id}\nNumber of students: ${students.size}\n\n*Message template*\n${template}`;
    const batchId = crypto.randomUUID();
    return teachers
      .filter(teacher => assigned.has(String(teacher.id)))
      .map(teacher => ({
        student_id: null,
        class_id: classId,
        number: teacher.mobilenumber,
        text: summary,
        type: 'notice',
        sent: false,
        created_at: due,
        notice_batch_id: batchId,
        notice_template: summary,
        notice_queued_at: queuedAt,
        notice_scheduled_for: scheduledFor,
      }));
  });
}

/**
 * @param {number | string} classId
 * @param {string} subject
 * @param {(teacher: { id: string, name?: string | null }) => string} createText
 */
export async function queueSubjectTeacherAlerts(classId, subject, createText) {
  const { data: timetable, error } = await supabase
    .from('school_timetable')
    .select('published')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  const classLessons = timetableRows(timetable?.published).filter(
    row => row.classId === String(classId)
  );
  if (!classLessons.length) return 0;
  const { data: catalogue, error: subjectError } = await supabase
    .from('subjects')
    .select('id')
    .eq('name', subject)
    .maybeSingle();
  if (subjectError) throw subjectError;
  if (!catalogue) return 0;
  return queueTeacherAlerts(
    classLessons
      .filter(row => String(row.subjectId) === String(catalogue.id))
      .flatMap(row => row.teacherIds),
    createText
  );
}
