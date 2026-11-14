import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawSchoolHeader, loadSchoolLogo } from './pdfBranding';

const money = value =>
  `PKR ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const date = value =>
  value
    ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('en-PK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export const downloadStatementCsv = (statements, range) => {
  const rows = [
    [
      'Student ID',
      'Student',
      'Father / Guardian',
      'Class',
      'Fee Month',
      'Invoice #',
      'Invoice Date',
      'Due Date',
      'Invoice Item',
      'Description',
      'Invoice Amount',
      'Payment Date',
      'Payment Method',
      'Payment Note',
      'Payment Amount',
      'Item Balance',
    ],
  ];

  statements.forEach(statement =>
    statement.months.forEach(month =>
      month.items.forEach(item => {
        const base = [
          statement.student.studentid,
          statement.student.name,
          statement.student.fathername || '',
          statement.student.className,
          month.label,
          item.invoiceId,
          item.invoiceDate,
          item.dueDate,
          item.feeType,
          item.description || '',
          item.amount,
        ];
        if (item.payments.length) {
          item.payments.forEach(payment =>
            rows.push([
              ...base,
              payment.paidAt,
              payment.method,
              payment.notes || '',
              payment.amount,
              item.balance,
            ])
          );
        } else {
          rows.push([...base, '', '', '', '', item.balance]);
        }
      })
    )
  );

  rows.push([]);
  rows.push(['Statement invoice period', range.start, range.end]);
  const csv = rows
    .map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `student-fee-statements-${range.start}-to-${range.end}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadStatementPdf = async (statements, range) => {
  const logo = await loadSchoolLogo();
  const drawHeader = () => drawSchoolHeader(doc, { logo, title: 'STUDENT FEE STATEMENT', subtitle: `${date(range.start)} to ${date(range.end)}` });
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  let first = true;

  statements.forEach(statement => {
    if (!first) doc.addPage();
    first = false;
    drawHeader();

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(statement.student.name || 'Unnamed student', 14, 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Student ID: ${statement.student.studentid}   |   Class: ${statement.student.className}   |   Father / Guardian: ${statement.student.fathername || '—'}`,
      14,
      40
    );
    if (statement.currentInvoice) {
      doc.text(
        `Outstanding is based on current invoice #${statement.currentInvoice.id}, issued ${date(statement.currentInvoice.invoiceDate)}.`,
        14,
        44
      );
    }

    let cursor = statement.currentInvoice ? 48 : 45;
    statement.months.forEach(month => {
      if (cursor > height - 45) {
        doc.addPage();
        drawHeader();
        cursor = 32;
      }
      doc.setFillColor(226, 232, 240);
      doc.rect(14, cursor, width - 28, 7, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(month.label.toUpperCase(), 17, cursor + 4.6);
      doc.text(
        `Invoiced ${money(month.totals.invoiced)}   Paid ${money(month.totals.paid)}   Invoice balances ${money(month.totals.balance)}`,
        width - 17,
        cursor + 4.6,
        { align: 'right' }
      );
      cursor += 8;

      const body = [];
      month.items.forEach(item => {
        if (item.payments.length) {
          item.payments.forEach((payment, index) =>
            body.push([
              index === 0 ? item.invoiceId : '',
              index === 0 ? `${date(item.invoiceDate)}\nDue ${date(item.dueDate)}` : '',
              index === 0
                ? `${item.feeType}${item.description ? `\n${item.description}` : ''}`
                : '',
              index === 0 ? money(item.amount) : '',
              date(payment.paidAt),
              `${String(payment.method || 'Cash').toUpperCase()}${payment.notes ? `\n${payment.notes}` : ''}`,
              money(payment.amount),
              index === 0 ? money(item.balance) : '',
            ])
          );
        } else {
          body.push([
            item.invoiceId,
            `${date(item.invoiceDate)}\nDue ${date(item.dueDate)}`,
            `${item.feeType}${item.description ? `\n${item.description}` : ''}`,
            money(item.amount),
            '—',
            '—',
            '—',
            money(item.balance),
          ]);
        }
      });

      autoTable(doc, {
        startY: cursor,
        head: [
          [
            'Invoice',
            'Issued / due',
            'Fee item',
            'Amount',
            'Payment date',
            'Method / note',
            'Paid',
            'Balance',
          ],
        ],
        body,
        theme: 'grid',
        margin: { left: 14, right: 14, top: 28, bottom: 18 },
        styles: {
          font: 'helvetica',
          fontSize: 6.1,
          cellPadding: 1.25,
          lineColor: [203, 213, 225],
          lineWidth: 0.1,
          valign: 'middle',
        },
        headStyles: {
          fillColor: [235, 238, 244],
          textColor: [30, 41, 59],
          fontStyle: 'bold',
          fontSize: 6.1,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didDrawPage: data => { if (data.pageNumber > 1) drawHeader(); },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 20 },
          2: { cellWidth: 38 },
          3: { halign: 'right', cellWidth: 18 },
          4: { cellWidth: 20 },
          5: { cellWidth: 28 },
          6: { halign: 'right', cellWidth: 18 },
          7: { halign: 'right', cellWidth: 18 },
        },
      });
      cursor = doc.lastAutoTable.finalY + 5;
    });
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Page ${page} of ${pageCount}`, width - 14, height - 8, { align: 'right' });
    doc.text(
      'This statement reflects recorded invoices and payments for the selected invoice period.',
      14,
      height - 8
    );
  }
  doc.save(`student-fee-statements-${range.start}-to-${range.end}.pdf`);
};
