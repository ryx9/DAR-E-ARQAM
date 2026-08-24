/**
 * printUtils.js
 * High-contrast, large text, dynamically-sized 80mm jsPDF thermal receipt
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ─── Shared Logic & UI Helpers ─────────────────────────── */

export const parseFee = (fee) => {
  try {
    const obj = typeof fee === "string" ? JSON.parse(fee) : fee || {};
    const get = (k1, k2) => Number(obj[k1] ?? obj[k2] ?? (typeof fee === "number" ? fee : 0));
    const [adm, mon, ann, sta] = [get("admission", "admission_fee"), get("monthly", "monthly_fee"), get("annual", "annual_charges"), get("stationery", "stationery_charges")];
    return { admission: adm, monthly: mon, annual: ann, stationery: sta, total: adm + mon + ann + sta };
  } catch {
    return { admission: 0, monthly: 0, annual: 0, stationery: 0, total: Number(fee) || 0 };
  }
};

const openPdf = (doc) => {
  const url = URL.createObjectURL(doc.output("blob"));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

const addHeader = (doc, title, showSchool = false) => {
  let y = 10;
  doc.setTextColor(0, 0, 0); // Pure black
  doc.setFont("helvetica", "bold");

  if (showSchool) {
    doc.setFontSize(14).text("DAR-E-ARQAM SCHOOL", 40, y, { align: "center" });
    y += 7;
  }

  doc.setFontSize(12);
  doc.text(title.toUpperCase(), 40, y, { align: "center" });

  y += 4;
  doc.setDrawColor(0, 0, 0).setLineWidth(0.4).line(4, y, 76, y);

  y += 5;
  const date = new Date().toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  doc.setFontSize(8).setFont("helvetica", "normal").text(`Generated: ${date}`, 76, y, { align: "right" });

  return y + 6;
};

const addGuardianInfo = (doc, g, startY) => {
  // Border only ("S") instead of fill, larger height for bigger text
  doc.setDrawColor(0, 0, 0).setLineWidth(0.3).roundedRect(4, startY, 72, 22, 1, 1, "S");

  doc.setFontSize(9).setFont("helvetica", "bold").text("PARENTS / GUARDIAN", 6, startY + 6);

  // Row 1: Father & Contact
  doc.setFont("helvetica", "normal").text("Father:", 6, startY + 13);
  doc.setFont("helvetica", "bold").text(g?.fathername || "—", 18, startY + 13);

  doc.setFont("helvetica", "normal").text("Mob:", 44, startY + 13);
  doc.setFont("helvetica", "bold").text(g?.mobilenumber || "—", 54, startY + 13);

  // Row 2: Address
  doc.setFont("helvetica", "normal").text("Addr:", 6, startY + 20);
  const addr = g?.address ? (g.address.length > 30 ? g.address.substring(0, 30) + "..." : g.address) : "—";
  doc.setFont("helvetica", "bold").text(addr, 18, startY + 20);

  return startY + 28;
};

// Larger text, no backgrounds, pure black lines
const tableTheme = {
  theme: "grid",
  margin: { left: 4, right: 4 },
  styles: { font: "helvetica", fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [0, 0, 0], fillColor: [255, 255, 255] },
  headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold" },
  alternateRowStyles: { fillColor: [255, 255, 255] }
};

/* ─── Fee Quotation Slip (80mm) ─────────────────────────── */

export const printFeeQuote = (siblings) => {
  if (!siblings?.length) return;

  // Render function that draws content and returns the final Y coordinate (height)
  const drawContent = (doc) => {
    let y = addGuardianInfo(doc, siblings[0], addHeader(doc, "Inquiry Slip"));

    siblings.forEach((s) => {
      doc.setFontSize(10).setFont("helvetica", "bold").text(s.name, 4, y + 4);
      doc.setFont("helvetica", "normal").text(` | Class: ${s.class}`, 4 + doc.getTextWidth(s.name), y + 4);

      const fee = parseFee(s.quoted_fee);

      autoTable(doc, {
        ...tableTheme,
        startY: y + 7,
        head: [["Description", "PKR"]],
        body: [
          ["Admission Fee", fee.admission.toLocaleString()],
          ["Monthly Fee", fee.monthly.toLocaleString()],
          ["Annual Charges", fee.annual.toLocaleString()],
          ["Stationery Charges", fee.stationery.toLocaleString()],
          ["Total Payable", `PKR ${fee.total.toLocaleString()}`],
        ],
        columnStyles: { 0: { halign: "left" }, 1: { halign: "right", fontStyle: "bold" } },
        didParseCell: (data) => {
          if (data.row.index === 4) { // Total Row
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.lineWidth = 0.6; // Thicker border instead of background
          }
        }
      });

      y = doc.lastAutoTable.finalY + 8;
    });

    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("Thank you for your inquiry.", 40, y + 4, { align: "center" });

    // Return final calculated height with a 10mm buffer for the printer cutter
    return y + 14;
  };

  // PASS 1: Dry run to calculate exact dynamic height
  const dummyDoc = new jsPDF({ unit: "mm", format: [80, 2000] });
  const exactHeight = drawContent(dummyDoc);

  // PASS 2: Generate actual perfectly sized PDF
  const doc = new jsPDF({ unit: "mm", format: [80, exactHeight] });
  drawContent(doc);

  openPdf(doc);
};

/* ─── Test Schedule Slip (80mm) ─────────────────────────── */

export const printTestSlip = (siblings) => {
  if (!siblings?.length) return;

  const drawContent = (doc) => {
    let y = addGuardianInfo(doc, siblings[0], addHeader(doc, "Test Schedule", true));

    siblings.forEach((s) => {
      doc.setFontSize(10).setFont("helvetica", "bold").text(s.name, 4, y + 4);
      doc.setFont("helvetica", "normal").text(` | Class: ${s.class}`, 4 + doc.getTextWidth(s.name), y + 4);

      const testDate = s.test_date
        ? new Date(s.test_date).toLocaleString("en-PK", { year: "2-digit", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "Not Scheduled";

      autoTable(doc, {
        ...tableTheme,
        startY: y + 7,
        head: [["Detail", "Information"]],
        body: [
          ["Prev. School", s.previous_school || "—"],
          ["Session", `${s.session || ""} ${s.year || ""}`.trim()],
          ["Test Date", testDate],
        ],
        columnStyles: { 0: { halign: "left", cellWidth: 26, fontStyle: "bold" }, 1: { halign: "left" } }
      });

      y = doc.lastAutoTable.finalY + 8;
    });

    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text("*** Bring this slip on test day ***", 40, y + 4, { align: "center" });

    return y + 14; // Return final height
  };

  // PASS 1: Dry run to calculate exact dynamic height
  const dummyDoc = new jsPDF({ unit: "mm", format: [80, 2000] });
  const exactHeight = drawContent(dummyDoc);

  // PASS 2: Generate actual perfectly sized PDF
  const doc = new jsPDF({ unit: "mm", format: [80, exactHeight] });
  drawContent(doc);

  openPdf(doc);
};
