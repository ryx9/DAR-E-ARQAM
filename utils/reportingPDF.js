/**
 * reportingPDF.js
 * PDF generation utilities for the Academic Reporting System.
 * Uses jsPDF (already installed). All charts are drawn programmatically
 * using jsPDF primitives — no html2canvas dependency.
 */

import { gradeFromPercent, GRADE_SCALE, PASS_THRESHOLD } from './reportingEngine';

// ─────────────────────────────────────────────
// Colour palette
// ─────────────────────────────────────────────
const C = {
  // Brand
  ink: [15, 23, 42],
  primary: [79, 70, 229],
  primaryLt: [199, 210, 254],
  // Surfaces
  bg: [245, 247, 250],
  white: [255, 255, 255],
  border: [226, 232, 240],
  muted: [100, 116, 139],
  mid: [71, 85, 105],
  // Grade colours (fill, text)
  grade: {
    'A+': { fill: [220, 252, 231], text: [22, 101, 52] },
    A: { fill: [219, 234, 254], text: [30, 64, 175] },
    B: { fill: [254, 243, 199], text: [120, 53, 15] },
    C: { fill: [255, 247, 237], text: [154, 52, 18] },
    D: { fill: [254, 226, 226], text: [153, 27, 27] },
    E: { fill: [243, 232, 255], text: [88, 28, 135] },
    F: { fill: [243, 244, 246], text: [31, 41, 55] },
  },
  // Header
  hdrBg: [15, 23, 42],
  hdrLine: [79, 70, 229],
  ftrBg: [15, 23, 42],
  gold: [251, 191, 36],
  silver: [209, 213, 219],
  bronze: [251, 146, 60],
};

// ─────────────────────────────────────────────
// Low-level drawing helpers
// ─────────────────────────────────────────────
function painters(doc) {
  return {
    sf: c => doc.setFillColor(c[0], c[1], c[2]),
    sd: c => doc.setDrawColor(c[0], c[1], c[2]),
    st: c => doc.setTextColor(c[0], c[1], c[2]),
    fillR: (x, y, w, h, c) => {
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(x, y, w, h, 'F');
    },
    bdR: (x, y, w, h, fc, sc) => {
      doc.setFillColor(fc[0], fc[1], fc[2]);
      doc.setDrawColor(sc[0], sc[1], sc[2]);
      doc.rect(x, y, w, h, 'FD');
    },
    sR: (x, y, w, h, c) => {
      doc.setDrawColor(c[0], c[1], c[2]);
      doc.rect(x, y, w, h, 'S');
    },
    text: (txt, x, y, opts = {}) => {
      const { align = 'left', fs = 8, bold = false, color = C.ink } = opts;
      doc.setFontSize(fs);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(String(txt ?? ''), x, y, { align });
    },
  };
}

function drawPageChrome(doc, pw, ph, title, subtitle, pageNum, totalPages) {
  const P = painters(doc);
  const HEADER_H = 20,
    FOOTER_H = 10,
    MARGIN = 10;

  // Background
  P.fillR(0, 0, pw, ph, C.bg);
  P.fillR(0, 0, 3, ph, C.primary);
  P.fillR(pw - 3, 0, 3, ph, C.primary);

  // Header
  P.fillR(0, 0, pw, HEADER_H, C.hdrBg);
  P.fillR(0, HEADER_H - 1.5, pw, 1.5, C.hdrLine);
  P.text(title, pw / 2, 10, { align: 'center', fs: 9, bold: true, color: C.white });
  P.text(subtitle, pw / 2, 16.5, { align: 'center', fs: 5.5, color: C.muted });

  // Footer
  P.fillR(0, ph - FOOTER_H, pw, FOOTER_H, C.ftrBg);
  P.fillR(0, ph - FOOTER_H, pw, 1, C.hdrLine);
  P.text(
    `Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    MARGIN + 2,
    ph - 3.5,
    { fs: 5, color: C.muted }
  );
  P.text(`Page ${pageNum} of ${totalPages}`, pw - MARGIN - 2, ph - 3.5, {
    align: 'right',
    fs: 5,
    color: C.muted,
  });
  P.text('DAR-E-ARQAM School', pw / 2, ph - 3.5, { align: 'center', fs: 5, color: C.muted });

  return { HEADER_H, FOOTER_H, MARGIN, contentTop: HEADER_H + 4, contentBottom: ph - FOOTER_H - 3 };
}

function gradeCell(doc, x, y, w, h, grade) {
  const P = painters(doc);
  const gc = C.grade[grade] || C.grade['F'];
  P.bdR(x, y, w, h, gc.fill, C.border);
  P.text(grade || '—', x + w / 2, y + h / 2 + 1.5, {
    align: 'center',
    fs: 7,
    bold: true,
    color: gc.text,
  });
}

function pctBar(doc, x, y, w, h, pct, color) {
  const P = painters(doc);
  P.bdR(x, y, w, h, [235, 238, 243], C.border);
  if (pct > 0) {
    const barW = Math.max(0.5, (pct / 100) * w);
    P.fillR(x, y, barW, h, color || C.primary);
  }
}

// ─────────────────────────────────────────────
// KPI Row
// ─────────────────────────────────────────────
function drawKPIRow(doc, kpis, x, y, w, h, colors) {
  const P = painters(doc);
  const kw = (w - (kpis.length - 1) * 3) / kpis.length;
  kpis.forEach(({ label, value, sub }, i) => {
    const kx = x + i * (kw + 3);
    const fill = colors[i] || [245, 247, 250];
    P.bdR(kx, y, kw, h, fill, C.border);
    P.text(String(value), kx + kw / 2, y + h / 2, {
      align: 'center',
      fs: 14,
      bold: true,
      color: C.ink,
    });
    P.text(label, kx + kw / 2, y + h / 2 + 6, { align: 'center', fs: 5.5, color: C.muted });
    if (sub) P.text(sub, kx + kw / 2, y + h - 3, { align: 'center', fs: 5, color: C.primary });
  });
}

// ─────────────────────────────────────────────
// 1. CLASS OVERVIEW PDF
// ─────────────────────────────────────────────
export async function generateClassOverviewPDF(arg1, arg2, arg3, arg4) {
  let classStats;
  let startDate = 'All Time';
  let endDate = 'All Time';

  if (arg1 && arg1.classStats) {
    classStats = arg1.classStats;
    startDate = arg1.startDate || 'All Time';
    endDate = arg1.endDate || 'All Time';
  } else if (arg1 && typeof arg1 === 'object') {
    // Positional call: (classInfo, stats, subjects, dateRange)
    const classInfo = arg1;
    const stats = arg2 || {};
    const subjects = arg3 || [];
    const dateRange = arg4 || {};
    startDate = dateRange.startDate || 'All Time';
    endDate = dateRange.endDate || 'All Time';

    const subjectStatsObj = {};
    subjects.forEach(s => {
      const sName = s.subject_name || s.subject || 'Subject';
      subjectStatsObj[sName] = {
        subject: sName,
        mean: s.averagePercentage ?? s.mean ?? 0,
        grade: s.grade || gradeFromPercent(s.averagePercentage ?? 0),
        passRate: s.passRate ?? 0,
        min: s.minPercentage ?? s.min ?? 0,
        max: s.maxPercentage ?? s.max ?? 0,
      };
    });

    classStats = {
      className: classInfo.name || 'Class',
      classId: classInfo.id,
      testedCount: stats.totalAssessments || 0,
      mean: stats.mean ?? null,
      median: stats.median ?? null,
      stdDev: stats.stdDev ?? null,
      passRate: stats.passRate ?? null,
      min: stats.min ?? null,
      max: stats.max ?? null,
      gradeDistribution: stats.gradeCounts || {},
      subjectStats: subjectStatsObj,
      rankedStudents: stats.rankedStudents || [],
    };
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = 297,
    PH = 210,
    MARGIN = 10,
    CW = PW - MARGIN * 2;
  const P = painters(doc);

  const className = classStats.className;
  const title = `CLASS OVERVIEW — ${className.toUpperCase()}`;
  const subtitle = `Period: ${startDate} → ${endDate}  ·  ${classStats.testedCount} students assessed`;

  // ── Page 1: Stats Summary ──
  const { HEADER_H, FOOTER_H, contentTop } = drawPageChrome(doc, PW, PH, title, subtitle, 1, 2);
  let y = contentTop;

  // KPI row
  const kpis = [
    { label: 'Students Tested', value: classStats.testedCount },
    {
      label: 'Class Average',
      value: classStats.mean !== null ? classStats.mean.toFixed(1) + '%' : '—',
    },
    {
      label: 'Pass Rate',
      value: classStats.passRate !== null ? classStats.passRate.toFixed(1) + '%' : '—',
    },
    { label: 'Highest', value: classStats.max !== null ? classStats.max.toFixed(1) + '%' : '—' },
    { label: 'Lowest', value: classStats.min !== null ? classStats.min.toFixed(1) + '%' : '—' },
    {
      label: 'Std Deviation',
      value: classStats.stdDev !== null ? classStats.stdDev.toFixed(1) : '—',
    },
  ];
  drawKPIRow(doc, kpis, MARGIN, y, CW, 22, [
    [219, 234, 254],
    [220, 252, 231],
    [254, 243, 199],
    [255, 247, 237],
    [254, 226, 226],
    [243, 232, 255],
  ]);
  y += 26;

  // Grade distribution bar chart
  const GRADES = GRADE_SCALE.map(g => g.label);
  const BAR_H = 7,
    GAP = 2,
    BAR_MAX = CW / 2 - 30;

  // Left panel: Grade Distribution
  const LP_X = MARGIN,
    LP_W = CW / 2 - 4;
  P.bdR(LP_X, y, LP_W, (BAR_H + GAP) * GRADES.length + 16, C.white, C.border);
  P.text('GRADE DISTRIBUTION', LP_X + 5, y + 8, { fs: 7, bold: true, color: C.ink });
  let by = y + 13;
  const total = classStats.testedCount || 1;
  for (const grade of GRADES) {
    const count = classStats.gradeDistribution[grade] || 0;
    const pct = (count / total) * 100;
    const gc = C.grade[grade] || C.grade['F'];
    P.bdR(LP_X + 5, by, 10, BAR_H, gc.fill, C.border);
    P.text(grade, LP_X + 5 + 5, by + BAR_H / 2 + 1.5, {
      align: 'center',
      fs: 6,
      bold: true,
      color: gc.text,
    });
    pctBar(doc, LP_X + 18, by, BAR_MAX, BAR_H, pct, gc.text);
    P.text(`${count} (${pct.toFixed(0)}%)`, LP_X + 18 + BAR_MAX + 3, by + BAR_H / 2 + 1.5, {
      fs: 5.5,
      color: C.muted,
    });
    by += BAR_H + GAP;
  }

  // Right panel: Subject Averages
  const RP_X = MARGIN + CW / 2 + 4,
    RP_W = CW / 2 - 4;
  const subjects = Object.values(classStats.subjectStats).sort(
    (a, b) => (b.mean ?? 0) - (a.mean ?? 0)
  );
  const RPH = Math.max(subjects.length * (BAR_H + GAP) + 16, (BAR_H + GAP) * GRADES.length + 16);
  P.bdR(RP_X, y, RP_W, RPH, C.white, C.border);
  P.text('SUBJECT AVERAGES', RP_X + 5, y + 8, { fs: 7, bold: true, color: C.ink });
  by = y + 13;
  for (const sub of subjects.slice(0, 12)) {
    if (sub.mean === null) continue;
    const lbl = sub.subject.length > 18 ? sub.subject.slice(0, 17) + '…' : sub.subject;
    P.text(lbl, RP_X + 5, by + BAR_H / 2 + 1.5, { fs: 5.5, color: C.ink });
    const grade = sub.grade || 'F';
    const gc = C.grade[grade] || C.grade['F'];
    pctBar(doc, RP_X + 56, by, RP_W - 80, BAR_H, sub.mean, gc.text);
    P.bdR(RP_X + RP_W - 21, by, 20, BAR_H, gc.fill, C.border);
    P.text(`${sub.mean.toFixed(0)}% ${grade}`, RP_X + RP_W - 11, by + BAR_H / 2 + 1.5, {
      align: 'center',
      fs: 5.5,
      bold: true,
      color: gc.text,
    });
    by += BAR_H + GAP;
  }

  y = Math.max(y + (BAR_H + GAP) * GRADES.length + 20, by + 6);

  // Student ranking table (top portion on page 1)
  if (classStats.rankedStudents.length > 0) {
    const tableSubjects = subjects.slice(0, 6);
    const NAME_W = 45,
      RANK_W = 12,
      OV_W = 18,
      SUB_W = 20;
    const tableW = NAME_W + RANK_W + tableSubjects.length * SUB_W + OV_W;
    const TX = MARGIN + (CW - tableW) / 2;

    // Header
    P.fillR(TX, y, NAME_W + RANK_W, 7, C.hdrBg);
    P.text('STUDENT', TX + (NAME_W + RANK_W) / 2, y + 4.5, {
      align: 'center',
      fs: 5.5,
      bold: true,
      color: C.white,
    });
    let hx = TX + NAME_W + RANK_W;
    for (const sub of tableSubjects) {
      P.fillR(hx, y, SUB_W, 7, [20, 27, 48]);
      const lbl = sub.subject.length > 9 ? sub.subject.slice(0, 8) + '…' : sub.subject;
      P.text(lbl, hx + SUB_W / 2, y + 4.5, { align: 'center', fs: 5, color: [199, 210, 254] });
      hx += SUB_W;
    }
    P.fillR(hx, y, OV_W, 7, C.primary);
    P.text('TOTAL%', hx + OV_W / 2, y + 4.5, {
      align: 'center',
      fs: 5.5,
      bold: true,
      color: C.white,
    });
    y += 7;

    for (const student of classStats.rankedStudents.slice(0, 15)) {
      const isOdd = student.rank % 2 === 1;
      const rowBg = isOdd ? [248, 250, 252] : C.white;
      const pFill =
        student.rank === 1
          ? C.gold
          : student.rank === 2
            ? C.silver
            : student.rank === 3
              ? C.bronze
              : rowBg;

      P.bdR(TX, y, NAME_W, 7, rowBg, C.border);
      P.text(
        student.name.length > 22 ? student.name.slice(0, 21) + '…' : student.name,
        TX + 2,
        y + 4.5,
        { fs: 6, bold: true, color: C.ink }
      );

      P.bdR(TX + NAME_W, y, RANK_W, 7, pFill, C.border);
      P.text(String(student.rank), TX + NAME_W + RANK_W / 2, y + 4.5, {
        align: 'center',
        fs: 7,
        bold: true,
        color: student.rank <= 3 ? [0, 0, 0] : C.muted,
      });

      let rx = TX + NAME_W + RANK_W;
      const subMap = {};
      for (const s of student.subjects) subMap[s.subject] = s;

      for (const sub of tableSubjects) {
        const s = subMap[sub.subject];
        const pct = s?.pct;
        const grade = pct !== null && pct !== undefined ? gradeFromPercent(pct) : '—';
        const gc = C.grade[grade] || { fill: rowBg, text: C.muted };
        P.bdR(rx, y, SUB_W, 7, pct !== null && pct !== undefined ? gc.fill : rowBg, C.border);
        P.text(
          pct !== null && pct !== undefined ? pct.toFixed(0) + '%' : '—',
          rx + SUB_W / 2,
          y + 4.5,
          { align: 'center', fs: 5.8, color: pct !== null && pct !== undefined ? gc.text : C.muted }
        );
        rx += SUB_W;
      }

      const ovPct = student.overallPct;
      const ovGrade = student.overallGrade;
      const ovGc = C.grade[ovGrade] || C.grade['F'];
      P.bdR(rx, y, OV_W, 7, ovGc.fill, ovGc.text);
      P.text(ovPct !== null ? ovPct.toFixed(1) + '%' : '—', rx + OV_W / 2, y + 4.5, {
        align: 'center',
        fs: 6.5,
        bold: true,
        color: ovGc.text,
      });
      y += 7;

      if (y > PH - FOOTER_H - 15) break;
    }
  }

  // ── Page 2: Full Student Ranking ──
  doc.addPage();
  drawPageChrome(doc, PW, PH, `${title} — FULL RANKINGS`, subtitle, 2, 2);

  // Full table with all students
  let py = contentTop;
  const allSubjects = Object.values(classStats.subjectStats).sort(
    (a, b) => (b.mean ?? 0) - (a.mean ?? 0)
  );
  const tSubs = allSubjects.slice(0, 10);
  const tNW = 40,
    tRW = 10,
    tSW = Math.min(22, (CW - tNW - tRW - 18) / Math.max(tSubs.length, 1)),
    tOW = 18;
  const totalTableW = tNW + tRW + tSubs.length * tSW + tOW;
  const TXt = MARGIN + (CW - totalTableW) / 2;

  P.fillR(TXt, py, tNW + tRW, 6, C.hdrBg);
  P.text('STUDENT', TXt + (tNW + tRW) / 2, py + 4, {
    align: 'center',
    fs: 5,
    bold: true,
    color: C.white,
  });
  let hxt = TXt + tNW + tRW;
  for (const sub of tSubs) {
    P.fillR(hxt, py, tSW, 6, [20, 27, 48]);
    const lbl = sub.subject.length > 8 ? sub.subject.slice(0, 7) + '…' : sub.subject;
    P.text(lbl, hxt + tSW / 2, py + 4, { align: 'center', fs: 4.5, color: [199, 210, 254] });
    hxt += tSW;
  }
  P.fillR(hxt, py, tOW, 6, C.primary);
  P.text('TOTAL%', hxt + tOW / 2, py + 4, { align: 'center', fs: 5, bold: true, color: C.white });
  py += 6;

  for (const student of classStats.rankedStudents) {
    if (py + 6 > PH - FOOTER_H - 3) break;
    const isOdd = student.rank % 2 === 1;
    const rowBg = isOdd ? [248, 250, 252] : C.white;
    const pFill =
      student.rank === 1
        ? C.gold
        : student.rank === 2
          ? C.silver
          : student.rank === 3
            ? C.bronze
            : rowBg;

    P.bdR(TXt, py, tNW, 6, rowBg, C.border);
    P.text(
      student.name.length > 20 ? student.name.slice(0, 19) + '…' : student.name,
      TXt + 2,
      py + 4,
      { fs: 5.5, bold: true, color: C.ink }
    );
    P.bdR(TXt + tNW, py, tRW, 6, pFill, C.border);
    P.text(String(student.rank), TXt + tNW + tRW / 2, py + 4, {
      align: 'center',
      fs: 6,
      bold: true,
      color: student.rank <= 3 ? [0, 0, 0] : C.muted,
    });

    let rxt = TXt + tNW + tRW;
    const subMap = {};
    for (const s of student.subjects) subMap[s.subject] = s;

    for (const sub of tSubs) {
      const s = subMap[sub.subject];
      const pct = s?.pct;
      const grade = pct !== null && pct !== undefined ? gradeFromPercent(pct) : '—';
      const gc = C.grade[grade] || { fill: rowBg, text: C.muted };
      P.bdR(rxt, py, tSW, 6, pct !== null && pct !== undefined ? gc.fill : rowBg, C.border);
      P.text(
        pct !== null && pct !== undefined ? pct.toFixed(0) + '%' : '—',
        rxt + tSW / 2,
        py + 4,
        { align: 'center', fs: 5, color: pct !== null && pct !== undefined ? gc.text : C.muted }
      );
      rxt += tSW;
    }

    const ovGc = C.grade[student.overallGrade] || C.grade['F'];
    P.bdR(rxt, py, tOW, 6, ovGc.fill, ovGc.text);
    P.text(
      student.overallPct !== null ? student.overallPct.toFixed(1) + '%' : '—',
      rxt + tOW / 2,
      py + 4,
      { align: 'center', fs: 6, bold: true, color: ovGc.text }
    );
    py += 6;
  }

  doc.save(`Analytics_${className}_${startDate}_${endDate}.pdf`);
}

// ─────────────────────────────────────────────
// 2. CLASS COMPARISON PDF
// ─────────────────────────────────────────────
export async function generateComparisonPDF(arg1, arg2) {
  let classesStats = [];
  let startDate = 'All Time';
  let endDate = 'All Time';

  if (arg1 && arg1.classesStats) {
    classesStats = arg1.classesStats;
    startDate = arg1.startDate || 'All Time';
    endDate = arg1.endDate || 'All Time';
  } else if (Array.isArray(arg1)) {
    // Positional call: (comparison, dateRange)
    startDate = arg2?.startDate || 'All Time';
    endDate = arg2?.endDate || 'All Time';
    classesStats = arg1.map(c => ({
      className: c.className || `Class #${c.classId}`,
      classId: c.classId,
      testedCount: c.testedCount || 0,
      mean: c.averagePercentage ?? c.mean ?? null,
      median: c.median ?? null,
      passRate: c.passRate ?? null,
      max: c.max ?? null,
      min: c.min ?? null,
      stdDev: c.stdDev ?? null,
      highestSubject: c.highestSubject,
      lowestSubject: c.lowestSubject,
      subjectStats: (c.subjects || []).reduce((acc, s) => {
        const sName = s.subject_name || s.subject || 'Subject';
        acc[sName] = {
          subject: sName,
          mean: s.averagePercentage ?? s.mean,
          grade: s.grade,
        };
        return acc;
      }, {}),
    }));
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = 297,
    PH = 210,
    MARGIN = 10,
    CW = PW - MARGIN * 2;
  const P = painters(doc);

  const title = `CLASS COMPARISON REPORT`;
  const subtitle = `${classesStats.map(c => c.className).join(' vs ')}  ·  Period: ${startDate} → ${endDate}`;
  const { HEADER_H, FOOTER_H, contentTop } = drawPageChrome(doc, PW, PH, title, subtitle, 1, 1);
  let y = contentTop;

  const cols = classesStats.length;
  const colW = (CW - (cols - 1) * 4) / cols;

  // Class KPI headers
  for (let i = 0; i < cols; i++) {
    const cs = classesStats[i];
    const cx = MARGIN + i * (colW + 4);
    P.fillR(cx, y, colW, 8, C.primary);
    P.text(cs.className, cx + colW / 2, y + 5.5, {
      align: 'center',
      fs: 7.5,
      bold: true,
      color: C.white,
    });
  }
  y += 10;

  const metricsRows = [
    { label: 'Students Tested', key: 'testedCount', fmt: v => String(v) },
    { label: 'Mean %', key: 'mean', fmt: v => (v !== null ? v.toFixed(1) + '%' : '—') },
    { label: 'Median %', key: 'median', fmt: v => (v !== null ? v.toFixed(1) + '%' : '—') },
    { label: 'Pass Rate', key: 'passRate', fmt: v => (v !== null ? v.toFixed(1) + '%' : '—') },
    { label: 'Highest', key: 'max', fmt: v => (v !== null ? v.toFixed(1) + '%' : '—') },
    { label: 'Lowest', key: 'min', fmt: v => (v !== null ? v.toFixed(1) + '%' : '—') },
    { label: 'Std Dev', key: 'stdDev', fmt: v => (v !== null ? v.toFixed(1) : '—') },
  ];

  for (const { label, key, fmt } of metricsRows) {
    P.text(label, MARGIN, y + 5, { fs: 6, color: C.muted });
    const values = classesStats.map(cs => cs[key]);
    const nums = values.filter(v => v !== null && typeof v === 'number');
    const best = nums.length > 0 ? Math.max(...nums) : null;

    for (let i = 0; i < cols; i++) {
      const cs = classesStats[i];
      const cx = MARGIN + i * (colW + 4);
      const val = cs[key];
      const isBest = val !== null && val === best && key !== 'stdDev';
      P.bdR(cx, y, colW, 8, isBest ? [220, 252, 231] : C.white, C.border);
      P.text(fmt(val), cx + colW / 2, y + 5, {
        align: 'center',
        fs: 6.5,
        bold: isBest,
        color: isBest ? [22, 101, 52] : C.ink,
      });
    }
    y += 10;
  }
  y += 4;

  // Grade distribution comparison
  P.text('GRADE DISTRIBUTION', MARGIN, y + 5, { fs: 7, bold: true, color: C.ink });
  y += 8;
  const GRADES = GRADE_SCALE.map(g => g.label);
  for (const grade of GRADES) {
    P.text(grade, MARGIN, y + 5, { fs: 6, bold: true, color: C.muted });
    for (let i = 0; i < cols; i++) {
      const cs = classesStats[i];
      const cx = MARGIN + i * (colW + 4);
      const count = cs.gradeDistribution?.[grade] || 0;
      const pct = cs.testedCount > 0 ? (count / cs.testedCount) * 100 : 0;
      const gc = C.grade[grade] || C.grade['F'];
      P.bdR(cx, y, colW, 7, gc.fill, C.border);
      P.text(`${count} (${pct.toFixed(0)}%)`, cx + colW / 2, y + 4.5, {
        align: 'center',
        fs: 5.8,
        color: gc.text,
      });
    }
    y += 9;
  }
  y += 6;

  // Subject averages comparison
  const allSubjectNames = new Set();
  for (const cs of classesStats) {
    for (const sub of Object.keys(cs.subjectStats || {})) allSubjectNames.add(sub);
  }

  P.text('SUBJECT AVERAGES', MARGIN, y + 5, { fs: 7, bold: true, color: C.ink });
  y += 8;

  for (const subject of Array.from(allSubjectNames).sort()) {
    if (y > PH - FOOTER_H - 10) break;
    const lbl = subject.length > 22 ? subject.slice(0, 21) + '…' : subject;
    P.text(lbl, MARGIN, y + 5, { fs: 5.5, color: C.ink });

    const vals = classesStats.map(cs => cs.subjectStats?.[subject]?.mean ?? null);
    const best = Math.max(...vals.filter(v => v !== null));

    for (let i = 0; i < cols; i++) {
      const cx = MARGIN + i * (colW + 4);
      const val = vals[i];
      if (val === null) {
        P.bdR(cx, y, colW, 7, [248, 250, 252], C.border);
        P.text('—', cx + colW / 2, y + 4.5, { align: 'center', fs: 5.5, color: C.muted });
      } else {
        const grade = gradeFromPercent(val);
        const gc = C.grade[grade] || C.grade['F'];
        const isBest = val === best;
        P.bdR(cx, y, colW, 7, isBest ? [220, 252, 231] : gc.fill, C.border);
        P.text(`${val.toFixed(1)}% (${grade})`, cx + colW / 2, y + 4.5, {
          align: 'center',
          fs: 5.5,
          bold: isBest,
          color: isBest ? [22, 101, 52] : gc.text,
        });
      }
    }
    y += 9;
  }

  doc.save(`Comparison_${startDate}_${endDate}.pdf`);
}

export const generateClassComparisonPDF = generateComparisonPDF;

// ─────────────────────────────────────────────
// 3. STUDENT REPORT PDF
// ─────────────────────────────────────────────
export async function generateStudentReportPDF({ studentProfile, className, startDate, endDate }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210,
    PH = 297,
    MARGIN = 14,
    CW = PW - MARGIN * 2;
  const P = painters(doc);

  // Header
  P.fillR(0, 0, PW, 24, C.hdrBg);
  P.fillR(0, 22.5, PW, 1.5, C.hdrLine);
  P.text('DAR-E-ARQAM SCHOOL', PW / 2, 10, { align: 'center', fs: 11, bold: true, color: C.white });
  P.text('STUDENT PERFORMANCE REPORT', PW / 2, 18, { align: 'center', fs: 7, color: C.muted });

  let y = 30;

  // Student info block
  P.bdR(MARGIN, y, CW, 18, [248, 250, 252], C.border);
  P.fillR(MARGIN, y, 3, 18, C.primary);
  P.text(studentProfile.name, MARGIN + 8, y + 7, { fs: 11, bold: true, color: C.ink });
  P.text(`Father: ${studentProfile.fathername}`, MARGIN + 8, y + 13, { fs: 7.5, color: C.muted });
  P.text(className, PW - MARGIN - 5, y + 7, {
    align: 'right',
    fs: 9,
    bold: true,
    color: C.primary,
  });
  P.text(`${startDate} to ${endDate}`, PW - MARGIN - 5, y + 13, {
    align: 'right',
    fs: 6.5,
    color: C.muted,
  });
  y += 24;

  // Overall result card
  const pct = studentProfile.overallPct;
  const grade = studentProfile.overallGrade || 'F';
  const gc = C.grade[grade] || C.grade['F'];
  P.bdR(MARGIN, y, CW, 18, gc.fill, gc.text);
  P.text('OVERALL RESULT', MARGIN + 6, y + 7, { fs: 7, bold: true, color: gc.text });
  P.text(pct !== null ? pct.toFixed(1) + '%' : '—', MARGIN + 6, y + 15, {
    fs: 16,
    bold: true,
    color: gc.text,
  });
  P.text(`Grade: ${grade}`, CW - 20, y + 7, { fs: 7, color: gc.text });
  P.text(studentProfile.passed ? 'PASSED' : 'FAILED', CW - 20, y + 15, {
    fs: 9,
    bold: true,
    color: gc.text,
  });
  P.text(`${studentProfile.totalObtained} / ${studentProfile.totalMax} marks`, PW / 2, y + 11, {
    align: 'center',
    fs: 8,
    color: gc.text,
  });
  y += 24;

  // Subject table
  P.text('SUBJECT-WISE PERFORMANCE', MARGIN, y + 5, { fs: 7.5, bold: true, color: C.primary });
  y += 8;

  // Header
  const cols = [
    { label: 'Subject', w: 60 },
    { label: 'Obtained', w: 25 },
    { label: 'Total', w: 25 },
    { label: '%', w: 25 },
    { label: 'Grade', w: 22 },
    { label: 'Pass?', w: 23 },
  ];
  let hx = MARGIN;
  for (const col of cols) {
    P.fillR(hx, y, col.w, 7, C.hdrBg);
    P.text(col.label, hx + col.w / 2, y + 4.5, {
      align: 'center',
      fs: 5.5,
      bold: true,
      color: C.white,
    });
    hx += col.w;
  }
  y += 7;

  for (const sub of studentProfile.subjects) {
    const isOdd = studentProfile.subjects.indexOf(sub) % 2 === 0;
    const rowBg = isOdd ? [248, 250, 252] : C.white;
    const grade = sub.grade || 'F';
    const gc2 = C.grade[grade] || C.grade['F'];

    let rx = MARGIN;
    P.bdR(rx, y, 60, 7, rowBg, C.border);
    P.text(
      sub.subject.length > 28 ? sub.subject.slice(0, 27) + '…' : sub.subject,
      rx + 2,
      y + 4.5,
      { fs: 6, color: C.ink }
    );
    rx += 60;

    P.bdR(rx, y, 25, 7, rowBg, C.border);
    P.text(String(sub.obtained), rx + 12.5, y + 4.5, { align: 'center', fs: 6, color: C.ink });
    rx += 25;

    P.bdR(rx, y, 25, 7, rowBg, C.border);
    P.text(String(sub.total), rx + 12.5, y + 4.5, { align: 'center', fs: 6, color: C.mid });
    rx += 25;

    P.bdR(rx, y, 25, 7, gc2.fill, C.border);
    P.text(sub.pct !== null ? sub.pct.toFixed(1) + '%' : '—', rx + 12.5, y + 4.5, {
      align: 'center',
      fs: 6,
      bold: true,
      color: gc2.text,
    });
    rx += 25;

    P.bdR(rx, y, 22, 7, gc2.fill, C.border);
    P.text(grade, rx + 11, y + 4.5, { align: 'center', fs: 6.5, bold: true, color: gc2.text });
    rx += 22;

    P.bdR(rx, y, 23, 7, sub.passed ? [220, 252, 231] : [254, 226, 226], C.border);
    P.text(sub.passed ? '✓ Pass' : '✗ Fail', rx + 11.5, y + 4.5, {
      align: 'center',
      fs: 5.5,
      bold: true,
      color: sub.passed ? [22, 101, 52] : [153, 27, 27],
    });
    y += 7;
  }

  // Total row
  let trx = MARGIN;
  P.bdR(trx, y, 60, 7, C.primaryLt, C.primary);
  P.text('TOTAL', trx + 2, y + 4.5, { fs: 6, bold: true, color: [30, 64, 175] });
  trx += 60;
  P.bdR(trx, y, 25, 7, C.primaryLt, C.primary);
  P.text(String(studentProfile.totalObtained), trx + 12.5, y + 4.5, {
    align: 'center',
    fs: 6,
    bold: true,
    color: [30, 64, 175],
  });
  trx += 25;
  P.bdR(trx, y, 25, 7, C.primaryLt, C.primary);
  P.text(String(studentProfile.totalMax), trx + 12.5, y + 4.5, {
    align: 'center',
    fs: 6,
    bold: true,
    color: [30, 64, 175],
  });
  trx += 25;
  P.bdR(trx, y, 25, 7, C.primaryLt, C.primary);
  P.text(pct !== null ? pct.toFixed(1) + '%' : '—', trx + 12.5, y + 4.5, {
    align: 'center',
    fs: 6.5,
    bold: true,
    color: [30, 64, 175],
  });
  trx += 25;
  P.bdR(trx, y, 22, 7, C.primaryLt, C.primary);
  P.text(grade, trx + 11, y + 4.5, { align: 'center', fs: 6.5, bold: true, color: [30, 64, 175] });
  trx += 22;
  P.bdR(trx, y, 23, 7, C.primaryLt, C.primary);
  y += 14;

  // Footer
  P.fillR(0, PH - 12, PW, 12, C.hdrBg);
  P.fillR(0, PH - 12, PW, 1, C.hdrLine);
  P.text('583 Q Block Model Town, Lahore  |  Phone: 03234447292', PW / 2, PH - 5, {
    align: 'center',
    fs: 5.5,
    color: C.muted,
  });
  P.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, MARGIN, PH - 5, {
    fs: 5,
    color: C.muted,
  });
  P.text('System generated report', PW - MARGIN, PH - 5, { align: 'right', fs: 5, color: C.muted });

  doc.save(`Student_Report_${studentProfile.name.replace(/ /g, '_')}_${startDate}_${endDate}.pdf`);
}
