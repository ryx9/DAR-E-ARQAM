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

const loadContactIcons = async color => {
  const entries = await Promise.all(
    Object.entries(LUCIDE_SVG).map(async ([name, svg]) => [
      name,
      await iconDataUrl(svg.replaceAll('#432c88', color)),
    ])
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
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, width, 54, 'F');
  doc.setFillColor(89, 69, 157);
  doc.circle(width + 8, 6, 39, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(-17, 5, 128, 41, 20.5, 20.5, 'F');
  doc.setFillColor(...YELLOW);
  doc.roundedRect(1, 43.5, 78, 2.5, 1.25, 1.25, 'F');
  doc.setFillColor(...YELLOW);
  doc.rect(0, 54, width, 2.3, 'F');
  if (logo) doc.addImage(logo, 'PNG', 16, 10, 82, 28.16);
  else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...PURPLE);
    doc.text('DAR-E-ARQAM SCHOOLS', MARGIN, 28);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('OFFICE OF THE PRINCIPAL', right, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(245, 243, 255);
  doc.text(`Ref: DAS/QMT/${studentId || '—'}`, right, 25, { align: 'right' });
  doc.text(`Student ID: ${studentId || '—'}`, right, 31, { align: 'right' });
  doc.text(`Issued: ${formatDate(new Date().toISOString().slice(0, 10))}`, right, 37, {
    align: 'right',
  });
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(title, MARGIN, 72);
};

const plain = text => ({ text });
const field = text => ({ text: String(text || '—'), highlight: true });

const writeParagraph = (doc, runs, y) => {
  doc.setFont('times', 'normal');
  doc.setFontSize(11.3);
  doc.setLineHeightFactor(1.45);
  doc.setTextColor(...INK);
  const left = MARGIN;
  const right = doc.internal.pageSize.getWidth() - MARGIN;
  const lineHeight = 5.4;
  let x = left;
  let lineY = y;

  for (const run of runs) {
    const tokens = run.text.split(/(\s+)/);
    for (const token of tokens) {
      if (!token) continue;
      doc.setFont('times', run.highlight ? 'bold' : 'normal');
      const tokenWidth = doc.getTextWidth(token);
      if (token.trim() && x + tokenWidth > right && x > left) {
        x = left;
        lineY += lineHeight;
      }
      if (run.highlight && token.trim()) {
        doc.setFillColor(255, 243, 125);
        doc.roundedRect(x - 0.7, lineY - 3.7, tokenWidth + 1.4, 4.7, 0.5, 0.5, 'F');
      }
      doc.setTextColor(...INK);
      doc.text(token, x, lineY);
      x += tokenWidth;
    }
  }
  return lineY + lineHeight;
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
  const footerTop = height - 31;
  doc.setFillColor(...PURPLE);
  doc.rect(0, footerTop, width, 29, 'F');
  doc.setFillColor(...YELLOW);
  doc.rect(0, footerTop, width, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  const contacts = [
    ['pin', '583 Q Block Model Town, Lahore'],
    ['phone', '03234447292'],
    ['mail', 'qmodeltown@das.edu.pk'],
  ];
  const textOffset = 5.8;
  const usedWidth = contacts.reduce(
    (sum, [, label]) => sum + textOffset + doc.getTextWidth(label),
    0
  );
  const gap = (width - 2 * MARGIN - usedWidth) / (contacts.length - 1);
  let x = MARGIN;
  for (const [icon, label] of contacts) {
    doc.addImage(icons[icon], 'PNG', x, height - 19, 4.2, 4.2);
    doc.text(label, x + textOffset, height - 15.5);
    x += textOffset + doc.getTextWidth(label) + gap;
  }
};

const createCertificate = async ({
  title,
  student,
  recipient,
  addressee,
  subject,
  salutation,
  paragraphs,
}) => {
  const [logo, icons] = await Promise.all([loadSchoolLogo(), loadContactIcons('#FFFFFF')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawLetterhead(doc, logo, title, student.studentid);
  let y = 88;
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
  if (salutation) {
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(salutation, 22.5, y);
    y += 12;
  }
  paragraphs.forEach((runs, index) => {
    y = writeParagraph(doc, runs, y);
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
      [
        plain('This is to certify that '),
        field(name),
        plain(', child of '),
        field(guardian),
        plain(
          ', was a bona fide student of Dar-e-Arqam Schools, Q Block Model Town Campus, Lahore, and last attended '
        ),
        field(`Class ${className}`),
        plain('.'),
      ],
      [
        plain('According to the school record, '),
        plain(p.subject.toLowerCase()),
        plain(' has completed the required leaving formalities. '),
        plain(p.possessive),
        plain(' conduct and character during '),
        plain(p.possessive.toLowerCase()),
        plain(' stay at the school were found to be '),
        plain('good'),
        plain('.'),
      ],
      [
        plain('This certificate is issued at the request of '),
        plain(p.possessive.toLowerCase()),
        plain(' parent or guardian for an official purpose. We wish '),
        plain(p.object),
        plain(' every success in '),
        plain(p.possessive.toLowerCase()),
        plain(' future studies.'),
      ],
    ],
  });
};

export const printBonafideCertificate = async student => {
  const p = pronouns(student.gender);
  const name = student.name || 'the student';
  const className = student.classes?.name || student.class_name || '—';
  const guardian = student.fathername || 'parent/guardian';
  return createCertificate({
    title: 'Bonafide Certificate',
    student,
    addressee: 'TO WHOM IT MAY CONCERN',
    paragraphs: [
      [
        plain('This is to certify that '),
        field(name),
        plain(', child of '),
        field(guardian),
        plain(
          ', is a bona fide student of Dar-e-Arqam Schools, Q Block Model Town Campus, Lahore.'
        ),
      ],
      [
        plain(p.subject),
        plain(' is presently enrolled in '),
        field(`Class ${className}`),
        plain(' and is attending the institution as a regular student.'),
      ],
      [
        plain('This certificate is issued at the request of '),
        plain(p.possessive.toLowerCase()),
        plain(' parent or guardian for an official purpose.'),
      ],
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
    salutation: 'Dear Sir/Madam,',
    paragraphs: [
      [
        plain('This is to certify that '),
        field(name),
        plain(', student of '),
        field(`Class ${className}`),
        plain(
          ', is a bona fide student of Dar-e-Arqam Schools, Q Block Model Town Campus, Lahore. '
        ),
        plain(p.possessive),
        plain(' current monthly fee is '),
        field(`PKR ${fee}`),
        plain('.'),
      ],
      [
        plain(p.subject),
        plain(' is willing to shift to your esteemed branch for continuation of '),
        plain(p.possessive.toLowerCase()),
        plain(' studies. All school dues have been cleared up to '),
        field(formatDate(paidTill)),
        plain('.'),
      ],
      [
        plain('We have no objection to '),
        plain(p.possessive.toLowerCase()),
        plain(' migration and request that '),
        plain(p.subject.toLowerCase()),
        plain(' may kindly be facilitated in completing the admission process at your branch.'),
      ],
    ],
  });
};
