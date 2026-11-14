"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Navbar from "../../components/Navbar"
import Loader from "../../components/Loader"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { 
  ArrowLeft, Calendar, FileText, 
  Download, FileBarChart, Users,
  PieChart, ClipboardList, ArrowRight
} from "lucide-react"
import { useToast } from "../../hooks/use-toast"
import { generateCollectionReportBlob } from "../../utils/collectionReport" 

export default function ReportsPage() {
  const router = useRouter()
  const { toast } = useToast()
  
  // --- States ---
  const [loading, setLoading] = useState(false)
  const [reportType, setReportType] = useState("collection") // "collection" | "defaulter" | "statement" | "feesummary" | "studentslist"
  
  // Date Range State
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0], 
    endDate: new Date().toISOString().split('T')[0]
  })

  // --- Handlers ---
  const handleSubmit = async (e) => {
    e.preventDefault()

    // IF FEE SUMMARY: Simple redirect
    if (reportType === "feesummary") {
      router.push(`/admin/feesummary`)
      return;
    }

    // IF STUDENTS LIST: Simple redirect
    if (reportType === "studentslist") {
      router.push(`/admin/studentslist`)
      return;
    }

    if (reportType === "statement") {
      router.push(`/admin/student-statement`)
      return;
    }

    // IF DEFAULTER LIST: Navigate to /admin/defaulters with URL params
    if (reportType === "defaulter") {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      })
      router.push(`/admin/defaulters?${params.toString()}`)
      return;
    }

    // IF COLLECTION REPORT: Generate PDF blob
    setLoading(true)
    try {
      const pdfBlob = await generateCollectionReportBlob(dateRange.startDate, dateRange.endDate)
      const blobUrl = URL.createObjectURL(pdfBlob)
      window.open(blobUrl, "_blank")
      
      toast({ title: "Report generated successfully! 📄" })

      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)

    } catch (error) {
      console.error(error)
      toast({ 
        title: "Failed to generate report", 
        description: error.message, 
        variant: "destructive" 
      })
    } finally {
      setLoading(false)
    }
  }

  // --- Glassmorphic Styles ---
  const glassCardClass = "relative overflow-hidden rounded-2xl border border-white/20 bg-white/40 dark:bg-black/40 backdrop-blur-xl shadow-xl p-6 transition-all hover:border-white/30"
  const glassInputClass = "flex h-10 w-full rounded-md border px-3 py-2 text-sm bg-white/50 dark:bg-white/5 border-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 placeholder:text-gray-500/70"

  // --- Dynamic Content based on Report Type ---
  let title, description, BgIcon, themeColor, buttonText;
  const requiresDates = reportType === "collection" || reportType === "defaulter";

  switch (reportType) {
    case "defaulter":
      title = "Defaulter List";
      description = "View list of students with pending fees for a specific date range.";
      BgIcon = Users;
      themeColor = "red";
      buttonText = "View Defaulters";
      break;
    case "feesummary":
      title = "Fee Summary & Average";
      description = "View an overview of all fee summaries and average fee statistics.";
      BgIcon = PieChart;
      themeColor = "green";
      buttonText = "Go to Fee Summary";
      break;
    case "studentslist":
      title = "Students List / Award Sheet";
      description = "View the complete list of students and generate award sheets.";
      BgIcon = ClipboardList;
      themeColor = "purple";
      buttonText = "Go to Students List";
      break;
    case "statement":
      title = "Student Fee Statement";
      description = "Create a detailed monthly invoice and payment statement for selected students.";
      BgIcon = FileText;
      themeColor = "blue";
      buttonText = "Open Statement Builder";
      break;
    case "collection":
    default:
      title = "Collection Report";
      description = "Generate a PDF report of all fee collections within a specific date range.";
      BgIcon = FileBarChart;
      themeColor = "blue";
      buttonText = "Generate Report";
      break;
  }

  // Helper for dynamic theme coloring
  const getThemeClasses = () => {
    if (themeColor === "red") return 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 hover:shadow-red-500/30';
    if (themeColor === "green") return 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 hover:shadow-emerald-500/30';
    if (themeColor === "purple") return 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 hover:shadow-purple-500/30';
    return 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-500/30'; // blue default
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-[#0b1220] dark:via-[#1a1c2e] dark:to-[#0f0718] p-4 md:p-8 transition-colors duration-500">
        <div className="max-w-2xl mx-auto">
            
          {/* HEADER */}
          <div className="flex items-center gap-4 mb-8">
            <Button variant="outline" size="icon" onClick={() => router.back()} className="rounded-full h-10 w-10 bg-white/30 backdrop-blur border-white/20 hover:bg-white/50 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white dark:border-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white drop-shadow-sm transition-all">
                {title}
              </h1>
              <p className="text-gray-600 dark:text-slate-400 text-sm font-medium transition-all">
                {description}
              </p>
            </div>
          </div>

          {/* REPORT CARD */}
          <div className={`${glassCardClass} flex flex-col`}>
            <div className={`absolute top-0 right-0 p-4 opacity-10 pointer-events-none transition-all`}>
              <BgIcon className={`w-24 h-24 text-${themeColor}-500`} />
            </div>
            
            <h2 className="text-xl font-bold flex items-center gap-2 mb-2 text-gray-800 dark:text-white relative z-10 transition-all">
              <FileText className={`w-6 h-6 text-${themeColor}-600 dark:text-${themeColor}-400`} /> 
              Generate {title}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 relative z-10">
              {description}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5 flex-1 flex flex-col relative z-10">
              
              {/* Report Type Dropdown */}
              <div className="space-y-1.5">
                <Label className="ml-1 text-gray-700 dark:text-gray-300">Report Type</Label>
                <select 
                  className={`${glassInputClass} appearance-none cursor-pointer outline-none`}
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  <option value="collection" className="text-black dark:text-white dark:bg-slate-800">Collection Report</option>
                  <option value="defaulter" className="text-black dark:text-white dark:bg-slate-800">Defaulter List</option>
                  <option value="statement" className="text-black dark:text-white dark:bg-slate-800">Student Fee Statement</option>
                  <option value="feesummary" className="text-black dark:text-white dark:bg-slate-800">Fee Summary & Average</option>
                  <option value="studentslist" className="text-black dark:text-white dark:bg-slate-800">Students List / Award Sheet</option>
                </select>
              </div>

              {/* Date Range Selectors (Only show if report type requires it) */}
              {requiresDates && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-1.5">
                    <Label className="ml-1 text-gray-700 dark:text-gray-300">Start Date</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <Input 
                        type="date" 
                        required={requiresDates}
                        className={`pl-9 ${glassInputClass} [color-scheme:light] dark:[color-scheme:dark]`} 
                        value={dateRange.startDate} 
                        onChange={e => setDateRange({...dateRange, startDate: e.target.value})} 
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="ml-1 text-gray-700 dark:text-gray-300">End Date</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <Input 
                        type="date" 
                        required={requiresDates}
                        className={`pl-9 ${glassInputClass} [color-scheme:light] dark:[color-scheme:dark]`} 
                        value={dateRange.endDate} 
                        onChange={e => setDateRange({...dateRange, endDate: e.target.value})} 
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-auto pt-6">
                <Button 
                  type="submit" 
                  disabled={loading}
                  className={`w-full ${getThemeClasses()} dark:bg-white/5 text-white shadow-lg transition-all rounded-lg h-12 border-0`}
                >
                  {loading ? <Loader small /> : (
                    <>
                      {!requiresDates ? <ArrowRight className="w-5 h-5 mr-2" /> : <Download className="w-5 h-5 mr-2" />} 
                      {buttonText}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </>
  )
}
