import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabaseClient';
import { drawSchoolHeader, loadSchoolLogo } from './pdfBranding';

export const generateCollectionReportBlob = async (startDate, endDate) => {
  // --- 1. Fetch data from Supabase using Pagination ---
  let allReceipts = [];
  let fetchMore = true;
  let from = 0;
  const pageSize = 1000;

  while (fetchMore) {
    const to = from + pageSize - 1;

    const { data: receiptsChunk, error } = await supabase
      .from('fee_payments')
      .select(
        `
        *,
        fee_invoice_details (
          fee_type
        ),
        cashier:profiles!fee_payments_cashier_profile_id_fkey (
          name,
          email
        ),
        fee_invoices (
          id,
          invoice_date,
          students (
            studentid,
            name,
            fathername,
            class_id,
            classes ( name )
          )
        )
      `
      )
      .gte('paid_at', `${startDate}T00:00:00.000Z`)
      .lte('paid_at', `${endDate}T23:59:59.999Z`)
      .order('paid_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    if (receiptsChunk && receiptsChunk.length > 0) {
      allReceipts.push(...receiptsChunk);
      from += pageSize;
      if (receiptsChunk.length < pageSize) {
        fetchMore = false;
      }
    } else {
      fetchMore = false;
    }
  }

  if (!allReceipts || allReceipts.length === 0) {
    throw new Error('No collections found for this date range.');
  }

  // --- 2. Format Date Range string for the header ---
  const startStr = new Date(startDate).toLocaleDateString();
  const endStr = new Date(endDate).toLocaleDateString();
  const dateRangeString = startStr === endStr ? startStr : `${startStr} to ${endStr}`;

  // --- 3. Grouping Logic & Totals Setup ---
  const groupedMap = new Map();
  const feeTypeTotals = {};
  const modeTotals = {};
  const cashierMethodTotals = new Map();
  const paymentMethods = new Set();
  let totalAmount = 0;

  allReceipts.forEach(rcpt => {
    const studentName = rcpt.fee_invoices?.students?.name || 'Unknown';
    const studentId = rcpt.fee_invoices?.students?.studentid || studentName;
    const classData = rcpt.fee_invoices?.students?.classes;
    const studentClass = classData
      ? Array.isArray(classData)
        ? classData[0]?.name
        : classData.name
      : 'N/A';

    const receiptDate = rcpt.paid_at ? new Date(rcpt.paid_at).toLocaleDateString() : 'N/A';
    const description = rcpt.fee_invoice_details?.fee_type || 'General Payment';
    const amount = Number(rcpt.amount) || 0;
    const mode = rcpt.payment_method || 'Cash';
    const methodKey = mode.trim().toUpperCase();
    const cashierName = rcpt.cashier?.name || rcpt.cashier?.email || '---';

    paymentMethods.add(methodKey);
    const cashierTotals = cashierMethodTotals.get(cashierName) || {};
    cashierTotals[methodKey] = (cashierTotals[methodKey] || 0) + amount;
    cashierMethodTotals.set(cashierName, cashierTotals);

    // Track Fee Type Totals (Excluding 'payment mode adjustment' case-insensitively and when payment mode is 'adjustment')
    if (
      description.toLowerCase() !== 'payment mode adjustment' &&
      mode.toLowerCase() !== 'adjustment'
    ) {
      feeTypeTotals[description] = (feeTypeTotals[description] || 0) + amount;
    }

    // Keep separate cashier entries distinct even when a student pays twice on the same day.
    const key = `${studentId}_${receiptDate}_${mode}_${rcpt.cashier_profile_id || 'legacy'}`;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        date: receiptDate,
        name: studentName,
        className: studentClass,
        descriptions: new Set([description]),
        amount: amount,
        mode: mode,
        cashierName,
      });
    } else {
      const existing = groupedMap.get(key);
      existing.amount += amount;
      existing.descriptions.add(description);
    }
  });

  // --- 4. Initialize PDF Document ---
  // Landscape gives the transaction register and reconciliation matrix enough breathing room.
  const doc = new jsPDF('l', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const logo = await loadSchoolLogo();

  // --- 5. Main Table Construction ---
  const tableColumns = [
    'DATE',
    'STUDENT NAME',
    'CLASS',
    'DESCRIPTION',
    'AMOUNT (PKR)',
    'MODE',
    'CASHIER',
  ];
  const tableRows = [];

  // Sort chronologically, then alphabetically by name
  const sortedGroupedData = Array.from(groupedMap.values()).sort((a, b) => {
    return new Date(a.date) - new Date(b.date) || a.name.localeCompare(b.name);
  });

  sortedGroupedData.forEach(group => {
    totalAmount += group.amount;

    // Accumulate mode totals here
    const modeKey = group.mode.toUpperCase();
    modeTotals[modeKey] = (modeTotals[modeKey] || 0) + group.amount;
    tableRows.push([
      group.date,
      group.name,
      group.className,
      Array.from(group.descriptions).join(', '),
      group.amount.toLocaleString(),
      group.mode.toUpperCase(),
      group.cashierName,
    ]);
  });

  const money = value => `PKR ${Number(value || 0).toLocaleString('en-PK')}`;
  const drawMetric = (x, label, value, fill, text = [255, 255, 255]) => {
    doc.setFillColor(...fill);
    doc.roundedRect(x, 78, 172, 38, 7, 7, 'F');
    doc.setTextColor(...text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), x + 11, 91);
    doc.setFontSize(15);
    doc.text(value, x + 11, 107);
  };
  drawMetric(margin, 'Total collection', money(totalAmount), [49, 46, 129]);
  drawMetric(margin + 182, 'Cash received', money(modeTotals.CASH), [14, 116, 144]);
  drawMetric(margin + 364, 'Payment entries', String(allReceipts.length), [30, 64, 175]);
  drawMetric(margin + 546, 'Cashiers', String(cashierMethodTotals.size), [109, 40, 217]);

  // Render Main Data Table
  autoTable(doc, {
    startY: 132,
    head: [tableColumns],
    body: tableRows,
    foot: [
      [
        { content: 'GRAND TOTAL', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: totalAmount.toLocaleString(), styles: { fontStyle: 'bold', halign: 'right' } },
        '',
        '',
      ],
    ],
    showFoot: 'lastPage',
    theme: 'grid',
    rowPageBreak: 'avoid',
    margin: { left: margin, right: margin, top: 85, bottom: 50 },
    headStyles: {
      fillColor: [235, 238, 244],
      textColor: [30, 41, 59],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: { top: 2.8, bottom: 2.8, left: 4, right: 4 },
      lineColor: [203, 213, 225],
      lineWidth: 0.35,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: 40,
      cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
      lineColor: [215, 222, 231],
      lineWidth: 0.35,
      valign: 'middle',
    },
    footStyles: {
      fillColor: [236, 240, 241], // Light grey for grand total
      textColor: [43, 55, 66],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 3,
      lineColor: [203, 213, 225],
      lineWidth: 0.35,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 64 },
      1: { cellWidth: 120 },
      2: { cellWidth: 70 },
      3: { cellWidth: 'auto' },
      4: { halign: 'right', cellWidth: 85, fontStyle: 'bold', textColor: 20 },
      5: { halign: 'center', cellWidth: 66 },
      6: { cellWidth: 105 },
    },
  });

  // --- 6. Summary tables ---
  let finalY = doc.lastAutoTable.finalY;
  let summaryY = finalY + 22;

  // Check if there's enough space for the summary tables, otherwise push to next page
  if (summaryY > pageHeight - 120) {
    doc.addPage();
    summaryY = 85;
  }

  // Section Titles
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(43, 55, 66);
  doc.text('COLLECTION SUMMARY', margin, summaryY);

  // Fee Type Summary Table
  const feeTypeBody = Object.entries(feeTypeTotals).map(([type, sum]) => [
    type.toUpperCase(),
    sum.toLocaleString(),
  ]);

  const modeBody = Object.entries(modeTotals).map(([mode, sum]) => [
    mode.toUpperCase(),
    sum.toLocaleString(),
  ]);

  autoTable(doc, {
    startY: summaryY + 8,
    head: [['FEE TYPE', 'AMOUNT (PKR)', 'PAYMENT MODE', 'AMOUNT (PKR)']],
    body: Array.from({ length: Math.max(feeTypeBody.length, modeBody.length) }, (_, i) => [
      ...(feeTypeBody[i] || ['', '']),
      ...(modeBody[i] || ['', '']),
    ]),
    theme: 'grid',
    tableWidth: pageWidth - margin * 2,
    margin: { left: margin, right: margin, top: 85, bottom: 50 },
    headStyles: {
      fillColor: [235, 238, 244],
      textColor: [43, 55, 66],
      fontStyle: 'bold',
      fontSize: 9,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
      lineColor: [215, 222, 231],
      lineWidth: 0.35,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
  });

  // Cashier reconciliation: each method has its own column so handovers are auditable.
  const methodColumns = Array.from(paymentMethods).sort((a, b) => {
    if (a === 'CASH') return -1;
    if (b === 'CASH') return 1;
    return a.localeCompare(b);
  });
  const cashierBody = Array.from(cashierMethodTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cashier, totals]) => {
      const rowTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
      return [
        cashier,
        ...methodColumns.map(method => Number(totals[method] || 0).toLocaleString()),
        rowTotal.toLocaleString(),
      ];
    });
  const cashierFooter = [
    'TOTAL',
    ...methodColumns.map(method =>
      Array.from(cashierMethodTotals.values())
        .reduce((sum, totals) => sum + Number(totals[method] || 0), 0)
        .toLocaleString()
    ),
    totalAmount.toLocaleString(),
  ];
  let cashierY = doc.lastAutoTable.finalY + 22;
  if (cashierY > pageHeight - 150) {
    doc.addPage();
    cashierY = 82;
  }
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(43, 55, 66);
  doc.text('CASHIER COLLECTION RECONCILIATION', margin, cashierY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Amounts are separated by payment method for a clear cashier handover.',
    margin,
    cashierY + 11
  );
  autoTable(doc, {
    startY: cashierY + 18,
    head: [['CASHIER', ...methodColumns, 'TOTAL (PKR)']],
    body: cashierBody.length ? cashierBody : [['---', ...methodColumns.map(() => '0'), '0']],
    foot: [cashierFooter],
    showFoot: 'lastPage',
    theme: 'grid',
    tableWidth: pageWidth - margin * 2,
    margin: { left: margin, right: margin, top: 85, bottom: 50 },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.7, bottom: 2.7, left: 4, right: 4 },
      lineColor: [199, 210, 254],
      lineWidth: 0.35,
    },
    alternateRowStyles: { fillColor: [238, 242, 255] },
    footStyles: { fillColor: [224, 231, 255], textColor: [30, 64, 175], fontStyle: 'bold' },
    columnStyles: Object.fromEntries(
      methodColumns
        .map((_, index) => [index + 1, { halign: 'right', fontStyle: 'bold' }])
        .concat([[methodColumns.length + 1, { halign: 'right', fontStyle: 'bold' }]])
    ),
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    drawSchoolHeader(doc, {
      logo,
      title: 'FEE COLLECTION REPORT',
      subtitle: `Period: ${dateRangeString}`,
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 20, {
      align: 'right',
    });
  }
  return doc.output('blob');
};
