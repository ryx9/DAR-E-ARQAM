export const PKT = 'Asia/Karachi';
const tokens = /{{\s*([a-zA-Z_]+)\s*}}/g;
const known = new Set(['name', 'fathername', 'id', 'class', 'date']);
export const messageTokens = [
  ['name', 'Student name'],
  ['fathername', 'Parent name'],
  ['id', 'Student ID'],
  ['class', 'Class'],
  ['date', 'Delivery date'],
];

export function pktDateTime(offset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PKT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + offset * 60000));
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}
export function formatMessageTime(time) {
  return time
    ? new Date(time).toLocaleString('en-PK', {
        timeZone: PKT,
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Date unavailable';
}
export function unsupportedTokens(template) {
  return [
    ...new Set(
      [...template.matchAll(/{{([^{}]*)}}/g)]
        .map(match => match[1].trim())
        .filter(key => !known.has(key))
    ),
  ];
}
export function personalise(template, student, timestamp) {
  const values = {
    name: student.name,
    fathername: student.fathername,
    id: student.studentid,
    class: student.classes?.name,
    date: new Date(timestamp).toLocaleDateString('en-PK', { timeZone: PKT }),
  };
  return template
    .replace(tokens, (original, key) => (known.has(key) ? String(values[key] ?? '') : original))
    .trim();
}

function legacyTemplate(message) {
  const text = message.text.normalize('NFC').trim().replace(/\r\n/g, '\n');
  const student = message.students;
  const fields = [
    [student?.name, 'name'],
    [student?.fathername, 'fathername'],
    [message.student_id, 'id'],
    // Short labels such as "A" are ambiguous unless introduced as a class.
    [message.classes?.name, 'class'],
  ]
    .map(([value, token]) => [
      String(value ?? '')
        .normalize('NFC')
        .trim(),
      token,
    ])
    .filter(
      ([value, token]) =>
        value && (token === 'id' ? value.length >= 3 : value.length >= 3 && /\p{L}/u.test(value))
    )
    .sort(([a], [b]) => b.length - a.length);
  if (!fields.length) return text;
  const escaped = fields.map(([value]) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const matcher = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${escaped.join('|')})(?![\\p{L}\\p{N}_])`,
    'gu'
  );
  return text.replace(matcher, value => `{{${fields.find(([field]) => field === value)[1]}}}`);
}

export function groupMessages(messages) {
  const groups = new Map();
  for (const message of messages) {
    const template = message.notice_template || legacyTemplate(message);
    const key = message.notice_batch_id
      ? 'batch:' + message.notice_batch_id
      : JSON.stringify([
          message.type,
          message.class_id,
          message.created_at || 'row:' + message.id,
          template,
        ]);
    if (!groups.has(key))
      groups.set(key, {
        key,
        template,
        messages: [],
        time: message.created_at,
        scheduledFor: message.notice_scheduled_for,
      });
    groups.get(key).messages.push(message);
  }
  return [...groups.values()].sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
}
