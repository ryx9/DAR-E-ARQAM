import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Generates and automatically prints a single continuous receipt for 80mm POS Printers.
 */
export const printReceipt = ({ student, invoiceId, items, totalPaidNow, balanceAfterPayment, receiptDate }) => {
  // 1. DYNAMIC HEIGHT CALCULATION
  const filteredItems = items.filter(item => item.payingNow > 0);
  const itemCount = Math.max(filteredItems.length, 1);

  // Height estimates in mm for each receipt component
  const headerHeight = 28;
  const metadataHeight = 25;
  const tableHeaderHeight = 7;
  const tableRowHeight = 6;
  const totalsHeight = balanceAfterPayment === 0 ? 25 : 18;
  const footerHeight = 12;
  const bottomFeedPadding = 15; // Extra feed margin so POS cutter doesn't clip text

  const totalHeight = headerHeight + metadataHeight + tableHeaderHeight + (itemCount * tableRowHeight) + totalsHeight + footerHeight + bottomFeedPadding;

  // 2. INITIALIZE DYNAMIC SIZED PDF
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, totalHeight]
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 80mm
  const margin = 4;
  let currentY = 8;

  // --- HELPER FUNCTIONS ---
  const centerText = (text, y, size, isBold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    const textWidth = doc.getTextWidth(text);
    doc.text(text, (pageWidth - textWidth) / 2, y);
  };

  const printRow = (label, value, y, isBold = false, fontSize = 9) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);

    doc.setFont("helvetica", isBold ? "bold" : "normal");
    const valStr = String(value);
    const textWidth = doc.getTextWidth(valStr);
    const rightX = pageWidth - margin - textWidth;
    doc.text(valStr, rightX, y);
  };

  const drawDashedLine = (y) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setLineDashPattern([], 0);
  };

  // --- HEADER ---
  centerText("DAR-E-ARQAM SCHOOL", currentY, 12, true);
  currentY += 5;
  centerText("Q MODEL TOWN CAMPUS", currentY, 10);
  currentY += 4.5;
  centerText("Phone: +92 323 4447292", currentY, 9);
  currentY += 6;

  centerText("PAYMENT RECEIPT", currentY, 10, true);
  currentY += 3;
  drawDashedLine(currentY);
  currentY += 5;

  // --- METADATA ---
  const displayDate = new Date(receiptDate || Date.now()).toLocaleDateString("en-PK", {
    day: "2-digit", month: "short", year: "numeric"
  });
  const receiptNumber = `#${invoiceId}-${Date.now().toString().slice(-4)}`;

  printRow("Date:", displayDate, currentY); currentY += 4.5;
  printRow("Receipt:", receiptNumber, currentY); currentY += 4.5;
  printRow("Student:", student?.name || 'N/A', currentY); currentY += 4.5;
  printRow("Father:", student?.fathername || 'N/A', currentY); currentY += 4.5;
  printRow("Roll No:", student?.studentid || 'N/A', currentY); currentY += 4.5;

  drawDashedLine(currentY);
  currentY += 2;

  // --- FEE TABLE ---
  const receiptRows = filteredItems.map(item => [
    item.fee_type,
    item.payingNow.toLocaleString()
  ]);

  if (receiptRows.length === 0) {
    receiptRows.push(["No payment", "0"]);
  }

  autoTable(doc, {
    startY: currentY,
    head: [['DESCRIPTION', 'AMOUNT']],
    body: receiptRows,
    theme: 'plain',
    tableWidth: pageWidth - (margin * 2),
    margin: { left: margin, right: margin },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 0 },
      textColor: [0, 0, 0]
    },
    headStyles: {
      fontStyle: 'bold',
      lineWidth: { bottom: 0.3 },
      lineColor: [0, 0, 0]
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 25, halign: 'right' }
    },
    didParseCell: function (data) {
      if (data.section === 'head' && data.column.index > 0) {
        data.cell.styles.halign = 'right';
      }
    }
  });

  currentY = doc.lastAutoTable.finalY + 4;
  drawDashedLine(currentY);
  currentY += 6;

  // --- TOTALS & BALANCE ---
  printRow("TOTAL RECEIVED:", totalPaidNow.toLocaleString(), currentY, true, 10);
  currentY += 6;
  printRow("BALANCE:", balanceAfterPayment.toLocaleString(), currentY, true, 10);
  currentY += 7;

  if (balanceAfterPayment === 0) {
    centerText("*** PAID IN FULL ***", currentY, 11, true);
    currentY += 7;
  }

  // --- FOOTER ---
  centerText("Keep this receipt for your records.", currentY, 8);
  currentY += 4;
  centerText("System generated - no signature required.", currentY, 8);

  // --- PRINT EXECUTION ---
  doc.autoPrint();
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);

  let iframe = document.getElementById("receipt-print-iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "receipt-print-iframe";
    iframe.style.display = "none";
    document.body.appendChild(iframe);
  }

  iframe.src = pdfUrl;
};
