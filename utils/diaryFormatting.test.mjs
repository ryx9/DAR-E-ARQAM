import test from 'node:test';
import assert from 'node:assert/strict';
import { splitDiarySubjects, preserveDiaryEdit, renderDiarySections } from './diaryFormatting.mjs';

test('subjects remain separate and Urdu instructions are kept exactly', () => {
  const header = '🏫 *Class 1* | 📅 *1 Jan 2026*';
  const source = `${header}\n\nEnglish: read pg 5\nUrdu: سبق نمبر ۵ یاد کریں۔\nمزید کام مکمل کریں۔\nMaths: solve q 2`;
  const sections = splitDiarySubjects(source, header);
  assert.deepEqual(sections.map(s => s.subject), ['English', 'Urdu', 'Maths']);
  assert.equal(preserveDiaryEdit(sections[1].text, 'Translate this.'), 'سبق نمبر ۵ یاد کریں۔\nمزید کام مکمل کریں۔');
  const rendered = renderDiarySections(header, sections);
  assert.match(rendered, /📚 \*Urdu:\*\nسبق نمبر ۵ یاد کریں۔\nمزید کام مکمل کریں۔/u);
  assert.deepEqual(splitDiarySubjects(rendered, header).map(s => s.subject), ['English', 'Urdu', 'Maths']);
});

test('rejects translated English and changed numeric details', () => {
  assert.equal(preserveDiaryEdit('Read page 5', 'صفحہ 5 پڑھیں'), 'Read page 5');
  assert.equal(preserveDiaryEdit('Read page 5', 'Read page 6.'), 'Read page 5');
  assert.equal(preserveDiaryEdit('read pg 5', 'Read page 5.'), 'Read page 5.');
  assert.equal(preserveDiaryEdit('HW: سبق ۵ یاد کریں', 'Complete the homework.'), 'HW: سبق ۵ یاد کریں');
});

test('retains original instructions when key meaning or language changes', () => {
  assert.equal(preserveDiaryEdit('Do not read page 5', 'Read page 5.'), 'Do not read page 5');
  assert.equal(preserveDiaryEdit('HW: page 5', 'Complete classwork on page 5.'), 'HW: page 5');
  assert.equal(preserveDiaryEdit('Test on Tuesday', 'Test on Monday.'), 'Test on Tuesday');
  assert.equal(preserveDiaryEdit('Read page 5', 'Прочитайте page 5.'), 'Read page 5');
  assert.equal(preserveDiaryEdit('hw ex 2', 'Complete homework exercise 2.'), 'Complete homework exercise 2.');
  assert.equal(preserveDiaryEdit('سبق ۵ یاد کریں', 'سبق ۵ یاد کرو'), 'سبق ۵ یاد کریں');
});

test('requires clear subject boundaries and accepts existing WhatsApp labels', () => {
  assert.throws(() => splitDiarySubjects('English: Read page 1 Maths: page 2'), /separate line/);
  assert.throws(() => splitDiarySubjects('Read page 1'), /subject/);
  assert.deepEqual(splitDiarySubjects('*English:* Read page 1\nHW: Exercise 2'), [
    { subject: 'English', text: 'Read page 1\nHW: Exercise 2' },
  ]);
});
