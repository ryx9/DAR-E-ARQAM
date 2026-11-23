"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../utils/supabaseClient"
import { parentMessage, feeLines, rupees, messageDate } from '../../../utils/parentMessages';
import Navbar from "../../../components/Navbar"
import Loader from "../../../components/Loader"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import {
  ArrowLeft, Users, Filter, Calendar,
  DollarSign, CheckSquare, Send, AlertCircle, Settings, MessageSquare, PlusCircle
} from "lucide-react"
import { useToast } from "../../../hooks/use-toast"

const todayLocal = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function GenerateInvoicesContent() {
  const router = useRouter()
  const { toast } = useToast()

  // --- State ---
  const [loading, setLoading] = useState(false)
  const [fetchingStudents, setFetchingStudents] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Data Lists
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [excludedCount, setExcludedCount] = useState(0)

  // Selections & Per-Student Configuration
  const [selectedClassId, setSelectedClassId] = useState("")
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set())
  const [studentFees, setStudentFees] = useState({})

  // Configuration
  const [invoiceDate, setInvoiceDate] = useState(todayLocal)
  const [config, setConfig] = useState({
    feeLabel: "",
    annualCharges: 0,
    stationeryCharges: 0,
    customFeeLabel: "",
    customFeeDefault: 0,
    dueDate: `${todayLocal().slice(0, 7)}-10`
  })

  // Messaging State
  const [sendMessage, setSendMessage] = useState(true)

  // --- Initialization ---
  useEffect(() => {
    fetchClasses()
    updateDefaultLabel(invoiceDate)
  }, [])

  useEffect(() => {
    updateDefaultLabel(invoiceDate)
    if (selectedClassId) {
      fetchEligibleStudents(selectedClassId, invoiceDate)
    }
  }, [invoiceDate])

  const updateDefaultLabel = (dateStr) => {
    const dateObj = new Date(dateStr)
    const month = dateObj.toLocaleString('default', { month: 'long' })
    const year = dateObj.getFullYear()
    setConfig(prev => ({ ...prev, feeLabel: `Tuition Fee - ${month} - ${year}` }))
  }

  const fetchClasses = async () => {
    const { data } = await supabase.from("classes").select("*").order('id')
    setClasses(data || [])
  }

  // --- CORE LOGIC: Fetch Students & Arrears ---
  const fetchEligibleStudents = async (classId, dateStr) => {
    setFetchingStudents(true)
    setSelectedStudentIds(new Set())
    setStudentFees({})

    try {
      const { data: allStudents, error: sError } = await supabase
        .from("active_students")
        .select("*")
        .eq("class_id", classId)
        .order("name")

      if (sError) throw sError

      const selectedDate = new Date(dateStr)
      const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString().split('T')[0]
      const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).toISOString().split('T')[0]

      // 1. Fetch Existing Invoices (to exclude students already invoiced this month)
      const { data: existingInvoices, error: iError } = await supabase
        .from("fee_invoices")
        .select("student_id")
        .gte("invoice_date", startOfMonth)
        .lte("invoice_date", endOfMonth)
        .neq("status", "expired")

      if (iError) throw iError

      const invoicedStudentIds = new Set(existingInvoices.map(inv => inv.student_id))
      const eligibleStudents = allStudents.filter(s => !invoicedStudentIds.has(s.studentid))

      // 2. Fetch Arrears for Eligible Students (based ONLY on the single latest prior invoice)
      const eligibleIds = eligibleStudents.map(s => s.studentid);
      let arrearsMap = {};

      if (eligibleIds.length > 0) {
        for (const studentId of eligibleIds) {
          const { data: latestOldInvoices } = await supabase
            .from("fee_invoices")
            .select("id, student_id, invoice_date, total_amount, status")
            .eq("student_id", studentId)
            .lt("invoice_date", startOfMonth)
            .neq("status", "expired")
            .order("invoice_date", { ascending: false })
            .limit(1);

          if (latestOldInvoices && latestOldInvoices.length > 0) {
            const latestInv = latestOldInvoices[0];

            if (latestInv.status === "unpaid" || latestInv.status === "partial") {
              const { data: payments } = await supabase
                .from("fee_payments")
                .select("amount")
                .eq("invoice_id", latestInv.id);

              const totalPaid = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
              let carryOver = Number(latestInv.total_amount || 0) - totalPaid;

              if (carryOver > 0) {
                arrearsMap[studentId] = carryOver;
              }
            }
          }
        }
      }

      const studentsWithArrears = eligibleStudents.map(s => ({
        ...s,
        arrears: arrearsMap[s.studentid] || 0
      }));

      setStudents(studentsWithArrears)
      setExcludedCount(allStudents.length - eligibleStudents.length)

    } catch (error) {
      console.error(error)
      toast({ title: "Error fetching data", variant: "destructive" })
    } finally {
      setFetchingStudents(false)
    }
  }

  // --- Selection & Input Logic ---
  const handleClassChange = (e) => {
    const cid = e.target.value
    setSelectedClassId(cid)
    if (cid) fetchEligibleStudents(cid, invoiceDate)
    else setStudents([])
  }

  const toggleStudent = (id) => {
    const newSet = new Set(selectedStudentIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedStudentIds(newSet)
  }

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === students.length) {
      setSelectedStudentIds(new Set())
    } else {
      setSelectedStudentIds(new Set(students.map(s => s.studentid)))
    }
  }

  const handleStudentFeeChange = (studentId, field, value) => {
    setStudentFees(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value
      }
    }))
  }

  const getCharge = (studentId, field, globalFallback) => {
    const val = studentFees[studentId]?.[field]
    return val !== undefined && val !== "" ? Number(val) : Number(globalFallback) || 0
  }

  // --- Generator Logic ---
  const handleGenerate = async () => {
    if (selectedStudentIds.size === 0) {
      toast({ title: "No students selected", variant: "destructive" })
      return
    }

    setSubmitting(true)
    let successCount = 0
    let failCount = 0
    let expiredCount = 0
    let successfullyInvoicedIds = []

    try {
      const selectedStudentsList = students.filter(s => selectedStudentIds.has(s.studentid))
      const startOfCurrentMonth = new Date(new Date(invoiceDate).getFullYear(), new Date(invoiceDate).getMonth(), 1).toISOString()

      for (const student of selectedStudentsList) {

        // 1. FETCH ONLY THE LATEST OLD INVOICE
        const { data: latestOldInvoices } = await supabase
          .from("fee_invoices")
          .select("id, invoice_date, status, total_amount")
          .eq("student_id", student.studentid)
          .lt("invoice_date", startOfCurrentMonth)
          .neq("status", "expired")
          .order("invoice_date", { ascending: false })
          .limit(1);

        let carriedOverDetails = []
        let totalCarryOverAmount = 0
        let latestInvoiceIdToExpire = null

        if (latestOldInvoices && latestOldInvoices.length > 0) {
          const latestInv = latestOldInvoices[0];

          if (latestInv.status === "unpaid" || latestInv.status === "partial") {
            latestInvoiceIdToExpire = latestInv.id;

            const { data: payments } = await supabase
              .from("fee_payments")
              .select("amount")
              .eq("invoice_id", latestInv.id);

            const totalPaid = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
            const remaining = Number(latestInv.total_amount || 0) - totalPaid;

            if (remaining > 0) {
              totalCarryOverAmount = remaining;

              const { data: oldDetails } = await supabase
                .from("fee_invoice_details")
                .select("fee_type, description, amount")
                .eq("invoice_id", latestInv.id)
                .order("id", { ascending: true }) // Maintain original billing order

              if (oldDetails && oldDetails.length > 0) {
                // FIX: WATERFALL ALLOCATION (Sequential Payment Application)
                let paymentRemaining = totalPaid;

                oldDetails.forEach((detail) => {
                  const originalAmount = Number(detail.amount) || 0;
                  if (originalAmount <= 0) return;

                  let portionToCarry = 0;

                  if (paymentRemaining >= originalAmount) {
                    paymentRemaining -= originalAmount; // Item fully paid off
                  } else {
                    portionToCarry = originalAmount - paymentRemaining;
                    paymentRemaining = 0; // Payment exhausted
                  }

                  if (portionToCarry > 0) {
                    carriedOverDetails.push({
                      fee_type: detail.fee_type,
                      description: `(Pending from ${new Date(latestInv.invoice_date).toLocaleDateString()})`,
                      amount: portionToCarry
                    })
                  }
                });
              } else {
                carriedOverDetails.push({
                  fee_type: "Previous Balance",
                  description: `Carried from ${new Date(latestInv.invoice_date).toLocaleDateString()}`,
                  amount: remaining
                })
              }
            }
          }
        }

        // 2. Calculate New Totals
        const monthlyFee = Number(student.monthly_fee) || 0
        const annual = getCharge(student.studentid, 'annual', config.annualCharges)
        const stationery = getCharge(student.studentid, 'stationery', config.stationeryCharges)
        const customFee = getCharge(student.studentid, 'custom', config.customFeeDefault)

        const grandTotal = monthlyFee + annual + stationery + customFee + totalCarryOverAmount

        // 3. Create Master Invoice
        const { data: invData, error: invError } = await supabase
          .from("fee_invoices")
          .insert({
            student_id: student.studentid,
            invoice_date: invoiceDate,
            due_date: config.dueDate,
            total_amount: grandTotal,
            status: "unpaid"
          })
          .select()
          .single()

        if (invError || !invData) {
          console.error(`Failed for ${student.name}`, invError)
          failCount++
          continue
        }

        // 4. Create Details & CONSOLIDATE MATCHING HEADERS
        const consolidatedMap = new Map();
        const customLabel = (config.customFeeLabel && config.customFeeLabel.trim()) ? config.customFeeLabel.trim() : "Custom Charges"

        const addOrMergeDetail = (feeType, desc, amt) => {
          if (amt <= 0) return;
          // Strict matching on header name to consolidate
          if (consolidatedMap.has(feeType)) {
            const existing = consolidatedMap.get(feeType);
            existing.amount += amt;
            if (!existing.description.includes("Pending") && desc.includes("Pending")) {
              existing.description = existing.description + " & Previous Balance";
            }
          } else {
            consolidatedMap.set(feeType, { fee_type: feeType, description: desc, amount: amt });
          }
        };

        // Add current month fees
        if (monthlyFee > 0) addOrMergeDetail(config.feeLabel || "Tuition Fee", "Monthly Tuition Charges", monthlyFee);
        if (annual > 0) addOrMergeDetail("Annual Charges", "Annual / Paper Funds", annual);
        if (stationery > 0) addOrMergeDetail("Stationery", "Stationery / Books", stationery);
        if (customFee > 0) addOrMergeDetail(customLabel, "Custom Charges", customFee);

        // Add carried over fees (will merge if headers match)
        carriedOverDetails.forEach(item => {
          addOrMergeDetail(item.fee_type, item.description, item.amount);
        });

        // Convert Map back to array for database insertion
        const detailsPayload = Array.from(consolidatedMap.values()).map(item => ({
          ...item,
          invoice_id: invData.id
        }));

        if (detailsPayload.length > 0) {
          const { error: detailsError } = await supabase.from("fee_invoice_details").insert(detailsPayload)

          if (detailsError) {
            console.error("Details failed to insert. Rolling back invoice.", detailsError);
            await supabase.from("fee_invoices").delete().eq("id", invData.id);
            failCount++;
            continue;
          }
        }

        // 5. Expire the Old Latest Invoice
        if (latestInvoiceIdToExpire) {
          const { error: expireError } = await supabase
            .from("fee_invoices")
            .update({
              status: "expired",
              notes: `Consolidated into Invoice #${invData.id}`
            })
            .eq("id", latestInvoiceIdToExpire)

          if (!expireError) expiredCount++
        }

        // 6. Messaging Integration
        if (sendMessage) {
          const finalMessage = parentMessage('Fee invoice', [
            `Student: ${student.name} · DAS ${student.studentid}`,
            `Invoice #${invData.id} · ${config.feeLabel}`,
            ...feeLines([
              ['Tuition', monthlyFee], ['Annual charges', annual], ['Stationery', stationery],
              [customLabel, customFee], ['Previous balance', totalCarryOverAmount],
            ]),
            `*Total due: ${rupees(grandTotal)}*`,
            `Payment due: ${messageDate(config.dueDate)}`,
          ], 'Please pay by the due date. Contact Accounts with any questions.', 'Accounts Office')


          await supabase.from("messages").insert({
            student_id: student.studentid,
            class_id: student.class_id,
            text: finalMessage,
            number: student.mobilenumber || null,
            sent: false
          })
        }

        successCount++
        successfullyInvoicedIds.push(student.studentid)
      }

      // 7. Update Student Clear Status in Batch
      if (successfullyInvoicedIds.length > 0) {
        const { error: clearUpdateError } = await supabase
          .from("students")
          .update({ Clear: false })
          .in("studentid", successfullyInvoicedIds)
      }

      toast({
        title: "Generation Complete",
        description: `Generated ${successCount} invoices. ${failCount > 0 ? `Failed: ${failCount}.` : ''} ${sendMessage ? 'Messages Queued.' : ''}`,
        variant: "default"
      })

      fetchEligibleStudents(selectedClassId, invoiceDate)

    } catch (error) {
      console.error(error)
      toast({ title: "System Error", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  // --- Styles ---
  const glassCardClass = "relative overflow-hidden rounded-xl border border-white/20 bg-black/40 backdrop-blur-xl shadow-sm p-4"
  const inputClass = "h-9 bg-white dark:bg-white/5 border-white/20 focus:border-blue-500/50 text-black dark:text-white"

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#0b1220] p-4 transition-colors duration-500 pb-20">
        <div className="max-w-7xl mx-auto space-y-4">

          {/* HEADER */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => router.back()} className="rounded-full bg-white/10  text-black dark:text-white hover:bg-white/20 border-white/20 backdrop-blur h-8 w-8 p-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-black dark:text-white">Fee Generation</h1>
            </div>
          </div>

          {/* TOP CONFIGURATION BAR */}
          <div className={glassCardClass}>
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">

              <div className="lg:col-span-1">
                <Label className="text-xs text-gray-500 font-semibold uppercase mb-1">Class</Label>
                <select
                  className="w-full h-9 rounded-md border border-gray-300 dark:border-gray-700 px-3 text-sm focus:outline-none focus:ring-2 bg-white dark:bg-white/5 text-black dark:text-white focus:ring-blue-500/50 shadow-sm transition-colors cursor-pointer"
                  value={selectedClassId}
                  onChange={handleClassChange}
                >
                  <option value="" className="bg-white dark:bg-[#111827] text-gray-900 dark:text-gray-200">-- Select --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id} className="bg-white dark:bg-[#111827] text-gray-900 dark:text-gray-200">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-1">
                <Label className="text-xs text-gray-500 font-semibold uppercase mb-1">Invoice Date</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => {
                  const nextDate = e.target.value
                  if (nextDate && nextDate.slice(0, 7) !== invoiceDate.slice(0, 7)) {
                    setConfig(prev => ({ ...prev, dueDate: `${nextDate.slice(0, 7)}-10` }))
                  }
                  setInvoiceDate(nextDate)
                }} />
              </div>

              <div className="lg:col-span-1">
                <Label className="text-xs text-gray-500 font-semibold uppercase mb-1">Due Date</Label>
                <Input type="date" value={config.dueDate} onChange={(e) => setConfig({ ...config, dueDate: e.target.value })} />
              </div>

              <div className="lg:col-span-3 grid grid-cols-3 gap-2 border-l pl-3 border-white/10">
                <div>
                  <Label className="text-[10px] text-gray-500 font-semibold uppercase mb-1">Global Annual</Label>
                  <Input type="number" placeholder="0" value={config.annualCharges} onChange={(e) => setConfig({ ...config, annualCharges: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <Label className="text-[10px] text-gray-500 font-semibold uppercase mb-1">Global Stationery</Label>
                  <Input type="number" placeholder="0" value={config.stationeryCharges} onChange={(e) => setConfig({ ...config, stationeryCharges: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <Label className="text-[10px] text-gray-500 font-semibold uppercase mb-1 flex items-center gap-1">
                    <PlusCircle className="w-3 h-3 text-blue-500" />
                    <input
                      type="text"
                      placeholder="Custom Label"
                      value={config.customFeeLabel}
                      onChange={(e) => setConfig({ ...config, customFeeLabel: e.target.value })}
                      className="bg-transparent border-b border-gray-600 text-black dark:text-white focus:outline-none focus:border-blue-500 w-full font-semibold placeholder:text-gray-400 placeholder:font-normal"
                    />
                  </Label>
                  <Input type="number" placeholder="0" value={config.customFeeDefault} onChange={(e) => setConfig({ ...config, customFeeDefault: e.target.value })} className={inputClass} />
                </div>
              </div>

              <div className="lg:col-span-1">
                <Button onClick={handleGenerate} disabled={submitting || selectedStudentIds.size === 0} className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-md text-xs font-bold">
                  {submitting ? <Loader small /> : "GENERATE"}
                </Button>
              </div>
            </div>

            {/* Labels Row */}
            <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="flex flex-col">
                <Label className="text-[10px] text-gray-400 uppercase font-bold">Main Fee Label (e.g. Tuition Fee)</Label>
                <Input value={config.feeLabel} onChange={(e) => setConfig({ ...config, feeLabel: e.target.value })} className="h-7 w-64 text-xs bg-transparent border-none p-0 focus-visible:ring-0 placeholder:text-gray-400 text-black dark:text-white" placeholder="e.g. Tuition Fee - Oct" />
              </div>
              <div className="flex justify-end">
                <div className="flex items-center gap-2 text-[10px] text-orange-600 bg-orange-900/20 px-3 py-1 rounded-full w-max">
                  <AlertCircle className="w-3 h-3" />
                  <span>Payments are applied sequentially; pending items auto-merge with new ones.</span>
                </div>
              </div>
            </div>
          </div>

          {/* MESSAGING CONFIGURATION */}
          <div className={`${glassCardClass} !p-3 flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="send-sms"
                  checked={sendMessage}
                  onChange={(e) => setSendMessage(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-white/5 text-green-600 focus:ring-green-500 accent-green-600 cursor-pointer"
                />
                <Label htmlFor="send-sms" className="cursor-pointer font-bold text-sm text-gray-200 flex items-center gap-1">
                  <MessageSquare className="w-4 h-4 text-green-600" /> WhatsApp / SMS Alert on Generation
                </Label>
              </div>
            </div>

            {sendMessage && (
              <div className="pl-6 pt-1">
                <Label className="text-[10px] text-gray-500 font-semibold mb-1 block">Standardized Message Preview</Label>
                <div className="w-full mt-1 p-3 text-xs rounded-md border border-white/10 bg-black/50 text-gray-800 dark:text-gray-300 whitespace-pre-wrap leading-relaxed font-medium">
                  *Fee Invoice Alert* 🔔{"\n\n"}
                  Dear *[Student Name]*,{"\n"}
                  Your fee invoice for *{config.feeLabel || "Tuition Fee"}* has been generated.{"\n\n"}
                  *Fee Breakdown:*{"\n"}
                  Tuition Fee: Rs. [Monthly Amount]{"\n"}
                  {config.annualCharges > 0 ? `Annual Charges: Rs. [Amount]\n` : ""}
                  {config.stationeryCharges > 0 ? `Stationery: Rs. [Amount]\n` : ""}
                  {config.customFeeDefault > 0 ? `${config.customFeeLabel || 'Custom Charges'}: Rs. [Amount]\n` : ""}
                  Previous Pending Dues: Rs. [Amount] (if any){"\n\n"}
                  *Total Due:* Rs. [Grand Total]{"\n"}
                  📅 *Due Date:* {config.dueDate}{"\n\n"}
                  Please clear the dues before the deadline. Thank you! 🏫
                </div>
              </div>
            )}
          </div>

          {/* MAIN CONTENT: STUDENT TABLE */}
          <div className="space-y-2 bg-[#111827] rounded-xl border border-gray-800 shadow-sm overflow-hidden">

            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-white/5">
              <h3 className="font-bold flex items-center gap-2 text-gray-200">
                <Users className="w-4 h-4" /> Eligible Students
                <span className="text-xs font-normal text-gray-400">({students.length})</span>
              </h3>
            </div>

            {!selectedClassId ? (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-800 text-black dark:text-white dark:bg-white/5 m-4 rounded-xl">
                <Filter className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">Select a class above to load students</p>
              </div>
            ) : fetchingStudents ? (
              <div className="h-64 flex items-center justify-center">
                <Loader />
              </div>
            ) : students.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-800 m-4 rounded-xl">
                <CheckSquare className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">No eligible students found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                  <thead className="bg-gray-800/50 text-xs uppercase text-gray-400 border-b border-gray-800">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-600 bg-white/5 text-blue-800 dark:text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                          checked={selectedStudentIds.size === students.length && students.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-3 font-semibold">Student Info</th>
                      <th className="p-3 font-semibold w-24">Monthly</th>
                      <th className="p-3 font-semibold w-24">Prev. Dues</th>
                      <th className="p-3 font-semibold w-28">Annual Rs.</th>
                      <th className="p-3 font-semibold w-28">Stat. Rs.</th>
                      <th className="p-3 font-semibold w-28 text-blue-400">{config.customFeeLabel || "Custom"} Rs.</th>
                      <th className="p-3 font-semibold text-right w-24">Est. Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {students.map((student) => {
                      const isSelected = selectedStudentIds.has(student.studentid)

                      const mFee = Number(student.monthly_fee) || 0;
                      const arrearsAmt = Number(student.arrears) || 0;
                      const ann = getCharge(student.studentid, 'annual', config.annualCharges)
                      const stat = getCharge(student.studentid, 'stationery', config.stationeryCharges)
                      const cust = getCharge(student.studentid, 'custom', config.customFeeDefault)
                      const estTotal = mFee + arrearsAmt + ann + stat + cust;

                      return (
                        <tr
                          key={student.studentid}
                          className={`hover:bg-white/5 transition-colors ${isSelected ? 'bg-blue-900/10' : ''}`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-gray-600 bg-white/5 text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleStudent(student.studentid)}
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-blue-500 dark:text-white ">{student.name}</div>
                            <div className="text-[11px] text-gray-400">{student.fathername} • {student.studentid}</div>
                          </td>
                          <td className="p-3 text-gray-500 font-medium">
                            {mFee.toLocaleString()}
                          </td>
                          <td className="p-3 text-red-400 font-medium">
                            {arrearsAmt > 0 ? arrearsAmt.toLocaleString() : "-"}
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              className="h-7 w-20 text-xs bg-black/40 border-gray-700"
                              placeholder={config.annualCharges}
                              value={studentFees[student.studentid]?.annual !== undefined ? studentFees[student.studentid].annual : ""}
                              onChange={(e) => handleStudentFeeChange(student.studentid, 'annual', e.target.value)}
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              className="h-7 w-20 text-xs bg-black/40 border-gray-700"
                              placeholder={config.stationeryCharges}
                              value={studentFees[student.studentid]?.stationery !== undefined ? studentFees[student.studentid].stationery : ""}
                              onChange={(e) => handleStudentFeeChange(student.studentid, 'stationery', e.target.value)}
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              className="h-7 w-20 text-xs bg-black/40 border-gray-700 focus-visible:ring-blue-500"
                              placeholder={config.customFeeDefault}
                              value={studentFees[student.studentid]?.custom !== undefined ? studentFees[student.studentid].custom : ""}
                              onChange={(e) => handleStudentFeeChange(student.studentid, 'custom', e.target.value)}
                            />
                          </td>
                          <td className="p-3 text-right font-bold text-gray-200">
                            {estTotal.toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
