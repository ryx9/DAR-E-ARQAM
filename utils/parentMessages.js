export const SCHOOL_NAME = 'Dar-e-Arqam School';

export function cleanMessageText(value) {
  return String(value ?? '')
    .replace(
      /[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*|[\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u{E0020}-\u{E007F}]/gu,
      ''
    )
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parentMessage(title, details, nextStep = '', office = '') {
  const signature = office ? `${office}\n${SCHOOL_NAME}` : SCHOOL_NAME;
  return cleanMessageText(
    [
      `*${title}*`,
      'Dear Parent/Guardian,',
      Array.isArray(details) ? details.filter(Boolean).join('\n') : details,
      nextStep,
      signature,
    ]
      .filter(Boolean)
      .join('\n\n')
  );
}

const amountFormatter = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });
export const rupees = amount => `PKR ${amountFormatter.format(Number(amount) || 0)}`;
export const feeLines = entries =>
  entries
    .filter(([, amount]) => Number(amount) > 0)
    .map(([label, amount]) => `${label}: ${rupees(amount)}`);

export function messageDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? String(value)
    : date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Karachi',
      });
}

export function complaintParentMessage(title, status, notes = '') {
  const wording = {
    received: 'We received your complaint and will review it.',
    assigned: 'Your complaint has been assigned for review.',
    reassigned: 'Your complaint has been reassigned for follow-up.',
    Resolved: 'Your complaint has been marked as resolved.',
    Closed: 'Your complaint has been closed.',
  };
  return parentMessage(
    status === 'received' ? 'Complaint received' : 'Complaint update',
    [`Reference: ${title}`, wording[status], notes.trim() && `Resolution: ${notes.trim()}`],
    'Please contact the school office if you need further assistance.'
  );
}
