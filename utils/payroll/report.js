import { drawSchoolHeader, loadSchoolLogo } from '../pdfBranding.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { payrollTotals } from './calculate.js';

const amount = n =>
  Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = n => `PKR ${amount(n)}`;
const punch = value => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'number') return String(value);
  const minutes = Math.round((value % 1) * 1440);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};
const colours = {
  ink: [15, 23, 42],
  muted: [71, 85, 105],
  line: [203, 213, 225],
  head: [30, 41, 59],
  soft: [241, 245, 249],
  accent: [49, 46, 129],
};

function footer(doc, page, count) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const y = height - 11;
  doc.setDrawColor(...colours.line);
  doc.setLineWidth(0.2);
  doc.line(14, y, width - 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...colours.muted);
  doc.text('System generated payroll record · Amounts in Pakistani Rupees', 14, y + 5);
  doc.text(`Page ${page} of ${count}`, width - 14, y + 5, { align: 'right' });
}
function sectionTitle(doc, title, y) {
  doc.setFillColor(...colours.accent);
  doc.roundedRect(14, y, 182, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), 17, y + 4.7);
}
function note(doc, text, y) {
  if (!text) return y;
  const lines = doc.splitTextToSize(text, 174),
    h = Math.max(8, lines.length * 4.2 + 4);
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(253, 230, 138);
  doc.roundedRect(14, y, 182, h, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 53, 15);
  doc.text(lines, 17, y + 5);
  return y + h + 4;
}

export async function downloadPayrollReport(rows, period, kind = 'review') {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const logo = typeof window === 'undefined' ? null : await loadSchoolLogo();
  const title =
    kind === 'attendance'
      ? 'EMPLOYEE ATTENDANCE REGISTER'
      : kind === 'final'
        ? 'FINALISED SALARY STATEMENT'
        : 'SALARY REVIEW STATEMENT';
  rows.forEach((row, index) => {
    if (index) doc.addPage();
    const totals = payrollTotals(row);
    const header = () => drawSchoolHeader(doc, { logo, title, subtitle: `${period} · PKR` });
    header();
    let y = 31;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...colours.ink);
    doc.text(row.name || 'Employee', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...colours.muted);
    doc.text(`Payroll period: ${period}`, 14, y + 5);
    doc.text(
      kind === 'final'
        ? 'Status: Finalised'
        : kind === 'review'
          ? 'Status: Review copy'
          : 'Status: Attendance detail',
      196,
      y + 5,
      { align: 'right' }
    );
    y += 12;
    if (kind !== 'attendance') {
      sectionTitle(doc, 'Payroll calculation', y);
      const details = [
        ['Monthly salary', money(row.salary)],
        ['Attendance deduction', `(${money(totals.attendance_deduction)})`],
        ['Advance repayment', `(${money(totals.advance_deduction)})`],
        ['Loan repayment', `(${money(totals.loan_deduction)})`],
        ['Net receivable', money(totals.net)],
      ];
      autoTable(doc, {
        startY: y + 8,
        body: details,
        theme: 'grid',
        margin: { left: 14, right: 14 },
        styles: {
          font: 'helvetica',
          fontSize: 8.7,
          cellPadding: 2.1,
          lineColor: colours.line,
          lineWidth: 0.15,
        },
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: colours.soft, cellWidth: 68 },
          1: { halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: data => {
          if (data.row.index === details.length - 1) {
            data.cell.styles.fillColor = [224, 231, 255];
            data.cell.styles.textColor = colours.accent;
          }
        },
      });
      y = doc.lastAutoTable.finalY + 5;
      if (row.settlement) {
        const revised =
            totals.net + row.settlement.adjustments.reduce((sum, a) => sum + Number(a.amount), 0),
          paid = row.settlement.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        sectionTitle(doc, 'Settlement position', y);
        autoTable(doc, {
          startY: y + 8,
          body: [
            ['Revised payable', money(revised)],
            ['Settled', money(paid)],
            ['Outstanding', money(revised - paid)],
          ],
          theme: 'grid',
          margin: { left: 14, right: 14 },
          styles: {
            font: 'helvetica',
            fontSize: 8.7,
            cellPadding: 2.1,
            lineColor: colours.line,
            lineWidth: 0.15,
          },
          columnStyles: {
            0: { fontStyle: 'bold', fillColor: colours.soft, cellWidth: 68 },
            1: { halign: 'right', fontStyle: 'bold' },
          },
        });
        y = doc.lastAutoTable.finalY + 5;
      }
      y = note(
        doc,
        row.salary_override_reason && `Salary decision: ${row.salary_override_reason}`,
        y
      );
      y = note(doc, row.waiver_reason && `Waiver reason: ${row.waiver_reason}`, y);
      y = note(
        doc,
        row.issue_acknowledgement && `Attendance issues acknowledged: ${row.issue_acknowledgement}`,
        y
      );
    }
    if (y > 245) {
      doc.addPage();
      header();
      y = 31;
    }
    sectionTitle(doc, 'Daily attendance', y);
    const body = (row.days || []).map(day => {
      const date = new Date(`${day.date}T00:00:00Z`);
      const pairs = day.source
        ? Array.from({ length: 5 }, (_, i) => [
            day.source[`Clock In ${i + 1}`],
            day.source[`Clock Out ${i + 1}`],
          ])
            .filter(pair => pair.some(v => v !== '' && v != null))
            .map(pair => pair.map(punch).join(' – '))
            .join(', ')
        : '';
      return [
        day.date,
        date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
        pairs || '—',
        [
          day.status.replaceAll('_', ' '),
          day.late && 'Late',
          day.early && 'Early',
          day.correction && `Corrected: ${day.correction.reason}`,
        ]
          .filter(Boolean)
          .join(' · '),
      ];
    });
    autoTable(doc, {
      startY: y + 8,
      theme: 'grid',
      head: [['Date', 'Day', 'Check-in / Check-out', 'Attendance remarks']],
      body,
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 1.65,
        lineColor: colours.line,
        lineWidth: 0.12,
        valign: 'middle',
      },
      headStyles: {
        fillColor: colours.head,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 16 },
        2: { cellWidth: 63 },
        3: { cellWidth: 78 },
      },
      margin: { left: 14, right: 14, top: 30, bottom: 22 },
      didDrawPage: data => {
        if (data.pageNumber > 1) header();
      },
    });
    let summaryY = doc.lastAutoTable.finalY + 6;
    if (summaryY > 277) {
      doc.addPage();
      header();
      summaryY = 32;
    }
    autoTable(doc, {
      startY: summaryY,
      theme: 'grid',
      body: [
        [
          `Absences: ${row.absences || 0}`,
          `Late arrivals: ${row.lates || 0}`,
          `Early departures: ${row.early || 0}`,
          `Calculated days: ${row.calculated_days || 0}`,
        ],
      ],
      margin: { left: 14, right: 14 },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 1.8,
        halign: 'center',
        fillColor: colours.soft,
        lineColor: colours.line,
        lineWidth: 0.12,
      },
    });
  });
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    footer(doc, page, count);
  }
  doc.save(`payroll-${kind}-${period}.pdf`);
}

export async function downloadPayrollRegister(table, period) {
  const logo = await loadSchoolLogo(),
    doc = new jsPDF('landscape', 'mm', 'a4');
  autoTable(doc, {
    html: table,
    theme: 'grid',
    margin: { left: 12, right: 12, top: 32, bottom: 19 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.7,
      halign: 'right',
      lineColor: colours.line,
      lineWidth: 0.12,
    },
    headStyles: {
      fillColor: colours.head,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    footStyles: { fillColor: [224, 231, 255], textColor: colours.ink, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { halign: 'left', cellWidth: 44 } },
    showFoot: 'lastPage',
    didDrawPage: () =>
      drawSchoolHeader(doc, { logo, title: 'PAYROLL REGISTER', subtitle: `${period} · PKR` }),
  });
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    footer(doc, page, count);
  }
  doc.save(`payroll-register-${period}.pdf`);
}

export async function downloadPayrollSummary(rows, period) {
  const logo = await loadSchoolLogo();
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const totals = rows.reduce(
    (sum, row) => {
      const value = payrollTotals(row);
      sum.salary += Number(row.salary || 0);
      sum.deduction += value.attendance_deduction + value.advance_deduction + value.loan_deduction;
      sum.payable += value.net;
      return sum;
    },
    { salary: 0, deduction: 0, payable: 0 }
  );
  autoTable(doc, {
    startY: 33,
    theme: 'grid',
    margin: { left: 12, right: 12, top: 32, bottom: 19 },
    head: [
      [
        'Employee',
        'Late arrivals',
        'Absences',
        'Early leaves',
        'Monthly salary',
        'Attendance deduction',
        'Other deductions',
        'Payable amount',
      ],
    ],
    body: rows.map(row => {
      const value = payrollTotals(row);
      return [
        row.name,
        row.lates || 0,
        row.absences || 0,
        row.early || 0,
        money(row.salary),
        money(value.attendance_deduction),
        money(value.advance_deduction + value.loan_deduction),
        money(value.net),
      ];
    }),
    foot: [
      [
        'Overall total',
        '',
        '',
        '',
        money(totals.salary),
        '',
        money(totals.deduction),
        money(totals.payable),
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 7.8,
      cellPadding: 1.7,
      lineColor: colours.line,
      lineWidth: 0.12,
      halign: 'right',
    },
    headStyles: {
      fillColor: colours.head,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    footStyles: { fillColor: [224, 231, 255], textColor: colours.ink, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'left', cellWidth: 53 },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
    },
    didDrawPage: () =>
      drawSchoolHeader(doc, {
        logo,
        title: 'PAYROLL SUMMARY',
        subtitle: `${period} · Attendance and payroll overview`,
      }),
  });
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    footer(doc, page, count);
  }
  doc.save(`payroll-summary-${period}.pdf`);
}

export async function downloadAttendanceExceptions(rows, period) {
  const logo = await loadSchoolLogo();
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const ranked = rows
    .map(row => ({
      ...row,
      score: Number(row.absences || 0) * 6 + Number(row.lates || 0) * 2 + Number(row.early || 0),
    }))
    .sort((a, b) => b.score - a.score || b.absences - a.absences || b.lates - a.lates);
  const affected = ranked.filter(row => row.score > 0);
  drawSchoolHeader(doc, {
    logo,
    title: 'HR ATTENDANCE EXCEPTIONS',
    subtitle: `${period} · Management review`,
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...colours.ink);
  doc.text('Attendance follow-up report', 14, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...colours.muted);
  doc.text(
    `${affected.length} of ${rows.length} employees require attendance follow-up. Ranked by absence, late-arrival and early-leave impact.`,
    14,
    38
  );
  autoTable(doc, {
    startY: 44,
    theme: 'grid',
    margin: { left: 14, right: 14, top: 30, bottom: 22 },
    head: [
      [
        'Rank',
        'Employee',
        'Absences',
        'Late arrivals',
        'Early leaves',
        'Deduction days',
        'Payroll impact',
      ],
    ],
    body: (affected.length ? affected : ranked).map((row, index) => {
      const value = payrollTotals(row);
      return [
        index + 1,
        row.name,
        row.absences || 0,
        row.lates || 0,
        row.early || 0,
        value.deductible_days,
        money(value.attendance_deduction),
      ];
    }),
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2,
      lineColor: colours.line,
      lineWidth: 0.12,
      halign: 'center',
    },
    headStyles: { fillColor: colours.head, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: 'left', cellWidth: 61 }, 6: { halign: 'right' } },
    didDrawPage: data => {
      if (data.pageNumber > 1)
        drawSchoolHeader(doc, {
          logo,
          title: 'HR ATTENDANCE EXCEPTIONS',
          subtitle: `${period} · Management review`,
        });
    },
  });
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    footer(doc, page, count);
  }
  doc.save(`hr-attendance-exceptions-${period}.pdf`);
}
