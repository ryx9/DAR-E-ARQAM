"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../utils/supabaseClient"
import Navbar from "../../components/Navbar"
import Loader from "../../components/Loader"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { 
  Search, Trash2, CreditCard, 
  PlusCircle, Users, ChevronLeft, ChevronRight,
  Calendar, CheckCircle2, XCircle, RefreshCcw,
  Filter, AlertCircle, Printer
} from "lucide-react"
import { useToast } from "../../hooks/use-toast"
import Link from "next/link"

function InvoicesPageContent() {
  const router = useRouter()
  const { toast } = useToast()

  // --- State ---
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState([])
  const [classes, setClasses] = useState([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false) 
    
  // Pagination State
  const [page, setPage] = useState(0)
  const ITEMS_PER_PAGE = 20
  const [totalCount, setTotalCount] = useState(0)

  // Filters
  const [filters, setFilters] = useState({
    search: "",
    classId: "",
    status: "all",
    startDate: "",
    endDate: ""
  })

  // --- Initialization ---
  useEffect(() => {
    // Check user role from localStorage on mount
    const checkUserRole = () => {
      try {
        const userRole = localStorage.getItem("UserRole")
        // Check if the role is 'superadmin' (added toLowerCase for safety)
        if (userRole && userRole.toLowerCase() === "superadmin") {
          setIsSuperAdmin(true)
        } else {
          setIsSuperAdmin(false)
        }
      } catch (error) {
        console.error("Error reading UserRole from local storage:", error)
      }
    }

    checkUserRole()
    fetchClasses()
  }, [])

  useEffect(() => {
    fetchInvoices()
  }, [page, filters.classId, filters.status, filters.startDate, filters.endDate]) 

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (filters.search !== undefined) {
        setPage(0)
        fetchInvoices()
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [filters.search])

  const fetchClasses = async () => {
    const { data } = await supabase.from("classes").select("id, name")
    setClasses(data || [])
  }

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const from = page * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1

      let query = supabase
        .from("fee_invoices")
        .select(`
          *,
          students!inner (
            studentid,
            name,
            class_id,
            classes ( name )
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

      if (filters.status !== "all") query = query.eq("status", filters.status)
      if (filters.startDate) query = query.gte("invoice_date", filters.startDate)
      if (filters.endDate) query = query.lte("invoice_date", filters.endDate)
      if (filters.classId) query = query.eq("students.class_id", filters.classId)

      if (filters.search) {
        if (!isNaN(filters.search)) {
          query = query.eq("id", filters.search)
        } else {
           query = query.ilike("students.name", `%${filters.search}%`)
        }
      }

      const { data, error, count } = await query

      if (error) throw error

      setInvoices(data || [])
      setTotalCount(count || 0)

    } catch (error) {
      console.error(error)
      toast({ title: "Failed to load invoices", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!isSuperAdmin) {
      toast({ title: "Unauthorized", description: "Only superadmins can delete invoices.", variant: "destructive" })
      return
    }

    if (!confirm("Are you sure you want to delete this invoice? This cannot be undone.")) return
    try {
      await supabase.from("fee_invoice_details").delete().eq("invoice_id", id)
      const { error } = await supabase.from("fee_invoices").delete().eq("id", id)
      if (error) throw error
      toast({ title: "Invoice deleted successfully" })
      fetchInvoices() 
    } catch (error) {
      toast({ title: "Error deleting invoice", variant: "destructive" })
    }
  }

  const handlePrint = (id) => {
    const idArray = JSON.stringify([id])
    router.push(`/admin/invoice/print?invoices=${idArray}`)
  }

  const getFeeMonth = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString('default', { month: 'short', year: 'numeric' });
  }

  const getInitials = (name) => {
    return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
  }

  // --- Styles ---
  const glassPanel = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/30 dark:shadow-none rounded-2xl"
  const glassInput = "bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all duration-300 placeholder:text-slate-400 text-sm"
  const tableHead = "px-6 py-4 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/70 sticky top-0 z-20"
  
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 font-sans">
        
        <div className="w-full max-w-7xl mx-auto space-y-6">

          {/* --- HEADER SECTION --- */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400">
                  <CreditCard className="h-5 w-5" />
                </span>
                <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">Fee Invoices</h1>
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium ml-1">
                Manage financial records and student payments.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost" onClick={fetchInvoices} className="h-10 w-10 p-0 rounded-full bg-white/40 hover:bg-white/80 border border-white/40 shadow-sm transition-all">
                <RefreshCcw className="w-4 h-4 text-slate-600" />
              </Button>
              <Link href="/admin/fee/pay">
                <Button variant="outline" className={`${glassPanel} hover:bg-white border-white/60 dark:text-white text-slate-700 font-semibold shadow-sm`}>
                  <Users className="w-4 h-4 mr-2" />
                  Record Payment
                </Button>
              </Link>
              <Link href="/admin/fee/generate">
                <Button className="bg-blue-600 hover:from-indigo-700 hover:to-purple-700 dark:hover:bg-white/5 text-white shadow-lg shadow-indigo-500/30 border-0 h-10 px-6 rounded-xl font-medium transition-all hover:scale-105 active:scale-95">
                  <PlusCircle className="w-4 h-4 mr-2" /> 
                  Generate Batch
                </Button>
              </Link>
            </div>
          </div>

          {/* --- MAIN CARD --- */}
          <div className={`${glassPanel} flex flex-col overflow-hidden`}>
            
            {/* FILTERS TOOLBAR */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-center bg-slate-50 dark:bg-slate-900">
              
              {/* Search */}
              <div className="lg:col-span-4 relative group">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <Input 
                  placeholder="Search student or invoice ID..." 
                  className={`pl-10 h-10 ${glassInput}`}
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                />
              </div>

              {/* Class Filter */}
              <div className="lg:col-span-2">
                <select 
                  className={`h-10 w-full rounded-xl px-3 text-sm outline-none cursor-pointer ${glassInput}`}
                  value={filters.classId}
                  onChange={(e) => setFilters({...filters, classId: e.target.value})}
                >
                  <option value="">All Classes</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Status Filter */}
              <div className="lg:col-span-2">
                <select 
                  className={`h-10 w-full rounded-xl px-3 text-sm outline-none cursor-pointer ${glassInput}`}
                  value={filters.status}
                  onChange={(e) => setFilters({...filters, status: e.target.value})}
                >
                  <option value="all">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              {/* Dates */}
              <div className="lg:col-span-4 flex gap-2">
                <div className="relative flex-1">
                  <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                   <Input 
                    type="date" 
                    className={`pl-9 h-10 text-xs ${glassInput} [color-scheme:light]`} 
                    value={filters.startDate}
                    onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                  />
                </div>
                <div className="relative flex-1">
                   <Input 
                    type="date" 
                    className={`px-3 h-10 text-xs ${glassInput} [color-scheme:light]`} 
                    value={filters.endDate}
                    onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* TABLE AREA */}
            <div className="overflow-x-auto min-h-[500px] relative">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className={`${tableHead} w-16`}>ID</th>
                    <th className={tableHead}>Student Information</th>
                    <th className={tableHead}>Fee Period</th>
                    <th className={tableHead}>Dates</th>
                    <th className={`${tableHead} text-right`}>Amount</th>
                    <th className={`${tableHead} text-center`}>Status</th>
                    <th className={`${tableHead} text-right pr-8`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-transparent text-slate-600 dark:text-slate-300">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="h-64">
                          <div className="flex flex-col items-center justify-center h-full gap-3">
                             <Loader small={false} />
                             <p className="text-sm text-slate-400 animate-pulse">Fetching records...</p>
                          </div>
                      </td>
                    </tr>
                  ) : invoices.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center opacity-60">
                           <Filter className="w-12 h-12 text-slate-300 mb-2" />
                           <p className="text-lg font-medium text-slate-500">No invoices found</p>
                           <p className="text-sm text-slate-400">Try adjusting your filters</p>
                           <Button variant="link" onClick={() => setFilters({search:"", classId:"", status:"all", startDate:"", endDate:""})} className="mt-2 text-indigo-500">
                             Clear all filters
                           </Button>
                        </div>
                      </td>
                    </tr>
                  ) : invoices.map((inv) => (
                    <tr key={inv.id} className="group border-b border-indigo-50/50 dark:border-white/5 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 transition-all duration-200">
                      
                      {/* ID */}
                      <td className="px-6 py-5 text-xs font-mono text-slate-400">
                        #{inv.id}
                      </td>

                      {/* Student Info */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar Placeholder */}
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ring-2 ring-white dark:ring-white/10 ${
                            inv.status === 'paid' 
                            ? 'bg-gradient-to-br from-emerald-100 to-teal-200 text-teal-700' 
                            : inv.status === 'expired'
                            ? 'bg-gradient-to-br from-slate-100 to-gray-200 text-slate-600'
                            : 'bg-gradient-to-br from-indigo-100 to-purple-200 text-indigo-700'
                          }`}>
                            {getInitials(inv.students?.name)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 dark:text-slate-100 text-[15px]">
                              {inv.students?.name || "Unknown"}
                            </span>
                            <span className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span className="bg-slate-100 dark:bg-white/10 px-1.5 rounded text-[10px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/5">
                                {inv.students?.classes?.name}
                              </span>
                              <span>ID: {inv.students?.studentid}</span>
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Fee Period */}
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-indigo-50/50 text-indigo-700 dark:bg-indigo-500/10 dark:text-white border border-indigo-100 dark:border-indigo-500/20">
                          <Calendar className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                          {getFeeMonth(inv.invoice_date)}
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col text-sm">
                           <span className="text-slate-700 dark:text-slate-300 font-medium">
                             {new Date(inv.invoice_date).toLocaleDateString()}
                           </span>
                           {(inv.status === 'unpaid' || inv.status === 'partial') && (
                             <span className="text-xs text-rose-500 font-medium mt-0.5">
                               Due: {new Date(inv.due_date).toLocaleDateString()}
                             </span>
                           )}
                           {inv.status === 'expired' && (
                             <span className="text-xs text-slate-400 italic mt-0.5">
                               Expired
                             </span>
                           )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                             <span className={`font-bold text-lg tracking-tight ${inv.status === 'expired' ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-white'}`}>
                               {Number(inv.total_amount).toLocaleString()}
                             </span>
                             <span className="text-[10px] uppercase font-bold text-slate-400">PKR</span>
                          </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        {inv.status === 'paid' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold  text-green-600 dark:text-green-400 shadow-sm">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                          </span>
                        ) : inv.status === 'partial' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange text-amber-400 dark:text-amber-400 shadow-sm">
                            <AlertCircle className="w-3.5 h-3.5" /> Partial
                          </span>
                        ) : inv.status === 'expired' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 shadow-sm dark:bg-white/5 dark:text-slate-400 dark:border-white/10">
                              <AlertCircle className="w-3.5 h-3.5" /> Expired
                            </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red text-red-600 shadow-sm">
                            <XCircle className="w-3.5 h-3.5" /> Unpaid
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right pr-8">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          
                          {/* PRINT BUTTON */}
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => handlePrint(inv.id)}
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-full"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>

                          {/* PAY BUTTON (Only if active) */}
                          {inv.status !== 'paid' && inv.status !== 'expired' && (
                            <Link href={`/admin/fee/pay?invoice_id=${inv.id}`}>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-full">
                                <CreditCard className="w-4 h-4" />
                              </Button>
                            </Link>
                          )}

                          {/* DELETE BUTTON (Conditionally Disabled) */}
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => handleDelete(inv.id)}
                            disabled={!isSuperAdmin}
                            title={!isSuperAdmin ? "Only superadmins can delete invoices" : "Delete invoice"}
                            className={`h-8 w-8 rounded-full transition-colors ${
                              isSuperAdmin 
                                ? "text-rose-400 hover:text-rose-600 hover:bg-rose-50" 
                                : "text-slate-300 opacity-50 cursor-not-allowed"
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* --- PAGINATION FOOTER --- */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
               <div className="text-xs text-slate-500 font-medium order-2 sm:order-1">
                 Showing <span className="text-slate-900 dark:text-white font-bold">{invoices.length > 0 ? page * ITEMS_PER_PAGE + 1 : 0}</span> - <span className="text-slate-900 dark:text-white font-bold">{Math.min((page + 1) * ITEMS_PER_PAGE, totalCount)}</span> of <span className="text-slate-900 dark:text-white font-bold">{totalCount}</span>
               </div>
               
               <div className="flex items-center gap-2 order-1 sm:order-2">
                 <Button 
                   variant="outline" size="sm" 
                   onClick={() => setPage(p => Math.max(0, p - 1))}
                   disabled={page === 0 || loading}
                   className="h-8 text-xs bg-white/50 hover:bg-white border-transparent shadow-sm"
                 >
                   <ChevronLeft className="w-3 h-3 mr-1" /> Previous
                 </Button>
                 <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-md min-w-[3rem] text-center dark:bg-indigo-900/30 dark:text-indigo-300">
                    {page + 1}
                 </span>
                 <Button 
                   variant="outline" size="sm" 
                   onClick={() => setPage(p => p + 1)}
                   disabled={(page + 1) * ITEMS_PER_PAGE >= totalCount || loading}
                   className="h-8 text-xs bg-white/50 hover:bg-white border-transparent shadow-sm"
                 >
                   Next <ChevronRight className="w-3 h-3 ml-1" />
                 </Button>
               </div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader /></div>}>
      <InvoicesPageContent />
    </Suspense>
  )
}
