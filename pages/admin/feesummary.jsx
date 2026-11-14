"use client"

import { useState, useEffect, useMemo } from "react"
import { supabase } from "../../utils/supabaseClient"
import Navbar from "../../components/Navbar"
import Loader from "../../components/Loader"
import { Button } from "../../components/ui/button"
import {
  Users, TrendingUp, DollarSign, BarChart3,
  FileText, GraduationCap, ChevronRight
} from "lucide-react"
import { useToast } from "../../hooks/use-toast"
import { exportFeeAnalyticsPDF } from "../../utils/feeAnalyticsPDF"
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend,
} from "chart.js"
import { Bar, Doughnut } from "react-chartjs-2"

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

// ─── Palette ──────────────────────────────────────────────────────────────────
const PAL = [
  "#3B8BD4", "#1D9E75", "#EF9F27", "#D85A30",
  "#7F77DD", "#D4537E", "#639922", "#BA7517",
  "#185FA5", "#0F6E56", "#9B3FC8", "#C07000",
]

const fmt = (n) => Number(n).toLocaleString("en-PK")

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FeeAnalyticsPage() {
  const { toast } = useToast()
  const [students,     setStudents]     = useState([])
  const [classes,      setClasses]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState("slabs")   // "slabs" | "classes"
  const [expandedSlab, setExpandedSlab] = useState(null)

  // ── fetch ────────────────────────────────────────────────────────────────
  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const [{ data: cls, error: e1 }, { data: stu, error: e2 }] = await Promise.all([
      supabase.from("classes").select("id, name").order("id"),
      supabase.from("active_students").select("studentid, name, fathername, class_id, monthly_fee").order("name"),
    ])
    if (e1 || e2) { toast({ title: "Failed to load data", variant: "destructive" }); setLoading(false); return }
    setClasses(cls || [])
    setStudents((stu || []).map(s => ({
      ...s,
      class_name: cls?.find(c => c.id === s.class_id)?.name ?? "Unknown",
      fee: s.monthly_fee != null && s.monthly_fee !== "" ? Number(s.monthly_fee) : null,
    })))
    setLoading(false)
  }

  // ── derived ──────────────────────────────────────────────────────────────
  const withFee  = useMemo(() => students.filter(s => s.fee !== null && !isNaN(s.fee)), [students])
  const noFee    = useMemo(() => students.filter(s => s.fee === null || isNaN(s.fee)),  [students])
  const totalRev = useMemo(() => withFee.reduce((a, s) => a + s.fee, 0), [withFee])
  const avgFee   = useMemo(() => withFee.length ? Math.round(totalRev / withFee.length) : 0, [withFee, totalRev])
  const maxFee   = useMemo(() => withFee.length ? Math.max(...withFee.map(s => s.fee)) : 0, [withFee])
  const minFee   = useMemo(() => withFee.length ? Math.min(...withFee.map(s => s.fee)) : 0, [withFee])

  const feeSlabs = useMemo(() => {
    const map = {}
    withFee.forEach(s => {
      if (!map[s.fee]) map[s.fee] = { fee: s.fee, count: 0, revenue: 0, students: [] }
      map[s.fee].count++; map[s.fee].revenue += s.fee; map[s.fee].students.push(s)
    })
    return Object.values(map).sort((a, b) => a.fee - b.fee)
  }, [withFee])

  const classStats = useMemo(() => classes.map(cls => {
    const members = withFee.filter(s => s.class_id === cls.id)
    const rev = members.reduce((a, s) => a + s.fee, 0)
    const slabs = {}
    members.forEach(s => { slabs[s.fee] = (slabs[s.fee] || 0) + 1 })
    return { id: cls.id, name: cls.name, count: members.length, revenue: rev, avg: members.length ? Math.round(rev / members.length) : 0, slabs }
  }).filter(c => c.count > 0).sort((a, b) => b.count - a.count), [classes, withFee])

  // ── chart data ───────────────────────────────────────────────────────────
  const barData = useMemo(() => ({
    labels: feeSlabs.map(g => `Rs. ${fmt(g.fee)}`),
    datasets: [{
      label: "Students",
      data: feeSlabs.map(g => g.count),
      backgroundColor: feeSlabs.map((_, i) => PAL[i % PAL.length] + "bb"),
      borderColor:     feeSlabs.map((_, i) => PAL[i % PAL.length]),
      borderWidth: 1.5,
      borderRadius: 8,
      borderSkipped: false,
    }]
  }), [feeSlabs])

  const donutData = useMemo(() => {
    const top = [...feeSlabs].sort((a, b) => b.count - a.count).slice(0, 8)
    return {
      labels: top.map(g => `Rs. ${fmt(g.fee)}`),
      datasets: [{
        data: top.map(g => g.count),
        backgroundColor: top.map((_, i) => PAL[i % PAL.length] + "cc"),
        borderColor:     top.map((_, i) => PAL[i % PAL.length]),
        borderWidth: 1.5,
        hoverOffset: 8,
      }]
    }
  }, [feeSlabs])

  const classBarData = useMemo(() => ({
    labels: classStats.map(c => c.name),
    datasets: [
      {
        label: "Avg Fee (Rs.)",
        data: classStats.map(c => c.avg),
        backgroundColor: "#3B8BD4bb", borderColor: "#3B8BD4", borderWidth: 1.5, borderRadius: 6, yAxisID: "yL",
      },
      {
        label: "Students",
        data: classStats.map(c => c.count),
        backgroundColor: "#1D9E75bb", borderColor: "#1D9E75", borderWidth: 1.5, borderRadius: 6, yAxisID: "yR",
      },
    ]
  }), [classStats])

  // ── PDF ──────────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!feeSlabs.length) return toast({ title: "No fee data to export", variant: "destructive" })
    try {
      await exportFeeAnalyticsPDF({ students, withFee, noFee, avgFee, totalRev, minFee, maxFee, feeSlabs, classStats })
      toast({ title: "PDF exported" })
    } catch (error) {
      console.error('Fee report export failed:', error)
      toast({ title: "Could not export PDF", description: error.message, variant: "destructive" })
    }
  }

  // ── shared chart options ──────────────────────────────────────────────────
  const axisStyle = { color: "#94a3b8", font: { size: 11 } }
  const gridColor = "rgba(148,163,184,0.12)"
  const noAxis   = { display: false }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar />

      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Fee Analytics</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Monthly fee distribution across all active students.</p>
            </div>
            <Button onClick={exportPDF} disabled={loading || !feeSlabs.length}
              className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shrink-0">
              <FileText className="w-4 h-4" /> Export PDF Report
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-32"><Loader /></div>
          ) : (
            <>
              {/* ── Stat cards ─────────────────────────────────────── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Students",      value: students.length,        sub: `${withFee.length} with fee data`,            icon: Users,       accent: "#3B8BD4" },
                  { label: "Average Monthly Fee", value: `Rs. ${fmt(avgFee)}`,   sub: `Min ${fmt(minFee)} · Max ${fmt(maxFee)}`,     icon: TrendingUp,  accent: "#1D9E75" },
                  { label: "Monthly Revenue",     value: `Rs. ${fmt(totalRev)}`, sub: `across ${withFee.length} students`,           icon: DollarSign,  accent: "#EF9F27" },
                  { label: "Fee Tiers",           value: feeSlabs.length,        sub: `${classStats.length} active classes`,         icon: BarChart3,   accent: "#7F77DD" },
                ].map(c => (
                  <div key={c.label} className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">{c.label}</span>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: c.accent + "18" }}>
                        <c.icon className="w-3.5 h-3.5" style={{ color: c.accent }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{c.value}</p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{c.sub}</p>
                    </div>
                    <div className="h-0.5 rounded-full w-10" style={{ background: c.accent }} />
                  </div>
                ))}
              </div>

              {/* ── Tabs ───────────────────────────────────────────── */}
              <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg w-fit">
                {[["slabs", "Fee Slabs"], ["classes", "By Class"]].map(([id, label]) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                      activeTab === id
                        ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ════ TAB: FEE SLABS ════ */}
              {activeTab === "slabs" && (
                <div className="space-y-5">

                  {/* Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                    {/* Bar chart */}
                    <div className="lg:col-span-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-5">
                      <p className="text-sm font-bold text-gray-800 dark:text-slate-100">Students per fee slab</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mb-5">How many students pay each monthly amount</p>
                      <div style={{ height: 250, position: "relative" }}>
                        <Bar data={barData} options={{
                          responsive: true, maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} student${ctx.parsed.y !== 1 ? "s" : ""}` } }
                          },
                          scales: {
                            x: { grid: noAxis, ticks: { ...axisStyle, maxRotation: 38 }, border: noAxis },
                            y: { grid: { color: gridColor }, ticks: { ...axisStyle, stepSize: 1 }, border: noAxis },
                          }
                        }} />
                      </div>
                    </div>

                    {/* Donut */}
                    <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-5">
                      <p className="text-sm font-bold text-gray-800 dark:text-slate-100">Share by slab</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">Proportion of students in each tier</p>
                      <div style={{ height: 190, position: "relative" }}>
                        <Doughnut data={donutData} options={{
                          responsive: true, maintainAspectRatio: false, cutout: "62%",
                          plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed} students (${((ctx.parsed / withFee.length) * 100).toFixed(1)}%)` } }
                          }
                        }} />
                        {/* Centre label */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-xl font-bold text-gray-900 dark:text-white">{withFee.length}</span>
                          <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-slate-500">students</span>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1.5">
                        {donutData.labels.map((lbl, i) => (
                          <div key={lbl} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: PAL[i % PAL.length] }} />
                              <span className="text-gray-600 dark:text-slate-400 truncate">{lbl}</span>
                            </div>
                            <span className="text-gray-400 dark:text-slate-500 ml-2 shrink-0 font-medium">
                              {((donutData.datasets[0].data[i] / withFee.length) * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Slab table */}
                  <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-white/5">
                      <p className="text-sm font-bold text-gray-800 dark:text-slate-100">Detailed slab breakdown</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Click any row to see which students are in that slab</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5">
                          <tr>
                            <th className="py-3 pl-5 w-8" />
                            <th className="py-3 px-3">Fee / month</th>
                            <th className="py-3 px-3">Students</th>
                            <th className="py-3 px-3">% of total</th>
                            <th className="py-3 px-3">Monthly revenue</th>
                            <th className="py-3 pr-5">Distribution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                          {feeSlabs.map((slab, i) => {
                            const pct  = ((slab.count / students.length) * 100)
                            const barW = Math.round((slab.count / Math.max(...feeSlabs.map(g => g.count))) * 100)
                            const open = expandedSlab === slab.fee
                            return (
                              <>
                                <tr key={slab.fee}
                                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                                  onClick={() => setExpandedSlab(open ? null : slab.fee)}>
                                  <td className="py-3 pl-5">
                                    <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="font-bold text-gray-900 dark:text-white">Rs. {fmt(slab.fee)}</span>
                                    <span className="text-gray-400 text-xs ml-1">/mo</span>
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
                                      style={{ background: PAL[i % PAL.length] + "22", color: PAL[i % PAL.length] }}>
                                      {slab.count}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-gray-500 dark:text-slate-400">{pct.toFixed(1)}%</td>
                                  <td className="py-3 px-3 font-medium text-gray-700 dark:text-slate-300">Rs. {fmt(slab.revenue)}</td>
                                  <td className="py-3 pr-5">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-gray-100 dark:bg-white/10 rounded-full h-1.5 min-w-[60px]">
                                        <div className="h-1.5 rounded-full transition-all duration-500"
                                          style={{ width: `${barW}%`, background: PAL[i % PAL.length] }} />
                                      </div>
                                      <span className="text-xs text-gray-400 w-8 text-right">{barW}%</span>
                                    </div>
                                  </td>
                                </tr>
                                {open && (
                                  <tr key={`${slab.fee}-exp`}>
                                    <td colSpan={6} className="bg-gray-50/80 dark:bg-white/[0.015] px-6 pt-2 pb-4">
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">
                                        Students in this slab
                                      </p>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                        {slab.students.map(s => (
                                          <div key={s.studentid}
                                            className="rounded-lg border border-gray-100 dark:border-white/5 bg-white dark:bg-white/5 px-3 py-2 text-xs">
                                            <p className="font-semibold text-gray-800 dark:text-slate-200 truncate">{s.name || "—"}</p>
                                            <p className="text-gray-400 dark:text-slate-500 truncate">{s.class_name}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] font-bold text-gray-800 dark:text-slate-100 text-sm">
                            <td className="py-3 pl-5" />
                            <td className="py-3 px-3">Total</td>
                            <td className="py-3 px-3">{withFee.length}</td>
                            <td className="py-3 px-3">100%</td>
                            <td className="py-3 px-3">Rs. {fmt(totalRev)}</td>
                            <td className="py-3 pr-5" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ════ TAB: BY CLASS ════ */}
              {activeTab === "classes" && (
                <div className="space-y-5">

                  {/* Grouped bar */}
                  <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-5">
                    <p className="text-sm font-bold text-gray-800 dark:text-slate-100">Class-wise comparison</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">Average fee and student count side by side</p>
                    <div className="flex gap-4 mb-4">
                      {[["#3B8BD4", "Avg Fee (Rs.) →"], ["#1D9E75", "← Student count"]].map(([col, lbl]) => (
                        <div key={lbl} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                          <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: col }} />{lbl}
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 280, position: "relative" }}>
                      <Bar data={classBarData} options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          x:  { grid: noAxis, ticks: axisStyle, border: noAxis },
                          yL: { type: "linear", position: "left",  grid: { color: gridColor }, ticks: { ...axisStyle, callback: v => `${(v/1000).toFixed(0)}k` }, border: noAxis },
                          yR: { type: "linear", position: "right", grid: noAxis, ticks: { ...axisStyle, stepSize: 1 }, border: noAxis },
                        }
                      }} />
                    </div>
                  </div>

                  {/* Class cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {classStats.map((cls, ci) => {
                      const slabs = Object.entries(cls.slabs).sort(([a], [b]) => Number(a) - Number(b))
                      const maxC  = Math.max(...slabs.map(([, v]) => v))
                      return (
                        <div key={cls.id} className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] overflow-hidden">
                          {/* Header */}
                          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                                style={{ background: PAL[ci % PAL.length] + "20" }}>
                                <GraduationCap className="w-3.5 h-3.5" style={{ color: PAL[ci % PAL.length] }} />
                              </div>
                              <span className="font-bold text-gray-900 dark:text-white text-sm">{cls.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
                              <span><span className="font-bold text-gray-800 dark:text-slate-200">{cls.count}</span> students</span>
                              <span className="text-gray-200 dark:text-white/20">|</span>
                              <span>Avg <span className="font-bold text-gray-800 dark:text-slate-200">Rs. {fmt(cls.avg)}</span></span>
                            </div>
                          </div>
                          {/* Revenue */}
                          <div className="px-5 py-2 flex items-center gap-2 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5">
                            <DollarSign className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-400 dark:text-slate-500">Monthly revenue:</span>
                            <span className="text-xs font-bold text-gray-700 dark:text-slate-200">Rs. {fmt(cls.revenue)}</span>
                          </div>
                          {/* Slab mini-bars */}
                          <div className="px-5 py-3 space-y-2.5">
                            {slabs.map(([fee, cnt]) => {
                              const si = feeSlabs.findIndex(g => g.fee === Number(fee))
                              const color = PAL[(si >= 0 ? si : ci) % PAL.length]
                              return (
                                <div key={fee} className="flex items-center gap-3 text-xs">
                                  <span className="text-gray-500 dark:text-slate-400 w-20 shrink-0 font-medium">Rs. {fmt(Number(fee))}</span>
                                  <div className="flex-1 bg-gray-100 dark:bg-white/10 rounded-full h-2">
                                    <div className="h-2 rounded-full transition-all"
                                      style={{ width: `${Math.round((cnt / maxC) * 100)}%`, background: color }} />
                                  </div>
                                  <span className="text-gray-400 dark:text-slate-500 w-16 text-right shrink-0">
                                    {cnt} student{cnt !== 1 ? "s" : ""}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* No-fee warning */}
              {noFee.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/10 px-5 py-3 flex items-center gap-3">
                  <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">
                    {noFee.length} student{noFee.length !== 1 ? "s" : ""} have no fee recorded
                  </span>
                  <span className="text-amber-500 dark:text-amber-500/80 text-xs">— excluded from all calculations above.</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
