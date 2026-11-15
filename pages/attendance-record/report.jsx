"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { 
  ArrowLeft, 
  Printer, 
  Send, 
  FileText, 
  Calendar as CalendarIcon, 
  Users, 
  Percent, 
  CheckCircle2, 
  Search,
  School,
  Loader2,
  Download,
  FileSpreadsheet
} from "lucide-react";

import { supabase } from "../../utils/supabaseClient";
import { canAccessClass, getClassAccess } from "../../utils/classAccess";
import Navbar from "../../components/Navbar";
import Breadcrumbs from "../../components/Breadcrumbs";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../../hooks/use-toast";
import { Input } from "../../components/ui/input";

/* ---------------- Glass Components ---------------- */
const GlassCard = ({ children, className = "" }) => (
  <div className={`rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl shadow-sm dark:shadow-xl overflow-hidden ${className}`}>
    {children}
  </div>
);

/* ---------------- PDF Export (jsPDF, no autoTable) ---------------- */
const exportToPDF = async ({ className, startDate, endDate, reportData, overallPercentage }) => {
  // Dynamically import jsPDF to avoid SSR issues
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const usableW = pageW - marginX * 2;

  // ── Header ──────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, pageW, 30, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Attendance Report", pageW / 2, 12, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(className || "", pageW / 2, 20, { align: "center" });

  doc.setFontSize(9);
  doc.text(
    `Period: ${format(new Date(startDate), "dd MMM yyyy")} — ${format(new Date(endDate), "dd MMM yyyy")}`,
    pageW / 2,
    26,
    { align: "center" }
  );

  // ── Summary Stats ────────────────────────────────────────────────────
  let y = 38;
  const statBoxW = usableW / 3 - 2;
  const stats = [
    { label: "Total Students", value: String(reportData.length), color: [219, 234, 254] },
    { label: "Avg. Attendance", value: `${overallPercentage.toFixed(1)}%`, color: [237, 233, 254] },
    {
      label: "Total Presents",
      value: String(reportData.reduce((a, c) => a + c.present, 0)),
      color: [209, 250, 229],
    },
  ];

  stats.forEach((stat, i) => {
    const x = marginX + i * (statBoxW + 3);
    doc.setFillColor(...stat.color);
    doc.roundedRect(x, y, statBoxW, 18, 3, 3, "F");
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(stat.label, x + statBoxW / 2, y + 6, { align: "center" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(stat.value, x + statBoxW / 2, y + 14, { align: "center" });
  });

  y += 24;

  // ── Table ────────────────────────────────────────────────────────────
  const cols = [
    { header: "#", width: 10 },
    { header: "Student Name", width: 60 },
    { header: "Father Name", width: 50 },
    { header: "Present", width: 24 },
    { header: "Absent", width: 22 },
    { header: "%", width: 22 },
  ];

  const rowHeight = 9;
  const headerH = 10;

  const drawTableHeader = (startY) => {
    doc.setFillColor(37, 99, 235);
    doc.rect(marginX, startY, usableW, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");

    let cx = marginX + 2;
    cols.forEach((col) => {
      doc.text(col.header, cx, startY + 7);
      cx += col.width;
    });
    return startY + headerH;
  };

  y = drawTableHeader(y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  reportData.forEach((student, idx) => {
    // Page break
    if (y + rowHeight > pageH - 18) {
      doc.addPage();
      y = 14;
      y = drawTableHeader(y);
    }

    // Row shading
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, usableW, rowHeight, "F");
    }

    // Percentage badge color
    const pct = student.percentage;
    let badgeColor = [239, 68, 68]; // red
    if (pct >= 90) badgeColor = [16, 185, 129];
    else if (pct >= 75) badgeColor = [245, 158, 11];

    doc.setTextColor(55, 65, 81);
    let cx = marginX + 2;
    const cells = [
      String(idx + 1),
      student.name,
      student.fathername,
      String(student.present),
      String(student.absent),
      null, // percentage - drawn specially
    ];

    cells.forEach((val, ci) => {
      if (val !== null) {
        doc.text(val, cx, y + 6.5);
      } else {
        // Draw colored percentage pill
        const pillX = cx;
        const pillY = y + 1.5;
        const pillW = cols[ci].width - 4;
        const pillH = 6;
        doc.setFillColor(...badgeColor);
        doc.roundedRect(pillX, pillY, pillW, pillH, 1.5, 1.5, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text(`${student.percentageStr}%`, pillX + pillW / 2, y + 6, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 65, 81);
      }
      cx += cols[ci].width;
    });

    // Row bottom border
    doc.setDrawColor(229, 231, 235);
    doc.line(marginX, y + rowHeight, marginX + usableW, y + rowHeight);

    y += rowHeight;
  });

  // ── Footer on each page ──────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(243, 244, 246);
    doc.rect(0, pageH - 10, pageW, 10, "F");
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text("Generated via School Management System", marginX, pageH - 3.5);
    doc.text(
      `${format(new Date(), "dd MMM yyyy HH:mm")}   |   Page ${p} of ${totalPages}`,
      pageW - marginX,
      pageH - 3.5,
      { align: "right" }
    );
  }

  // ── Open in new tab as blob ──────────────────────────────────────────
  const pdfBlob = doc.output("blob");
  const blobUrl = URL.createObjectURL(pdfBlob);
  window.open(blobUrl, "_blank");
};

/* ---------------- CSV Export ---------------- */
const exportToCSV = ({ className, startDate, endDate, reportData }) => {
  const periodLabel = `${format(new Date(startDate), "dd-MMM-yyyy")} to ${format(new Date(endDate), "dd-MMM-yyyy")}`;

  const headers = ["#", "Student Name", "Father Name", "Present", "Absent", "Percentage"];
  const rows = reportData.map((s, i) => [
    i + 1,
    `"${s.name}"`,
    `"${s.fathername}"`,
    s.present,
    s.absent,
    `${s.percentageStr}%`,
  ]);

  const csvContent = [
    [`"Attendance Report — ${className}"`],
    [`"Period: ${periodLabel}"`],
    [],
    headers,
    ...rows,
    [],
    [`"Total Students: ${reportData.length}"`],
    [`"Overall Attendance: ${reportData.length > 0 ? ((reportData.reduce((a,c) => a+c.present,0) / reportData.reduce((a,c) => a+c.present+c.absent,0))*100).toFixed(1) : 0}%"`],
  ]
    .map((row) => row.join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance_${className?.replace(/\s+/g, "_")}_${format(new Date(startDate), "MMM-yyyy")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

/* ================================================================
   MAIN PAGE
================================================================ */
export default function AttendanceReportPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Data State
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [reportData, setReportData] = useState([]);
  const [overallPercentage, setOverallPercentage] = useState(0);
  
  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchClasses = async () => {
      const access = await getClassAccess();
      if (access.role === "teacher" && !access.classIds?.length) {
        setClasses([]);
        return;
      }
      let query = supabase.from("classes").select("id, name");
      if (access.role === "teacher") query = query.in("id", access.classIds || []);
      const { data, error } = await query;
      if (error) {
        toast({ variant: "destructive", title: "Error", description: error.message });
      } else {
        setClasses(data || []);
      }
    };
    fetchClasses();
  }, []);

  const fetchReport = async () => {
    if (!selectedClassId) {
      toast({ variant: "destructive", title: "Required", description: "Please select a class first." });
      return;
    }

    try {
      if (!canAccessClass(await getClassAccess(), selectedClassId)) {
        throw new Error("You can only view attendance for your assigned classes.");
      }
      setIsLoading(true);

      let allData = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from("attendance")
          .select("studentid, status, date, active_students(name, fathername, mobilenumber)")
          .eq("class_id", selectedClassId)
          .gte("date", startDate)
          .lte("date", endDate)
          .range(from, to);

        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < pageSize) hasMore = false;
          else page++;
        } else {
          hasMore = false;
        }
      }

      const map = new Map();
      allData.forEach((row) => {
        if (!map.has(row.studentid)) {
          map.set(row.studentid, {
            studentid: row.studentid,
            name: row.active_students?.name || "Unknown",
            fathername: row.active_students?.fathername || "-",
            mobilenumber: row.active_students?.mobilenumber || "",
            present: 0,
            absent: 0,
            percentage: 0,
            percentageStr: "0.0"
          });
        }
        const rec = map.get(row.studentid);
        if (row.status === "Present") rec.present += 1;
        else if (row.status === "Absent") rec.absent += 1;
      });

      let totalPresent = 0;
      let totalRecords = 0;

      const aggregated = Array.from(map.values()).map((s) => {
        const total = s.present + s.absent;
        const pct = total > 0 ? (s.present / total) * 100 : 0;
        totalPresent += s.present;
        totalRecords += total;
        return { ...s, percentage: pct, percentageStr: pct.toFixed(1) };
      });

      // Remove students with unknown/missing names
      const knownOnly = aggregated.filter((s) => s.name && s.name.toLowerCase() !== "unknown");
      knownOnly.sort((a, b) => a.name.localeCompare(b.name));

      const overall = totalRecords > 0 ? ((totalPresent / totalRecords) * 100) : 0;
      setReportData(knownOnly);
      setOverallPercentage(overall);

      if (knownOnly.length === 0) {
        toast({ title: "No Data", description: "No attendance records found for this period." });
      } else {
        toast({ variant: "default", title: "Report Generated", description: `Processed ${knownOnly.length} students.` });
      }
    } catch (err) {
      console.error("Report fetch error:", err);
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const sendReports = async () => {
    if (reportData.length === 0) return;
    try {
      if (!canAccessClass(await getClassAccess(), selectedClassId)) {
        throw new Error("You can only send attendance reports for your assigned classes.");
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Not allowed", description: err.message });
      return;
    }

    const messages = reportData
      .filter((s) => (s.mobilenumber || "").trim() !== "")
      .map((s) => ({
        student_id: s.studentid,
        class_id: selectedClassId,
        number: s.mobilenumber,
        text: `Dear Parent,\n\nAttendance Report for *${s.name}* (${format(new Date(startDate), "dd-MMM")} to ${format(new Date(endDate), "dd-MMM")}):\n\n✅ Present: ${s.present}\n❌ Absent: ${s.absent}\n📊 Percentage: ${s.percentageStr}%\n\nRegular attendance ensures better learning.\n\nRegards,\nDAR-E-ARQAM SCHOOL`,
      }));

    if (messages.length === 0) {
      toast({ title: "No Contacts", description: "No student phone numbers found." });
      return;
    }

    try {
      setIsSending(true);
      const { error } = await supabase.from("messages").insert(messages);
      if (error) throw error;
      toast({ variant: "default", title: "Success", description: `${messages.length} messages queued for sending.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setIsSending(false);
    }
  };

  const handlePrintPDF = async () => {
    if (reportData.length === 0) return;
    try {
      setIsPdfLoading(true);
      await exportToPDF({
        className: classes.find((c) => c.id === selectedClassId)?.name || "",
        startDate,
        endDate,
        reportData: filteredData,
        overallPercentage,
      });
    } catch (err) {
      console.error("PDF error:", err);
      toast({ variant: "destructive", title: "PDF Error", description: err.message });
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (reportData.length === 0) return;
    exportToCSV({
      className: classes.find((c) => c.id === selectedClassId)?.name || "Class",
      startDate,
      endDate,
      reportData: filteredData,
    });
  };

  const getPercentageColor = (pct) => {
    if (pct >= 90) return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30";
    if (pct >= 75) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30";
    return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30";
  };

  const statusBadgeStyles = {
    present: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30",
    absent: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30"
  };

  const filteredData = reportData.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.fathername.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 pb-20 print:bg-white print:text-black print:pb-0">
      
      <div className="print:hidden">
        <Navbar />
      </div>

      <div className="container mx-auto max-w-6xl p-4 md:p-8 space-y-6">
        
        <div className="print:hidden space-y-6">
          <div className="hidden md:block">
            <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports", href: "#" }]} />
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <Button variant="ghost" size="sm" onClick={() => router.back()} className="pl-0 text-gray-500 hover:bg-transparent">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <h1 className="text-3xl font-bold tracking-tight mt-2 flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-600" />
                Attendance Report
              </h1>
              <p className="text-gray-500 dark:text-slate-400 mt-1">
                Generate detailed attendance summaries for classes.
              </p>
            </div>
          </div>

          {/* Controls Card */}
          <GlassCard className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-gray-500 flex items-center gap-1">
                  <School className="w-3 h-3" /> Class
                </label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10">
                    <SelectValue placeholder="Select Class" />
                  </SelectTrigger>
                  <SelectContent side="bottom" position="popper" sideOffset={4} avoidCollisions={false} className="z-[9999]">
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-gray-500 flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" /> Start Date
                </label>
                <Input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                  className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-gray-500 flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" /> End Date
                </label>
                <Input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                  className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10"
                />
              </div>

              <Button 
                onClick={fetchReport} 
                disabled={isLoading} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                Generate
              </Button>
            </div>
          </GlassCard>
        </div>

        {/* Report Content */}
        {reportData.length > 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 print:hidden bg-white/5 dark:bg-white/[0.02] p-4 rounded-xl border border-gray-200 dark:border-white/5">
               <div className="relative w-full sm:w-64">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                 <input 
                   type="text" 
                   placeholder="Filter students..." 
                   className="w-full pl-9 pr-4 py-2 text-sm rounded-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                 />
               </div>

               <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
                 {/* ── PDF Button ── */}
                 <Button 
                   variant="outline" 
                   onClick={handlePrintPDF}
                   disabled={isPdfLoading}
                   className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                 >
                   {isPdfLoading
                     ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                     : <Printer className="w-4 h-4 mr-2" />
                   }
                   Print PDF
                 </Button>

                 {/* ── CSV Button ── */}
                 <Button 
                   variant="outline"
                   onClick={handleExportCSV}
                   className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                 >
                   <FileSpreadsheet className="w-4 h-4 mr-2" />
                   Export CSV
                 </Button>

                 {/* ── Notify Button ── */}
                 <Button 
                   onClick={sendReports} 
                   disabled={isSending}
                   className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
                 >
                   {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                   Notify Parents
                 </Button>
               </div>
            </div>

            {/* Print Header (Only visible when printing) */}
            <div className="hidden print:block mb-8 text-center border-b pb-4">
              <h1 className="text-2xl font-bold uppercase tracking-wider">Attendance Report</h1>
              <h2 className="text-xl text-gray-600 mt-1">{classes.find(c => c.id === selectedClassId)?.name}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Period: {format(new Date(startDate), "dd MMM yyyy")} — {format(new Date(endDate), "dd MMM yyyy")}
              </p>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-4 print:mb-6">
              <GlassCard className="p-4 flex items-center gap-4 border-l-4 border-l-blue-500 print:border text-left">
                <div className="p-3 rounded-full bg-blue-50 dark:bg-blue-900/20 print:hidden">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Total Students</p>
                  <p className="text-2xl font-bold">{filteredData.length}</p>
                </div>
              </GlassCard>

              <GlassCard className="p-4 flex items-center gap-4 border-l-4 border-l-purple-500 print:border text-left">
                <div className="p-3 rounded-full bg-purple-50 dark:bg-purple-900/20 print:hidden">
                  <Percent className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Avg. Attendance</p>
                  <p className={`text-2xl font-bold ${overallPercentage < 75 ? 'text-rose-500 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>
                    {overallPercentage.toFixed(1)}%
                  </p>
                </div>
              </GlassCard>

              <GlassCard className="p-4 flex items-center gap-4 border-l-4 border-l-emerald-500 print:border text-left">
                <div className="p-3 rounded-full bg-emerald-50 dark:bg-emerald-900/20 print:hidden">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Total Presents</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{reportData.reduce((acc, curr) => acc + curr.present, 0)}</p>
                </div>
              </GlassCard>
            </div>

            {/* Desktop Table View */}
            <GlassCard className="hidden md:block print:block print:shadow-none print:border-none print:bg-transparent">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-slate-400 uppercase text-xs font-semibold border-b border-gray-200 dark:border-white/10 print:bg-gray-100 print:text-black">
                    <tr>
                      <th className="px-6 py-4">#</th>
                      <th className="px-6 py-4">Student Name</th>
                      <th className="px-6 py-4">Father Name</th>
                      <th className="px-6 py-4 text-center">Present</th>
                      <th className="px-6 py-4 text-center">Absent</th>
                      <th className="px-6 py-4 text-right">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {filteredData.map((student, idx) => (
                      <tr key={student.studentid} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] print:hover:bg-transparent">
                        <td className="px-6 py-4 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-slate-200 print:text-black">
                          {student.name}
                        </td>
                        <td className="px-6 py-4 text-gray-500 dark:text-slate-400 print:text-black">
                          {student.fathername}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border print:bg-transparent print:text-black print:border-gray-300 ${statusBadgeStyles.present}`}>
                            {student.present}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border print:bg-transparent print:text-black print:border-gray-300 ${statusBadgeStyles.absent}`}>
                            {student.absent}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-bold border print:bg-transparent print:text-black print:border-none ${getPercentageColor(student.percentage)}`}>
                            {student.percentageStr}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>

            {/* Mobile Card View */}
            <div className="grid grid-cols-1 gap-4 md:hidden print:hidden">
              {filteredData.map((student) => (
                <GlassCard key={student.studentid} className="p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{student.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400">{student.fathername}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-xs font-bold border ${getPercentageColor(student.percentage)}`}>
                      {student.percentageStr}%
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className={`p-2 rounded-lg text-center border ${statusBadgeStyles.present}`}>
                      <span className="block text-xl font-bold">{student.present}</span>
                      <span className="text-xs uppercase opacity-70">Present</span>
                    </div>
                    <div className={`p-2 rounded-lg text-center border ${statusBadgeStyles.absent}`}>
                      <span className="block text-xl font-bold">{student.absent}</span>
                      <span className="text-xs uppercase opacity-70">Absent</span>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>

          </div>
        )}
      </div>

      {/* Print Footer */}
      <div className="hidden print:flex fixed bottom-0 left-0 w-full justify-between p-8 text-xs text-gray-400 border-t mt-4">
         <span>Generated via School Management System</span>
         <span>{format(new Date(), "dd MMM yyyy HH:mm")}</span>
      </div>
    </div>
  );
}
