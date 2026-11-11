import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "./supabaseClient";

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
    theme: "striped",
    margin: { left: margin, right: margin, bottom: 50 },
    headStyles: {
      fillColor: [43, 55, 66], // Modern dark slate
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 6,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: 40,
      cellPadding: 5,
    },
    footStyles: {
      fillColor: [236, 240, 241], // Light grey for grand total
      textColor: [43, 55, 66],
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 6,
    },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 100 },
      2: { cellWidth: 60 },
      3: { cellWidth: "auto" },
      4: { halign: "right", cellWidth: 80, fontStyle: "bold", textColor: 20 },
      5: { halign: "center", cellWidth: 50 },
    },
    didDrawPage: function (data) {
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `PAGE ${data.pageNumber} OF ${doc.internal.getNumberOfPages()}`,
        pageWidth / 2,
        pageHeight - 20,
        { align: "center" }
      );
    }
  });

  // --- 6. Render Separate Summary Tables (Side by Side) ---
  let finalY = doc.lastAutoTable.finalY;
  let summaryY = finalY + 30;

  // Check if there's enough space for the summary tables, otherwise push to next page
  if (summaryY > pageHeight - 120) {
    doc.addPage();
    summaryY = 50;
  }

  // Section Titles
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(43, 55, 66);
  doc.text("SUMMARY BY FEE TYPE", margin, summaryY);
  doc.text("SUMMARY BY PAYMENT MODE", margin + 260, summaryY);

  // Fee Type Summary Table
  const feeTypeBody = Object.entries(feeTypeTotals).map(([type, sum]) => [
    type.toUpperCase(),
    sum.toLocaleString()
  ]);

  autoTable(doc, {
    startY: summaryY + 10,
    head: [["FEE TYPE", "AMOUNT (PKR)"]],
    body: feeTypeBody,
    theme: "grid",
    tableWidth: 230,
    margin: { left: margin },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [43, 55, 66],
      fontStyle: "bold",
      fontSize: 8
    },
    bodyStyles: { fontSize: 8, textColor: 50 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } }
  });

  // Payment Mode Summary Table (Rendered next to Fee Type table)
  const modeBody = Object.entries(modeTotals).map(([mode, sum]) => [
    mode.toUpperCase(),
    sum.toLocaleString()
  ]);

  autoTable(doc, {
    startY: summaryY + 10,
    head: [["PAYMENT MODE", "AMOUNT (PKR)"]],
    body: modeBody,
    theme: "grid",
    tableWidth: 190,
    margin: { left: margin + 260 },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [43, 55, 66],
      fontStyle: "bold",
      fontSize: 8
    },
    bodyStyles: { fontSize: 8, textColor: 50 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } }
  });

  return doc.output("blob");
};
