const taskLabels = new Set(['hw', 'h.w', 'homework', 'cw', 'c.w', 'classwork', 'test', 'note']);
export function hasNonLatinLetters(text) {
  return [...String(text || '')].some(char => /\p{L}/u.test(char) && !/\p{Script=Latin}/u.test(char));
}

export function splitDiarySubjects(text, header = '') {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const sections = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current) current.text += '\n';
      continue;
    }
    if (line === header || line === 'Dar-e-Arqam School') continue;
    // Accept plain and WhatsApp-bold subject labels, including Urdu labels.
    const match = line.match(/^(?:[\p{Extended_Pictographic}\uFE0F]\s*)?\*?([^:*\n]{1,60}?)\s*:\*?\s*(.*)$/u);
    const label = match?.[1]?.replace(/\*/g, '').trim();
    const isSubject = label && !taskLabels.has(label.toLowerCase()) && label.split(/\s+/).length <= 4;
    if (isSubject) {
      if (/(?:^|\s)(?:english|maths?|mathematics|urdu|science|islami(?:at|yat)|computer|sindhi|punjabi|arabic|social studies|pakistan studies|اردو|ریاضی|انگریزی|اسلامیات|سائنس)\s*:/iu.test(match[2]))
        throw new Error('Put each subject on a separate line so its work cannot be grouped with another subject.');
      current = { subject: label, text: match[2].trim() };
      sections.push(current);
    } else if (current) {
      current.text += `${current.text && !current.text.endsWith('\n') ? '\n' : ''}${raw}`;
    } else {
      throw new Error('Start each subject with its name and a colon, for example: English: Read page 5.');
    }
  }
  if (!sections.length || sections.some(section => !section.text.trim()))
    throw new Error('Enter at least one subject and its work. Put each subject on a new line, followed by a colon.');
  return sections;
}

export function preserveDiaryEdit(original, proposed) {
  const source = String(original || '');
  const edit = String(proposed || '').trim();
  // Preserve Urdu and mixed-language instructions verbatim, including script and meaning.
  if (hasNonLatinLetters(source)) return source;
  if (!edit || hasNonLatinLetters(edit) || /[\r\n]/.test(edit)) return source;
  // The formatter must not change or invent numeric details such as pages and dates.
  const numbers = value => (value.match(/\d+(?:[.,]\d+)*/g) || []).sort().join('|');
  if (numbers(source) !== numbers(edit)) return source;
  const protectedTerms = [
    /\b(?:no|not|never|without|cannot|[a-z]+n['’]?t)\b/i,
    /\b(?:hw|h\.w\.?|homework|home\s+work)\b/i,
    /\b(?:cw|c\.w\.?|classwork|class\s+work)\b/i,
    /\btest\b/i,
    /\b(?:exam|examination)\b/i,
    /\bquiz\b/i,
    /\b(?:rev|revise|revision)\b/i,
    ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      .map(day => new RegExp(`\\b${day}\\b`, 'i')),
  ];
  if (protectedTerms.some(term => term.test(source) !== term.test(edit))) return source;
  const exactTokens = value => (value.match(/https?:\/\/\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi) || []).sort().join('|');
  if (exactTokens(source) !== exactTokens(edit)) return source;
  return edit;
}

export function diarySubjectEmoji(subject) {
  const label = String(subject || '').trim().toLowerCase();
  if (/english|انگریزی/.test(label)) return '📖';
  if (/urdu|اردو/.test(label)) return '📚';
  if (/math|ریاضی|حساب/.test(label)) return '🔢';
  if (/science|سائنس/.test(label)) return '🔬';
  if (/islami|islamic|اسلامیات|دینیات/.test(label)) return '🕌';
  if (/computer|کمپیوٹر/.test(label)) return '💻';
  if (/arabic|عربی/.test(label)) return '📖';
  if (/art|drawing|آرٹ/.test(label)) return '🎨';
  if (/notice|announcement|اعلان|نوٹس/.test(label)) return '📢';
  return '📘';
}

export function renderDiarySections(header, sections) {
  return [header, ...sections.map(({ subject, text }) => `${diarySubjectEmoji(subject)} *${subject}:*\n${text}`)].join('\n\n');
}
