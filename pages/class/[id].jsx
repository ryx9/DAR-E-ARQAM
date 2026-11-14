import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns'
import { 
  Plus, 
  ArrowLeft, 
  Calendar as CalendarIcon, 
  UserPlus, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Search,
  Users,
  Cake,
  MessageCircle, 
  Send,
  AlertCircle, 
  Loader2,
  Flame 
} from 'lucide-react'

import { supabase } from '../../utils/supabaseClient'
import Navbar from '../../components/Navbar'
import Breadcrumbs from '../../components/Breadcrumbs'
import Loader from '../../components/Loader' 
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog'
import { useToast } from "../../hooks/use-toast"

/* ---------------- Reusable Glass Components ---------------- */
const GlassCard = ({ children, className = "" }) => (
  <div className={`rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl shadow-sm dark:shadow-xl overflow-hidden ${className}`}>
    {children}
  </div>
)

export default function ClassPage() {
  const router = useRouter()
  const { id } = router.query
  const { toast } = useToast()

  // State
  const [classData, setClassData] = useState(null)
  const [students, setStudents] = useState([])
  const [attendanceData, setAttendanceData] = useState([])
   
  // Streak State (Lazy Loaded)
  const [absentStreaks, setAbsentStreaks] = useState({}) 
  const [loadingStreaks, setLoadingStreaks] = useState(true)

  // UI State
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [isAddStudentDialogOpen, setIsAddStudentDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Form State
  const [newstudentid, setNewstudentid] = useState('')
  const [newStudentName, setNewStudentName] = useState('')
  const [newfathername, setNewfathername] = useState('')
  const [newDob, setNewDob] = useState('') 

  /* ---------------- Fetch Data ---------------- */
  useEffect(() => {
    if (id) {
      fetchClassData()
      fetchStudents()
    }
  }, [id])

  useEffect(() => {
    if (id && students.length > 0) {
      fetchAttendance()
    }
  }, [id, students, selectedDate])

  useEffect(() => {
    if (id) {
      fetchAbsentStreaks()
    }
  }, [id])

  const fetchClassData = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to fetch class details." })
    } else {
      setClassData(data)
    }
    setIsLoading(false)
  }

  const fetchStudents = async () => {
    const { data, error } = await supabase
      .from('active_students')
      .select('studentid, name, fathername, dob')
      .eq('class_id', id)
      .order('name')

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to load students." })
    } else {
      setStudents(data || [])
    }
  }

  const fetchAttendance = async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('class_id', id)
      .eq('date', format(selectedDate, 'yyyy-MM-dd'))

    if (error) {
      console.error("Attendance fetch error:", error)
    } else {
      setAttendanceData(data || [])
    }
  }

  // ---- LAZY LOAD FUNCTION FOR STREAKS ----
  const fetchAbsentStreaks = async () => {
    setLoadingStreaks(true)
    
    const { data, error } = await supabase
      .from('attendance')
      .select('studentid, status, date')
      .eq('class_id', id)
      .order('date', { ascending: false })
      .range(0, 2999) 

    if (error) {
      console.error("Streak fetch error:", error);
    } 
    
    if (data && data.length > 0) {
      const streakMap = {}

      const groupedByStudent = data.reduce((acc, curr) => {
        const sId = curr.studentid;
        if (!acc[sId]) acc[sId] = [];
        acc[sId].push(curr);
        return acc;
      }, {});

      Object.keys(groupedByStudent).forEach(studentId => {
        const records = groupedByStudent[studentId].sort((a, b) => 
          new Date(b.date) - new Date(a.date)
        );
        
        let streak = 0;
        
        for (let record of records) {
          const status = record.status ? record.status.toLowerCase() : '';
          
          if (status === 'absent') {
            streak++;
          } else if (status === 'present') {
            break;
          }
        }
        streakMap[studentId] = streak;
      });

      setAbsentStreaks(streakMap)
    }
    setLoadingStreaks(false)
  }

  /* ---------------- Actions ---------------- */
  const addStudent = async () => {
    if (!newStudentName || !newstudentid) {
      toast({ variant: "destructive", title: "Missing Info", description: "Name and ID are required." })
      return
    }

    const { data, error } = await supabase
      .from('students')
      .insert([{
        studentid: newstudentid,
        name: newStudentName,
        fathername: newfathername,
        dob: newDob, 
        class_id: id
      }])
      .select()

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message })
    } else {
      setStudents([...students, data[0]].sort((a, b) => a.name.localeCompare(b.name)))
      setNewstudentid('')
      setNewStudentName('')
      setNewfathername('')
      setNewDob('')
      setIsAddStudentDialogOpen(false)
      toast({ variant: "default", title: "Success", description: "Student added successfully." })
    }
  }

  /* ---------------- Render Helpers (UPDATED SORTING) ---------------- */
  const processedStudents = students
    .filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.studentid.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      // Sort by Absent Streak (Highest First)
      const streakA = absentStreaks[a.studentid] || 0;
      const streakB = absentStreaks[b.studentid] || 0;
      
      if (streakB !== streakA) {
        return streakB - streakA;
      }
      
      // Secondary Sort: Alphabetical
      return a.name.localeCompare(b.name);
    });

  /* ---------------- CALENDAR RENDER ---------------- */
  const renderCalendar = () => {
    const start = startOfMonth(selectedDate)
    const end = endOfMonth(selectedDate)
    const days = eachDayOfInterval({ start, end })

    const colStartClasses = [
      'col-start-1', 'col-start-2', 'col-start-3', 'col-start-4', 'col-start-5', 'col-start-6', 'col-start-7',
    ]

    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 uppercase tracking-wider">
            {format(selectedDate, 'MMMM yyyy')}
          </span>
          <CalendarIcon className="w-4 h-4 text-gray-400" />
        </div>
        
        <div 
          className="grid gap-1 mb-2 text-center" 
          style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
        >
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
            <div key={d} className="text-[10px] md:text-xs font-medium text-gray-400 dark:text-slate-500">{d}</div>
          ))}
        </div>
        
        <div 
          className="grid gap-1"
          style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
        >
          {days.map((day, index) => {
             const dayOfWeek = day.getDay();
             const isFirstDay = index === 0;
             const isSelected = isSameDay(day, selectedDate);
             const isToday = isSameDay(day, new Date());

             return (
              <button
                key={day.toString()}
                onClick={() => setSelectedDate(day)}
                className={`
                  h-8 w-full rounded-md flex items-center justify-center text-xs transition-all relative
                  ${isFirstDay ? colStartClasses[dayOfWeek] : ''}
                  ${isSelected 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 font-semibold' 
                    : 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-slate-300'}
                  ${isToday && !isSelected ? 'text-blue-600 dark:text-blue-400 font-bold' : ''}
                `}
              >
                {format(day, 'd')}
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 w-1 h-1 bg-blue-600 rounded-full"></span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (isLoading && !classData) {
    return <Loader fullScreen />
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors pb-20">
      <Navbar />
       
      <div className="container mx-auto max-w-6xl p-4 md:p-8 space-y-6">
       
        {/* Breadcrumbs */}
        <div className="hidden md:block">
          <Breadcrumbs items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: classData?.name || 'Class', href: `/class/${id}` }
          ]} />
        </div>

        {/* Header Section */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div className="space-y-2 w-full">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => router.back()} 
                className="pl-0 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-transparent"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white">
                {classData?.name}
              </h1>
              <p className="text-gray-500 dark:text-slate-400 max-w-2xl">
                {classData?.description || 'Manage students and attendance for this class.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <Link href={`/notice?class=${id}`} className="flex-1 md:flex-none">
                <Button variant="outline" className="w-full md:w-auto rounded-full border-gray-200 dark:border-white/10 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/10">
                  <Send className="mr-2 h-4 w-4" /> Send Notice
                </Button>
              </Link>

              <Link href={`/attendance-record/${id}`} className="flex-1 md:flex-none">
                <Button className="w-full md:w-auto rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow hover:shadow-blue-500/20 transition-all">
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Attendance
                </Button>
              </Link>
              
              <Link href={`/attendance-record/report`} className="flex-1 md:flex-none">
                <Button variant="outline" className="w-full md:w-auto rounded-full border-gray-200 dark:border-white/10 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/10">
                  <FileText className="mr-2 h-4 w-4" /> Report
                </Button>
              </Link>

              <Dialog open={isAddStudentDialogOpen} onOpenChange={setIsAddStudentDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full md:w-auto rounded-full bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-gray-200 shadow-lg">
                    <UserPlus className="mr-2 h-4 w-4" /> Add Student
                  </Button>
                </DialogTrigger>
                
                <DialogContent className="sm:max-w-md rounded-2xl border-gray-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-0 overflow-hidden">
                  <DialogHeader className="px-6 py-4 border-b border-gray-100 dark:border-white/5">
                    <DialogTitle>Add New Student</DialogTitle>
                  </DialogHeader>
                  <div className="p-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-gray-500">Registration ID</label>
                      <Input className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10" placeholder="e.g. ST-2024-001" value={newstudentid} onChange={e => setNewstudentid(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-gray-500">Full Name</label>
                      <Input className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10" placeholder="John Doe" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-gray-500">Father Name</label>
                        <Input className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10" value={newfathername} onChange={e => setNewfathername(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-gray-500">Date of Birth</label>
                        <Input 
                          type="date"
                          className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10" 
                          value={newDob} 
                          onChange={e => setNewDob(e.target.value)} 
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="px-6 py-4 bg-gray-50 dark:bg-white/5 flex gap-2">
                    <Button variant="ghost" onClick={() => setIsAddStudentDialogOpen(false)}>Cancel</Button>
                    <Button onClick={addStudent} className="bg-blue-600 hover:bg-blue-700 text-white">Save Student</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
           
          {/* Left Column: Calendar */}
          <GlassCard className="lg:col-span-1 p-5">
             {renderCalendar()}
             <div className="mt-6 pt-4 border-t border-gray-100 dark:border-white/5">
               <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-500 dark:text-slate-400">Total Students</span>
                 <span className="font-semibold">{students.length}</span>
               </div>
               <div className="flex justify-between items-center text-sm mt-2">
                 <span className="text-gray-500 dark:text-slate-400">Present Today</span>
                 <span className="font-semibold text-green-600">
                    {attendanceData.filter(a => a.status === 'Present').length}
                 </span>
               </div>
             </div>
          </GlassCard>

          {/* Right Column: Today's Attendance Preview */}
          <GlassCard className="lg:col-span-2 flex flex-col h-full min-h-[300px]">
            <div className="p-5 border-b border-gray-100 dark:border-white/5 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-slate-100">Daily Overview</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">{format(selectedDate, 'EEEE, d MMMM yyyy')}</p>
              </div>
              <Link href={`/attendance-record/${id}`}>
                <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-8 text-xs">
                  View Full Log
                </Button>
              </Link>
            </div>
             
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-slate-400 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-3 whitespace-nowrap">Student Name</th>
                    <th className="px-6 py-3 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-6 py-8 text-center text-gray-500">No students found.</td>
                    </tr>
                  ) : (
                    students.slice(0, 5).map(student => {
                      const record = attendanceData.find(a => a.studentid === student.studentid)
                      return (
                        <tr key={student.studentid} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                          <td className="px-6 py-3 font-medium text-gray-900 dark:text-slate-200">
                            {student.name}
                          </td>
                          <td className="px-6 py-3">
                            {record?.status === 'Present' && (
                              <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Present
                              </span>
                            )}
                            {record?.status === 'Absent' && (
                              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-500/20">
                                <XCircle className="w-3 h-3" /> Absent
                              </span>
                            )}
                            {!record?.status && (
                              <span className="text-gray-400 dark:text-slate-600 text-xs italic">Not Marked</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                  {students.length > 5 && (
                     <tr>
                       <td colSpan={2} className="px-6 py-2 text-center text-xs text-gray-400 bg-gray-50/50 dark:bg-white/[0.02]">
                         + {students.length - 5} more students
                       </td>
                     </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>

        {/* Student Management Section */}
        <GlassCard className="overflow-hidden">
          <div className="p-5 border-b border-gray-200 dark:border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              Student Directory
            </h2>
             
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search students..." 
                className="w-full pl-9 pr-4 py-2 text-sm rounded-full bg-gray-100 dark:bg-white/5 border-transparent focus:bg-white dark:focus:bg-black focus:border-blue-500 focus:ring-0 transition-all text-gray-900 dark:text-slate-100 placeholder:text-gray-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-slate-400 uppercase text-xs font-semibold border-b border-gray-200 dark:border-white/10">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Father Name</th>
                  {/* Removed Separate Streak Column */}
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {processedStudents.length === 0 ? (
                   <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                       No students found matching your search.
                     </td>
                   </tr>
                ) : (
                  processedStudents.map(student => {
                    const streakCount = absentStreaks[student.studentid] || 0;
                    
                    return (
                    <tr key={student.studentid} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-xs font-mono text-gray-500 dark:text-slate-500">
                        {student.studentid}
                      </td>
                      
                      {/* Name Column with Inline Badge */}
                      <td className="px-6 py-4">
                         <div className="flex items-center gap-3">
                            <span className="font-medium text-gray-900 dark:text-slate-200">
                                {student.name}
                            </span>
                            
                            {/* Streak Badge (Only shows if > 0) */}
                            {!loadingStreaks && streakCount > 0 && (
                                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide ${
                                    streakCount >= 3 
                                    ? 'bg-red-50 text-red-600 border-red-200 dark:bg-black/5 dark:text-red-400 dark:border-red-900/50' 
                                    : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/50'
                                }`}>
                                    {streakCount >= 3 ? <Flame className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                    {streakCount}d Absent
                                </div>
                            )}
                         </div>
                      </td>

                      <td className="px-6 py-4 text-gray-600 dark:text-slate-400">
                        {student.fathername || '-'}
                      </td>
                      
                      <td className="px-6 py-4 text-right">
                        <Link href={`/notice?student=${student.studentid}`}>
                          <Button 
                            size="sm" 
                            variant="secondary"
                            className="rounded-full text-xs font-medium"
                          >
                            <MessageCircle className="w-3 h-3 mr-1.5" /> Message
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
