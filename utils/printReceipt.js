import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Generates and opens a PDF receipt optimized for smaller 58mm POS Thermal Printers.
 */
export const printReceipt = ({ student, invoiceId, items, totalPaidNow, balanceAfterPayment, receiptDate }) => {
  // 58mm width is the standard small POS printer size. 
  // Height is set to 120mm; adjust if you have a very long list of fee items.
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [58, 120]
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 2; // Ultra-tight margins for 58mm paper
  let currentY = 5; // Vertical tracker

  // --- HELPER FUNCTIONS ---
  const centerText = (text, y, size, isBold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.text(text, pageWidth / 2, y, { align: "center" });
  };

  const printRow = (label, value, y, isBold = false) => {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.text(String(value), pageWidth - margin, y, { align: "right" });
  };

  const drawDashedLine = (y) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setLineDashPattern([], 0); // Reset dash pattern
  };

  // --- 1. HEADER ---
  centerText("DAR-E-ARQAM SCHOOL", currentY, 9, true);
  currentY += 3.5;
  centerText("Q MODEL TOWN CAMPUS", currentY, 7);
  currentY += 3;
  centerText("Phone: +92 323 4447292", currentY, 7);
  currentY += 4;

  centerText("PAYMENT RECEIPT", currentY, 8, true);
  currentY += 2;
  drawDashedLine(currentY);
  currentY += 3.5;

  // --- 2. METADATA ---
  const displayDate = new Date(receiptDate || Date.now()).toLocaleDateString("en-PK", {
    day: "2-digit", month: "short", year: "numeric"
  });

  const receiptNumber = `#${invoiceId}-${Date.now().toString().slice(-4)}`;

  printRow("Date:", displayDate, currentY); currentY += 3.5;
  printRow("Receipt:", receiptNumber, currentY); currentY += 3.5;
  printRow("Student:", student?.name || 'N/A', currentY); currentY += 3.5;
  printRow("Father:", student?.fathername || 'N/A', currentY); currentY += 3.5;
  printRow("Roll No:", student?.studentid || 'N/A', currentY); currentY += 3.5;

  drawDashedLine(currentY);
  currentY += 1.5;

  // --- 3. FEE TABLE ---
  const filteredItems = items.filter(item => item.payingNow > 0);
  const receiptRows = filteredItems.map(item => [
    item.fee_type,
    item.payingNow.toLocaleString()
  ]);

  if (receiptRows.length === 0) {
    receiptRows.push(["No payment", "0"]);
  }

  autoTable(doc, {
    startY: currentY,
    head: [['ITEM', 'AMT']], // Abbreviated to save space
    body: receiptRows,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: {
      font: 'helvetica',
      fontSize: 7, // Smaller font for 58mm
      cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
      textColor: [0, 0, 0]
    },
    headStyles: {
      fontStyle: 'bold',
      lineWidth: { bottom: 0.2 },
      lineColor: [0, 0, 0]
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 15, halign: 'right' } // Shorter width for amount column
    },
    didParseCell: function (data) {
      if (data.section === 'head' && data.column.index > 0) {
        data.cell.styles.halign = 'right';
      }
    }
  });

  currentY = doc.lastAutoTable.finalY + 3;
  drawDashedLine(currentY);
  currentY += 4;

  // --- 4. TOTALS & BALANCE ---
  printRow("TOTAL RECEIVED:", totalPaidNow.toLocaleString(), currentY, true);
  currentY += 4;
  printRow("BALANCE:", balanceAfterPayment.toLocaleString(), currentY, true);
  currentY += 5;

  // --- 5. PAID IN FULL BADGE ---
  if (balanceAfterPayment === 0) {
    centerText("*** PAID IN FULL ***", currentY, 8, true);
    currentY += 5;
  }

  // --- 6. FOOTER ---
  centerText("Keep this receipt for your records.", currentY, 6);
  currentY += 3;
  centerText("System generated - no signature required.", currentY, 6);

  // --- 7. OPEN IN NEW TAB ---
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
};
