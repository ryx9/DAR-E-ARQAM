import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawSchoolHeader, loadSchoolLogo } from './pdfBranding';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt   = (v) => (v && v > 0 ? v.toLocaleString() : "—");
const pct   = (part, total) => (total > 0 ? ((part / total) * 100).toFixed(1) : "0.0");
const today = () => new Date().toLocaleDateString("en-PK").replace(/\//g, "-");

// ─── Group & sort students by class ─────────────────────────────────────────

const groupByClass = (students) => {
  const map = {};
  for (const s of students) {
    const classId = s.class_id ?? s.classId ?? null;
    const key = classId != null ? `id:${classId}` : `name:${s.className || "Unknown"}`;
    if (!map[key]) map[key] = { classId, className: s.className || "Unknown", students: [] };
    map[key].students.push(s);
  }
  return Object.values(map).sort((dA, dB) => {
    if (dA.classId !== null && dB.classId !== null)
      return String(dA.classId).localeCompare(String(dB.classId), undefined, { numeric: true });
    if (dA.classId !== null) return -1;
    if (dB.classId !== null) return 1;
    return dA.className.localeCompare(dB.className, undefined, { numeric: true, sensitivity: "base" });
  }).map(group => [group.className, group]);
};

// ─── Aggregate totals ────────────────────────────────────────────────────────

const totals = (list) => ({
  currentTuition:    list.reduce((a, b) => a + (b.currentTuition || 0), 0),
  prevTuition:       list.reduce((a, b) => a + (b.prevTuition || 0), 0),
  annualCharges:     list.reduce((a, b) => a + (b.annualCharges || 0), 0),
  stationeryCharges: list.reduce((a, b) => a + (b.stationeryCharges || 0), 0),
  arrears:           list.reduce((a, b) => a + (b.arrears || 0), 0),
  totalPending:      list.reduce((a, b) => a + (b.totalPending || 0), 0),
  received:          list.reduce((a, b) => a + (b.amountReceivedThisMonth || 0), 0),
});

// ─── Shared cell styles ──────────────────────────────────────────────────────

const S = {
  classHead: { fillColor: [40, 38, 80],    textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
  subtotal:  { fillColor: [240, 240, 240],  textColor: [0, 0, 0],       fontStyle: "bold" },
  grandTotal:{ fillColor: [40, 38, 80],     textColor: [255, 255, 255], fontStyle: "bold" },
  accent:    { fillColor: [220, 220, 220],  textColor: [0, 0, 0],       fontStyle: "bold" },
};

// ─── Draw a thin horizontal rule ────────────────────────────────────────────

const rule = (doc, y, color = [180, 180, 180]) => {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.line(14, y, 283, y);
};

// ─── Page header (repeatable) ────────────────────────────────────────────────

const drawPageHeader = (doc, startDate, endDate) => {
  // Left: school name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("DAR-E-ARQAM SCHOOL", 14, 13);

  // Right: report title
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text("DEFAULTER REPORT", 283, 13, { align: "right" });

  // Sub-line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  const range = startDate && endDate ? `${startDate} – ${endDate}` : today();
  doc.text(`Generated ${today()}   •   Period: ${range}`, 14, 19);

  rule(doc, 22, [0, 0, 0]);
};

// ════════════════════════════════════════════════════════════════════════════
//  PDF EXPORT
// ════════════════════════════════════════════════════════════════════════════

export const exportToPDF = async (defaulters, startDate, endDate) => {
  if (!defaulters?.length) throw new Error("No data to export.");

  const doc     = new jsPDF("landscape");
  const grouped = groupByClass(defaulters);
  const gt      = totals(defaulters);
  const DATE    = today();
  const TOT_PG  = "{total_pages_count_string}";
  const logo = await loadSchoolLogo();

  drawPageHeader(doc, startDate, endDate);

  // ── Column definitions ────────────────────────────────────────────────────

  const COLS = [
    "Student / Father / ID",
    "Cls",
    "Curr Tuition",
    "Prev Tuition",
    "Annual",
    "Stn'ry",
    "Arrears",
    "Total Pending",
    "Rcvd",
  ];

  // ── Build rows ────────────────────────────────────────────────────────────

  const rows = [];

  for (const [className, { students }] of grouped) {
    // Class banner
    rows.push([{
      content: `${className}  ·  ${students.length} student${students.length !== 1 ? "s" : ""}`,
      colSpan: 9,
      styles: S.classHead,
    }]);

    // Students
    for (const s of students) {
      rows.push([
        { content: `${s.name || "N/A"}\n${s.fathername || "N/A"}  ·  ${s.studentid || "N/A"}`, styles: { fontSize: 7.5 } },
        s.className || "—",
        fmt(s.currentTuition),
        fmt(s.prevTuition),
        fmt(s.annualCharges),
        fmt(s.stationeryCharges),
        fmt(s.arrears),
        fmt(s.totalPending),
        fmt(s.amountReceivedThisMonth),
      ]);
    }

    // Subtotal
    const ct = totals(students);
    rows.push([
      { content: `Subtotal — ${className}`, colSpan: 2, styles: { ...S.subtotal, halign: "right" } },
      { content: fmt(ct.currentTuition),    styles: S.subtotal },
      { content: fmt(ct.prevTuition),       styles: S.subtotal },
      { content: fmt(ct.annualCharges),     styles: S.subtotal },
      { content: fmt(ct.stationeryCharges), styles: S.subtotal },
      { content: fmt(ct.arrears),           styles: S.subtotal },
      { content: fmt(ct.totalPending),      styles: { ...S.subtotal, fontStyle: "bold" } },
      { content: fmt(ct.received),          styles: S.subtotal },
    ]);
  }

  // Grand total
  rows.push([
    { content: `GRAND TOTAL  (${defaulters.length} students)`, colSpan: 2, styles: { ...S.grandTotal, halign: "right" } },
    { content: fmt(gt.currentTuition),    styles: S.grandTotal },
    { content: fmt(gt.prevTuition),       styles: S.grandTotal },
    { content: fmt(gt.annualCharges),     styles: S.grandTotal },
    { content: fmt(gt.stationeryCharges), styles: S.grandTotal },
    { content: fmt(gt.arrears),           styles: S.grandTotal },
    { content: fmt(gt.totalPending),      styles: { ...S.grandTotal } },
    { content: fmt(gt.received),          styles: S.grandTotal },
  ]);

  // ── AutoTable ─────────────────────────────────────────────────────────────

  autoTable(doc, {
    head: [COLS],
    body: rows,
    startY: 26,
    theme: "grid",
    headStyles: {
      fillColor: [235, 238, 244],
      textColor: [30, 41, 59],
      fontSize: 8,
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
      valign: "middle",
      lineColor: [180, 180, 180],
      lineWidth: 0.1,
      textColor: [20, 20, 20],
    },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 14, halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right", fontStyle: "bold" },
      8: { halign: "right" },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: 14, right: 14, top: 26 },
    didDrawPage: ({ pageNumber }) => {
      // Re-draw header on continuation pages
      if (doc.internal.getCurrentPageInfo().pageNumber > 1)
        drawPageHeader(doc, startDate, endDate);

      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${TOT_PG}`,
        283, 202, { align: "right" }
      );
    },
  });

  // ════════════════════════════════════════════════════════════════════════
  //  ANALYSIS PAGE — compact, smart, non-redundant
  // ════════════════════════════════════════════════════════════════════════

  doc.addPage();
  drawPageHeader(doc, startDate, endDate);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text("Fee Recovery Analysis", 14, 30);

  // ── KPI bar ──────────────────────────────────────────────────────────────
  // Four key numbers in a row: Total Pending | Collected | Recovery % | Chronic Students

  const chronicCount = defaulters.filter(s =>
    s.totalPending > 0 && (((s.arrears || 0) + (s.prevTuition || 0)) / s.totalPending) >= 0.5
  ).length;

  const recoveryRate = pct(gt.received, gt.totalPending + gt.received);

  const kpis = [
    { label: "Total Pending",  value: `PKR ${gt.totalPending.toLocaleString()}` },
    { label: "Collected",      value: `PKR ${gt.received.toLocaleString()}` },
    { label: "Recovery Rate",  value: `${recoveryRate}%` },
    { label: "Chronic Students", value: `${chronicCount}` },
  ];

  const kpiBoxW = 63, kpiBoxH = 14, kpiStartX = 14, kpiY = 34;
  kpis.forEach((k, i) => {
    const x = kpiStartX + i * (kpiBoxW + 3);
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, kpiY, kpiBoxW, kpiBoxH, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(k.value, x + kpiBoxW / 2, kpiY + 6, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(k.label, x + kpiBoxW / 2, kpiY + 11, { align: "center" });
  });

  // ── 1. Fee Component Breakdown ───────────────────────────────────────────

  const components = [
    { label: "Current Month Tuition",  value: gt.currentTuition    },
    { label: "Prev Month Tuition",     value: gt.prevTuition       },
    { label: "Annual / Reg. Charges",  value: gt.annualCharges     },
    { label: "Stationery",             value: gt.stationeryCharges },
    { label: "Historical Arrears",     value: gt.arrears           },
  ].filter(c => c.value > 0).sort((a, b) => b.value - a.value);

  const breakdownRows = [
    ...components.map(c => [
      c.label,
      { content: c.value.toLocaleString(), styles: { halign: "right" } },
      { content: `${pct(c.value, gt.totalPending)}%`, styles: { halign: "right" } },
    ]),
    [
      { content: "Total Pending", styles: S.accent },
      { content: gt.totalPending.toLocaleString(), styles: { ...S.accent, halign: "right" } },
      { content: "100%", styles: { ...S.accent, halign: "right" } },
    ],
  ];

  const section1Y = kpiY + kpiBoxH + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Pending by Fee Component", 14, section1Y);

  autoTable(doc, {
    head: [["Component", "PKR", "Share"]],
    body: breakdownRows,
    startY: section1Y + 3,
    theme: "grid",
    headStyles: { fillColor: [235, 238, 244], textColor: [30, 41, 59], fontSize: 8, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 2, textColor: [20, 20, 20] },
    margin: { left: 14, right: 14 },
    tableWidth: 130,
  });

  // ── 2. Class Risk Table ───────────────────────────────────────────────────

  const classSummary = grouped.map(([name, { students }]) => {
    const ct  = totals(students);
    const chronicPct = parseFloat(pct(ct.arrears + ct.prevTuition, ct.totalPending));
    return { name, count: students.length, ...ct, chronicPct };
  }).sort((a, b) => b.totalPending - a.totalPending);

  const riskRows = classSummary.map((c, i) => [
    `${i + 1}. ${c.name}`,
    { content: c.count,                        styles: { halign: "center" } },
    { content: c.totalPending.toLocaleString(), styles: { halign: "right", fontStyle: "bold" } },
    { content: c.arrears.toLocaleString(),      styles: { halign: "right" } },
    { content: c.prevTuition.toLocaleString(),  styles: { halign: "right" } },
    { content: `${c.chronicPct}%`,              styles: { halign: "center" } },
    {
      content: c.chronicPct >= 50 ? "⚠ Chronic" : c.chronicPct >= 25 ? "◉ Moderate" : "✓ Low",
      styles: {
        halign: "center",
        textColor:
          c.chronicPct >= 50 ? [180, 0, 0] :
          c.chronicPct >= 25 ? [140, 90, 0] : [0, 120, 0],
      },
    },
  ]);

  const section2Y = doc.lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Class Risk Ranking  (by Total Pending)", 14, section2Y);

  autoTable(doc, {
    head: [["Class", "#", "Total Pending", "Arrears", "Prev Tuit.", "Chronic %*", "Risk"]],
    body: riskRows,
    startY: section2Y + 3,
    theme: "grid",
    headStyles: { fillColor: [235, 238, 244], textColor: [30, 41, 59], fontSize: 8, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 2, textColor: [20, 20, 20] },
    margin: { left: 14, right: 14 },
  });

  // ── 3. Actionable Insights (max 4, non-redundant) ────────────────────────

  const insightsY = doc.lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Action Points", 14, insightsY);

  const top       = components[0];
  const worstCls  = classSummary[0];
  const chronic   = classSummary.filter(c => c.chronicPct >= 50);

  // Build only distinct, high-signal insights
  const insights = [];

  // 1. Top recovery target
  if (top) {
    insights.push(
      `Priority collection target: "${top.label}" accounts for ${pct(top.value, gt.totalPending)}% of all pending ` +
      `(PKR ${top.value.toLocaleString()}). Clearing this alone would halve the backlog.`
    );
  }

  // 2. Chronic debt signal — only if meaningful
  if (gt.arrears + gt.prevTuition > 0) {
    const repeaterPct = pct(gt.arrears + gt.prevTuition, gt.totalPending);
    insights.push(
      `${repeaterPct}% of pending is repeat debt (arrears + carried-over tuition). ` +
      chronic.length > 0
        ? `${chronic.length} class(es) — ${chronic.map(c => c.name).join(", ")} — show chronic non-payment patterns; schedule payment plan meetings.`
        : "Consider structured instalment plans for long-standing balances."
    );
  }

  // 3. Recovery efficiency
  if (gt.received > 0) {
    insights.push(
      `${recoveryRate}% collected this period. ` +
      (parseFloat(recoveryRate) < 50
        ? "Below 50% — escalate follow-up for high-balance students first."
        : "Above 50% — focus remaining effort on the chronic segment.")
    );
  }

  // 4. Worst class — only if not already obvious from insight #1
  if (worstCls) {
    insights.push(
      `${worstCls.name} carries the highest total (PKR ${worstCls.totalPending.toLocaleString()}, ` +
      `${worstCls.count} students). Address this class-group first for the fastest impact.`
    );
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);

  let lY = insightsY + 6;
  insights.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}.  ${line}`, 265);
    doc.text(wrapped, 14, lY);
    lY += wrapped.length * 4.8 + 1.5;
  });

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("* Chronic % = (Arrears + Prev Tuition) ÷ Total Pending", 14, lY + 2);

  // ── Finalize ──────────────────────────────────────────────────────────────

  if (typeof doc.putTotalPages === "function") doc.putTotalPages(TOT_PG);
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    drawSchoolHeader(doc, { logo, title: 'DEFAULTER REPORT', subtitle: `Period: ${startDate || '-'} to ${endDate || '-'}` });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} of ${pageCount}`, 283, 202, { align: 'right' });
  }
  doc.save(`Defaulter_Report_${DATE}.pdf`);
  return true;
};

// ════════════════════════════════════════════════════════════════════════════
//  CSV EXPORT  (unchanged logic, cleaned up)
// ════════════════════════════════════════════════════════════════════════════

export const exportToCSV = async (defaulters) => {
  if (!defaulters?.length) throw new Error("No data to export.");

  const HEADERS = [
    "Student ID","Name","Father Name","Class",
    "Curr Tuition","Prev Tuition","Annual Charges",
    "Stationery","Arrears","Total Pending","Received This Month",
  ];

  const grouped = groupByClass(defaulters);
  const rows    = [];

  for (const [className, { students }] of grouped) {
    rows.push([`## Class: ${className}`, ...Array(10).fill("")]);

    for (const d of students) {
      rows.push([
        d.studentid || "",
        `"${(d.name       || "").replace(/"/g, '""')}"`,
        `"${(d.fathername || "").replace(/"/g, '""')}"`,
        `"${(d.className  || "").replace(/"/g, '""')}"`,
        d.currentTuition    || 0,
        d.prevTuition       || 0,
        d.annualCharges     || 0,
        d.stationeryCharges || 0,
        d.arrears           || 0,
        d.totalPending      || 0,
        d.amountReceivedThisMonth || 0,
      ]);
    }

    const ct = totals(students);
    rows.push([`Subtotal — ${className}`, "", "", "",
      ct.currentTuition, ct.prevTuition, ct.annualCharges,
      ct.stationeryCharges, ct.arrears, ct.totalPending, ct.received,
    ]);
    rows.push([""]);
  }

  const gt = totals(defaulters);
  rows.push(["GRAND TOTAL", "", "", "",
    gt.currentTuition, gt.prevTuition, gt.annualCharges,
    gt.stationeryCharges, gt.arrears, gt.totalPending, gt.received,
  ]);

  const csv  = [HEADERS.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url,
    download: `Dar-e-Arqam_Defaulters_${today()}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
};
