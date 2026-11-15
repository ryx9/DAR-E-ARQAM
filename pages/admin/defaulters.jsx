"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "../../utils/supabaseClient"
import { exportToCSV, exportToPDF } from "../../utils/exportUtils"
import Navbar from "../../components/Navbar"
import Loader from "../../components/Loader"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { 
  ArrowLeft, Users, Filter, Send, Download, 
  Printer, CheckSquare, MessageSquare
} from "lucide-react"
import { useToast } from "../../hooks/use-toast"

function DefaulterListContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // --- State ---
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // Data Lists
  const [classes, setClasses] = useState([])
  const [defaulters, setDefaulters] = useState([]) 
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set())

  // Configuration & Filters (Respecting URL Params)
  const urlStart = searchParams.get('startDate')
  const urlEnd = searchParams.get('endDate')

  const [startDate, setStartDate] = useState(
    urlStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  )
  const [endDate, setEndDate] = useState(
    urlEnd || new Date().toISOString().split('T')[0]
  )
  const [selectedClasses, setSelectedClasses] = useState(new Set())

  // --- Initialization ---
  useEffect(() => {
    fetchInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Combines class fetching, auto-selecting all, and auto-fetching defaulters
  const fetchInitialData = async () => {
    // 1. Fetch Classes
    const { data } = await supabase.from("classes").select("*").order('id')
    const fetchedClasses = data || []
    setClasses(fetchedClasses)

    if (fetchedClasses.length > 0) {
      // 2. Select All Classes
      const allClassIds = new Set(fetchedClasses.map(c => c.id))
      setSelectedClasses(allClassIds)

      // 3. Auto-load Defaulter Data
      await fetchDefaulters(Array.from(allClassIds))
    }
  }

  // --- CORE LOGIC: Paginated Fetch & Grouping ---
  const fetchDefaulters = async (overrideClassIds = null) => {
    // Use override IDs on initial load (since state might not be updated yet), otherwise use state
    const classIdsArray = overrideClassIds || Array.from(selectedClasses)

    if (classIdsArray.length === 0) {
      toast({ title: "Please select at least one class", variant: "destructive" })
      return
    }

    setFetching(true)
    setSelectedStudentIds(new Set())
    
    try {
      // 1. Fetch Students (Paginated to bypass 1000 limit)
      let students = []
      let fromStudents = 0
      const limit = 1000
      let hasMoreStudents = true

      while (hasMoreStudents) {
        const { data: sData, error: sError } = await supabase
          .from("students")
          .select("studentid, name, fathername, class_id, mobilenumber, classes(name)")
          .in("class_id", classIdsArray)
          .order("name")
          .range(fromStudents, fromStudents + limit - 1)

        if (sError) throw sError
        if (sData && sData.length > 0) {
          students = [...students, ...sData]
          fromStudents += limit
          if (sData.length < limit) hasMoreStudents = false
        } else {
          hasMoreStudents = false
        }
      }

      if (students.length === 0) {
        setDefaulters([])
        setFetching(false)
        return
      }

      // 2. Fetch Invoices (Chunked by Student IDs & Paginated)
      const chunkSize = 150
      let allInvoices = []
      const receivedByStudent = new Map()
      const latestPaymentByStudent = new Map()
      const studentIds = students.map(s => s.studentid)

      for (let i = 0; i < studentIds.length; i += chunkSize) {
        const chunk = studentIds.slice(i, i + chunkSize)
        let historyOffset = 0
        while (true) {
          const { data: history, error: historyError } = await supabase
            .from('fee_payments').select('id, paid_at, fee_invoices!inner(student_id)')
            .in('fee_invoices.student_id', chunk).lt('paid_at', `${endDate}T23:59:59.999+05:00`)
            .order('id', { ascending: true }).range(historyOffset, historyOffset + limit - 1)
          if (historyError) throw historyError
          for (const payment of history || []) {
            const invoice = Array.isArray(payment.fee_invoices) ? payment.fee_invoices[0] : payment.fee_invoices
            if (!invoice || !payment.paid_at) continue
            const key = String(invoice.student_id), previous = latestPaymentByStudent.get(key)
            if (!previous || new Date(payment.paid_at) > new Date(previous)) latestPaymentByStudent.set(key, payment.paid_at)
          }
          if (!history || history.length < limit) break
          historyOffset += limit
        }
        let paymentOffset = 0
        while (true) {
          const { data: payments, error: paymentError } = await supabase
            .from("fee_payments")
            .select("id, amount, fee_invoices!inner(student_id, invoice_date)")
            .in("fee_invoices.student_id", chunk)
            .gte("fee_invoices.invoice_date", startDate)
            .lte("fee_invoices.invoice_date", endDate)
            .order("id", { ascending: true })
            .range(paymentOffset, paymentOffset + limit - 1)
          if (paymentError) throw paymentError
          for (const payment of payments || []) {
            const invoice = Array.isArray(payment.fee_invoices) ? payment.fee_invoices[0] : payment.fee_invoices
            if (!invoice) continue
            const key = String(invoice.student_id)
            receivedByStudent.set(key, (receivedByStudent.get(key) || 0) + (Number(payment.amount) || 0))
          }
          if (!payments || payments.length < limit) break
          paymentOffset += limit
        }
        let fromInvoices = 0
        let hasMoreInvoices = true

        while (hasMoreInvoices) {
          const { data: invoices, error: iError } = await supabase
            .from("fee_invoices")
            .select(`
              id, student_id, invoice_date, status, total_amount,
              fee_invoice_details ( id, fee_type, description, amount ),
              fee_payments ( invoice_detail_id, amount, paid_at )
            `)
            .in("student_id", chunk)
            .gte("invoice_date", startDate) // Invoices selected only within date range
            .lte("invoice_date", endDate)
            .in("status", ["unpaid", "partial"])
            .range(fromInvoices, fromInvoices + limit - 1)

          if (iError) throw iError
          if (invoices && invoices.length > 0) {
            allInvoices = [...allInvoices, ...invoices]
            fromInvoices += limit
            if (invoices.length < limit) hasMoreInvoices = false
          } else {
            hasMoreInvoices = false
          }
        }
      }

      // 3. Process and Merge Fee Data
      const defaulterData = []

      students.forEach(student => {
        const studentInvoices = allInvoices.filter(inv => inv.student_id === student.studentid)
        if (studentInvoices.length === 0) return

        // Grab latest forwarded invoice
        studentInvoices.sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date))
        const latestInvoice = studentInvoices[0]

        let currentTuition = 0
        let prevTuition = 0
        let annualCharges = 0
        let stationeryCharges = 0
        let arrears = 0
        const totalReceivedAmount = receivedByStudent.get(String(student.studentid)) || 0

        // Merge and categorize remaining balances from the latest invoice details
        latestInvoice.fee_invoice_details?.forEach(detail => {
          const paidForDetail = latestInvoice.fee_payments
            ?.filter(p => p.invoice_detail_id === detail.id)
            .reduce((sum, p) => sum + (p.amount || 0), 0) || 0

          const pendingForDetail = (detail.amount || 0) - paidForDetail

          if (pendingForDetail > 0) {
            const descLow = ((detail.fee_type || "") + " " + (detail.description || "")).toLowerCase()
            
            if (descLow.includes("tuition")) {
                const targetDate = new Date(endDate)
                const currentMonthIndex = targetDate.getMonth()
                const currentFilterYear = targetDate.getFullYear()

                // Check string for specific month mentioning
                const monthsRegex = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
                const match = descLow.match(monthsRegex)

                if (match) {
                    const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
                    const mentionedMonth = monthMap[match[0].toLowerCase()]

                    if (mentionedMonth === currentMonthIndex) {
                        currentTuition += pendingForDetail
                    } else {
                        prevTuition += pendingForDetail
                    }
                } else {
                    // Fallback to the invoice creation date
                    const invDate = new Date(latestInvoice.invoice_date)
                    if (invDate.getMonth() === currentMonthIndex && invDate.getFullYear() === currentFilterYear) {
                        currentTuition += pendingForDetail
                    } else {
                        prevTuition += pendingForDetail
                    }
                }
            } else if (descLow.includes("annual")) {
                annualCharges += pendingForDetail
            } else if (descLow.includes("stationery") || descLow.includes("stationary")) {
                stationeryCharges += pendingForDetail
            } else {
                arrears += pendingForDetail
            }
          }
        })

        const totalPending = currentTuition + prevTuition + annualCharges + stationeryCharges + arrears

        if (totalPending > 0) {
          defaulterData.push({
            ...student,
            className: student.classes?.name || 'Unknown',
            currentTuition,
            prevTuition,
            annualCharges,
            stationeryCharges,
            arrears,
            totalPending,
            totalReceivedAmount,
            lastPaymentAt: latestPaymentByStudent.get(String(student.studentid)) || null
          })
        }
      })

      setDefaulters(defaulterData)
      toast({ title: `Loaded ${defaulterData.length} defaulters`, variant: "default" })

    } catch (error) {
      console.error(error)
      toast({ title: "Error fetching data", variant: "destructive" })
    } finally {
      setFetching(false)
    }
  }

  // --- Selection Logic ---
  const toggleClass = (id) => {
    const newSet = new Set(selectedClasses)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedClasses(newSet)
  }

  const toggleStudent = (id) => {
    const newSet = new Set(selectedStudentIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedStudentIds(newSet)
  }

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === defaulters.length) {
      setSelectedStudentIds(new Set())
    } else {
      setSelectedStudentIds(new Set(defaulters.map(s => s.studentid)))
    }
  }

  // --- Formal Messaging Logic ---
  const handleSendMessages = async () => {
    if (selectedStudentIds.size === 0) {
      toast({ title: "No students selected", variant: "destructive" })
      return
    }

    setSubmitting(true)

    try {
      const selectedDefaulters = defaulters.filter(d => selectedStudentIds.has(d.studentid))
      const messagesPayload = []

      for (const student of selectedDefaulters) {
        let finalMessage = `Subject: Notice of Outstanding Fee Dues\n\nDear Parent/Guardian of ${student.name},\n\nWe hope this message finds you well.\n\nThis is a formal reminder regarding the outstanding account balance for ${student.name}. Below is the summary of the pending dues:\n\n`
        
        if (student.currentTuition > 0) finalMessage += `- Current Tuition: Rs. ${student.currentTuition}\n`
        if (student.prevTuition > 0) finalMessage += `- Previous Tuition: Rs. ${student.prevTuition}\n`
        if (student.annualCharges > 0) finalMessage += `- Annual Charges: Rs. ${student.annualCharges}\n`
        if (student.stationeryCharges > 0) finalMessage += `- Stationery Charges: Rs. ${student.stationeryCharges}\n`
        if (student.arrears > 0) finalMessage += `- Arrears / Other: Rs. ${student.arrears}\n`
        
        finalMessage += `\nTotal Amount Payable: Rs. ${student.totalPending}\n\nWe kindly request you to clear these dues at your earliest convenience to ensure uninterrupted access to school services. If you have already made this payment, please disregard this notice.\n\nSincerely,\nAdministration`

        messagesPayload.push({
          student_id: student.studentid,
          class_id: student.class_id,
          text: finalMessage,
          number: student.mobilenumber || null,
          sent: false
        })
      }

      // Chunk inserts to avoid Supabase 1000 row limit
      const insertChunkSize = 500
      for (let i = 0; i < messagesPayload.length; i += insertChunkSize) {
         const chunk = messagesPayload.slice(i, i + insertChunkSize)
         const { error } = await supabase.from("messages").insert(chunk)
         if (error) throw error
      }

      toast({ title: "Messages Queued", description: `Queued formal reminders for ${messagesPayload.length} students.`, variant: "default" })
      setSelectedStudentIds(new Set()) 
    } catch (error) {
      console.error(error)
      toast({ title: "Failed to queue messages", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  // --- Styles (Matching Previous Page) ---
  const glassCardClass = "relative overflow-hidden rounded-2xl border border-white/20 bg-white/40 dark:bg-black/40 backdrop-blur-xl shadow-xl p-6 transition-all hover:border-white/30 print:hidden print:shadow-none print:border-none print:p-0"
  const glassInputClass = "flex h-10 w-full rounded-md border px-3 py-2 text-sm bg-white/50 dark:bg-white/5 border-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 placeholder:text-gray-500/70 [color-scheme:light] dark:[color-scheme:dark]"

  return (
    <>
      <div className="print:hidden">
        <Navbar />
      </div>
      
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-[#0b1220] dark:via-[#1a1c2e] dark:to-[#0f0718] p-4 md:p-8 transition-colors duration-500 pb-20 print:bg-white print:p-0 print:m-0">
        <div className="max-w-7xl mx-auto space-y-6 print:max-w-full print:space-y-0">
          
          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => router.back()} className="rounded-full h-10 w-10 bg-white/30 backdrop-blur border-white/20 hover:bg-white/50 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white dark:border-white/10">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white drop-shadow-sm transition-all">
                  Defaulter List
                </h1>
                <p className="text-gray-600 dark:text-slate-400 text-sm font-medium transition-all">
                  Manage and notify students with pending fees.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button onClick={() => exportToCSV(defaulters)} variant="outline" className="h-10 gap-2 text-sm font-semibold bg-white/40 dark:bg-white/5 backdrop-blur-md border-white/20 text-gray-800 dark:text-gray-200 hover:bg-white/60 dark:hover:bg-white/10 transition-all rounded-lg shadow-sm">
                <Download className="w-4 h-4" /> Export Excel
              </Button>
              <Button onClick={() => exportToPDF(defaulters, startDate, endDate)} variant="outline" className="h-10 gap-2 text-sm font-semibold bg-white/40 dark:bg-white/5 backdrop-blur-md border-white/20 text-gray-800 dark:text-gray-200 hover:bg-white/60 dark:hover:bg-white/10 transition-all rounded-lg shadow-sm">
                <Printer className="w-4 h-4" /> Print / PDF
              </Button>
            </div>
          </div>

          {/* TOP CONFIGURATION BAR */}
          <div className={glassCardClass}>
             <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
               
               {/* Date Range */}
               <div className="xl:col-span-1 space-y-4 border-b xl:border-b-0 xl:border-r border-gray-300 dark:border-gray-700 pb-6 xl:pb-0 xl:pr-6">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Filter className="w-4 h-4" /> Invoice Dates
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="ml-1 text-xs text-gray-600 dark:text-gray-400 font-semibold uppercase">From</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={glassInputClass} />
                    </div>
                    <div>
                      <Label className="ml-1 text-xs text-gray-600 dark:text-gray-400 font-semibold uppercase">To</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={glassInputClass} />
                    </div>
                  </div>
               </div>

               {/* Multi-Class Selection */}
               <div className="xl:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-4 h-4" /> Select Classes
                    </h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-xs font-semibold bg-white/30 dark:bg-white/5 hover:bg-white/50 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 transition-all rounded-md"
                      onClick={() => setSelectedClasses(new Set(classes.map(c => c.id)))}
                    >
                      Select All
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-40 overflow-y-auto p-1 custom-scrollbar">
                    {classes.map(c => (
                      <label 
                        key={c.id} 
                        className={`flex items-start gap-2 p-2.5 w-full rounded-lg border cursor-pointer transition-all text-sm font-medium shadow-sm backdrop-blur-md ${
                          selectedClasses.has(c.id) 
                            ? 'bg-blue-500/10 border-blue-500/50 text-blue-900 dark:bg-blue-500/20 dark:border-blue-500/50 dark:text-blue-100' 
                            : 'bg-white/40 border-white/20 text-gray-700 dark:bg-black/20 dark:border-white/10 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/5'
                        }`}
                      >
                        <input 
                          type="checkbox" 
                          checked={selectedClasses.has(c.id)}
                          onChange={() => toggleClass(c.id)}
                          className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0 bg-transparent"
                        />
                        <span className="break-words whitespace-normal leading-tight">{c.name}</span>
                      </label>
                    ))}
                  </div>
               </div>

               {/* Actions */}
               <div className="xl:col-span-1 flex flex-col justify-end h-full pt-4 xl:pt-0">
                  <Button 
                    onClick={() => fetchDefaulters()} 
                    disabled={fetching} 
                    className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-500/30 text-white shadow-lg transition-all rounded-xl border-0 font-bold"
                  >
                    {fetching ? <Loader small /> : ( <>APPLY & FETCH</> )}
                  </Button>
               </div>

             </div>
          </div>

          {/* BULK MESSAGING BAR */}
          {defaulters.length > 0 && (
            <div className={`${glassCardClass} flex flex-col md:flex-row items-center justify-between gap-4 py-4`}>
               <div className="flex items-center gap-4">
                 <div className="bg-blue-500/20 dark:bg-blue-500/20 p-3 rounded-xl backdrop-blur-sm border border-blue-500/20">
                   <MessageSquare className="w-6 h-6 text-blue-700 dark:text-blue-400" />
                 </div>
                 <div>
                   <h3 className="font-bold text-lg text-gray-900 dark:text-white">Bulk Formal Reminders</h3>
                   <p className="text-sm text-gray-600 dark:text-gray-400">Send formal WhatsApp/SMS notices to selected defaulters.</p>
                 </div>
               </div>
               
               <div className="flex items-center gap-3 w-full md:w-auto">
                 <Button 
                   onClick={handleSendMessages} 
                   disabled={submitting || selectedStudentIds.size === 0} 
                   className="w-full md:w-auto bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-lg hover:shadow-green-500/30 text-white font-bold gap-2 h-12 px-6 rounded-xl border-0 transition-all"
                 >
                   {submitting ? <Loader small /> : <><Send className="w-5 h-5" /> SEND NOTICES {selectedStudentIds.size > 0 ? `(${selectedStudentIds.size})` : ''}</>}
                 </Button>
               </div>
            </div>
          )}

          {/* MAIN CONTENT: DEFAULTER TABLE */}
          <div className={`${glassCardClass} !p-0 print:border-none print:shadow-none print:bg-transparent print:backdrop-blur-none`}>
             
             <div className="flex justify-between items-center p-5 border-b border-white/20 dark:border-white/10 bg-white/20 dark:bg-black/20 print:hidden">
                 <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800 dark:text-white">
                   Defaulter Records
                   <span className="text-sm font-medium bg-white/40 dark:bg-white/10 px-2.5 py-0.5 rounded-full text-gray-700 dark:text-gray-300 border border-white/20">
                     {defaulters.length} found
                   </span>
                 </h3>
             </div>

             {fetching ? (
                 <div className="h-64 flex items-center justify-center print:hidden">
                   <Loader />
                 </div>
             ) : defaulters.length === 0 ? (
                 <div className="h-64 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 m-6 rounded-2xl print:hidden bg-white/10 dark:bg-black/10">
                   <CheckSquare className="w-10 h-10 mb-3 opacity-30" />
                   <p className="text-base font-medium">No defaulters found for the selected criteria.</p>
                 </div>
             ) : (
                 <div className="overflow-x-auto print:overflow-visible custom-scrollbar">
                     <table className="w-full text-left text-sm text-gray-700 dark:text-gray-300 print:text-black print:text-[10px]">
                         <thead className="bg-white/30 dark:bg-black/30 backdrop-blur-md text-xs uppercase text-gray-600 dark:text-gray-400 border-b border-white/20 dark:border-white/10 print:bg-gray-100 print:text-black print:border-gray-300">
                             <tr>
                                 <th className="p-4 w-12 text-center print:hidden">
                                     <input 
                                         type="checkbox"
                                         className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer bg-white/50 dark:bg-black/50"
                                         checked={selectedStudentIds.size === defaulters.length && defaulters.length > 0}
                                         onChange={toggleSelectAll}
                                     />
                                 </th>
                                 <th className="p-4 font-bold tracking-wider">Student Name</th>
                                 <th className="p-4 font-bold tracking-wider">Class</th>
                                 <th className="p-4 font-bold tracking-wider text-right text-blue-700 dark:text-blue-400 print:text-black">Curr Tuition</th>
                                 <th className="p-4 font-bold tracking-wider text-right text-blue-700 dark:text-blue-400 print:text-black">Prev Tuition</th>
                                 <th className="p-4 font-bold tracking-wider text-right text-purple-700 dark:text-purple-400 print:text-black">Annual</th>
                                 <th className="p-4 font-bold tracking-wider text-right text-orange-700 dark:text-orange-400 print:text-black">Stationery</th>
                                 <th className="p-4 font-bold tracking-wider text-right">Arrears</th>
                                 <th className="p-4 font-bold tracking-wider text-right text-red-600 dark:text-red-400 print:text-black">Total Pending</th>
                                 <th className="p-4 font-bold tracking-wider text-right text-emerald-600 dark:text-emerald-500 print:text-black">Received for invoices</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-white/10 dark:divide-white/5 print:divide-gray-300">
                             {defaulters.map((student) => {
                               const isSelected = selectedStudentIds.has(student.studentid)
                               return (
                                 <tr 
                                   key={student.studentid} 
                                   className={`hover:bg-white/40 dark:hover:bg-white/5 transition-colors ${isSelected ? 'bg-blue-500/10 dark:bg-blue-500/20' : ''} print:bg-transparent`}
                                 >
                                     <td className="p-4 text-center print:hidden">
                                         <input 
                                             type="checkbox"
                                             className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                                             checked={isSelected}
                                             onChange={() => toggleStudent(student.studentid)}
                                         />
                                     </td>
                                     <td className="p-4">
                                         <div className="font-bold text-gray-900 dark:text-white print:text-black text-base">{student.name}</div>
                                         <div className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">{student.fathername} • {student.studentid}</div>
                                     </td>
                                     <td className="p-4 font-medium print:text-black">
                                         <span className="bg-white/50 dark:bg-black/30 border border-white/20 dark:border-white/10 px-2 py-1 rounded-md text-xs">{student.className}</span>
                                     </td>
                                     <td className="p-4 text-right font-medium text-blue-700 dark:text-blue-300 print:text-black">
                                         {student.currentTuition > 0 ? student.currentTuition.toLocaleString() : "-"}
                                     </td>
                                     <td className="p-4 text-right font-medium text-blue-700 dark:text-blue-300 print:text-black">
                                         {student.prevTuition > 0 ? student.prevTuition.toLocaleString() : "-"}
                                     </td>
                                     <td className="p-4 text-right font-medium text-purple-700 dark:text-purple-300 print:text-black">
                                         {student.annualCharges > 0 ? student.annualCharges.toLocaleString() : "-"}
                                     </td>
                                     <td className="p-4 text-right font-medium text-orange-700 dark:text-orange-300 print:text-black">
                                         {student.stationeryCharges > 0 ? student.stationeryCharges.toLocaleString() : "-"}
                                     </td>
                                     <td className="p-4 text-right font-medium text-gray-600 dark:text-gray-400 print:text-black">
                                         {student.arrears > 0 ? student.arrears.toLocaleString() : "-"}
                                     </td>
                                     <td className="p-4 text-right">
                                         <div className="font-mono font-bold text-base text-red-600 dark:text-red-400 print:text-black">
                                            {student.totalPending.toLocaleString()}
                                         </div>
                                     </td>
                                     <td className="p-4 text-right">
                                         <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 print:text-black">
                                            {student.totalReceivedAmount > 0 ? student.totalReceivedAmount.toLocaleString() : "-"}
                                         </div>
                                     </td>
                                 </tr>
                               )
                             })}
                             
                             <tr className="bg-white/40 dark:bg-black/40 backdrop-blur-md font-bold print:bg-gray-100 text-base">
                               <td colSpan={3} className="p-4 text-right print:hidden text-gray-900 dark:text-white">Grand Totals:</td>
                               <td colSpan={2} className="p-4 text-right hidden print:table-cell text-black">Grand Totals:</td>
                               <td className="p-4 text-right text-blue-700 dark:text-blue-400 print:text-black">
                                 {defaulters.reduce((acc, curr) => acc + curr.currentTuition, 0).toLocaleString()}
                               </td>
                               <td className="p-4 text-right text-blue-700 dark:text-blue-400 print:text-black">
                                 {defaulters.reduce((acc, curr) => acc + curr.prevTuition, 0).toLocaleString()}
                               </td>
                               <td className="p-4 text-right text-purple-700 dark:text-purple-400 print:text-black">
                                 {defaulters.reduce((acc, curr) => acc + curr.annualCharges, 0).toLocaleString()}
                               </td>
                               <td className="p-4 text-right text-orange-700 dark:text-orange-400 print:text-black">
                                 {defaulters.reduce((acc, curr) => acc + curr.stationeryCharges, 0).toLocaleString()}
                               </td>
                               <td className="p-4 text-right text-gray-900 dark:text-white print:text-black">
                                 {defaulters.reduce((acc, curr) => acc + curr.arrears, 0).toLocaleString()}
                               </td>
                               <td className="p-4 text-right font-mono text-red-600 dark:text-red-500 print:text-black">
                                 {defaulters.reduce((acc, curr) => acc + curr.totalPending, 0).toLocaleString()}
                               </td>
                               <td className="p-4 text-right font-mono text-emerald-600 dark:text-emerald-500 print:text-black">
                                 {defaulters.reduce((acc, curr) => acc + curr.totalReceivedAmount, 0).toLocaleString()}
                               </td>
                             </tr>
                         </tbody>
                     </table>
                 </div>
             )}
          </div>
          {defaulters.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-bold">Time since last payment</h2>
            <p className="mt-1 text-xs text-slate-500">Calendar months since the most recent recorded payment as of {endDate}. Students who paid in the end month are omitted.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{['1 month', '2 months', '3 months or more', 'No recorded payment'].map((label, index) => {
              const members = defaulters.filter(student => {
                if (!student.lastPaymentAt) return index === 3
                const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit' }).formatToParts(new Date(student.lastPaymentAt))
                const year = Number(parts.find(part => part.type === 'year').value), month = Number(parts.find(part => part.type === 'month').value)
                const [endYear, endMonth] = endDate.split('-').map(Number)
                const gap = endYear * 12 + endMonth - (year * 12 + month)
                return index === 0 ? gap === 1 : index === 1 ? gap === 2 : index === 2 ? gap >= 3 : false
              })
              return <div key={label} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-semibold">{label} <span className="text-slate-500">({members.length})</span></h3>{members.length ? <ul className="mt-2 space-y-2 text-sm">{members.map(student => <li key={student.studentid}>{student.name}<span className="block text-xs text-slate-500">{student.className} · {student.lastPaymentAt ? new Date(student.lastPaymentAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' }) : 'Never recorded'}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">No students</p>}</div>
            })}</div>
          </section>}
        </div>
      </div>
    </>
  )
}

export default function DefaultersPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader /></div>}>
      <DefaulterListContent />
    </Suspense>
  )
}
