"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "../../../utils/supabaseClient"
import Navbar from "../../../components/Navbar"
import Loader from "../../../components/Loader"
import { Button } from "../../../components/ui/button"
import { Label } from "../../../components/ui/label"
import { Input } from "../../../components/ui/input"
import { ArrowLeft, Printer, Search, Download } from "lucide-react"
import { useToast } from "../../../hooks/use-toast"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// --- CONSTANTS ---
const SCHOOL_NAME = "DAR-E-ARQAM SCHOOL"
const CAMPUS_NAME = "Q MODEL TOWN CAMPUS"
const COPIES = ["BANK COPY", "SCHOOL COPY", "PARENT COPY"]

const COLORS = {
  brand: "#1F2937",    // Dark Charcoal
  accent: "#B91C1C",   // Dark Red
  sub_bg: "#F3F4F6",   // Light Grey
  text: "#111827",     // Near Black
  border: "#9CA3AF",   // Mid Grey
  white: "#FFFFFF",
  total_bg: "#D1D5DB"  // Darker Grey for Totals
}

// --- HELPER: FORMAT CURRENCY ---
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-PK', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount || 0)
}

// --- HELPER: LOAD IMAGE TO BASE64 FOR JSPDF ---
const loadImageBase64 = async (url) => {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    console.warn("Logo not found or could not be loaded:", err)
    return null
  }
}

function PrintInvoicesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [processingPdf, setProcessingPdf] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [autoPrintMode, setAutoPrintMode] = useState(false)

  // Manual Selection State
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState("")
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  })

  const paramInvoiceIds = searchParams.get('invoices')

  // --- 1. INITIALIZATION & AUTO-PRINT LOGIC ---
  useEffect(() => {
    if (paramInvoiceIds) {
      setAutoPrintMode(true)
      const cleanedIds = paramInvoiceIds.replace(/[\[\]"]/g, '')
      if (cleanedIds && cleanedIds.trim() !== "") {
        const ids = cleanedIds.split(',').filter(id => id.trim() !== '')
        fetchAndAutoPrint(ids)
      } else {
        setAutoPrintMode(false)
        fetchClasses()
      }
    } else {
      fetchClasses()
    }
  }, [paramInvoiceIds])

  // --- 2. DATA FETCHING ---
  const fetchClasses = async () => {
    const { data } = await supabase.from("classes").select("*").order('id')
    setClasses(data || [])
  }

  const fetchAndAutoPrint = async (ids) => {
    setLoading(true)
    const data = await fetchInvoicesByIds(ids)
    setLoading(false)
    
    if (data && data.length > 0) {
      setInvoices(data)
      await generatePDF(data)
    } else {
      toast({ title: "No invoices found", variant: "destructive" })
      setAutoPrintMode(false) 
    }
  }

  // Fetch payments separately so reprints include all payments on each invoice,
  // including payment records beyond the server's default row limit.
  const attachInvoicePayments = async (invoices) => {
    const totals = new Map()
    const ids = invoices.map(invoice => invoice.id)
    for (let i = 0; i < ids.length; i += 150) {
      const chunk = ids.slice(i, i + 150)
      let offset = 0
      while (true) {
        const { data, error } = await supabase.from('fee_payments')
          .select('id, invoice_id, amount').in('invoice_id', chunk)
          .order('id', { ascending: true }).range(offset, offset + 999)
        if (error) throw error
        for (const payment of data || []) {
          const key = String(payment.invoice_id)
          totals.set(key, (totals.get(key) || 0) + (Number(payment.amount) || 0))
        }
        if (!data || data.length < 1000) break
        offset += 1000
      }
    }
    return invoices.map(invoice => ({ ...invoice, paidOnInvoice: totals.get(String(invoice.id)) || 0 }))
  }

  const fetchInvoicesByIds = async (ids) => {
    try {
      const { data, error } = await supabase
        .from("fee_invoices")
        .select(`
          *,
          students (
            name, fathername, studentid,
            classes ( name )
          ),
          fee_invoice_details ( fee_type, amount )
        `)
        .in('id', ids)

      if (error) throw error
      return await attachInvoicePayments(data || [])
    } catch (error) {
      console.error(error)
      return []
    }
  }

  const handleManualSearch = async () => {
    if (!selectedClassId) return toast({ title: "Select a class", variant: "destructive" })

    setLoading(true)
    try {
      const { data: students } = await supabase
        .from("students").select("studentid").eq("class_id", selectedClassId)

      const studentIds = students.map(s => s.studentid)
      if (studentIds.length === 0) {
        setInvoices([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from("fee_invoices")
        .select(`
          *,
          students (
            name, fathername, studentid,
            classes ( name )
          ),
          fee_invoice_details ( fee_type, amount )
        `)
        .in("student_id", studentIds)
        .gte("invoice_date", dateRange.start)
        .lte("invoice_date", dateRange.end)
        .neq("status", "expired")

      if (error) throw error
      setInvoices(await attachInvoicePayments(data || []))
      
    } catch (error) {
      console.error(error)
      toast({ title: "Search failed", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  // --- 3. HEAVY CORPORATE DESIGN PDF GENERATOR ---
  const generatePDF = async (dataToPrint = invoices) => {
    if (!dataToPrint || dataToPrint.length === 0) return

    setProcessingPdf(true)
    
    try {
      const logoBase64 = await loadImageBase64('/lg.png')
      const doc = new jsPDF('l', 'mm', 'a4') 
      const pageWidth = 297
      const pageHeight = 210
      const margin = 10 
      const stripWidth = (pageWidth - (margin * 2)) / 3
      const stripHeight = pageHeight - 20
      const startY = 10

      dataToPrint.forEach((inv, invIndex) => {
        if (invIndex > 0) doc.addPage()

        COPIES.forEach((copyType, copyIndex) => {
          const startX = margin + (copyIndex * stripWidth)
          
          // Container bounds
          const innerBoxX = startX + 2
          const innerBoxY = startY + 2
          const innerBoxW = stripWidth - 4
          const innerBoxH = stripHeight - 4

          // --- 1. OUTER CONTAINER (Thick Border) ---
          doc.setDrawColor(COLORS.brand)
          doc.setLineWidth(0.53) // Approx 1.5 points
          doc.rect(innerBoxX, innerBoxY, innerBoxW, innerBoxH)

          // --- 2. HEADER BLOCK ---
          const headerHeight = 24
          const headerTopY = innerBoxY
          
          doc.setFillColor(COLORS.brand)
          doc.rect(innerBoxX, headerTopY, innerBoxW, headerHeight, 'F')

          const logoW = 16
          const pad = 4
          let textStartX = startX + 6

          if (logoBase64) {
            doc.setFillColor(COLORS.white)
            doc.rect(startX + 5, headerTopY + 4, logoW, logoW, 'F')
            doc.addImage(logoBase64, 'PNG', startX + 6, headerTopY + 5, logoW - 2, logoW - 2)
            textStartX += (logoW + pad)
          }

          // Center Text in remaining space
          const remainingWidth = (innerBoxX + innerBoxW) - textStartX
          const textCenterX = textStartX + (remainingWidth / 2)

          doc.setTextColor(COLORS.white)
          doc.setFont("helvetica", "bold")
          doc.setFontSize(13)
          doc.text(SCHOOL_NAME, textCenterX, headerTopY + 11, { align: 'center' })

          doc.setFont("helvetica", "normal")
          doc.setFontSize(8)
          doc.setTextColor('#D1D5DB')
          doc.text(CAMPUS_NAME, textCenterX, headerTopY + 16, { align: 'center' })

          // Top Right Copy Label
          doc.setFont("helvetica", "bold")
          doc.setFontSize(10)
          doc.setTextColor(COLORS.white)
          doc.text(copyType.toUpperCase(), innerBoxX + innerBoxW - 4, headerTopY + 6, { align: 'right' })

          // --- 3. STATUS BAR (Invoice # & Due Date) ---
          const barTopY = headerTopY + headerHeight
          doc.setFillColor('#E5E7EB')
          doc.rect(startX + 2.5, barTopY, stripWidth - 5, 8, 'F')

          doc.setTextColor(COLORS.brand)
          doc.setFontSize(9)
          doc.text(`INV #: ${inv.id}`, startX + 6, barTopY + 5.5)

          doc.setTextColor(COLORS.accent)
          const dueDate = inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}) : "10th"
          doc.text(`DUE: ${dueDate}`, innerBoxX + innerBoxW - 4, barTopY + 5.5, { align: 'right' })

          // --- 4. STUDENT DETAILS (Reversed white grid on grey background) ---
          const studentData = [
            ["NAME:", inv.students?.name || "-"],
            ["FATHER:", inv.students?.fathername || "-"],
            ["DAS NO:", inv.students?.studentid || "-"],
            ["CLASS:", inv.students?.classes?.name || "-"]
          ]

          autoTable(doc, {
            startY: barTopY + 8 + 2,
            body: studentData,
            theme: 'grid',
            margin: { left: startX + 6 },
            tableWidth: innerBoxW - 8,
            styles: { 
              font: 'helvetica', 
              fontSize: 10, 
              cellPadding: 1.5, 
              lineColor: COLORS.white, // White borders
              lineWidth: 0.5 
            },
            columnStyles: {
              0: { cellWidth: 20, fillColor: COLORS.sub_bg, textColor: COLORS.brand, fontStyle: 'bold' },
              1: { fillColor: COLORS.sub_bg, textColor: COLORS.text }
            }
          })

          // Charges and payments are shown separately so a receipt cannot be
          // mistaken for an additional fee item.
          const invoiceTotal = Number(inv.total_amount) || 0
          const paidOnInvoice = Number(inv.paidOnInvoice) || 0
          const remaining = invoiceTotal - paidOnInvoice
          const feeData = (inv.fee_invoice_details || []).map(d => [d.fee_type, formatCurrency(d.amount)])
          if (!feeData.length) feeData.push(['No fee items recorded', '-'])
          feeData.push(['INVOICE TOTAL', formatCurrency(invoiceTotal)])

          autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 5,
            head: [['INVOICE CHARGES', 'PKR']],
            body: feeData,
            theme: 'grid',
            margin: { left: startX + 6 },
            tableWidth: innerBoxW - 8,
            headStyles: { 
              fillColor: COLORS.brand, 
              textColor: COLORS.white, 
              fontStyle: 'bold', 
              fontSize: 8,
              halign: 'left', 
              cellPadding: 1.5
            },
            bodyStyles: { 
              fontSize: 8,
              textColor: COLORS.text, 
              cellPadding: 1.3,
              lineColor: COLORS.border, 
              lineWidth: 0.2 
            },
            alternateRowStyles: { 
              fillColor: COLORS.sub_bg 
            },
            columnStyles: {
              0: { cellWidth: 'auto' },
              1: { halign: 'right', cellWidth: 22 }
            },
            didParseCell: data => {
              if (data.section === 'body' && data.row.index === feeData.length - 1) {
                data.cell.styles.fillColor = [224, 231, 239]
                data.cell.styles.fontStyle = 'bold'
                data.cell.styles.textColor = COLORS.brand
              }
            }
          })

          autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 3,
            head: [['PAYMENT SUMMARY', 'PKR']],
            body: [
              ['Payments made against this invoice', `- ${formatCurrency(paidOnInvoice)}`],
              [remaining < 0 ? 'CREDIT ON THIS INVOICE' : 'AMOUNT REMAINING', formatCurrency(Math.abs(remaining))],
            ],
            theme: 'grid',
            margin: { left: startX + 6 },
            tableWidth: innerBoxW - 8,
            headStyles: { fillColor: [235, 238, 244], textColor: [31, 41, 55], fontStyle: 'bold', fontSize: 8, cellPadding: 1.5 },
            bodyStyles: { fontSize: 8, textColor: COLORS.text, cellPadding: 1.3, lineColor: COLORS.border, lineWidth: 0.2 },
            columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 22 } },
            didParseCell: data => {
              if (data.section === 'body' && data.row.index === 0) {
                data.cell.styles.textColor = [21, 101, 76]
              }
              if (data.section === 'body' && data.row.index === 1) {
                data.cell.styles.fillColor = [224, 231, 239]
                data.cell.styles.fontStyle = 'bold'
                data.cell.styles.textColor = COLORS.brand
              }
            },
          })

          // --- 6. FOOTER (Split Layout) ---
          const innerBoxBottomY = innerBoxY + innerBoxH
          const footerTopY = innerBoxBottomY - 30 // Approx 25mm footer area + bottom bar

          // Dashed separation line
          doc.setDrawColor(COLORS.border)
          doc.setLineWidth(0.2)
          doc.setLineDash([2, 2])
          doc.line(startX + 6, footerTopY, innerBoxX + innerBoxW - 4, footerTopY)
          doc.setLineDash([]) // Reset

          // Left: Instructions
          doc.setTextColor(COLORS.brand)
          doc.setFont("helvetica", "bold")
          doc.setFontSize(9)
          doc.text("INSTRUCTIONS:", startX + 6, footerTopY + 7)

          doc.setTextColor(COLORS.text)
          doc.setFont("helvetica", "normal")
          doc.setFontSize(8)
          const instructions = [
            "1. Due date is the 10th of every month.",
            "2. Late fee: Rs. 50/day after due date.",
            "3. Name struck off on 2 consecutive",
            "   non-payments."
          ]
          let instY = footerTopY + 11.5
          instructions.forEach(line => {
             doc.text(line, startX + 6, instY)
             instY += 3.5
          })

          // Right: Signature
          doc.setDrawColor(COLORS.brand)
          doc.setLineWidth(0.35)
          doc.line(innerBoxX + innerBoxW - 35, footerTopY + 18, innerBoxX + innerBoxW - 8, footerTopY + 18)
          
          doc.setFont("helvetica", "bold")
          doc.setFontSize(8)
          doc.text("ACCOUNTANT", innerBoxX + innerBoxW - 21.5, footerTopY + 22, { align: 'center' })

          // --- BOTTOM BAR: COPY TYPE ---
          doc.setFillColor(COLORS.brand)
          doc.rect(innerBoxX, innerBoxBottomY - 5, innerBoxW, 5, 'F')
          
          doc.setTextColor(COLORS.white)
          doc.setFontSize(7)
          doc.text(copyType.toUpperCase(), innerBoxX + (innerBoxW / 2), innerBoxBottomY - 1.5, { align: 'center' })

          // --- SCISSOR CUT LINE ---
          if (copyIndex < 2) {
             const cutX = margin + ((copyIndex + 1) * stripWidth)
             doc.setDrawColor('#9CA3AF')
             doc.setLineWidth(0.2)
             doc.setLineDash([2, 2])
             doc.line(cutX, 5, cutX, pageHeight - 5)
             doc.setLineDash([]) // Reset
          }

        }) // End Copies Loop
      }) // End Invoices Loop

      // --- OUTPUT ---
      const pdfBlobUrl = doc.output('bloburl')
      const opened = window.open(pdfBlobUrl, '_blank')
      if (!opened) throw new Error('The PDF window was blocked. Allow pop-ups and try again.')
      setAutoPrintMode(false)
      if (window.history.length > 1) router.back()
      else router.replace('/admin/invoices')
      
    } catch (e) {
      console.error(e)
      setAutoPrintMode(false)
      toast({ title: "PDF Generation Failed", description: e.message, variant: "destructive" })
    } finally {
      setProcessingPdf(false)
    }
  }

  // --- RENDER ---
  
  if (autoPrintMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <Loader />
        <p className="mt-4 text-gray-500 animate-pulse">Generating Invoices...</p>
      </div>
    )
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-slate-50 dark:bg-[#0b1220] p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => router.back()} className="rounded-full h-9 w-9 p-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-2xl font-bold">Print Invoices</h1>
            </div>
          </div>

          <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl p-6 rounded-xl border border-white/20 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label>Class</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                >
                  <option value="">Select Class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label>From Date</Label>
                <Input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
              </div>
              <div>
                <Label>To Date</Label>
                <Input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
              </div>
              <div>
                <Button onClick={handleManualSearch} className="w-full" disabled={loading}>
                  {loading ? <Loader small /> : <><Search className="w-4 h-4 mr-2" /> Find Invoices</>}
                </Button>
              </div>
            </div>
          </div>

          {invoices.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                 <h3 className="font-bold">Results ({invoices.length})</h3>
                 <Button 
                   onClick={() => generatePDF()} 
                   className="bg-green-600 hover:bg-green-700 text-white"
                   disabled={processingPdf}
                 >
                   {processingPdf ? <Loader small /> : <><Download className="w-4 h-4 mr-2" /> Download All PDFs</>}
                 </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {invoices.map(inv => (
                  <div key={inv.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-sm">{inv.students?.name}</h4>
                        <p className="text-xs text-gray-500">Inv #{inv.id}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full capitalize ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mt-3 pt-3 border-t">
                      <span className="text-gray-500">Total</span>
                      <span className="font-bold">{formatCurrency(inv.total_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function PrintInvoicesPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader /></div>}>
      <PrintInvoicesContent />
    </Suspense>
  )
}
