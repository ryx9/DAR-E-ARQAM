"use client"

import { useState, useEffect, useMemo } from "react"
import { supabase } from "../../utils/supabaseClient"
import Navbar from "../../components/Navbar"
import Loader from "../../components/Loader"
import { Button } from "../../components/ui/button"
import {
  Download, FileText, FileSpreadsheet, Filter,
  CheckSquare, Square, Layers, Medal, Users, Settings2,
  GraduationCap, TableProperties, Sparkles
} from "lucide-react"
import { useToast } from "../../hooks/use-toast"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { motion, AnimatePresence } from "framer-motion"

const AVAILABLE_COLUMNS = [
  { key: "studentid", label: "Student ID" },
  { key: "name", label: "Name" },
  { key: "fathername", label: "Father Name" },
  { key: "class_name", label: "Class" },
  { key: "gender", label: "Gender" },
  { key: "mobilenumber", label: "Mobile Number" },
  { key: "dob", label: "Date of Birth" },
  { key: "joining_date", label: "Joining Date" },
  { key: "address", label: "Address" },
  { key: "monthly_fee", label: "Monthly Fee" },
  { key: "Clear", label: "Clear Status" },
]

const formatReportValue = (student, key) => {
  const value = student[key]
  if (value == null || value === '') return '-'
  if (key === 'dob' || key === 'joining_date') {
    const datePart = String(value).slice(0, 10)
    const parsed = new Date(`${datePart}T12:00:00`)
    if (!Number.isNaN(parsed.getTime())) {
      const day = String(parsed.getDate()).padStart(2, '0')
      const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parsed.getMonth()]
      return `${day}-${month}-${parsed.getFullYear()}`
    }
  }
  return String(value)
}

export default function ReportGeneratorPage() {
  const { toast } = useToast()

  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  const [selectedClassId, setSelectedClassId] = useState("all")
  const [isAwardSheet, setIsAwardSheet] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState([
    "studentid", "name", "fathername", "mobilenumber"
  ])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("id, name")
      .order("id", { ascending: true })

    const { data: studentData, error: studentError } = await supabase
      .from("active_students")
      .select("*")
      .order("name", { ascending: true })

    if (classError || studentError) {
      toast({ title: "Failed to fetch data", variant: "destructive" })
    } else {
      setClasses(classData || [])
      const mappedStudents = (studentData || []).map(student => {
        const studentClass = classData?.find(c => c.id === student.class_id)
        return {
          ...student,
          class_name: studentClass ? studentClass.name : "Unknown",
          // Normalize fee: coerce to string so it never shows as empty
          mothly_fee: student.mothly_fee != null ? String(student.mothly_fee) : "",
          Clear: student.Clear === true || student.Clear === "true" ? "Yes" : "No"
        }
      })
      setStudents(mappedStudents)
    }
    setLoading(false)
  }

  const handleAwardSheetToggle = () => {
    const newState = !isAwardSheet
    setIsAwardSheet(newState)
    if (newState) {
      setSelectedColumns(["studentid", "name", "fathername"])
    }
  }

  const toggleColumn = (colKey) => {
    if (isAwardSheet) return
    setSelectedColumns(prev =>
      prev.includes(colKey)
        ? prev.filter(k => k !== colKey)
        : [...prev, colKey]
    )
  }

  const filteredStudents = useMemo(() => {
    if (selectedClassId === "all") return students
    return students.filter(s => s.class_id.toString() === selectedClassId)
  }, [students, selectedClassId])

  const activeColumns = useMemo(() => {
    return AVAILABLE_COLUMNS.filter(col => selectedColumns.includes(col.key))
  }, [selectedColumns])

  // --- EXPORTS ---

  const exportCSV = () => {
    if (filteredStudents.length === 0) {
      return toast({ title: "No data to export", variant: "destructive" })
    }

    const headers = activeColumns.map(col => col.label).join(",")
    const rows = filteredStudents.map(student =>
      activeColumns.map(col => `"${String(student[col.key] ?? "").replace(/"/g, '""')}"`).join(",")
    )

    const csvContent = [headers, ...rows].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.setAttribute("download", `Data_Export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({ title: "CSV Exported Successfully! 📊" })
  }

  const exportPDF = async () => {
    if (filteredStudents.length === 0) {
      return toast({ title: "No data to export", variant: "destructive" })
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

    const targetClasses = selectedClassId === "all"
      ? classes.filter(c => filteredStudents.some(s => s.class_id === c.id))
      : classes.filter(c => c.id.toString() === selectedClassId)

    {
      let logo = null
      try {
        const response = await fetch('/logo-1.png')
        if (!response.ok) throw new Error('Logo unavailable')
        const blob = await response.blob()
        logo = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      } catch (error) {
        console.warn('Award sheet logo unavailable:', error)
      }

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const generated = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      let firstClass = true

      targetClasses.forEach(cls => {
        const classStudents = filteredStudents.filter(s => s.class_id === cls.id)
        if (!classStudents.length) return
        if (!firstClass) doc.addPage()
        firstClass = false

        const drawHeader = () => {
          doc.setFillColor(40, 38, 80)
          doc.rect(0, 0, pageWidth, 2.5, 'F')
          if (logo) doc.addImage(logo, 'PNG', 14, 8, 53, 18)
          else {
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(12)
            doc.setTextColor(40, 38, 80)
            doc.text('DAR-E-ARQAM SCHOOL', 14, 17)
          }
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(15)
          doc.setTextColor(30, 41, 59)
          doc.text(isAwardSheet ? 'AWARD SHEET' : 'STUDENT REPORT', pageWidth - 14, 15, { align: 'right' })
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(100, 116, 139)
          doc.text(isAwardSheet ? 'ACADEMIC RECORD' : 'STUDENT RECORDS', pageWidth - 14, 21, { align: 'right' })
          doc.setDrawColor(203, 213, 225)
          doc.line(14, 29, pageWidth - 14, 29)
          doc.setTextColor(30, 41, 59)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.text(`Class: ${cls.name}`, 14, 36)
          doc.text(`Students: ${classStudents.length}`, pageWidth - 14, 36, { align: 'right' })
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          if (isAwardSheet) {
            doc.text('Examination: __________________________', 14, 43)
            doc.text('Session: __________________', 112, 43)
            doc.text('Subject: _______________________________', 14, 50)
            doc.text('Date: _____________________', 112, 50)
          }
        }

        autoTable(doc, {
          startY: isAwardSheet ? 55 : 43,
          margin: { top: isAwardSheet ? 55 : 43, right: 14, bottom: 24, left: 14 },
          head: isAwardSheet ? [['No.', 'Student ID', 'Student name', 'Father / guardian', '', '', '', '', '', '']] : [['No.', ...activeColumns.map(col => col.label)]],
          body: isAwardSheet ? classStudents.map((student, index) => [index + 1, student.studentid ?? '-', student.name || '-', student.fathername || '-', '', '', '', '', '', '']) : classStudents.map((student, index) => [index + 1, ...activeColumns.map(col => formatReportValue(student, col.key))]),
          theme: 'grid',
          showHead: 'everyPage',
          rowPageBreak: 'avoid',
          styles: { font: 'helvetica', fontSize: 8, textColor: [30, 41, 59], lineColor: [190, 198, 210], lineWidth: 0.18, cellPadding: 2, minCellHeight: 9, valign: 'middle', overflow: 'linebreak' },
          headStyles: { fillColor: [235, 238, 244], textColor: [30, 41, 59], fontStyle: 'bold', minCellHeight: 12, valign: 'middle' },
          columnStyles: isAwardSheet ? { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 19 }, 2: { cellWidth: 33 }, 3: { cellWidth: 31 }, 4: { cellWidth: 15 }, 5: { cellWidth: 15 }, 6: { cellWidth: 15 }, 7: { cellWidth: 15 }, 8: { cellWidth: 15 }, 9: { cellWidth: 15 } } : { 0: { cellWidth: 10, halign: 'center' } },
          didDrawPage: () => {
            drawHeader()
            doc.setDrawColor(203, 213, 225)
            doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7)
            doc.setTextColor(100, 116, 139)
            doc.text(`Generated ${generated}  |  Class: ${cls.name}`, 14, pageHeight - 11)
            doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, pageWidth - 14, pageHeight - 11, { align: 'right' })
          },
        })
      })
      doc.save(`${isAwardSheet ? 'Award_Sheet' : 'Class_Report'}_${new Date().toISOString().split('T')[0]}.pdf`)
      toast({ title: 'PDF downloaded' })
      return
    }

  }

  const totalStudentCount = filteredStudents.length
  const selectedClass = classes.find(c => c.id.toString() === selectedClassId)

  return (
    <>
      <Navbar />

      <div className="min-h-screen transition-colors duration-300 bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

          {/* --- HEADER --- */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Report Generator</h1>
              <p className="text-gray-500 dark:text-slate-400 mt-1">
                Configure and download student reports or printable award sheets.
              </p>
            </div>

            {!loading && totalStudentCount > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-4 py-2 rounded-lg text-sm font-semibold border border-blue-100 dark:border-blue-800/50">
                <Users className="w-4 h-4" />
                {totalStudentCount} Student{totalStudentCount !== 1 ? "s" : ""}{selectedClass ? ` · ${selectedClass.name}` : " · All Classes"}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader /></div>
          ) : (
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl">

              <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">

                {/* --- LEFT: SETTINGS --- */}
                <div className="md:col-span-5 space-y-6">

                  {/* Target Class */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                      <GraduationCap className="w-3.5 h-3.5" /> Target Class
                    </label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/5 dark:border-white/10 dark:text-white"
                    >
                      <option value="all">All Classes (Combined)</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Report Format Toggle */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                      <Medal className="w-3.5 h-3.5" /> Report Format
                    </label>
                    <button
                      onClick={handleAwardSheetToggle}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-sm font-medium ${
                        isAwardSheet
                          ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700/50 dark:text-blue-300 shadow-sm"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-transparent dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        Printable Award Sheet
                      </span>
                      <div className={`w-4 h-4 rounded flex items-center justify-center border ${isAwardSheet ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                        {isAwardSheet && <CheckSquare className="w-3 h-3" />}
                      </div>
                    </button>
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                      {isAwardSheet
                        ? "Locks columns to ID/Name and adds blank grid spaces for entering marks."
                        : "Standard report. Select custom columns to include from the panel on the right."}
                    </p>
                  </div>

                  {/* Export Actions */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                      <Download className="w-3.5 h-3.5" /> Export
                    </label>
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={exportPDF}
                        disabled={selectedColumns.length === 0 || filteredStudents.length === 0}
                        className="h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white w-full justify-start px-4"
                      >
                        <FileText className="w-4 h-4 mr-2" /> Download PDF Report
                      </Button>
                      <Button
                        onClick={exportCSV}
                        disabled={selectedColumns.length === 0 || filteredStudents.length === 0 || isAwardSheet}
                        variant="outline"
                        className="h-10 text-sm bg-white border-gray-200 dark:bg-transparent dark:border-white/10 dark:text-slate-300 w-full justify-start px-4"
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-2" /> Export CSV
                      </Button>
                    </div>
                  </div>

                </div>

                {/* --- RIGHT: COLUMN PICKER --- */}
                <div className="md:col-span-7 md:border-l md:border-gray-100 dark:md:border-white/5 md:pl-6">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-2">
                      <TableProperties className="w-3.5 h-3.5" /> Data Columns
                    </label>
                    <span className="text-[10px] bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-slate-400 px-2 py-0.5 rounded font-semibold uppercase">
                      {isAwardSheet ? "Locked" : `${selectedColumns.length} Selected`}
                    </span>
                  </div>

                  <div className={`grid grid-cols-2 gap-2 transition-opacity ${isAwardSheet ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                    {AVAILABLE_COLUMNS.map(col => {
                      const isSelected = selectedColumns.includes(col.key)
                      return (
                        <button
                          key={col.key}
                          onClick={() => toggleColumn(col.key)}
                          disabled={isAwardSheet}
                          className={`flex items-center gap-2 p-2.5 rounded-lg text-sm transition-colors text-left border ${
                            isSelected
                              ? "bg-blue-50/50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800/60 dark:text-blue-300 font-medium"
                              : "bg-transparent border-gray-100 text-gray-600 hover:border-gray-300 dark:border-white/5 dark:text-slate-400 dark:hover:border-white/20 dark:hover:bg-white/[0.03]"
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                          )}
                          <span className="truncate">{col.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Live summary strip */}
                  {!isAwardSheet && activeColumns.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5">
                      <p className="text-xs text-gray-400 dark:text-slate-500 font-medium uppercase tracking-wider mb-1.5">Columns in report</p>
                      <div className="flex flex-wrap gap-1.5">
                        {activeColumns.map(col => (
                          <span key={col.key} className="text-[11px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded font-medium">
                            {col.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* --- PREVIEW TABLE --- */}
              {filteredStudents.length > 0 && !isAwardSheet && activeColumns.length > 0 && (
                <div className="border-t border-gray-100 dark:border-white/5">
                  <div className="px-5 sm:px-6 py-3 flex items-center gap-2 bg-gray-50/70 dark:bg-white/[0.02]">
                    <Settings2 className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Preview — first 5 rows
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/5 text-gray-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 pl-5 w-8 text-center">#</th>
                          {activeColumns.map(col => (
                            <th key={col.key} className="py-2.5 px-3">{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                        {filteredStudents.slice(0, 5).map((student, idx) => (
                          <tr key={student.studentid || idx} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 pl-5 text-center text-gray-400 dark:text-slate-600">{idx + 1}</td>
                            {activeColumns.map(col => (
                              <td key={col.key} className="py-2.5 px-3 text-gray-700 dark:text-slate-300 truncate max-w-[160px]">
                                {student[col.key] != null && student[col.key] !== "" ? student[col.key] : <span className="text-gray-300 dark:text-slate-600">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredStudents.length > 5 && (
                      <p className="text-center text-xs text-gray-400 dark:text-slate-600 py-2">
                        +{filteredStudents.length - 5} more rows in export
                      </p>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </>
  )
}
