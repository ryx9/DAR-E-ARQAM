"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "../../utils/supabaseClient"
import Navbar from "../../components/Navbar"
import Loader from "../../components/Loader"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { 
  Save, ArrowLeft, User, Phone, Calendar, 
  BookOpen, DollarSign, Download, Search, 
  FileText, Hash, BadgeCheck 
} from "lucide-react"
import { useToast } from "../../hooks/use-toast"

const todayLocal = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const feeLabelForDate = date => {
  if (!date) return ''
  const [year, month] = date.split('-').map(Number)
  return `Tuition Fee - ${new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' })} - ${year}`
}

function ManageStudentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
   
  // Check Mode
  const urlStudentId = searchParams.get("id")
  const isEditing = !!urlStudentId

  // --- State ---
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [classes, setClasses] = useState([])
   
  // Inquiry Search
  const [inquirySearch, setInquirySearch] = useState("")
  const [inquiryResults, setInquiryResults] = useState([])
  const [showInquirySearch, setShowInquirySearch] = useState(false)

  // Form Data
  const [formData, setFormData] = useState({
    studentid: "", 
    name: "",
    fathername: "",
    mobilenumber: "",
    dob: "",
    address: "",
    class_id: "",
    monthly_fee: 0,
    gender: "Male",
    joining_date: new Date().toISOString().split('T')[0]
  })

  // Invoice State (Always active for new admissions now)
  const [invoiceData, setInvoiceData] = useState({
    invoiceDate: todayLocal(),
    dueDate: `${todayLocal().slice(0, 7)}-10`,
    feeLabel: feeLabelForDate(todayLocal()),
    admission_fee: 0,
    annual_charges: 0,
    stationery_charges: 0,
    discount: 0,
    notes: "First Month Enrollment Fee"
  })

  // --- Initialization ---
  useEffect(() => {
    fetchClasses()
    if (isEditing) {
      fetchStudentData(urlStudentId)
    }
  }, [urlStudentId])

  const fetchClasses = async () => {
    const { data } = await supabase.from("classes").select("*").order('id')
    setClasses(data || [])
  }

  const fetchStudentData = async (id) => {
    setLoading(true)
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("studentid", id)
      .single()

    if (error) {
      toast({ title: "Error fetching student", variant: "destructive" })
      router.push("/admin/crud")
    } else if (data) {
      setFormData({
        studentid: data.studentid,
        name: data.name,
        fathername: data.fathername,
        mobilenumber: data.mobilenumber,
        dob: data.dob,
        address: data.address || "",
        class_id: data.class_id,
        monthly_fee: data.monthly_fee || 0,
        gender: data.gender || "Male",
        joining_date: data.joining_date || new Date().toISOString().split('T')[0]
      })
    }
    setLoading(false)
  }

  // --- Inquiry Import ---
  const handleInquirySearch = async (query) => {
    setInquirySearch(query)
    if (query.length < 2) {
      setInquiryResults([])
      return
    }
    const { data } = await supabase
      .from("inquiries")
      .select("id, name,fathername,mobilenumber, address")
      .ilike("name", `%${query}%`)
      .limit(5)
    setInquiryResults(data || [])
  }

  const importInquiry = (inquiry) => {
    setFormData(prev => ({
      ...prev,
      name: inquiry.name || "",
      fathername: inquiry.father_name || inquiry.fathername || "",
      mobilenumber: inquiry.mobile || inquiry.mobilenumber || "",
      address: inquiry.address || "",
    }))
    setShowInquirySearch(false)
    setInquirySearch("")
    toast({ title: "Data imported", variant: "default" })
  }

  const nextStudentId = async () => {
    let offset = 0, highest = 0
    while (true) {
      const { data, error } = await supabase.from('students').select('studentid').order('studentid', { ascending: true }).range(offset, offset + 999)
      if (error) throw error
      for (const row of data || []) {
        const value = String(row.studentid ?? '')
        if (/^\d+$/.test(value)) highest = Math.max(highest, Number(value))
      }
      if (!data || data.length < 1000) return highest + 1
      offset += 1000
    }
  }

  // --- Submit Logic ---
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      // Validation
      if (!formData.name) throw new Error("Student Name is required.")
      if (!formData.class_id) throw new Error("Class is required.")
      if (!isEditing && (!invoiceData.invoiceDate || !invoiceData.dueDate || !invoiceData.feeLabel.trim())) throw new Error('Invoice Date, Due Date and Main Fee Label are required.')

      // 1. Insert / Update Student
      if (isEditing) {
        const { error } = await supabase
          .from("students")
          .update({
            name: formData.name,
            fathername: formData.fathername,
            mobilenumber: formData.mobilenumber,
            dob: formData.dob,
            address: formData.address,
            class_id: formData.class_id,
            monthly_fee: formData.monthly_fee,
            gender: formData.gender,
            joining_date: formData.joining_date
          })
          .eq("studentid", urlStudentId)

        if (error) throw error
        toast({ title: "Student updated successfully! ✅" })

      } else {
        // --- ADD MODE (With Mandatory Invoice) ---
        let assignedId
        for (let attempt = 0; attempt < 3; attempt++) {
          const candidate = await nextStudentId()
          const { error } = await supabase.from("students").insert([{ ...formData, studentid: candidate, Clear: false, status: "invoice_generated" }])
          if (!error) { assignedId = candidate; break }
          if (error.code !== '23505') throw error
          const { data: existing, error: lookupError } = await supabase.from('students').select('studentid').eq('studentid', candidate).maybeSingle()
          if (lookupError) throw lookupError
          if (!existing) throw error
        }
        if (assignedId == null) throw new Error('Could not assign a student ID. Please try again.')

        toast({ title: "Admission Successful! 🎉" })

        // 2. Generate Invoice (Mandatory)
          
        // Calculate Total
        const monthly = Number(formData.monthly_fee) || 0;
        const admission = Number(invoiceData.admission_fee) || 0;
        const annual = Number(invoiceData.annual_charges) || 0;
        const stationery = Number(invoiceData.stationery_charges) || 0;
        const discount = Number(invoiceData.discount) || 0;
        
        const totalAmount = (monthly + admission + annual + stationery) - discount;

        // A. Create Master Invoice (fee_invoices)
        const { data: invData, error: invError } = await supabase
          .from("fee_invoices")
          .insert([{
            student_id: assignedId,
            invoice_date: invoiceData.invoiceDate,
            due_date: invoiceData.dueDate,
            total_amount: totalAmount,
            status: "unpaid"
          }])
          .select()
          .single()

        if (invError) {
          console.error("Invoice Master Error:", invError)
          toast({ title: "Admission done, but Invoice failed", variant: "destructive" })
        } else if (invData) {
          
          // B. Prepare Detail Rows (fee_invoice_details)
          const detailsPayload = [];

          if (monthly > 0) detailsPayload.push({ invoice_id: invData.id, fee_type: invoiceData.feeLabel.trim(), description: 'Monthly Tuition Charges', amount: monthly });
          if (admission > 0) detailsPayload.push({ invoice_id: invData.id, fee_type: 'Admission Fee', description: 'New Admission Charges', amount: admission });
          if (annual > 0) detailsPayload.push({ invoice_id: invData.id, fee_type: 'Annual Charges', description: 'Annual / Paper Funds', amount: annual });
          if (stationery > 0) detailsPayload.push({ invoice_id: invData.id, fee_type: 'Stationery', description: 'Books/Stationery', amount: stationery });
          if (discount > 0) detailsPayload.push({ invoice_id: invData.id, fee_type: 'Discount', description: 'Admission Discount', amount: -discount });

          if (detailsPayload.length > 0) {
            const { error: detailError } = await supabase
              .from("fee_invoice_details")
              .insert(detailsPayload)

            if (detailError) console.error("Invoice Details Error:", detailError)
            else toast({ title: "Fee Invoice Generated 🧾" })
          }
        }
      }

      router.push("/admin/crud")

    } catch (error) {
      console.error(error)
      toast({ title: error.message || "Failed to save", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader /></div>

  // --- Glassmorphic Styles ---
  const glassCardClass = "relative overflow-hidden rounded-2xl border border-white/20 bg-white/40 dark:bg-black/40 backdrop-blur-xl shadow-xl p-6 transition-all hover:border-white/30"
  const glassInputClass = "bg-white/50 dark:bg-white/5 border-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 placeholder:text-gray-500/70"

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-[#0b1220] dark:via-[#1a1c2e] dark:to-[#0f0718] p-4 md:p-8 transition-colors duration-500">
        <div className="max-w-5xl mx-auto">
           
          {/* HEADER */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => router.back()} className="rounded-full h-10 w-10 bg-white/30 backdrop-blur border-white/20 hover:bg-white/50">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white drop-shadow-sm">
                  {isEditing ? "Edit Student" : "New Admission"}
                </h1>
                <p className="text-gray-600 dark:text-slate-400 text-sm font-medium">
                  {isEditing ? "Update existing records" : "Enroll a new student manually"}
                </p>
              </div>
            </div>
             
            {!isEditing && (
              <Button 
                variant="ghost" 
                onClick={() => setShowInquirySearch(!showInquirySearch)}
                className="bg-white/30 backdrop-blur hover:bg-white/50 border border-white/20 text-blue-700 dark:text-blue-300"
              >
                <Download className="w-4 h-4 mr-2" />
                {showInquirySearch ? "Close Import" : "Import from Inquiry"}
              </Button>
            )}
          </div>

          {/* INQUIRY IMPORT (Glass) */}
          {showInquirySearch && (
            <div className="mb-6 p-4 rounded-xl border border-blue-200/50 bg-blue-50/60 backdrop-blur-md dark:bg-blue-900/20 dark:border-blue-700/30 animate-in slide-in-from-top-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-blue-600/70" />
                <Input 
                  placeholder="Search by student name..." 
                  className="pl-10 bg-white/60 dark:bg-black/40 border-blue-200 dark:border-blue-800"
                  value={inquirySearch}
                  onChange={(e) => handleInquirySearch(e.target.value)}
                />
              </div>
              {inquiryResults.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {inquiryResults.map(inq => (
                    <div key={inq.id} className="flex justify-between items-center p-3 rounded-lg bg-white/60 dark:bg-white/5 border border-white/20 shadow-sm">
                      <div>
                        <p className="font-bold text-sm text-gray-800 dark:text-gray-200">{inq.name}</p>
                        <p className="text-xs text-gray-500">
                          {inq.father_name || inq.fathername || "—"} &nbsp;·&nbsp; {inq.mobile || inq.mobilenumber || "—"}
                        </p>
                        {(inq.address) && (
                          <p className="text-xs text-gray-400 mt-0.5">{inq.address}</p>
                        )}
                      </div>
                      <Button size="sm" className="bg-blue-600/90 hover:bg-blue-700" onClick={() => importInquiry(inq)}>Import</Button>
                    </div>
                  ))}
                </div>
              )}
              {inquirySearch.length >= 2 && inquiryResults.length === 0 && (
                <p className="text-center text-sm text-gray-500 mt-3">No inquiries found for "{inquirySearch}"</p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* 1. STUDENT INFO CARD (Glass) */}
            <div className={glassCardClass}>
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <User className="w-24 h-24" />
              </div>
              
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-gray-800 dark:text-white">
                <BadgeCheck className="w-6 h-6 text-blue-600 dark:text-white" /> 
                Student Identity
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                
                {/* ID INPUT */}
                <div className="col-span-1 md:col-span-2">
                    <Label className="text-gray-700 dark:text-gray-300 font-semibold ml-1">Student ID (Roll No)</Label>
                    <div className="relative mt-1.5">
                      <Hash className="absolute left-3 top-2.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <Input 
                        type="text"
                        disabled
                        value={isEditing ? formData.studentid : ''}
                        className={`pl-10 h-11 text-lg font-bold tracking-wide ${glassInputClass} opacity-60 cursor-not-allowed`}
                        placeholder="Assigned automatically on admission"
                      />
                    </div>
                    {!isEditing && <p className="text-xs text-gray-500 mt-1 ml-1">The next available student ID is assigned when you save.</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Full Name <span className="text-red-500">*</span></Label>
                  <Input required className={glassInputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Student Name" />
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Father Name</Label>
                  <Input className={glassInputClass} value={formData.fathername} onChange={e => setFormData({...formData, fathername: e.target.value})} placeholder="Parent/Guardian Name" />
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Mobile Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input className={`pl-9 ${glassInputClass}`} value={formData.mobilenumber} onChange={e => setFormData({...formData, mobilenumber: e.target.value})} placeholder="0300-1234567" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Date of Birth</Label>
                  <Input type="date" className={glassInputClass} value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                </div>

                <div className="space-y-1.5">
                    <Label className="ml-1 text-gray-700 dark:text-gray-300">Gender</Label>
                    <select 
                      className={`flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${glassInputClass}`}
                      value={formData.gender}
                      onChange={e => setFormData({...formData, gender: e.target.value})}
                    >
                      <option value="Male" className="dark:bg-slate-800">Male</option>
                      <option value="Female" className="dark:bg-slate-800">Female</option>
                    </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Address</Label>
                  <Input className={glassInputClass} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="City / Area" />
                </div>
              </div>
            </div>

            {/* 2. ACADEMIC & FEE CARD (Glass) */}
            <div className={glassCardClass}>
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <BookOpen className="w-24 h-24" />
              </div>

              <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-gray-800 dark:text-white">
                <DollarSign className="w-6 h-6 text-green-600 dark:text-white" /> 
                Academic & Fee Structure
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Assign Class <span className="text-red-500">*</span></Label>
                  <select 
                    className={`flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${glassInputClass}`}
                    value={formData.class_id}
                    onChange={e => setFormData({...formData, class_id: e.target.value})}
                    required
                  >
                    <option value="" className="dark:bg-slate-800">Select Class</option>
                    {classes.map(c => <option key={c.id} value={c.id} className="dark:bg-slate-800">{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Joining Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input type="date" className={`pl-9 ${glassInputClass}`} value={formData.joining_date} onChange={e => setFormData({...formData, joining_date: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Monthly Tuition Fee (PKR) <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-green-600" />
                    <Input 
                      type="number" 
                      className={`pl-9 font-bold text-green-700 dark:text-green-400 text-lg ${glassInputClass}`}
                      value={formData.monthly_fee} 
                      onChange={e => setFormData({...formData, monthly_fee: e.target.value})} 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. FIRST INVOICE GENERATOR (MANDATORY & ALWAYS VISIBLE) */}
            {!isEditing && (
              <div className={glassCardClass}>
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none"><FileText className="w-24 h-24" /></div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-white" />
                    <div>
                      <h2 className="text-xl font-bold text-gray-800 dark:text-white">First Invoice Details</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Mandatory for new admissions</p>
                    </div>
                  </div>
                </div>

                <div className="animate-in fade-in slide-in-from-top-4 space-y-5 pt-4 border-t border-gray-200/30 dark:border-white/10 relative z-10">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div><Label htmlFor="admission-invoice-date" className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">Invoice Date</Label><Input id="admission-invoice-date" type="date" required className={glassInputClass} value={invoiceData.invoiceDate} onChange={e => {
                      const next = e.target.value
                      setInvoiceData(prev => ({ ...prev, invoiceDate: next, ...(next && next.slice(0, 7) !== prev.invoiceDate.slice(0, 7) ? { dueDate: `${next.slice(0, 7)}-10`, feeLabel: feeLabelForDate(next) } : {}) }))
                    }} /></div>
                    <div><Label htmlFor="admission-due-date" className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">Due Date</Label><Input id="admission-due-date" type="date" required className={glassInputClass} value={invoiceData.dueDate} onChange={e => setInvoiceData(prev => ({ ...prev, dueDate: e.target.value }))} /></div>
                    <div><Label htmlFor="admission-fee-label" className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">Main Fee Label (e.g. Tuition Fee)</Label><Input id="admission-fee-label" required className={glassInputClass} value={invoiceData.feeLabel} onChange={e => setInvoiceData(prev => ({ ...prev, feeLabel: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <Label className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">Admission Fee</Label>
                        <Input type="number" className={glassInputClass} value={invoiceData.admission_fee} onChange={e => setInvoiceData({...invoiceData, admission_fee: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">Annual Charges</Label>
                        <Input type="number" className={glassInputClass} value={invoiceData.annual_charges} onChange={e => setInvoiceData({...invoiceData, annual_charges: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-bold text-gray-500 dark:text-gray-300 uppercase">Stationery/Books</Label>
                        <Input type="number" className={glassInputClass} value={invoiceData.stationery_charges} onChange={e => setInvoiceData({...invoiceData, stationery_charges: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-bold text-red-400 uppercase">Discount</Label>
                        <Input type="number" className={`text-red-500 ${glassInputClass}`} value={invoiceData.discount} onChange={e => setInvoiceData({...invoiceData, discount: e.target.value})} />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-end gap-4 bg-white/30 dark:bg-black/20 p-4 rounded-xl backdrop-blur-md border border-white/20">
                    <div className="text-xs text-gray-600 dark:text-gray-400 italic max-w-xs">
                        Formula: Monthly Fee ({formData.monthly_fee}) + Admission + Annual + Stationery - Discount.
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Payable Now</p>
                      <p className="text-3xl font-black text-gray-900 dark:text-white leading-none drop-shadow-sm">
                        <span className="text-sm font-normal text-gray-500 mr-1">PKR</span>
                        {(
                          Number(formData.monthly_fee || 0) + 
                          Number(invoiceData.admission_fee || 0) + 
                          Number(invoiceData.annual_charges || 0) + 
                          Number(invoiceData.stationery_charges || 0) - 
                          Number(invoiceData.discount || 0)
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="flex justify-end gap-4 pt-4 pb-12">
              <Button type="button" variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">Cancel</Button>
              <Button 
                type="submit" 
                disabled={saving}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-blue-500/30 transition-all rounded-lg px-8 h-12"
              >
                {saving ? <Loader small /> : (
                  <>
                    <Save className="w-5 h-5 mr-2" /> 
                    {isEditing ? "Update Student" : "Admit & Generate Invoice"}
                  </>
                )}
              </Button>
            </div>

          </form>
        </div>
      </div>
    </>
  )
}

export default function ManageStudentPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader /></div>}>
      <ManageStudentContent />
    </Suspense>
  )
}
