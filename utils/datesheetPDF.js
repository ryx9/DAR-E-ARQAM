import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawSchoolHeader, loadSchoolLogo } from './pdfBranding';

const date = value =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export async function downloadDatesheetsPDF({
  title,
  schedule,
  students,
  invoiceStart,
  invoiceEnd,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadSchoolLogo();
  const width = doc.internal.pageSize.getWidth(),
    height = doc.internal.pageSize.getHeight();
  students.forEach((student, index) => {
    if (index) doc.addPage();
    drawSchoolHeader(doc, {
      logo,
      title: 'EXAM DATESHEET',
      subtitle: `${date(invoiceStart)} – ${date(invoiceEnd)}`,
    });
    doc.setFillColor(40, 38, 80);
    doc.roundedRect(14, 32, width - 28, 22, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(student.name, 19, 41);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`${student.className}  |  DAS: ${student.studentid}  |  ${title}`, 19, 47);
    autoTable(doc, {
      startY: 62,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      head: [['#', 'Subject / Test', 'Date']],
      body: schedule.map((row, i) => [i + 1, row.test_name || row.subject, date(row.date)]),
      styles: { fontSize: 9, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.15 },
      headStyles: { fillColor: [40, 38, 80], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    const dueY = doc.lastAutoTable.finalY + 10;
    doc.setFillColor(
      student.balance > 0 ? 255 : 236,
      student.balance > 0 ? 247 : 253,
      student.balance > 0 ? 237 : 245
    );
    doc.roundedRect(14, dueY, width - 28, 30, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text('FEE POSITION', 19, dueY + 7);
    autoTable(doc, {
      startY: dueY + 10,
      margin: { left: 19, right: 19 },
      theme: 'plain',
      head: [['Invoice period', 'Pending balance']],
      body: [
        [
          `${date(invoiceStart)} – ${date(invoiceEnd)}`,
          `Rs. ${Number(student.balance || 0).toLocaleString('en-PK')}`,
        ],
      ],
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { textColor: [100, 116, 139], fontStyle: 'bold' },
      columnStyles: {
        1: {
          halign: 'right',
          fontStyle: 'bold',
          textColor: student.balance > 0 ? [185, 28, 28] : [22, 101, 52],
        },
      },
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Please bring this datesheet to every examination. Contact the accounts office for any balance query.',
      14,
      height - 22
    );
    doc.setDrawColor(203, 213, 225);
    doc.line(14, height - 15, width - 14, height - 15);
    doc.text('DAR-E-ARQAM SCHOOL', 14, height - 10);
    doc.text(`Page ${index + 1} of ${students.length}`, width - 14, height - 10, {
      align: 'right',
    });
  });
  doc.save(`Datesheets_${title.replace(/[^a-z0-9]+/gi, '_')}.pdf`);
}
