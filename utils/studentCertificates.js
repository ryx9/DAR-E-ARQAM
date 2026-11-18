import jsPDF from 'jspdf';
import { loadSchoolLogo } from './pdfBranding';

// Taken directly from Lucide's MapPin, Phone and Mail icons. They are rendered
// to PNG only because jsPDF's core build cannot place SVG paths natively.
const LUCIDE_SVG = {
  pin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#432c88" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
  phone:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#432c88" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  mail: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#432c88" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
};

const PURPLE = [67, 44, 136];
const YELLOW = [255, 233, 0];
const INK = [38, 38, 38];
const GREY = [91, 91, 91];

const formatDate = value => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' });
};

const pronouns = gender => {
  const value = String(gender || '').toLowerCase();
  if (value.includes('female') || value.includes('girl'))
    return { subject: 'She', object: 'her', possessive: 'Her' };
  if (value.includes('male') || value.includes('boy'))
    return { subject: 'He', object: 'him', possessive: 'His' };
  return { subject: 'He/She', object: 'him/her', possessive: 'His/Her' };
};

const iconDataUrl = svg =>
  new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      canvas.getContext('2d').drawImage(image, 0, 0, 48, 48);
      resolve(canvas.toDataURL('image/png'));
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

const loadContactIcons = async () => {
  const entries = await Promise.all(
    Object.entries(LUCIDE_SVG).map(async ([name, svg]) => [name, await iconDataUrl(svg)])
  );
  return Object.fromEntries(entries);
};

const openPdf = doc => {
  const url = URL.createObjectURL(doc.output('blob'));
  const popup = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return Boolean(popup);
};

const MARGIN = 22.5;

const drawLetterhead = (doc, logo, title, studentId) => {
  const width = doc.internal.pageSize.getWidth();
  const right = width - MARGIN;
  if (logo) doc.addImage(logo, 'PNG', MARGIN, 16, 67, 23);
  else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...PURPLE);
    doc.text('DAR-E-ARQAM SCHOOLS', MARGIN, 28);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(`Ref: DAS/QMT/${studentId || '—'}`, right, 25, { align: 'right' });
  doc.text(`Student ID: ${studentId || '—'}`, right, 30, { align: 'right' });
  doc.text(`Issued: ${formatDate(new Date().toISOString().slice(0, 10))}`, right, 35, {
    align: 'right',
  });
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, 46, right, 46);
  doc.setFillColor(...YELLOW);
  doc.rect(MARGIN, 45.5, 14, 1, 'F');
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(title, MARGIN, 65);
};

const writeParagraph = (doc, text, y) => {
  doc.setFont('times', 'normal');
  doc.setFontSize(11.3);
  doc.setLineHeightFactor(1.45);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(text, 165);
  doc.text(lines, 22.5, y, { maxWidth: 165, align: 'justify' });
  return y + lines.length * 5.25;
};

const drawSignatureLine = doc => {
  const y = doc.internal.pageSize.getHeight() - 42;
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(0.4);
  doc.line(138, y, 186, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...PURPLE);
  doc.text('Principal', 162, y + 5, { align: 'center' });
};

const drawFooter = (doc, icons) => {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setDrawColor(205, 205, 205);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, height - 22, width - MARGIN, height - 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  const contacts = [
    ['pin', '583 Q Block Model Town, Lahore'],
    ['phone', '03234447292'],
    ['mail', 'qmodeltown@das.edu.pk'],
  ];
  const textOffset = 5;
  const usedWidth = contacts.reduce(
    (sum, [, label]) => sum + textOffset + doc.getTextWidth(label),
    0
  );
  const gap = (width - 2 * MARGIN - usedWidth) / (contacts.length - 1);
  let x = MARGIN;
  for (const [icon, label] of contacts) {
    doc.addImage(icons[icon], 'PNG', x, height - 17, 3.4, 3.4);
    doc.text(label, x + textOffset, height - 14.2);
    x += textOffset + doc.getTextWidth(label) + gap;
  }
};

const createCertificate = async ({ title, student, recipient, addressee, subject, paragraphs }) => {
  const [logo, icons] = await Promise.all([loadSchoolLogo(), loadContactIcons()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawLetterhead(doc, logo, title, student.studentid);
  let y = 81;
  if (recipient) {
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(recipient, 22.5, y);
    y += 19;
  }
  if (addressee) {
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(addressee, 22.5, y);
    y += 13;
  }
  if (subject) {
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(`Subject: ${subject}`, 22.5, y);
    y += 13;
  }
  paragraphs.forEach((text, index) => {
    y = writeParagraph(doc, text, y);
    if (index < paragraphs.length - 1) y += 7;
  });
  drawSignatureLine(doc);
  drawFooter(doc, icons);
  return openPdf(doc);
};

export const printSchoolLeavingCertificate = async student => {
  const p = pronouns(student.gender);
  const name = student.name || 'the student';
  const className = student.classes?.name || student.class_name || '—';
  const guardian = student.fathername || 'parent/guardian';
  return createCertificate({
    title: 'School Leaving Certificate',
    student,
    addressee: 'TO WHOM IT MAY CONCERN',
    paragraphs: [
      `This is to certify that ${name}, child of ${guardian}, was a bona fide student of Dar-e-Arqam Schools, Q Block Model Town Campus, Lahore, and last attended Class ${className}.`,
      `According to the school record, ${p.subject.toLowerCase()} has completed the required leaving formalities. ${p.possessive} conduct and character during ${p.possessive.toLowerCase()} stay at the school were found to be good.`,
      `This certificate is issued at the request of ${p.possessive.toLowerCase()} parent or guardian for an official purpose. We wish ${p.object} every success in ${p.possessive.toLowerCase()} future studies.`,
    ],
  });
};

export const printMigrationCertificate = async ({ student, branch, paidTill }) => {
  const p = pronouns(student.gender);
  const name = student.name || 'the student';
  const className = student.classes?.name || student.class_name || '—';
  const fee = Number(student.monthly_fee || 0).toLocaleString('en-PK');
  return createCertificate({
    title: 'Migration Certificate',
    student,
    recipient: `The Principal / Director\n${branch}`,
    subject: `Migration of ${name}`,
    paragraphs: [
      `This is to certify that ${name}, student of Class ${className}, is a bona fide student of Dar-e-Arqam Schools, Q Block Model Town Campus, Lahore. ${p.possessive} current monthly fee is PKR ${fee}.`,
      `${p.subject} is willing to shift to your esteemed branch for continuation of ${p.possessive.toLowerCase()} studies. All school dues have been cleared up to ${formatDate(paidTill)}.`,
      `We have no objection to ${p.possessive.toLowerCase()} migration and request that ${p.subject.toLowerCase()} may kindly be facilitated in completing the admission process at your branch.`,
    ],
  });
};
