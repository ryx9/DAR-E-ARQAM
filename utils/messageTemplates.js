import { parentMessage } from './parentMessages';

const syllabus = 'Admission test syllabus: https://darearqam.vercel.app/admission';
const admissionsContact = 'For questions, call Admissions at 0323-4447292.';

export function admissionInquiryMessage(studentNames) {
  const names = studentNames.filter(Boolean).join(', ') || 'your child';
  return parentMessage(
    'Admission inquiry received',
    [`Thank you for your inquiry for ${names}.`, syllabus],
    admissionsContact,
    'Admissions Office'
  );
}

export function generateMessageTemplate(type, inquiry, extraData = {}) {
  const student = inquiry.name;
  switch (type) {
    case 'WELCOME':
      return admissionInquiryMessage([student]);
    case 'TEST_SCHEDULED': {
      const date = extraData.date || '';
      const scheduledAt = new Date(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(date) ? date + '+05:00' : date
      );
      const time =
        extraData.date && Number.isFinite(scheduledAt.valueOf())
          ? new Intl.DateTimeFormat('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Karachi',
            }).format(scheduledAt)
          : '';
      return parentMessage(
        'Admission test',
        [
          `Student: ${student}`,
          time
            ? `Date and time: ${time} PKT`
            : 'Please contact Admissions to confirm the date and time.',
          syllabus,
        ],
        time ? 'Please arrive at the campus on time for the test.' : '',
        'Admissions Office'
      );
    }
    case 'TEST_CLEAR':
      return parentMessage(
        'Admission test result',
        `${student} passed the admission test.`,
        'Please visit the Admissions Office to complete enrolment and pay the fees.',
        'Admissions Office'
      );
    case 'ADMISSION':
      return parentMessage(
        'Admission confirmed',
        `Enrolment for ${student} is complete.`,
        'Please contact Admissions for joining instructions if needed.',
        'Admissions Office'
      );
    case 'FOLLOW_UP':
      return parentMessage(
        'Admission follow-up',
        `We are following up on the admission inquiry for ${student}.`,
        'Please reply if you would like to schedule the admission test.',
        'Admissions Office'
      );
    default:
      return '';
  }
}
