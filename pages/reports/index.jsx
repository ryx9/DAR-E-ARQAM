"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../utils/supabaseClient';
import Navbar from '../../components/Navbar';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../../components/ui/select';
import { useToast } from '../../hooks/use-toast';
import { generateClassResultPDF } from '../../utils/resultCardGenerator';
import {
  GRADE_SCALE, PASS_THRESHOLD, gradeFromPercent, flattenMark, buildStudentProfile,
  buildClassStats, calculateDeciles, compareClasses, buildSubjectCrossClassStats,
  buildTrendByMonth, buildTrendByTestType, mean, median,
} from '../../utils/reportingEngine';
import {
  generateClassOverviewPDF, generateComparisonPDF, generateStudentReportPDF,
} from '../../utils/reportingPDF';
import {
  Trophy, Calendar, Printer, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  School, FileSpreadsheet, FileText, Send, BarChart3, Users, User, TrendingUp,
  AlertTriangle, Download, GraduationCap, Target, Award, X, Layers, Sparkles,
  CheckCircle2, Percent, Activity, ArrowUpDown, Copy, Loader2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers & design tokens (light + dark)
// ─────────────────────────────────────────────────────────────────────────────
const cx = (...a) => a.filter(Boolean).join(' ');
const f1 = v => (v === null || v === undefined || Number.isNaN(Number(v))) ? '—' : Number(v).toFixed(1);
const f0 = v => (v === null || v === undefined || Number.isNaN(Number(v))) ? '—' : Number(v).toFixed(0);
const GRADES = GRADE_SCALE.map(g => g.label);
const GRADE_HEX = { 'A+': '#10b981', A: '#3b82f6', B: '#f59e0b', C: '#f97316', D: '#ef4444', E: '#a855f7', F: '#64748b' };
const GRADE_CHIP = {
  'A+': 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25',
  A: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25',
  B: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25',
  C: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/25',
  D: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/25',
  E: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/25',
  F: 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30',
};
const gradeChip = g => GRADE_CHIP[g] || 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10';
const heat = p => {
  if (p === null || p === undefined || Number.isNaN(p)) return 'text-slate-400 dark:text-slate-500';
  if (p >= 90) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300';
  if (p >= 80) return 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300';
  if (p >= 70) return 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300';
  if (p >= 50) return 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300';
  if (p >= PASS_THRESHOLD) return 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300';
  return 'bg-red-200 text-red-900 dark:bg-red-500/30 dark:text-red-200';
};

const CARD = 'rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none';
const FIELD = 'h-11 rounded-xl border-input bg-background text-foreground [color-scheme:light] dark:[color-scheme:dark]';
const LABEL = 'text-[11px] font-bold uppercase tracking-widest text-muted-foreground';
const BTN_GHOST = 'h-10 rounded-xl border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50';
const BTN_PRIMARY = 'h-11 rounded-xl bg-indigo-600 font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50';

const isoDate = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const PRESETS = [
  { id: 'month', label: 'This month', range: () => { const n = new Date(); return [isoDate(new Date(n.getFullYear(), n.getMonth(), 1)), isoDate(n)]; } },
  { id: '30', label: 'Last 30 days', range: () => { const n = new Date(); return [isoDate(new Date(n.getTime() - 29 * 864e5)), isoDate(n)]; } },
  { id: '90', label: 'Last 90 days', range: () => { const n = new Date(); return [isoDate(new Date(n.getTime() - 89 * 864e5)), isoDate(n)]; } },
  { id: 'year', label: 'This year', range: () => { const n = new Date(); return [isoDate(new Date(n.getFullYear(), 0, 1)), isoDate(n)]; } },
];

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
}

async function paginate(build) {
  const size = 1000;
  let all = [], page = 0;
  for (; ;) {
    const { data, error } = await build().range(page * size, (page + 1) * size - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < size) break;
    page++;
  }
  return all;
}

const MARK_SELECT = 'studentid, test_id, obtained_marks, total_marks, tests!inner(id, test_name, test_type, subject, class_id, class_name, date)';

function downloadBlob(text, filename, type = 'text/csv;charset=utf-8;') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;


// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
async function generatePDF({ studentsResults, subjects, subjectAverages, classes, selectedClass, startDate, endDate }) {
  const { jsPDF } = await import('jspdf');

  const className = classes.find(c => String(c.id) === String(selectedClass))?.name || 'Class';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const PW = 297, PH = 210;
  const HEADER_H = 22;
  const FOOTER_H = 10;
  const MARGIN = 10;
  const CONTENT_TOP = HEADER_H + 3;
  const CONTENT_BOTTOM = PH - FOOTER_H - 2;
  const CONTENT_W = PW - MARGIN * 2;

  // ── Colour palette (for data pages) ──────────────────────────────────────
  const C = {
    pageBg: [245, 247, 250],
    hdrBg: [10, 15, 30],
    hdrLine: [79, 70, 229],
    ftrBg: [10, 15, 30],
    accent: [79, 70, 229],
    accentLt: [199, 210, 254],
    rowA: [249, 250, 252],
    rowB: [255, 255, 255],
    gFill: { 'A+': [209, 250, 229], A: [219, 234, 254], B: [254, 243, 199], C: [255, 251, 235], D: [255, 237, 213], E: [254, 215, 170], F: [254, 202, 202] },
    gText: { 'A+': [4, 120, 87], A: [29, 78, 216], B: [146, 64, 14], C: [161, 98, 7], D: [154, 52, 18], E: [194, 65, 12], F: [185, 28, 28] },
    white: [255, 255, 255],
    black: [0, 0, 0],
    ink: [17, 24, 39],
    mid: [75, 85, 99],
    muted: [156, 163, 175],
    border: [229, 231, 235],
    gold: [253, 211, 77],
    silver: [209, 213, 219],
    bronze: [253, 186, 116],
    emerald: [16, 185, 129],
    red: [239, 68, 68],
    indigo: [99, 102, 241],
    sky: [14, 165, 233],
  };

  // ── B&W palette (stats/analytics page only) ───────────────────────────────
  // White background, black borders and text, distinct grayscale fills for bars
  const BW = {
    white: [255, 255, 255],
    black: [0, 0, 0],
    ink: [0, 0, 0],
    mid: [80, 80, 80],
    muted: [130, 130, 130],
    light: [180, 180, 180],
    // Grade bar fills: dark (A+) → light (F) so bars differ clearly when printed
    barFill: {
      'A+': [20, 20, 20],
      A: [60, 60, 60],
      B: [95, 95, 95],
      C: [130, 130, 130],
      D: [160, 160, 160],
      E: [190, 190, 190],
      F: [215, 215, 215],
    },
    trackBg: [240, 240, 240],
    trackBd: [180, 180, 180],
    // Grade badge fills for Top Performers (alternating light rows)
    rowBg: [
      [210, 210, 210],  // 1st – darkest
      [228, 228, 228],  // 2nd
      [240, 240, 240],  // 3rd
      [248, 248, 248],  // 4th
      [252, 252, 252],  // 5th
    ],
    // Pass/Fail pie: light gray = pass, dark gray = fail
    passFill: [220, 220, 220],
    failFill: [80, 80, 80],
  };

  // ── Drawing primitives ────────────────────────────────────────────────────
  const sf = c => doc.setFillColor(c[0], c[1], c[2]);
  const sd = c => doc.setDrawColor(c[0], c[1], c[2]);
  const st = c => doc.setTextColor(c[0], c[1], c[2]);

  const fillR = (x, y, w, h, c) => { sf(c); doc.rect(x, y, w, h, 'F'); };
  const bdR = (x, y, w, h, fc, sc) => { sf(fc); sd(sc); doc.rect(x, y, w, h, 'FD'); };
  const strokeR = (x, y, w, h, c) => { sd(c); doc.rect(x, y, w, h, 'S'); };

  const cell = (x, y, w, h, txt, opts = {}) => {
    const { fill = null, tc = C.ink, fs = 6.5, align = 'center', bold = false, bc = C.border, pad = 1.5 } = opts;
    if (fill) fillR(x, y, w, h, fill);
    strokeR(x, y, w, h, bc);
    doc.setFontSize(fs); doc.setFont('helvetica', bold ? 'bold' : 'normal'); st(tc);
    const ty = y + h / 2 + fs * 0.175;
    const s = String(txt ?? '');
    if (align === 'center') doc.text(s, x + w / 2, ty, { align: 'center' });
    else if (align === 'right') doc.text(s, x + w - pad, ty, { align: 'right' });
    else doc.text(s, x + pad, ty);
  };

  const gFill = g => C.gFill[g] || C.rowB;
  const gText = g => C.gText[g] || C.ink;

  // ── Table geometry ────────────────────────────────────────────────────────
  const NAME_W = 42;
  const POS_W = 10;
  const OV_P_W = 15;
  const OV_G_W = 12;
  const FIXED_W = NAME_W + POS_W + OV_P_W + OV_G_W;
  const SUB_W = Math.min(26, (CONTENT_W - FIXED_W) / Math.max(subjects.length, 1));
  const MRK_W = SUB_W * 0.36;
  const PCT_W = SUB_W * 0.36;
  const GRD_W = SUB_W * 0.28;
  const TABLE_W = FIXED_W + subjects.length * SUB_W;
  const TX = MARGIN + (CONTENT_W - TABLE_W) / 2;

  const ROW_H = 7;
  const HDR1_H = 7;
  const HDR2_H = 5;

  // ── Page chrome (colored, for data pages) ────────────────────────────────
  const paintBg = () => {
    fillR(0, 0, PW, PH, C.pageBg);
    fillR(0, 0, 3, PH, C.accent);
    fillR(PW - 3, 0, 3, PH, C.accent);
  };

  const paintHeader = (title, sub) => {
    fillR(0, 0, PW, HEADER_H, C.hdrBg);
    fillR(3, 0, PW - 6, HEADER_H, C.hdrBg);
    fillR(0, HEADER_H - 1.5, PW, 1.5, C.hdrLine);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); st(C.white);
    doc.text(title, PW / 2, 9, { align: 'center' });
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); st(C.muted);
    doc.text(sub, PW / 2, 16.5, { align: 'center' });
  };

  const paintFooter = (pg, total) => {
    fillR(0, PH - FOOTER_H, PW, FOOTER_H, C.ftrBg);
    fillR(0, PH - FOOTER_H, PW, 1, C.hdrLine);
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); st(C.muted);
    doc.text(
      `Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      MARGIN + 3, PH - 3.5,
    );
    doc.text(`Page ${pg} of ${total}`, PW - MARGIN - 3, PH - 3.5, { align: 'right' });
    doc.text(`${className}  ·  ${startDate} → ${endDate}`, PW / 2, PH - 3.5, { align: 'center' });
  };

  // ── Table header ─────────────────────────────────────────────────────────
  const drawTableHeaders = (startY) => {
    let x = TX;
    const y1 = startY, y2 = startY + HDR1_H;

    bdR(x, y1, NAME_W, HDR1_H, C.hdrBg, C.hdrBg);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); st(C.white);
    doc.text('STUDENT', x + NAME_W / 2, y1 + HDR1_H / 2 + 1.2, { align: 'center' });
    x += NAME_W;

    bdR(x, y1, POS_W, HDR1_H, C.hdrBg, C.hdrBg);
    doc.setFontSize(6); st(C.muted);
    doc.text('POS', x + POS_W / 2, y1 + HDR1_H / 2 + 1.2, { align: 'center' });
    x += POS_W;

    subjects.forEach(sub => {
      const lbl = sub.length > 11 ? sub.slice(0, 10) + '…' : sub;
      bdR(x, y1, SUB_W, HDR1_H, [20, 27, 48], [30, 41, 59]);
      doc.setFontSize(6); doc.setFont('helvetica', 'bold'); st(C.accentLt);
      doc.text(lbl, x + SUB_W / 2, y1 + HDR1_H / 2 + 1.2, { align: 'center' });
      x += SUB_W;
    });

    bdR(x, y1, OV_P_W + OV_G_W, HDR1_H, C.accent, C.accent);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); st(C.white);
    doc.text('OVERALL', x + (OV_P_W + OV_G_W) / 2, y1 + HDR1_H / 2 + 1.2, { align: 'center' });

    x = TX + NAME_W + POS_W;
    subjects.forEach(() => {
      cell(x, y2, MRK_W, HDR2_H, 'Mrk', { fill: [18, 25, 45], tc: C.muted, fs: 5, bc: [15, 23, 42] });
      cell(x + MRK_W, y2, PCT_W, HDR2_H, '%', { fill: [18, 25, 45], tc: C.muted, fs: 5, bc: [15, 23, 42] });
      cell(x + MRK_W + PCT_W, y2, GRD_W, HDR2_H, 'Grd', { fill: [18, 25, 45], tc: C.muted, fs: 5, bc: [15, 23, 42] });
      x += SUB_W;
    });
    cell(x, y2, OV_P_W, HDR2_H, '%', { fill: [67, 56, 202], tc: C.white, fs: 5.5 });
    cell(x + OV_P_W, y2, OV_G_W, HDR2_H, 'Grd', { fill: [67, 56, 202], tc: C.white, fs: 5.5 });

    return y2 + HDR2_H;
  };

  // ── Data row ──────────────────────────────────────────────────────────────
  const drawRow = (student, y, isOdd) => {
    const mm = new Map(student.marksData.map(m => [m.subject, m]));
    const bg = isOdd ? C.rowA : C.rowB;
    const ovG = student.overallGrade;
    let x = TX;

    fillR(x, y, NAME_W, ROW_H, bg);
    strokeR(x, y, NAME_W, ROW_H, C.border);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); st(C.ink);
    const nm = student.studentName.length > 23 ? student.studentName.slice(0, 22) + '…' : student.studentName;
    doc.text(nm, x + 2, y + ROW_H / 2 - 0.6);
    doc.setFontSize(5.2); doc.setFont('helvetica', 'normal'); st(C.muted);
    doc.text('ID: ' + student.dasNumber, x + 2, y + ROW_H / 2 + 2.8);
    x += NAME_W;

    const pFill = student.position === 1 ? C.gold : student.position === 2 ? C.silver : student.position === 3 ? C.bronze : bg;
    bdR(x, y, POS_W, ROW_H, pFill, C.border);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    st(student.position <= 3 ? C.black : C.muted);
    doc.text(String(student.position), x + POS_W / 2, y + ROW_H / 2 + 1.4, { align: 'center' });
    x += POS_W;

    subjects.forEach(sub => {
      const m = mm.get(sub);
      const pct = (m?.total_marks > 0) ? (m.obtained_marks / m.total_marks) * 100 : undefined;
      const g = pct !== undefined ? gradeFromPercent(pct) : '-';
      const gf = pct !== undefined ? gFill(g) : bg;
      const gt = pct !== undefined ? gText(g) : C.muted;

      cell(x, y, MRK_W, ROW_H, m?.obtained_marks ?? '—', { fill: bg, tc: C.mid, fs: 6.2 });
      cell(x + MRK_W, y, PCT_W, ROW_H, pct !== undefined ? pct.toFixed(0) + '%' : '—', { fill: bg, tc: C.muted, fs: 5.8 });

      fillR(x + MRK_W + PCT_W, y, GRD_W, ROW_H, bg);
      strokeR(x + MRK_W + PCT_W, y, GRD_W, ROW_H, C.border);
      fillR(x + MRK_W + PCT_W + 0.6, y + 0.8, GRD_W - 1.2, ROW_H - 1.6, gf);
      doc.setFontSize(6.8); doc.setFont('helvetica', 'bold'); st(gt);
      doc.text(g, x + MRK_W + PCT_W + GRD_W / 2, y + ROW_H / 2 + 1.3, { align: 'center' });
      x += SUB_W;
    });

    const ovF = gFill(ovG), ovT = gText(ovG);
    fillR(x, y, OV_P_W, ROW_H, bg);
    strokeR(x, y, OV_P_W, ROW_H, ovT);
    fillR(x + 0.5, y + 0.7, OV_P_W - 1, ROW_H - 1.4, ovF);
    doc.setFontSize(6.8); doc.setFont('helvetica', 'bold'); st(ovT);
    doc.text(student.overallPercent.toFixed(1) + '%', x + OV_P_W / 2, y + ROW_H / 2 + 1.3, { align: 'center' });
    x += OV_P_W;

    fillR(x, y, OV_G_W, ROW_H, bg);
    strokeR(x, y, OV_G_W, ROW_H, ovT);
    fillR(x + 0.5, y + 0.7, OV_G_W - 1, ROW_H - 1.4, ovF);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); st(ovT);
    doc.text(ovG, x + OV_G_W / 2, y + ROW_H / 2 + 1.4, { align: 'center' });
  };

  // ── Average footer row ────────────────────────────────────────────────────
  const drawAvgRow = (y) => {
    let x = TX;
    bdR(x, y, NAME_W + POS_W, ROW_H, C.hdrBg, C.hdrBg);
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); st(C.accentLt);
    doc.text('CLASS AVERAGE', x + (NAME_W + POS_W) / 2, y + ROW_H / 2 + 1.2, { align: 'center' });
    x += NAME_W + POS_W;

    subjects.forEach(sub => {
      const avg = parseFloat(subjectAverages[sub] || 0);
      const g = gradeFromPercent(avg);
      bdR(x, y, SUB_W, ROW_H, [18, 25, 45], [30, 41, 59]);
      fillR(x + 0.5, y + 0.7, SUB_W - 1, ROW_H - 1.4, gFill(g));
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); st(gText(g));
      doc.text(avg.toFixed(1) + '%', x + SUB_W / 2, y + ROW_H / 2 + 1.2, { align: 'center' });
      x += SUB_W;
    });
    bdR(x, y, OV_P_W + OV_G_W, ROW_H, [18, 25, 45], [30, 41, 59]);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STATS PAGE — B&W PRINT-FRIENDLY
  // White background, black borders, strictly grayscale fills
  // ─────────────────────────────────────────────────────────────────────────
  const drawStatsPage = () => {
    doc.addPage();

    // White page background
    fillR(0, 0, PW, PH, BW.white);

    // ── Header (black on white) ──────────────────────────────────────────────
    fillR(0, 0, PW, HEADER_H, BW.black);
    fillR(0, HEADER_H - 1.5, PW, 1.5, BW.mid);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); st(BW.white);
    doc.text(`ANALYTICS & STATISTICS  —  ${className.toUpperCase()}`, PW / 2, 9, { align: 'center' });
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); st(BW.light);
    doc.text(`Period: ${startDate}  →  ${endDate}  ·  ${studentsResults.length} students`, PW / 2, 16.5, { align: 'center' });

    const allGrades = ['A+', 'A', 'B', 'C', 'D', 'E', 'F'];
    const gCounts = {};
    allGrades.forEach(g => { gCounts[g] = 0; });
    studentsResults.forEach(s => { if (gCounts[s.overallGrade] !== undefined) gCounts[s.overallGrade]++; });

    const total = studentsResults.length;
    const passCount = studentsResults.filter(s => s.overallGrade !== 'F').length;
    const failCount = gCounts['F'];
    const distCount = (gCounts['A+'] || 0) + (gCounts['A'] || 0);
    const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : '0.0';

    const R1_Y = CONTENT_TOP; const R1_H = 22;
    const R2_Y = R1_Y + R1_H + 4; const R2_H = 72;
    const R3_Y = R2_Y + R2_H + 4; const R3_H = CONTENT_BOTTOM - R3_Y;

    const MID_X = MARGIN + CONTENT_W / 2 + 2;
    const L_W = CONTENT_W / 2 - 2;
    const R_W = CONTENT_W / 2 - 2;

    // B&W panel: white fill, black border, black top bar
    const bwPanel = (x, y, w, h) => {
      fillR(x, y, w, h, BW.white);
      strokeR(x, y, w, h, BW.black);
      fillR(x, y, w, 2.5, BW.black);
    };

    // Panel section title with underline
    const bwTitle = (x, y, txt) => {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); st(BW.black);
      doc.text(txt, x, y);
      fillR(x, y + 1.5, 32, 0.5, BW.black);
    };

    // ── ROW 1: KPI Cards ─────────────────────────────────────────────────────
    const KPIs = [
      { label: 'Total Students', val: total },
      { label: 'Passed', val: passCount },
      { label: 'Failed', val: failCount },
      { label: 'Distinction', val: distCount },
      { label: 'Pass Rate', val: passRate + '%' },
    ];
    const KPI_W = (CONTENT_W - (KPIs.length - 1) * 3) / KPIs.length;
    // Stepped fill shades so KPI cards differ visually when B&W printed
    const KPI_FILLS = [[240, 240, 240], [225, 225, 225], [210, 210, 210], [195, 195, 195], [180, 180, 180]];

    KPIs.forEach(({ label, val }, i) => {
      const kx = MARGIN + i * (KPI_W + 3), ky = R1_Y;
      fillR(kx, ky, KPI_W, R1_H, KPI_FILLS[i]);
      strokeR(kx, ky, KPI_W, R1_H, BW.black);
      fillR(kx, ky, KPI_W, 2.5, BW.black);   // black top accent

      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); st(BW.black);
      doc.text(String(val), kx + KPI_W / 2, ky + 14, { align: 'center' });
      doc.setFontSize(5.8); doc.setFont('helvetica', 'normal'); st(BW.mid);
      doc.text(label, kx + KPI_W / 2, ky + 19.5, { align: 'center' });
    });

    // ── ROW 2 LEFT: Grade Distribution ───────────────────────────────────────
    {
      const px = MARGIN, py = R2_Y, pw = L_W, ph = R2_H;
      bwPanel(px, py, pw, ph);
      bwTitle(px + 4, py + 9, 'OVERALL GRADE DISTRIBUTION');

      const BAR_MAX = pw - 54, BAR_H = 7.5, GAP = 2.5;
      let by = py + 14;

      allGrades.forEach(g => {
        const count = gCounts[g];
        const pct = total > 0 ? (count / total) * 100 : 0;
        const bw = (pct / 100) * BAR_MAX;

        // Grade badge — outlined in black, white fill with bold label
        fillR(px + 4, by, 11, BAR_H, BW.white);
        strokeR(px + 4, by, 11, BAR_H, BW.black);
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); st(BW.black);
        doc.text(g, px + 4 + 5.5, by + BAR_H / 2 + 1.2, { align: 'center' });

        // Track
        fillR(px + 18, by, BAR_MAX, BAR_H, BW.trackBg);
        strokeR(px + 18, by, BAR_MAX, BAR_H, BW.trackBd);
        // Filled bar — each grade gets a unique gray shade
        if (bw > 0) fillR(px + 18, by, bw, BAR_H, BW.barFill[g]);

        // Count + pct
        doc.setFontSize(5.8); doc.setFont('helvetica', 'normal'); st(BW.mid);
        doc.text(`${count} (${pct.toFixed(1)}%)`, px + 18 + BAR_MAX + 3, by + BAR_H / 2 + 1.2);

        by += BAR_H + GAP;
      });
    }

    // ── ROW 2 RIGHT: Subject Averages ─────────────────────────────────────────
    {
      const px = MID_X, py = R2_Y, pw = R_W, ph = R2_H;
      bwPanel(px, py, pw, ph);
      bwTitle(px + 4, py + 9, 'SUBJECT-WISE AVERAGES');

      const BAR_MAX = pw - 58, BAR_H = 7.5, GAP = 2.5;
      let by = py + 14;

      subjects.forEach(sub => {
        if (by + BAR_H > py + ph - 2) return;
        const avg = parseFloat(subjectAverages[sub] || 0);
        const g = gradeFromPercent(avg);
        const bwBar = (avg / 100) * BAR_MAX;
        const lbl = sub.length > 15 ? sub.slice(0, 14) + '…' : sub;

        doc.setFontSize(5.8); doc.setFont('helvetica', 'normal'); st(BW.ink);
        doc.text(lbl, px + 4, by + BAR_H / 2 + 1.2);

        fillR(px + 38, by, BAR_MAX, BAR_H, BW.trackBg);
        strokeR(px + 38, by, BAR_MAX, BAR_H, BW.trackBd);
        if (bwBar > 0) fillR(px + 38, by, bwBar, BAR_H, BW.barFill[g]);

        // End badge: outlined, shows pct + grade letter
        const bx2 = px + 38 + BAR_MAX + 2;
        fillR(bx2, by, 16, BAR_H, BW.white);
        strokeR(bx2, by, 16, BAR_H, BW.black);
        doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); st(BW.black);
        doc.text(`${avg.toFixed(0)}% ${g}`, bx2 + 8, by + BAR_H / 2 + 1.2, { align: 'center' });

        by += BAR_H + GAP;
      });
    }

    // ── ROW 3 LEFT: Top Performers ───────────────────────────────────────────
    {
      const px = MARGIN, py = R3_Y, pw = L_W, ph = R3_H;
      bwPanel(px, py, pw, ph);
      bwTitle(px + 4, py + 9, 'TOP PERFORMERS');

      const maxRows = Math.min(5, Math.floor((ph - 14) / 14));
      const top = studentsResults.slice(0, maxRows);
      const lbls = ['1st', '2nd', '3rd', '4th', '5th'];
      let cy = py + 13;

      top.forEach((s, i) => {
        const ch = 12;
        // Stepped grays: 1st darkest → 5th lightest
        const rowBg = BW.rowBg[i] || [252, 252, 252];
        fillR(px + 4, cy, pw - 8, ch, rowBg);
        strokeR(px + 4, cy, pw - 8, ch, BW.black);
        // Solid black left accent stripe
        fillR(px + 4, cy, 3.5, ch, BW.black);

        // Position label in white on black stripe
        doc.setFontSize(5); doc.setFont('helvetica', 'bold'); st(BW.white);
        doc.text(lbls[i], px + 5.5, cy + 7);

        // Student name
        doc.setFontSize(6.8); doc.setFont('helvetica', 'bold'); st(BW.black);
        const nm = s.studentName.length > 26 ? s.studentName.slice(0, 25) + '…' : s.studentName;
        doc.text(nm, px + 10, cy + 9.5);

        // Score badge — outlined box
        const bx = px + pw - 34;
        fillR(bx, cy + 1, 26, ch - 2, BW.white);
        strokeR(bx, cy + 1, 26, ch - 2, BW.black);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); st(BW.black);
        doc.text(s.overallPercent.toFixed(1) + '%', bx + 13, cy + 6, { align: 'center' });
        doc.setFontSize(5); doc.setFont('helvetica', 'normal'); st(BW.mid);
        doc.text(`Grade: ${s.overallGrade}`, bx + 13, cy + 10, { align: 'center' });

        cy += ch + 2;
      });
    }

    // ── ROW 3 RIGHT: Pass/Fail donut + stat rows ──────────────────────────────
    {
      const px = MID_X, py = R3_Y, pw = R_W, ph = R3_H;
      bwPanel(px, py, pw, ph);

      const PIE_W = pw * 0.44;
      bwTitle(px + 4, py + 9, 'PASS / FAIL SUMMARY');

      const cx_ = px + PIE_W / 2;
      const cy_ = py + ph / 2 + 2;
      const rad = Math.min(PIE_W / 2 - 6, ph / 2 - 10);
      const pass = total > 0 ? passCount / total : 0;

      if (total > 0 && rad > 0) {
        // Draw full circle in fail gray
        sf(BW.failFill); doc.circle(cx_, cy_, rad, 'F');

        // Overlay pass sector in light gray (triangle-fan)
        if (pass > 0.005 && pass < 0.995) {
          const STEPS = 60;
          const startAng = -Math.PI / 2;
          const sweep = pass * 2 * Math.PI;
          sf(BW.passFill);
          for (let i = 0; i < STEPS; i++) {
            const a1 = startAng + (i / STEPS) * sweep;
            const a2 = startAng + ((i + 1) / STEPS) * sweep;
            doc.triangle(cx_, cy_, cx_ + rad * Math.cos(a1), cy_ + rad * Math.sin(a1),
              cx_ + rad * Math.cos(a2), cy_ + rad * Math.sin(a2), 'F');
          }
        } else if (pass >= 0.995) {
          sf(BW.passFill); doc.circle(cx_, cy_, rad, 'F');
        }

        // Donut hole
        sf(BW.white); doc.circle(cx_, cy_, rad * 0.52, 'F');
        // Ring border
        sd(BW.black); doc.circle(cx_, cy_, rad, 'S');

        // Centre labels
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); st(BW.black);
        doc.text(passRate + '%', cx_, cy_ + 1.5, { align: 'center' });
        doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); st(BW.mid);
        doc.text('pass rate', cx_, cy_ + 6, { align: 'center' });

        // Legend swatches
        const LEG_Y = cy_ + rad + 5;
        fillR(cx_ - 14, LEG_Y, 7, 4, BW.passFill);
        strokeR(cx_ - 14, LEG_Y, 7, 4, BW.black);
        doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); st(BW.ink);
        doc.text('Pass', cx_ - 6, LEG_Y + 3.2);

        fillR(cx_ + 4, LEG_Y, 7, 4, BW.failFill);
        strokeR(cx_ + 4, LEG_Y, 7, 4, BW.black);
        doc.text('Fail', cx_ + 12, LEG_Y + 3.2);
      }

      // Stat rows (alternating white / light-gray)
      const SX = px + PIE_W + 4, SW = pw - PIE_W - 8;
      const stats = [
        { label: 'Total Students', val: total },
        { label: 'Pass  (≥ 33%)', val: passCount },
        { label: 'Fail  (< 33%)', val: failCount },
        { label: 'Distinction', val: distCount },
        { label: 'Pass Rate', val: passRate + '%' },
      ];
      let sy = py + 10;
      const STAT_ROW_H = (ph - 14) / stats.length;

      stats.forEach(({ label, val }, i) => {
        const rowBg = i % 2 === 0 ? [240, 240, 240] : BW.white;
        fillR(SX, sy, SW, STAT_ROW_H - 1, rowBg);
        strokeR(SX, sy, SW, STAT_ROW_H - 1, BW.black);
        fillR(SX, sy, 2.5, STAT_ROW_H - 1, BW.black);  // black left stripe

        doc.setFontSize(5.8); doc.setFont('helvetica', 'normal'); st(BW.mid);
        doc.text(label, SX + 5, sy + (STAT_ROW_H - 1) / 2 + 1);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); st(BW.black);
        doc.text(String(val), SX + SW - 3, sy + (STAT_ROW_H - 1) / 2 + 1.5, { align: 'right' });

        sy += STAT_ROW_H;
      });
    }

    // ── B&W Footer ─────────────────────────────────────────────────────────
    fillR(0, PH - FOOTER_H, PW, FOOTER_H, BW.black);
    fillR(0, PH - FOOTER_H, PW, 1, BW.mid);
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); st(BW.light);
    doc.text(
      `Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      MARGIN + 3, PH - 3.5,
    );
    doc.text(`${className}  ·  ${startDate} → ${endDate}`, PW / 2, PH - 3.5, { align: 'center' });
    // Page number will be stamped in the footer-repaint loop below
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER DATA PAGES
  // ─────────────────────────────────────────────────────────────────────────
  let pageIdx = 1;
  paintBg();
  paintHeader(
    `CLASS RESULT REPORT  —  ${className.toUpperCase()}`,
    `Period: ${startDate}  →  ${endDate}  ·  ${studentsResults.length} students`
  );

  const TABLE_SAFE_TOP = CONTENT_TOP + 1;
  const TABLE_SAFE_BOTTOM = CONTENT_BOTTOM - 1;
  let y = drawTableHeaders(TABLE_SAFE_TOP);

  studentsResults.forEach((student, idx) => {
    if (y + ROW_H > TABLE_SAFE_BOTTOM - ROW_H) {
      drawAvgRow(y);
      paintFooter(pageIdx, '?');
      pageIdx++;
      doc.addPage();
      paintBg();
      paintHeader(
        `CLASS RESULT REPORT  —  ${className.toUpperCase()}  (cont.)`,
        `Period: ${startDate}  →  ${endDate}`
      );
      y = drawTableHeaders(TABLE_SAFE_TOP);
    }
    drawRow(student, y, idx % 2 === 0);
    y += ROW_H;
  });

  if (y + ROW_H <= TABLE_SAFE_BOTTOM) drawAvgRow(y);
  paintFooter(pageIdx, '?');

  drawStatsPage();

  // Repaint all page numbers now we know the total
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p < totalPages) {
      // Colored data pages — repaint full footer
      paintFooter(p, totalPages);
    } else {
      // B&W stats page — repaint just the footer with page number
      fillR(0, PH - FOOTER_H, PW, FOOTER_H, BW.black);
      fillR(0, PH - FOOTER_H, PW, 1, BW.mid);
      doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); st(BW.light);
      doc.text(
        `Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        MARGIN + 3, PH - 3.5,
      );
      doc.text(`Page ${p} of ${totalPages}`, PW - MARGIN - 3, PH - 3.5, { align: 'right' });
      doc.text(`${className}  ·  ${startDate} → ${endDate}`, PW / 2, PH - 3.5, { align: 'center' });
    }
  }

  doc.save(`Result_${className}_${startDate}_${endDate}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI primitives & lightweight SVG charts (theme-aware, no extra deps)
// ─────────────────────────────────────────────────────────────────────────────
function Spinner({ className = 'h-4 w-4' }) { return <Loader2 className={cx('animate-spin', className)} />; }

function Stat({ icon: Icon, label, value, sub, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    sky: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    violet: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  };
  return (
    <div className={cx(CARD, 'p-4 flex items-start gap-3')}>
      <div className={cx('h-10 w-10 shrink-0 rounded-xl flex items-center justify-center', tones[tone])}><Icon className="h-5 w-5" /></div>
      <div className="min-w-0">
        <div className={LABEL}>{label}</div>
        <div className="text-2xl font-black leading-tight text-foreground">{value}</div>
        {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, action, children, className }) {
  return (
    <section className={cx(CARD, 'p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          {Icon && <Icon className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />}{title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ icon: Icon = Search, title, text }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Icon className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-muted" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 rounded-2xl bg-muted" />
        <div className="h-72 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

function GradePill({ g, className }) {
  return <span className={cx('inline-flex min-w-[1.75rem] justify-center rounded-md border px-1.5 py-0.5 text-xs font-bold', gradeChip(g), className)}>{g || '—'}</span>;
}

function HBars({ rows, max = 100, suffix = '%' }) {
  return (
    <div className="space-y-2.5">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-3 text-sm">
          <div className="w-28 shrink-0 truncate text-foreground" title={r.label}>{r.label}</div>
          <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted">
            <div className="h-full rounded-md transition-all duration-500" style={{ width: `${Math.min(100, ((r.value || 0) / max) * 100)}%`, background: r.color || '#6366f1' }} />
            {r.marker !== undefined && r.marker !== null && (
              <div className="absolute top-0 h-full w-0.5 bg-slate-900 dark:bg-white" style={{ left: `${Math.min(100, (r.marker / max) * 100)}%` }} title={`Class avg ${f1(r.marker)}%`} />
            )}
          </div>
          <div className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">{r.text ?? `${f1(r.value)}${suffix}`}</div>
        </div>
      ))}
    </div>
  );
}

function Histogram({ buckets }) {
  const top = Math.max(1, ...buckets.map(b => b.count));
  return (
    <div>
      <div className="flex h-44 items-end gap-1.5">
        {buckets.map((b, i) => (
          <div key={b.range} className="group flex h-full flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[10px] font-semibold text-muted-foreground opacity-0 transition group-hover:opacity-100">{b.count}</span>
            <div className="w-full rounded-t-md transition-all duration-500"
              style={{ height: `${(b.count / top) * 100}%`, minHeight: b.count ? 4 : 2, background: i < 3 ? '#ef4444' : i < 5 ? '#f59e0b' : i < 8 ? '#3b82f6' : '#10b981', opacity: b.count ? 1 : 0.2 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {buckets.map(b => <div key={b.range} className="flex-1 text-center text-[9px] text-muted-foreground">{b.range.replace('%', '')}</div>)}
      </div>
    </div>
  );
}

function LineChart({ points, height = 180, yMin = 0, yMax = 100 }) {
  if (!points.length) return <p className="py-10 text-center text-sm text-slate-500">Not enough data for a trend.</p>;
  const W = 520, H = height, pl = 30, pr = 12, pt = 12, pb = 26;
  const x = i => pl + (points.length === 1 ? (W - pl - pr) / 2 : (i / (points.length - 1)) * (W - pl - pr));
  const y = v => pt + (1 - (v - yMin) / (yMax - yMin)) * (H - pt - pb);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${H - pb} L${x(0)},${H - pb} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {[0, 25, 50, 75, 100].map(t => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-white/10" strokeDasharray={t === PASS_THRESHOLD ? '' : '3 3'} />
          <text x={pl - 5} y={y(t) + 3} textAnchor="end" className="fill-slate-500 dark:fill-slate-400" fontSize="9">{t}</text>
        </g>
      ))}
      <line x1={pl} x2={W - pr} y1={y(PASS_THRESHOLD)} y2={y(PASS_THRESHOLD)} stroke="#ef4444" strokeOpacity=".5" strokeDasharray="4 3" />
      <path d={area} fill="#6366f1" fillOpacity=".12" />
      <path d={path} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill="#6366f1" className="stroke-white dark:stroke-slate-900" strokeWidth="2"><title>{`${p.label}: ${f1(p.value)}%`}</title></circle>
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize="9">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

function Scatter({ pts }) {
  if (pts.length < 3) return <p className="py-10 text-center text-sm text-slate-500">Not enough attendance data.</p>;
  const W = 360, H = 200, pl = 32, pb = 24, pt = 8, pr = 8;
  const x = v => pl + (v / 100) * (W - pl - pr);
  const y = v => pt + (1 - v / 100) * (H - pt - pb);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {[0, 25, 50, 75, 100].map(t => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-white/10" strokeDasharray="3 3" />
          <text x={pl - 4} y={y(t) + 3} textAnchor="end" className="fill-slate-500 dark:fill-slate-400" fontSize="8">{t}</text>
          <text x={x(t)} y={H - 8} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize="8">{t}</text>
        </g>
      ))}
      {pts.map((p, i) => <circle key={i} cx={x(p.a)} cy={y(p.s)} r="3.5" fill={p.s < PASS_THRESHOLD ? '#ef4444' : '#6366f1'} fillOpacity=".7"><title>{`${p.name}: attendance ${f0(p.a)}%, score ${f1(p.s)}%`}</title></circle>)}
      <text x={W / 2} y={H - 0} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize="8">Attendance %  →  Score %  ↑</text>
    </svg>
  );
}

function Rank({ n, size = 'h-8 w-8' }) {
  const cls = n === 1 ? 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-yellow-950'
    : n === 2 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900'
      : n === 3 ? 'bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950'
        : 'bg-muted text-muted-foreground';
  return <span className={cx('inline-flex items-center justify-center rounded-full text-xs font-black', size, cls)}>{n <= 3 ? <Trophy className="h-3.5 w-3.5" /> : n}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — OVERVIEW (class analytics powered by reportingEngine)
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ data, onOpenStudent }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const cs = data.classStats;
  const subjRows = useMemo(() => Object.values(cs.subjectStats || {}).sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0)), [cs]);
  const distRows = GRADES.map(g => ({ label: g, value: cs.gradeDistribution?.[g] || 0, color: GRADE_HEX[g] }));
  const total = cs.testedCount || 1;

  const exportPDF = async () => {
    setBusy(true);
    try {
      await generateClassOverviewPDF({ classStats: cs, startDate: data.range.start, endDate: data.range.end });
      toast({ variant: 'success', title: 'Analytics PDF ready', description: 'Class overview downloaded.' });
    } catch (e) { toast({ variant: 'destructive', title: 'PDF failed', description: e.message }); }
    finally { setBusy(false); }
  };

  const exportCSV = () => {
    const lines = [['Metric', 'Value'], ['Class', data.className], ['Period', `${data.range.start} → ${data.range.end}`],
    ['Students assessed', cs.testedCount], ['Mean %', f1(cs.mean)], ['Median %', f1(cs.median)], ['Std dev', f1(cs.stdDev)],
    ['Highest %', f1(cs.max)], ['Lowest %', f1(cs.min)], ['Pass rate %', f1(cs.passRate)], [], ['Subject', 'Mean %', 'Median %', 'Std dev', 'Min %', 'Max %', 'Pass rate %', 'Students']];
    subjRows.forEach(s => lines.push([s.subject, f1(s.mean), f1(s.median), f1(s.stdDev), f1(s.min), f1(s.max), f1(s.passRate), s.studentCount]));
    lines.push([], ['Test', 'Subject', 'Date', 'Mean %', 'Pass rate %', 'Entries']);
    data.testStats.forEach(t => lines.push([t.name, t.subject, t.date, f1(t.mean), f1(t.passRate), t.count]));
    downloadBlob(lines.map(r => r.map(csvCell).join(',')).join('\n'), `Analytics_${data.className}_${data.range.start}_${data.range.end}.csv`);
  };

  const copySummary = async () => {
    const txt = `${data.className} (${data.range.start} → ${data.range.end})\n` + data.insights.map(i => `• ${i.text}`).join('\n');
    try { await navigator.clipboard.writeText(txt); toast({ variant: 'success', title: 'Copied', description: 'Summary copied to clipboard.' }); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Users} label="Assessed" value={cs.testedCount} sub={`of ${cs.studentCount} students`} tone="sky" />
        <Stat icon={Percent} label="Class mean" value={`${f1(cs.mean)}%`} sub={`Median ${f1(cs.median)}%`} tone="indigo" />
        <Stat icon={CheckCircle2} label="Pass rate" value={`${f1(cs.passRate)}%`} sub={`${cs.passCount} pass · ${cs.failCount} fail`} tone="emerald" />
        <Stat icon={Award} label="Highest" value={`${f1(cs.max)}%`} sub={cs.rankedStudents[0]?.name} tone="amber" />
        <Stat icon={AlertTriangle} label="Lowest" value={`${f1(cs.min)}%`} sub={cs.rankedStudents[cs.rankedStudents.length - 1]?.name} tone="rose" />
        <Stat icon={Activity} label="Spread (σ)" value={f1(cs.stdDev)} sub={cs.stdDev > 20 ? 'Wide gap in ability' : 'Fairly consistent'} tone="violet" />
      </div>

      <Panel title="Smart insights" icon={Sparkles} action={
        <div className="flex gap-2">
          <Button variant="outline" onClick={copySummary} className={cx(BTN_GHOST, 'h-8 px-3 text-xs')}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</Button>
        </div>}>
        <ul className="grid gap-2 md:grid-cols-2">
          {data.insights.map((i, k) => (
            <li key={k} className={cx('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm',
              i.tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
                : i.tone === 'bad' ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200'
                  : 'border-border bg-muted text-foreground')}>
              <span className="mt-0.5">{i.tone === 'good' ? '▲' : i.tone === 'bad' ? '▼' : '●'}</span><span>{i.text}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Grade distribution" icon={BarChart3}>
          <HBars max={Math.max(1, ...distRows.map(r => r.value))}
            rows={distRows.map(r => ({ ...r, text: `${r.value} · ${((r.value / total) * 100).toFixed(0)}%` }))} />
        </Panel>
        <Panel title="Score distribution (10% bands)" icon={BarChart3}>
          <Histogram buckets={data.deciles} />
          <p className="mt-3 text-xs text-muted-foreground">Each bar counts individual test results. Red = below pass mark ({PASS_THRESHOLD}%).</p>
        </Panel>
        <Panel title="Subject performance" icon={Layers}>
          <HBars rows={subjRows.map(s => ({ label: s.subject, value: s.mean, color: GRADE_HEX[s.grade] || '#6366f1', text: `${f1(s.mean)}% · ${s.grade}` }))} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                {['Subject', 'Median', 'σ', 'Min', 'Max', 'Pass'].map(h => <th key={h} className="px-2 py-1.5 font-bold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border text-foreground">
                {subjRows.map(s => (
                  <tr key={s.subject}><td className="px-2 py-1.5 font-medium">{s.subject}</td><td className="px-2 py-1.5">{f1(s.median)}</td><td className="px-2 py-1.5">{f1(s.stdDev)}</td>
                    <td className="px-2 py-1.5">{f0(s.min)}</td><td className="px-2 py-1.5">{f0(s.max)}</td>
                    <td className={cx('px-2 py-1.5 font-semibold', s.passRate < 70 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>{f0(s.passRate)}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Performance trend" icon={TrendingUp}>
          <LineChart points={data.trendMonth.map(t => ({ label: t.label, value: t.mean }))} />
          {data.trendType.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.trendType.map(t => (
                <span key={t.period} className="rounded-lg border border-border bg-muted px-2.5 py-1 text-xs text-foreground">
                  <b>{t.period}</b> · {f1(t.mean)}% · pass {f0(t.passRate)}%
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Top performers" icon={Trophy} className="lg:col-span-1">
          <ul className="space-y-2">
            {cs.rankedStudents.slice(0, 5).map(s => (
              <li key={s.studentid}>
                <button onClick={() => onOpenStudent(s.studentid)} className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10">
                  <Rank n={s.rank} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{s.name}</span>
                  <span className="text-sm font-black text-indigo-600 dark:text-indigo-300">{f1(s.overallPct)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={`Needs attention (${data.atRisk.length})`} icon={AlertTriangle} className="lg:col-span-1">
          {data.atRisk.length === 0 ? <p className="py-6 text-center text-sm text-emerald-600 dark:text-emerald-400">Nobody is at risk 🎉</p> : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {data.atRisk.map(s => (
                <li key={s.studentid}>
                  <button onClick={() => onOpenStudent(s.studentid)} className="flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-left transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:hover:bg-rose-500/15">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                      <span className="block text-[11px] text-rose-700 dark:text-rose-300">{s.reasons.join(' · ')}</span>
                    </span>
                    <span className="text-sm font-black text-rose-600 dark:text-rose-300">{f1(s.overallPct)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Attendance vs score" icon={Activity} className="lg:col-span-1">
          <Scatter pts={data.scatter} />
          <p className="mt-2 text-xs text-muted-foreground">
            {data.corr === null ? 'Correlation unavailable.' : `Correlation r = ${data.corr.toFixed(2)} — ${Math.abs(data.corr) > 0.5 ? 'strong' : Math.abs(data.corr) > 0.25 ? 'moderate' : 'weak'} ${data.corr >= 0 ? 'positive' : 'negative'} link.`}
          </p>
        </Panel>
      </div>

      <Panel title="Test-by-test breakdown" icon={FileText}>
        <div className="max-h-80 overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>{['Test', 'Subject', 'Date', 'Mean', 'Pass', 'Entries'].map(h => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border text-foreground">
              {data.testStats.map(t => (
                <tr key={t.id} className="hover:bg-muted/60">
                  <td className="px-3 py-2 font-medium text-foreground">{t.name}</td><td className="px-3 py-2">{t.subject}</td><td className="px-3 py-2 tabular-nums">{t.date}</td>
                  <td className="px-3 py-2"><span className={cx('rounded-md px-2 py-0.5 text-xs font-bold', heat(t.mean))}>{f1(t.mean)}%</span></td>
                  <td className="px-3 py-2">{f0(t.passRate)}%</td><td className="px-3 py-2">{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={exportCSV} className={BTN_GHOST}><FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />Export CSV</Button>
        <Button onClick={exportPDF} disabled={busy} className={cx(BTN_PRIMARY, 'h-10 px-5')}>{busy ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}Analytics PDF</Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — GRADE SHEET (searchable / sortable / filterable)
// ─────────────────────────────────────────────────────────────────────────────
function GradeSheetTab({ data, classes, onOpenStudent }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('rank');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const cs = data.classStats;
  const subjects = data.subjects;

  const rows = useMemo(() => {
    let r = cs.rankedStudents.filter(s => (!q || (s.name + s.studentid).toLowerCase().includes(q.toLowerCase())) &&
      (gradeFilter === 'all' || s.overallGrade === gradeFilter));
    const by = { rank: (a, b) => a.rank - b.rank, name: (a, b) => a.name.localeCompare(b.name), low: (a, b) => a.overallPct - b.overallPct, att: (a, b) => (b.attendance?.percent || 0) - (a.attendance?.percent || 0) };
    return [...r].sort(by[sort]);
  }, [cs, q, sort, gradeFilter]);

  const subjAvg = s => cs.subjectStats?.[s]?.mean;

  const exportPDF = async () => {
    setPdfLoading(true);
    try {
      const studentsResults = cs.rankedStudents.map(p => ({
        studentName: p.name, fatherName: p.fathername, mobilenumber: p.mobilenumber, dasNumber: p.studentid,
        marksData: p.subjects.map(s => ({ subject: s.subject, obtained_marks: s.obtained, total_marks: s.total })),
        overallPercent: p.overallPct, overallGrade: p.overallGrade, position: p.rank,
      }));
      const subjectAverages = {};
      subjects.forEach(s => { subjectAverages[s] = (subjAvg(s) ?? 0).toFixed(2); });
      await generatePDF({ studentsResults, subjects, subjectAverages, classes, selectedClass: data.classId, startDate: data.range.start, endDate: data.range.end });
      toast({ variant: 'success', title: 'Grade sheet downloaded' });
    } catch (e) { toast({ variant: 'destructive', title: 'PDF error', description: e.message }); }
    finally { setPdfLoading(false); }
  };

  const exportCSV = () => {
    const head = ['Rank', 'Name', 'Student ID', 'Father', ...subjects.flatMap(s => [`${s} Mrk`, `${s} %`, `${s} Grd`]), 'Total', 'Overall %', 'Overall Grd', 'Attendance %'];
    const lines = [head];
    cs.rankedStudents.forEach(p => {
      const mm = new Map(p.subjects.map(s => [s.subject, s]));
      lines.push([p.rank, p.name, p.studentid, p.fathername, ...subjects.flatMap(s => { const m = mm.get(s); return m ? [`${m.obtained}/${m.total}`, f1(m.pct), m.grade] : ['-', '-', '-']; }),
      `${p.totalObtained}/${p.totalMax}`, f1(p.overallPct), p.overallGrade, f1(p.attendance?.percent)]);
    });
    downloadBlob(lines.map(r => r.map(csvCell).join(',')).join('\n'), `GradeSheet_${data.className}_${data.range.start}_${data.range.end}.csv`);
  };

  return (
    <div className="space-y-4">
      <div className={cx(CARD, 'flex flex-col gap-3 p-4 lg:flex-row lg:items-center')}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or ID…" className={cx(FIELD, 'pl-10')} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setGradeFilter('all')} className={cx('rounded-lg border px-2.5 py-1.5 text-xs font-bold transition', gradeFilter === 'all' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-border text-muted-foreground hover:bg-muted')}>All</button>
          {GRADES.filter(g => cs.gradeDistribution?.[g] > 0).map(g => (
            <button key={g} onClick={() => setGradeFilter(gradeFilter === g ? 'all' : g)}
              className={cx('rounded-lg border px-2.5 py-1.5 text-xs font-bold transition', gradeFilter === g ? 'ring-2 ring-indigo-500' : 'opacity-90 hover:opacity-100', gradeChip(g))}>
              {g} · {cs.gradeDistribution[g]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-slate-400" />
          <select value={sort} onChange={e => setSort(e.target.value)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground">
            <option value="rank">Rank</option><option value="name">Name A–Z</option><option value="low">Lowest first</option><option value="att">Attendance</option>
          </select>
          <Button variant="outline" onClick={exportCSV} className={BTN_GHOST}><FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />Excel</Button>
          <Button variant="outline" onClick={exportPDF} disabled={pdfLoading} className={BTN_GHOST}>{pdfLoading ? <Spinner className="mr-1.5" /> : <Printer className="mr-1.5 h-4 w-4 text-indigo-600 dark:text-indigo-400" />}PDF</Button>
        </div>
      </div>

      {rows.length === 0 && <Empty title="No students match" text="Try clearing the search or grade filter." />}

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map(s => {
          const open = expanded === s.studentid;
          return (
            <div key={s.studentid} className={cx(CARD, open && 'ring-1 ring-indigo-500/40')}>
              <button className="flex w-full items-center justify-between gap-3 p-4 text-left" onClick={() => setExpanded(open ? null : s.studentid)}>
                <div className="flex min-w-0 items-center gap-3"><Rank n={s.rank} size="h-10 w-10" />
                  <div className="min-w-0"><div className="truncate font-bold text-foreground">{s.name}</div><div className="font-mono text-xs text-slate-500">#{s.studentid}</div></div></div>
                <div className="text-right"><div className={cx('text-lg font-black', s.passed ? 'text-indigo-600 dark:text-indigo-300' : 'text-rose-600 dark:text-rose-400')}>{f1(s.overallPct)}%</div><GradePill g={s.overallGrade} /></div>
              </button>
              {open && (
                <div className="border-t border-border bg-muted/50 p-4">
                  {s.subjects.map(sub => (
                    <div key={sub.subject} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                      <span className="text-foreground">{sub.subject}</span>
                      <span className="flex items-center gap-3"><span className="font-mono text-xs text-slate-500">{sub.obtained}/{sub.total}</span><GradePill g={sub.grade} /></span>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => onOpenStudent(s.studentid)} className={cx(BTN_GHOST, 'mt-3 w-full')}>Open student profile</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      {rows.length > 0 && (
        <div className={cx(CARD, 'hidden overflow-hidden md:block')}>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-30 bg-muted px-4 py-3 text-left">Student</th>
                  <th className="px-3 py-3 text-center">Pos</th>
                  {subjects.map(s => <th key={s} className="px-3 py-3 text-center">{s}</th>)}
                  <th className="bg-indigo-100 px-3 py-3 text-center text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">Overall</th>
                  <th className="px-3 py-3 text-center">Attn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(s => {
                  const mm = new Map(s.subjects.map(x => [x.subject, x]));
                  return (
                    <tr key={s.studentid} className="group hover:bg-muted/60">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2.5 group-hover:bg-muted">
                        <button onClick={() => onOpenStudent(s.studentid)} className="text-left">
                          <div className="font-semibold text-foreground hover:text-indigo-600 dark:hover:text-indigo-300">{s.name}</div>
                          <div className="font-mono text-[10px] text-slate-500">{s.studentid}</div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center"><Rank n={s.rank} size="h-7 w-7" /></td>
                      {subjects.map(sub => {
                        const m = mm.get(sub);
                        return <td key={sub} className="px-2 py-2 text-center">
                          {m ? <div className={cx('mx-auto inline-flex flex-col rounded-lg px-2.5 py-1 leading-tight', heat(m.pct))} title={`${m.obtained}/${m.total}`}>
                            <span className="text-xs font-bold">{f0(m.pct)}%</span><span className="text-[9px] opacity-70">{m.obtained}/{m.total} · {m.grade}</span></div> : <span className="text-slate-400">—</span>}
                        </td>;
                      })}
                      <td className="bg-indigo-50/60 px-3 py-2.5 text-center dark:bg-indigo-500/5">
                        <div className={cx('text-sm font-black', s.passed ? 'text-indigo-700 dark:text-indigo-300' : 'text-rose-600 dark:text-rose-400')}>{f1(s.overallPct)}%</div><GradePill g={s.overallGrade} />
                      </td>
                      <td className={cx('px-3 py-2.5 text-center text-xs font-semibold', (s.attendance?.percent ?? 0) < 75 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>{data.attnDays ? `${f0(s.attendance.percent)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-muted text-xs font-bold text-foreground">
                <tr>
                  <td className="sticky left-0 bg-muted px-4 py-3 uppercase tracking-wider">Class average</td><td />
                  {subjects.map(s => <td key={s} className="px-3 py-3 text-center">{f1(subjAvg(s))}%</td>)}
                  <td className="px-3 py-3 text-center text-indigo-700 dark:text-indigo-300">{f1(cs.mean)}%</td><td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">{rows.length} of {cs.rankedStudents.length} students shown</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — STUDENTS (profiles + multi-select: result-card PDF & WhatsApp queue)
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ clear, className }) {
  return clear
    ? <span className={cx('inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300', className)}><CheckCircle2 className="h-3 w-3" />Clear</span>
    : <span className={cx('inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-300', className)}><AlertTriangle className="h-3 w-3" />Pending</span>;
}

function StudentTab({ data, classId, selectedId, setSelectedId }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [checked, setChecked] = useState(() => new Set());
  const [perTest, setPerTest] = useState(false);
  const [busy, setBusy] = useState(null); // 'report' | 'cards' | 'wa'
  const list = data.classStats.rankedStudents;
  const clearCount = list.filter(p => p.isClear === true).length;

  const filtered = list.filter(s =>
    (!q || (s.name + s.studentid + (s.fathername || '')).toLowerCase().includes(q.toLowerCase())) &&
    (status === 'all' || (status === 'clear' ? s.isClear === true : s.isClear !== true)));
  const idx = list.findIndex(s => String(s.studentid) === String(selectedId));
  const s = idx >= 0 ? list[idx] : null;
  const chosen = list.filter(p => checked.has(String(p.studentid)));
  const chosenPending = chosen.filter(p => p.isClear !== true).length;

  const toggle = id => setChecked(prev => { const n = new Set(prev); const k = String(id); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const selectShown = () => setChecked(prev => { const n = new Set(prev); filtered.forEach(p => n.add(String(p.studentid))); return n; });
  const allShownChecked = filtered.length > 0 && filtered.every(p => checked.has(String(p.studentid)));

  const trend = useMemo(() => {
    if (!s) return [];
    return [...s.assessments].filter(a => a.pct !== null && a.date).sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map(a => ({ label: String(a.date).slice(5), value: a.pct }));
  }, [s]);

  const toCardStudent = p => ({
    studentName: p.name, fatherName: p.fathername, mobilenumber: p.mobilenumber, dasNumber: p.studentid,
    className: data.className, isClear: p.isClear, attendance: p.attendance,
    marksData: perTest
      ? p.assessments.map(a => ({ subject: a.testName || a.subject, total_marks: a.total, obtained_marks: a.obtained }))
      : p.subjects.map(x => ({ subject: x.subject, total_marks: x.total, obtained_marks: x.obtained })),
  });

  const downloadCards = async list2 => {
    if (!list2.length) { toast({ variant: 'destructive', title: 'Select students first' }); return; }
    setBusy('cards');
    try {
      await generateClassResultPDF(list2.map(toCardStudent), { name: data.className }, { start: data.range.start, end: data.range.end, attnStart: data.range.aStart, attnEnd: data.range.aEnd });
      toast({ variant: 'success', title: 'Result cards ready', description: `${list2.length} card${list2.length > 1 ? 's' : ''} generated.` });
    } catch (e) { toast({ variant: 'destructive', title: 'PDF failed', description: e.message }); }
    finally { setBusy(null); }
  };

  const queueWA = async list2 => {
    if (!list2.length) { toast({ variant: 'destructive', title: 'Select students first' }); return; }
    const withNum = list2.filter(p => p.mobilenumber);
    const skipped = list2.length - withNum.length;
    if (!withNum.length) { toast({ variant: 'destructive', title: 'No mobile numbers', description: 'None of the selected students have a number.' }); return; }
    setBusy('wa');
    const messages = withNum.map(p => {
      const rows = perTest ? p.assessments.map(a => ({ name: a.testName || a.subject, o: a.obtained, t: a.total })) : p.subjects.map(x => ({ name: x.subject, o: x.obtained, t: x.total }));
      const sub = rows.map(r => { const pc = r.t > 0 ? (r.o / r.t) * 100 : 0; return `- *${r.name}:* ${r.o}/${r.t} (${pc.toFixed(1)}%, ${gradeFromPercent(pc)})`; }).join('\n');
      const a = p.attendance;
      const body = `📊 *Report Card*\n\n *Name:* ${p.name}\n *Father:* ${p.fathername}\n *Class:* ${data.className}\n${sub}\n\n *Attendance:* ${f1(a.percent)}% (P:${a.present}/T:${a.total})\n\n *Total:* ${p.totalObtained}/${p.totalMax}\n *Percentage:* ${p.overallPct.toFixed(2)}%\n *Grade:* ${p.overallGrade}\n *Rank:* ${p.rank}/${data.classStats.rankedStudents.length}\n\n *Regards,* \n *Management* \n DAR-E-ARQAM`;
      return { number: p.mobilenumber, text: body, sent: false, student_id: p.studentid, class_id: classId };
    });
    const { error } = await supabase.from('messages').insert(messages);
    setBusy(null);
    if (error) toast({ variant: 'destructive', title: 'Failed to queue', description: error.message });
    else toast({ variant: 'success', title: `${messages.length} result${messages.length > 1 ? 's' : ''} queued for WhatsApp`, description: skipped ? `${skipped} skipped (no mobile number).` : undefined });
  };

  const downloadReport = async () => {
    setBusy('report');
    try { await generateStudentReportPDF({ studentProfile: s, className: data.className, startDate: data.range.start, endDate: data.range.end }); toast({ variant: 'success', title: 'Student report downloaded' }); }
    catch (e) { toast({ variant: 'destructive', title: 'PDF failed', description: e.message }); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      <div className={cx(CARD, 'sticky top-36 z-20 flex flex-wrap items-center gap-3 p-3 md:top-[9.5rem]', chosen.length > 0 && 'ring-2 ring-indigo-500/50')}>
        <div className="flex items-center gap-2 pl-1">
          <input type="checkbox" checked={allShownChecked} onChange={() => allShownChecked ? setChecked(prev => { const n = new Set(prev); filtered.forEach(p => n.delete(String(p.studentid))); return n; }) : selectShown()}
            className="h-4 w-4 rounded border-border accent-indigo-600" aria-label="Select all shown" />
          <span className="text-sm font-semibold text-foreground">{chosen.length} selected</span>
          {chosen.length > 0 && <span className="text-xs text-muted-foreground">· {chosen.length - chosenPending} clear, {chosenPending} pending</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          <button className="rounded-lg px-2 py-1 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10" onClick={() => setChecked(new Set(list.filter(p => p.isClear === true).map(p => String(p.studentid))))}>Select all clear</button>
          <button className="rounded-lg px-2 py-1 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10" onClick={() => setChecked(new Set(list.map(p => String(p.studentid))))}>Select everyone</button>
          <button className="rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted" onClick={() => setChecked(new Set())}>Clear selection</button>
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={perTest} onChange={e => setPerTest(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />One row per test
        </label>
        <Button variant="outline" disabled={!chosen.length || busy === 'cards'} onClick={() => downloadCards(chosen)} className={BTN_GHOST}>
          {busy === 'cards' ? <Spinner className="mr-1.5" /> : <Download className="mr-1.5 h-4 w-4" />}Result cards PDF
        </Button>
        <Button disabled={!chosen.length || busy === 'wa'} onClick={() => queueWA(chosen)} className="h-10 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          {busy === 'wa' ? <Spinner className="mr-1.5" /> : <Send className="mr-1.5 h-4 w-4" />}WhatsApp
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <aside className={cx(CARD, 'flex max-h-[75vh] flex-col overflow-hidden')}>
          <div className="space-y-2.5 border-b border-border p-3">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Find student…" className={cx(FIELD, 'h-10 pl-9')} /></div>
            <div className="flex gap-1.5">
              {[['all', `All · ${list.length}`], ['clear', `Clear · ${clearCount}`], ['pending', `Pending · ${list.length - clearCount}`]].map(([id, label]) => (
                <button key={id} onClick={() => setStatus(id)} className={cx('flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition',
                  status === id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-border text-muted-foreground hover:bg-muted')}>{label}</button>
              ))}
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {filtered.map(x => {
              const active = String(x.studentid) === String(selectedId);
              const on = checked.has(String(x.studentid));
              return (
                <li key={x.studentid}>
                  <div className={cx('flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition', active ? 'bg-indigo-600 text-white' : 'text-foreground hover:bg-muted')}>
                    <input type="checkbox" checked={on} onChange={() => toggle(x.studentid)} onClick={e => e.stopPropagation()} className="h-4 w-4 shrink-0 rounded border-border accent-indigo-600" aria-label={`Select ${x.name}`} />
                    <button onClick={() => setSelectedId(x.studentid)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <span className="w-5 text-center text-xs font-black opacity-70">{x.rank}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{x.name}</span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          {active ? <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase">{x.isClear ? 'Clear' : 'Pending'}</span> : <StatusBadge clear={x.isClear === true} />}
                          {!x.mobilenumber && <span className={cx('text-[10px] font-semibold', active ? 'text-white/80' : 'text-rose-500')}>no mobile</span>}
                        </span>
                      </span>
                      <span className="text-xs font-bold tabular-nums">{f0(x.overallPct)}%</span>
                    </button>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No matches</li>}
          </ul>
        </aside>

        {!s ? <Empty icon={User} title="Pick a student" text="Click a student to see their profile. Tick the boxes to select several for result cards or WhatsApp." /> : (
          <div className="space-y-4">
            <div className={cx(CARD, 'flex flex-wrap items-center gap-4 p-5')}>
              <Rank n={s.rank} size="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-2xl font-black text-foreground">{s.name}</h2><StatusBadge clear={s.isClear === true} /></div>
                <p className="text-sm text-muted-foreground">S/O {s.fathername || '—'} · #{s.studentid} · {data.className} · Rank {s.rank} of {list.length}</p>
              </div>
              <div className="text-right">
                <div className={cx('text-4xl font-black', s.passed ? 'text-indigo-600 dark:text-indigo-300' : 'text-rose-600 dark:text-rose-400')}>{f1(s.overallPct)}%</div>
                <div className="mt-1 flex items-center justify-end gap-2"><GradePill g={s.overallGrade} /><span className={cx('text-xs font-bold', s.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{s.passed ? 'PASSED' : 'FAILED'}</span></div>
              </div>
              <div className="flex w-full flex-wrap gap-2">
                <Button variant="outline" disabled={idx <= 0} onClick={() => setSelectedId(list[idx - 1].studentid)} className={cx(BTN_GHOST, 'px-3')}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" disabled={idx >= list.length - 1} onClick={() => setSelectedId(list[idx + 1].studentid)} className={cx(BTN_GHOST, 'px-3')}><ChevronRight className="h-4 w-4" /></Button>
                <Button variant="outline" onClick={() => toggle(s.studentid)} className={BTN_GHOST}>{checked.has(String(s.studentid)) ? 'Deselect' : 'Select'}</Button>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy === 'cards'} onClick={() => downloadCards([s])} className={BTN_GHOST}><Download className="mr-1.5 h-4 w-4" />Result card</Button>
                  <Button variant="outline" disabled={busy === 'wa'} onClick={() => queueWA([s])} className={cx(BTN_GHOST, 'text-emerald-700 dark:text-emerald-300')}><Send className="mr-1.5 h-4 w-4" />WhatsApp</Button>
                  <Button onClick={downloadReport} disabled={busy === 'report'} className={cx(BTN_PRIMARY, 'h-10 px-4')}>{busy === 'report' ? <Spinner className="mr-2" /> : <FileText className="mr-2 h-4 w-4" />}Analysis PDF</Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat icon={Target} label="Marks" value={`${s.totalObtained}/${s.totalMax}`} tone="indigo" />
              <Stat icon={FileText} label="Assessments" value={s.assessmentsCount} sub={`${s.passedCount} passed`} tone="sky" />
              <Stat icon={Percent} label="vs class mean" value={`${s.overallPct - data.classStats.mean >= 0 ? '+' : ''}${f1(s.overallPct - data.classStats.mean)}`} sub={`Class ${f1(data.classStats.mean)}%`} tone={s.overallPct >= data.classStats.mean ? 'emerald' : 'amber'} />
              <Stat icon={Activity} label="Attendance" value={data.attnDays ? `${f0(s.attendance.percent)}%` : '—'} sub={data.attnDays ? `${s.attendance.present}/${s.attendance.total} days` : 'No data'} tone={(s.attendance.percent ?? 0) < 75 && data.attnDays ? 'rose' : 'emerald'} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Subjects vs class average" icon={Layers}>
                <HBars rows={s.subjects.map(x => ({ label: x.subject, value: x.pct, color: GRADE_HEX[x.grade], marker: data.classStats.subjectStats?.[x.subject]?.mean, text: `${f0(x.pct)}% · ${x.grade}` }))} />
                <p className="mt-3 text-xs text-muted-foreground">Vertical line marks the class average for each subject.</p>
              </Panel>
              <Panel title="Score timeline" icon={TrendingUp}><LineChart points={trend} /></Panel>
            </div>

            <Panel title="All assessments" icon={FileText}>
              <div className="max-h-72 overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-[10px] uppercase tracking-wider text-muted-foreground"><tr>
                    {['Date', 'Test', 'Subject', 'Marks', '%', 'Grade'].map(h => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-border text-foreground">
                    {[...s.assessments].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((a, i) => (
                      <tr key={i}><td className="px-3 py-2 tabular-nums">{a.date}</td><td className="px-3 py-2 font-medium">{a.testName}</td><td className="px-3 py-2">{a.subject}</td>
                        <td className="px-3 py-2 tabular-nums">{a.obtained}/{a.total}</td><td className="px-3 py-2"><span className={cx('rounded-md px-2 py-0.5 text-xs font-bold', heat(a.pct))}>{f1(a.pct)}%</span></td><td className="px-3 py-2"><GradePill g={a.grade} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — COMPARE CLASSES
// ─────────────────────────────────────────────────────────────────────────────
function CompareTab({ classes, start, end }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => { if (classes.length && selected.length === 0) setSelected(classes.map(c => String(c.id))); }, [classes]); // eslint-disable-line

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const run = async () => {
    if (!start || !end) { toast({ variant: 'destructive', title: 'Pick a date range first' }); return; }
    if (selected.length < 2) { toast({ variant: 'destructive', title: 'Select at least two classes' }); return; }
    setLoading(true);
    try {
      const rows = await paginate(() => supabase.from('marks').select(MARK_SELECT).gte('tests.date', start).lte('tests.date', end));
      const marks = rows.filter(m => m.obtained_marks !== null && m.obtained_marks !== undefined && selected.includes(String(m.tests?.class_id)))
        .map(m => ({ ...m, test_id: m.test_id ?? m.tests?.id }));
      const tmap = {}; marks.forEach(m => { tmap[m.tests.id] = m.tests; });
      const tests = Object.values(tmap);
      const cls = classes.filter(c => selected.includes(String(c.id)));
      const comparison = compareClasses(cls, tests, marks);
      const sets = cls.map(c => ({ classId: c.id, className: c.name, flatMarks: marks.filter(m => String(m.tests.class_id) === String(c.id)).map(flattenMark) }));
      const subjects = [...new Set(sets.flatMap(s => s.flatMarks.map(m => m.subject)).filter(Boolean))].sort();
      const matrix = subjects.map(sub => ({ subject: sub, cells: buildSubjectCrossClassStats(sets, sub) }));
      setRes({ comparison, matrix, sets });
    } catch (e) { console.error(e); toast({ variant: 'destructive', title: 'Comparison failed', description: e.message }); }
    finally { setLoading(false); }
  };

  const exportPDF = async () => {
    setPdfBusy(true);
    try { await generateComparisonPDF(res.comparison, { startDate: start, endDate: end }); toast({ variant: 'success', title: 'Comparison PDF downloaded' }); }
    catch (e) { toast({ variant: 'destructive', title: 'PDF failed', description: e.message }); }
    finally { setPdfBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className={cx(CARD, 'p-5')}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className={LABEL}>Classes to compare · {selected.length} selected</div>
          <div className="flex gap-2 text-xs font-semibold">
            <button className="text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => setSelected(classes.map(c => String(c.id)))}>Select all</button>
            <button className="text-slate-500 hover:underline" onClick={() => setSelected([])}>Clear</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {classes.map(c => {
            const on = selected.includes(String(c.id));
            return <button key={c.id} onClick={() => toggle(String(c.id))} className={cx('rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
              on ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'border-border bg-background text-foreground hover:border-indigo-400')}>{c.name}</button>;
          })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Period: {start || '—'} → {end || '—'} (set in the filter bar above)</p>
          <Button onClick={run} disabled={loading} className={cx(BTN_PRIMARY, 'px-6')}>{loading ? <Spinner className="mr-2" /> : <BarChart3 className="mr-2 h-4 w-4" />}Run comparison</Button>
        </div>
      </div>

      {loading && <SkeletonBlock />}
      {!loading && !res && <Empty icon={BarChart3} title="Compare classes side by side" text="Select classes, choose a period and run the comparison to see rankings and a subject heat-map." />}
      {!loading && res && res.comparison.length === 0 && <Empty title="No data" text="No marks found for these classes in this period." />}

      {!loading && res && res.comparison.length > 0 && (
        <>
          <Panel title="Class leaderboard" icon={Trophy} action={
            <Button variant="outline" onClick={exportPDF} disabled={pdfBusy} className={cx(BTN_GHOST, 'h-8 px-3 text-xs')}>{pdfBusy ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}PDF</Button>}>
            <div className="space-y-3">
              {res.comparison.map(c => (
                <div key={c.classId} className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3">
                  <Rank n={c.rank} size="h-10 w-10" />
                  <div className="min-w-[7rem] flex-1">
                    <div className="font-bold text-foreground">{c.className}</div>
                    <div className="text-xs text-muted-foreground">{c.testedCount} results · {c.testsCount} tests</div>
                  </div>
                  <div className="min-w-[10rem] flex-[2]"><HBars rows={[{ label: 'Mean', value: c.averagePercentage, color: '#6366f1' }, { label: 'Pass rate', value: c.passRate, color: '#10b981' }]} /></div>
                  <div className="text-right text-xs text-muted-foreground">
                    {c.highestSubject && <div>▲ {c.highestSubject.name} <b>{f0(c.highestSubject.avg)}%</b></div>}
                    {c.lowestSubject && <div>▼ {c.lowestSubject.name} <b>{f0(c.lowestSubject.avg)}%</b></div>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Subject × class heat-map (mean %)" icon={Layers}>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-sm">
                <thead><tr><th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider text-slate-500">Subject</th>
                  {res.sets.map(s => <th key={s.classId} className="px-2 py-1 text-center text-[10px] uppercase tracking-wider text-slate-500">{s.className}</th>)}</tr></thead>
                <tbody>
                  {res.matrix.map(r => (
                    <tr key={r.subject}>
                      <td className="whitespace-nowrap px-2 py-1 font-medium text-foreground">{r.subject}</td>
                      {r.cells.map(c => <td key={c.classId} className={cx('rounded-lg px-3 py-2 text-center text-xs font-bold', heat(c.mean))} title={c.mean === null ? '' : `Pass ${f0(c.passRate)}% · n=${c.pcts.length}`}>{c.mean === null ? '—' : `${f1(c.mean)}%`}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3, needsData: true },
  { id: 'sheet', label: 'Grade Sheet', icon: School, needsData: true },
  { id: 'student', label: 'Students', icon: Users, needsData: true },
  { id: 'compare', label: 'Compare', icon: Layers, needsData: false },
];

export default function ResultCenterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState('overview');
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [sepAttn, setSepAttn] = useState(false);
  const [aStart, setAStart] = useState('');
  const [aEnd, setAEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [studentId, setStudentId] = useState(null);

  // restore saved filters + tab from URL
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('reports:filters') || '{}');
      if (s.classId) setClassId(s.classId); if (s.start) setStart(s.start); if (s.end) setEnd(s.end);
    } catch { /* ignore */ }
    supabase.from('classes').select('id, name').order('id').then(({ data: d }) => setClasses(d || []));
  }, []);
  useEffect(() => { if (router.isReady && TABS.some(t => t.id === router.query.tab)) setTab(router.query.tab); }, [router.isReady, router.query.tab]);
  useEffect(() => {
    try { localStorage.setItem('reports:filters', JSON.stringify({ classId, start, end })); } catch { /* ignore */ }
  }, [classId, start, end]);

  const changeTab = id => { setTab(id); router.replace({ pathname: router.pathname, query: { tab: id } }, undefined, { shallow: true }); };
  const applyPreset = p => { const [s, e] = p.range(); setStart(s); setEnd(e); };
  const effAS = sepAttn && aStart ? aStart : start;
  const effAE = sepAttn && aEnd ? aEnd : end;
  const invalidRange = start && end && start > end;
  const canRun = classId && start && end && !invalidRange && !loading;

  const run = useCallback(async () => {
    if (!canRun) return;
    setLoading(true);
    try {
      const className = classes.find(c => String(c.id) === String(classId))?.name || 'Class';
      const { data: students, error } = await supabase.from('active_students').select('studentid, name, fathername, mobilenumber, Clear').eq('class_id', classId);
      if (error) throw error;
      const ids = (students || []).map(s => s.studentid);
      if (!ids.length) { setData({ empty: true, className }); return; }

      const [rawMarks, attn] = await Promise.all([
        paginate(() => supabase.from('marks').select(MARK_SELECT).in('studentid', ids).gte('tests.date', start).lte('tests.date', end)),
        paginate(() => supabase.from('attendance').select('studentid, date, status').in('studentid', ids).gte('date', effAS).lte('date', effAE)),
      ]);
      const valid = rawMarks.filter(m => m.obtained_marks !== null && m.obtained_marks !== undefined && m.total_marks > 0);
      const flat = valid.map(flattenMark);

      const attnDays = new Set(attn.map(a => a.date)).size;
      const presentBy = {};
      attn.forEach(a => { if (a.status === 'Present') presentBy[a.studentid] = (presentBy[a.studentid] || 0) + 1; });
      const attnOf = id => { const p = presentBy[id] || 0; return { total: attnDays, present: p, absent: attnDays - p, percent: attnDays ? (p / attnDays) * 100 : 0 }; };

      const profiles = students.map(s => buildStudentProfile(s.studentid, s, flat, attnOf(s.studentid))).filter(p => p.assessmentsCount > 0);
      const classStats = buildClassStats(profiles, classId, className);
      const subjects = Object.keys(classStats.subjectStats || {}).sort();

      // per-test breakdown
      const tm = {};
      flat.forEach(m => { const k = m.testId; (tm[k] = tm[k] || { id: k, name: m.testName, subject: m.subject, date: m.date, pcts: [] }).pcts.push(m.pct); });
      const testStats = Object.values(tm).map(t => ({ ...t, count: t.pcts.length, mean: mean(t.pcts), passRate: (t.pcts.filter(p => p >= PASS_THRESHOLD).length / t.pcts.length) * 100 }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));

      const scatter = attnDays ? profiles.map(p => ({ a: p.attendance.percent, s: p.overallPct, name: p.name })) : [];
      const corr = scatter.length ? pearson(scatter.map(p => p.a), scatter.map(p => p.s)) : null;

      const atRisk = profiles.map(p => {
        const reasons = [];
        if (p.overallPct < PASS_THRESHOLD) reasons.push('Failing overall');
        else if (p.overallPct < 50) reasons.push('Below 50%');
        const failSubs = p.subjects.filter(s => s.pct < PASS_THRESHOLD).length;
        if (failSubs) reasons.push(`${failSubs} failing subject${failSubs > 1 ? 's' : ''}`);
        if (attnDays && p.attendance.percent < 75) reasons.push(`Attendance ${f0(p.attendance.percent)}%`);
        return { ...p, reasons };
      }).filter(p => p.reasons.length).sort((a, b) => a.overallPct - b.overallPct);

      // insights
      const insights = [];
      const subs = Object.values(classStats.subjectStats || {}).sort((a, b) => b.mean - a.mean);
      if (subs.length > 1) {
        insights.push({ tone: 'good', text: `Strongest subject: ${subs[0].subject} (${f1(subs[0].mean)}% avg).` });
        insights.push({ tone: 'bad', text: `Weakest subject: ${subs[subs.length - 1].subject} (${f1(subs[subs.length - 1].mean)}% avg, ${f0(subs[subs.length - 1].passRate)}% pass).` });
      }
      const high = profiles.filter(p => p.overallPct >= 80).length;
      insights.push({ tone: 'neutral', text: `${high} student${high === 1 ? '' : 's'} (${f0((high / profiles.length) * 100)}%) scored 80% or above.` });
      insights.push({ tone: atRisk.length ? 'bad' : 'good', text: atRisk.length ? `${atRisk.length} student${atRisk.length === 1 ? '' : 's'} need attention (low scores or attendance).` : 'No students flagged as at-risk.' });
      if (corr !== null) insights.push({ tone: 'neutral', text: `Attendance and results are ${Math.abs(corr) > 0.5 ? 'strongly' : Math.abs(corr) > 0.25 ? 'moderately' : 'only weakly'} ${corr >= 0 ? 'positively' : 'negatively'} related (r = ${corr.toFixed(2)}).` });
      if (classStats.stdDev > 20) insights.push({ tone: 'neutral', text: 'Results are widely spread — consider differentiated support.' });
      if (profiles.length < students.length) insights.push({ tone: 'neutral', text: `${students.length - profiles.length} student(s) have no marks in this period and are excluded.` });

      setData({
        classId, className, students, profiles, classStats, subjects, flat, testStats, scatter, corr, atRisk, insights, attnDays,
        deciles: calculateDeciles(valid.map(m => ({ ...m, total_marks: m.total_marks })), []),
        trendMonth: buildTrendByMonth(flat), trendType: buildTrendByTestType(flat),
        range: { start, end, aStart: effAS, aEnd: effAE },
      });
      setStudentId(null);
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Could not load report', description: e.message || 'Unexpected error' });
    } finally { setLoading(false); }
  }, [canRun, classes, classId, start, end, effAS, effAE, toast]);

  const openStudent = id => { setStudentId(id); changeTab('student'); };

  const active = TABS.find(t => t.id === tab);
  const hasData = data && !data.empty && data.classStats.testedCount > 0;

  return (
    <>
      <Navbar />
      <div className="reports-theme min-h-screen bg-background text-foreground">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-[10%] -top-[10%] h-[50%] w-[50%] rounded-full bg-indigo-300/20 blur-[120px] dark:bg-indigo-900/20" />
          <div className="absolute -right-[5%] bottom-0 h-[40%] w-[40%] rounded-full bg-sky-200/30 blur-[100px] dark:bg-slate-700/10" />
        </div>

        <main className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-28 md:px-6">
          <header className="mb-6 flex flex-col gap-1">
            <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight md:text-4xl">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg shadow-indigo-600/30"><GraduationCap className="h-7 w-7" /></span>
              Academic Reports
            </h1>
            <p className="text-muted-foreground">Analytics, grade sheets, student profiles, class comparison, result cards and WhatsApp — in one place.</p>
          </header>

          {/* Filter bar */}
          <section className={cx(CARD, 'mb-6 p-5')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
              <div className="space-y-1.5">
                <label className={LABEL}>Class</label>
                <Select onValueChange={setClassId} value={classId}>
                  <SelectTrigger className={FIELD}><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className={cx(LABEL, 'flex items-center gap-1')}><Calendar className="h-3 w-3" />From</label>
                <Input type="date" value={start} onChange={e => setStart(e.target.value)} className={FIELD} />
              </div>
              <div className="space-y-1.5">
                <label className={cx(LABEL, 'flex items-center gap-1')}><Calendar className="h-3 w-3" />To</label>
                <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className={FIELD} />
              </div>
              <div className="flex items-end">
                <Button onClick={run} disabled={!canRun} className={cx(BTN_PRIMARY, 'w-full px-6 lg:w-auto')}>
                  {loading ? <><Spinner className="mr-2" />Loading…</> : <><Search className="mr-2 h-4 w-4" />Generate</>}
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Quick range:</span>
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => applyPreset(p)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-indigo-500 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-300">{p.label}</button>
              ))}
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={sepAttn} onChange={e => setSepAttn(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
                Separate attendance range
              </label>
            </div>
            {sepAttn && (
              <div className="mt-3 grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:grid-cols-2 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                <div><label className={cx(LABEL, 'text-emerald-700 dark:text-emerald-400')}>Attendance from</label><Input type="date" value={aStart} onChange={e => setAStart(e.target.value)} className={cx(FIELD, 'mt-1')} /></div>
                <div><label className={cx(LABEL, 'text-emerald-700 dark:text-emerald-400')}>Attendance to</label><Input type="date" value={aEnd} onChange={e => setAEnd(e.target.value)} className={cx(FIELD, 'mt-1')} /></div>
              </div>
            )}
            {invalidRange && <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-400">“From” date must be before “To” date.</p>}
          </section>

          {/* Tabs */}
          <nav className="sticky top-20 z-30 -mx-1 mb-6 overflow-x-auto px-1 py-2">
            <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-card/90 p-1 shadow-sm backdrop-blur-xl">
              {TABS.map(t => {
                const Icon = t.icon; const on = tab === t.id;
                return (
                  <button key={t.id} onClick={() => changeTab(t.id)} className={cx('flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition',
                    on ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                    <Icon className="h-4 w-4" />{t.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          {active.needsData ? (
            loading ? <SkeletonBlock />
              : !data ? <Empty icon={BarChart3} title="Ready when you are" text="Pick a class and a date range, then press Generate to unlock analytics, grade sheet, student profiles and result cards." />
                : data.empty ? <Empty title="No active students" text={`${data.className} has no active students.`} />
                  : !hasData ? <Empty title="No results found" text="No marks were recorded for this class in the selected period. Try widening the date range." />
                    : (
                      <>
                        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="rounded-lg bg-indigo-100 px-2.5 py-1 font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{data.className}</span>
                          <span>{data.range.start} → {data.range.end}</span><span>·</span><span>{data.classStats.testedCount} students</span><span>·</span><span>{data.testStats.length} tests</span>
                          {data.attnDays > 0 && <><span>·</span><span>{data.attnDays} attendance days</span></>}
                        </div>
                        {tab === 'overview' && <OverviewTab data={data} onOpenStudent={openStudent} />}
                        {tab === 'sheet' && <GradeSheetTab data={data} classes={classes} onOpenStudent={openStudent} />}
                        {tab === 'student' && <StudentTab data={data} classId={classId} selectedId={studentId} setSelectedId={setStudentId} />}
                      </>
                    )
          ) : <CompareTab classes={classes} start={start} end={end} />}
        </main>
      </div>
    </>
  );
}
