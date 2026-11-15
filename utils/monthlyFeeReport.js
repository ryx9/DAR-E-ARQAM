import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawSchoolHeader, loadSchoolLogo } from './pdfBranding';

export const monthKey = value =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date(value));
export function monthsBetween(start, end) {
  const result = [];
  let [year, month] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  while (year * 12 + month <= endYear * 12 + endMonth) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    if (++month === 13) {
      month = 1;
      year++;
    }
  }
  return result;
}
export const monthLabel = key =>
  new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
export function paymentAgeGroups(rows, end) {
  const [year, month] = end.split('-').map(Number);
  const groups = [[], [], [], []];
  rows.forEach(row => {
    if (!row.lastPaymentAt) {
      groups[3].push(row);
      return;
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date(row.lastPaymentAt));
    const gap =
      year * 12 +
      month -
      (Number(parts.find(p => p.type === 'year').value) * 12 +
        Number(parts.find(p => p.type === 'month').value));
    if (gap === 1) groups[0].push(row);
    else if (gap === 2) groups[1].push(row);
    else if (gap >= 3) groups[2].push(row);
  });
  return groups;
}

export async function downloadMonthlyFeePdf({ rows, months, classes, start, end }) {
  const logo = await loadSchoolLogo();
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const width = doc.internal.pageSize.getWidth(),
    height = doc.internal.pageSize.getHeight();
  const fmt = value =>
    value === null ? '-' : Number(value).toLocaleString('en-PK', { maximumFractionDigits: 2 });
  let first = true;
  for (const cls of classes) {
    const members = rows.filter(row => String(row.class_id) === String(cls.id));
    if (!members.length) continue;
    for (let offset = 0; offset < months.length; offset += 6) {
      const batch = months.slice(offset, offset + 6);
      if (!first) doc.addPage();
      first = false;
      const header = () => {
        drawSchoolHeader(doc, {
          logo,
          title: 'MONTHLY FEE OVERVIEW',
          subtitle: `${start} to ${end}`,
        });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text(`Class: ${cls.name}    Students: ${members.length}`, 14, 29);
      };
      header();
      autoTable(doc, {
        startY: 33,
        margin: { top: 33, left: 14, right: 14, bottom: 17 },
        theme: 'grid',
        head: [
          [
            { content: 'Student ID', rowSpan: 2 },
            { content: 'Student', rowSpan: 2 },
            { content: 'Father / guardian', rowSpan: 2 },
            ...batch.map(month => ({
              content: monthLabel(month),
              colSpan: 2,
              styles: { halign: 'center' },
            })),
          ],
          [...batch.flatMap(() => ['Invoice', 'Payment'])],
        ],
        body: members.map(row => [
          row.studentid,
          row.name || '-',
          row.fathername || '-',
          ...batch.flatMap(month => [
            fmt(row.months[month]?.invoice ?? null),
            fmt(row.months[month]?.payment ?? null),
          ]),
        ]),
        styles: {
          fontSize: 7,
          cellPadding: 1.7,
          lineWidth: 0.15,
          lineColor: [203, 213, 225],
          textColor: [30, 41, 59],
          overflow: 'linebreak',
        },
        headStyles: { fillColor: [235, 238, 244], textColor: [30, 41, 59], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 40 }, 2: { cellWidth: 40 } },
        didDrawPage: () => {
          header();
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text(
            'Invoices use invoice date; payments use payment date. Invoices can include carried balances.',
            14,
            height - 8
          );
          doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, width - 14, height - 8, {
            align: 'right',
          });
        },
      });
    }
  }
  const groups = paymentAgeGroups(rows, end);
  const labels = [
    '1 month since last payment',
    '2 months since last payment',
    '3 months or more since last payment',
    'No recorded payment',
  ];
  doc.addPage();
  const agingRows = [];
  groups.forEach((members, index) => {
    agingRows.push([
      {
        content: `${labels[index]} (${members.length})`,
        colSpan: 4,
        styles: { fillColor: [40, 38, 80], textColor: [255, 255, 255], fontStyle: 'bold' },
      },
    ]);
    if (!members.length) agingRows.push([{ content: 'No students', colSpan: 4 }]);
    members.forEach(row =>
      agingRows.push([
        row.name || '-',
        row.fathername || '-',
        classes.find(c => String(c.id) === String(row.class_id))?.name || '-',
        row.lastPaymentAt
          ? new Date(row.lastPaymentAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' })
          : 'Never recorded',
      ])
    );
  });
  autoTable(doc, {
    startY: 32,
    margin: { top: 32, bottom: 17, left: 14, right: 14 },
    theme: 'grid',
    head: [['Student', 'Father / guardian', 'Class', 'Last payment']],
    body: agingRows,
    styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.15, lineColor: [203, 213, 225] },
    headStyles: { fillColor: [235, 238, 244], textColor: [30, 41, 59] },
    didDrawPage: () => {
      drawSchoolHeader(doc, { logo, title: 'PAYMENT HISTORY', subtitle: `As of ${end}` });
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Calendar months since last recorded payment.', 14, 27);
      doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, width - 14, height - 8, {
        align: 'right',
      });
    },
  });
  doc.save(`Monthly_Fee_Overview_${start}_${end}.pdf`);
}
