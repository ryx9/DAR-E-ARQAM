import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./supabaseClient";
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
      .from("fee_payments")
      .select(`
        *,
        fee_invoice_details (
          fee_type
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
      `)
      .gte("paid_at", `${startDate}T00:00:00.000Z`)
      .lte("paid_at", `${endDate}T23:59:59.999Z`)
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
    throw new Error("No collections found for this date range.");
  }

  // --- 2. Format Date Range string for the header ---
  const startStr = new Date(startDate).toLocaleDateString();
  const endStr = new Date(endDate).toLocaleDateString();
  const dateRangeString = startStr === endStr ? startStr : `${startStr} to ${endStr}`;

  // --- 3. Grouping Logic & Totals Setup ---
  const groupedMap = new Map();
  const feeTypeTotals = {}; // Tracks fee type totals
  const modeTotals = {};    // Tracks mode totals
  let totalAmount = 0;

  allReceipts.forEach((rcpt) => {
    const studentName = rcpt.fee_invoices?.students?.name || "Unknown";
    const studentId = rcpt.fee_invoices?.students?.studentid || studentName;
    const classData = rcpt.fee_invoices?.students?.classes;
    const studentClass = classData
      ? (Array.isArray(classData) ? classData[0]?.name : classData.name)
      : "N/A";

    const receiptDate = rcpt.paid_at ? new Date(rcpt.paid_at).toLocaleDateString() : "N/A";
    const description = rcpt.fee_invoice_details?.fee_type || "General Payment";
    const amount = Number(rcpt.amount) || 0;
    const mode = rcpt.payment_method || "Cash";

    // Track Fee Type Totals (Excluding 'payment mode adjustment' case-insensitively and when payment mode is 'adjustment')
    if (description.toLowerCase() !== "payment mode adjustment" && mode.toLowerCase() !== "adjustment") {
      feeTypeTotals[description] = (feeTypeTotals[description] || 0) + amount;
    }

    // Key includes mode so different payment modes are never merged
    const key = `${studentId}_${receiptDate}_${mode}`;

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        date: receiptDate,
        name: studentName,
        className: studentClass,
        descriptions: new Set([description]),
        amount: amount,
        mode: mode
      });
    } else {
      const existing = groupedMap.get(key);
      existing.amount += amount;
      existing.descriptions.add(description);
    }
  });

  // --- 4. Initialize PDF Document ---
  const doc = new jsPDF("p", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const logo = await loadSchoolLogo();

  // Header Section
  doc.setTextColor(43, 55, 66); // Dark sleek color
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("DAR-E-ARQAM SCHOOL", margin, 45);

  doc.setFontSize(10);
  doc.text("FEE COLLECTION REPORT", pageWidth - margin, 45, { align: "right" });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(1);
  doc.line(margin, 55, pageWidth - margin, 55);

  // Meta Information
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);

  doc.text(`DATE RANGE: ${dateRangeString.toUpperCase()}`, margin, 70);

  const generatedTime = new Date().toLocaleString("en-US", {
    dateStyle: "medium", timeStyle: "short"
  });
  doc.text(`GENERATED: ${generatedTime.toUpperCase()}`, pageWidth - margin, 70, { align: "right" });

  // --- 5. Main Table Construction ---
  const tableColumns = ["DATE", "STUDENT NAME", "CLASS", "DESCRIPTION", "AMOUNT (PKR)", "MODE"];
  const tableRows = [];

  // Sort chronologically, then alphabetically by name
  const sortedGroupedData = Array.from(groupedMap.values()).sort((a, b) => {
    return new Date(a.date) - new Date(b.date) || a.name.localeCompare(b.name);
  });

  sortedGroupedData.forEach((group) => {
    totalAmount += group.amount;

    // Accumulate mode totals here
    const modeKey = group.mode.toUpperCase();
    modeTotals[modeKey] = (modeTotals[modeKey] || 0) + group.amount;

    tableRows.push([
      group.date,
      group.name,
      group.className,
      Array.from(group.descriptions).join(", "),
      group.amount.toLocaleString(),
      group.mode.toUpperCase()
    ]);
  });

  // Render Main Data Table
  autoTable(doc, {
    startY: 85,
    head: [tableColumns],
    body: tableRows,
    foot: [[
      { content: "GRAND TOTAL", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
      { content: totalAmount.toLocaleString(), styles: { fontStyle: "bold", halign: "right" } },
      ""
    ]],
    showFoot: "lastPage",
    theme: "grid",
    rowPageBreak: "avoid",
    margin: { left: margin, right: margin, top: 85, bottom: 50 },
    headStyles: {
      fillColor: [235, 238, 244],
      textColor: [30, 41, 59],
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineColor: [203, 213, 225],
      lineWidth: 0.35,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: 40,
      cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
      lineColor: [215, 222, 231],
      lineWidth: 0.35,
      valign: "middle",
    },
    footStyles: {
      fillColor: [236, 240, 241], // Light grey for grand total
      textColor: [43, 55, 66],
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: [203, 213, 225],
      lineWidth: 0.35,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 105 },
      2: { cellWidth: 50 },
      3: { cellWidth: "auto" },
      4: { halign: "right", cellWidth: 70, fontStyle: "bold", textColor: 20 },
      5: { halign: "center", cellWidth: 55 },
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
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(43, 55, 66);
  doc.text("COLLECTION SUMMARY", margin, summaryY);

  // Fee Type Summary Table
  const feeTypeBody = Object.entries(feeTypeTotals).map(([type, sum]) => [
    type.toUpperCase(),
    sum.toLocaleString()
  ]);

  const modeBody = Object.entries(modeTotals).map(([mode, sum]) => [
    mode.toUpperCase(),
    sum.toLocaleString()
  ]);

  autoTable(doc, {
    startY: summaryY + 8,
    head: [["FEE TYPE", "AMOUNT (PKR)", "PAYMENT MODE", "AMOUNT (PKR)"]],
    body: Array.from({ length: Math.max(feeTypeBody.length, modeBody.length) }, (_, i) => [
      ...(feeTypeBody[i] || ['', '']), ...(modeBody[i] || ['', '']),
    ]),
    theme: "grid",
    tableWidth: pageWidth - margin * 2,
    margin: { left: margin, right: margin, top: 85, bottom: 50 },
    headStyles: {
      fillColor: [235, 238, 244],
      textColor: [43, 55, 66],
      fontStyle: "bold",
      fontSize: 8
    },
    styles: { fontSize: 7.5, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 }, lineColor: [215, 222, 231], lineWidth: 0.35, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 3: { halign: "right", fontStyle: "bold" } }
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    drawSchoolHeader(doc, { logo, title: 'FEE COLLECTION REPORT', subtitle: `Period: ${dateRangeString}` });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
  }
  return doc.output("blob");
};
