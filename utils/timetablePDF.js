import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawSchoolHeader, loadSchoolLogo } from './pdfBranding';

export async function downloadTimetablePDF(plan, reports, mode) {
  if (!reports.length) throw new Error('No assignments match the report selection.');
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const logo = await loadSchoolLogo();
  let first = true;
  for (const report of reports) {
    for (let start = 1; start < report.head.length; start += 7) {
      if (!first) doc.addPage();
      first = false;
      const chunk = row => [row[0], ...row.slice(start, start + 7)];
      autoTable(doc, {
        head: [chunk(report.head)],
        body: report.body.map(row =>
          chunk(row).map(c => ({ content: c.text, styles: c.color ? { fillColor: c.color } : {} }))
        ),
        startY: 30,
        margin: { top: 30, bottom: 15 },
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [67, 44, 136] },
        didDrawPage: () => {
          drawSchoolHeader(doc, { logo, title: report.title, subtitle: plan.title });
          doc.setFontSize(8);
          doc.text('DAR-E-ARQAM School · Model Town, Lahore', 14, 202);
          doc.text(String(doc.internal.getCurrentPageInfo().pageNumber), 283, 202, {
            align: 'right',
          });
        },
      });
    }
  }
  doc.save('timetable-' + mode + '.pdf');
}
