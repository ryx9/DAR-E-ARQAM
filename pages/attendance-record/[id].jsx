import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  getYear, 
  getMonth, 
  isSameDay, 
  getDay 
} from 'date-fns';
import { 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Calendar as CalendarIcon,
  Save,
  MessageSquare,
  Users,
  CheckCheck
} from 'lucide-react';

import { supabase } from '../../utils/supabaseClient';
import Navbar from '../../components/Navbar';
import Breadcrumbs from '../../components/Breadcrumbs';
import Loader from '../../components/Loader';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useToast } from '../../hooks/use-toast';

/* ---------------- Reusable Glass Components ---------------- */
const GlassCard = ({ children, className = "" }) => (
  <div className={`rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl shadow-sm dark:shadow-xl overflow-hidden ${className}`}>
    {children}
  </div>
);

export default function AttendanceRecordPage() {
  const router = useRouter();
  const { id } = router.query;
  const { toast } = useToast();

  // State
  const [classData, setClassData] = useState(null);
  const [students, setStudents] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
    
  // UI State
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendAbsenteeMessages, setSendAbsenteeMessages] = useState(true);

  // Date constants
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  const years = Array.from({ length: currentYear - startYear + 1 }, (_, i) => startYear + i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  /* ---------------- Data Fetching ---------------- */
  useEffect(() => {
    if (id) {
      fetchClassData();
      fetchStudents();
    }
  }, [id]);

  useEffect(() => {
    if (id && students.length > 0) {
      fetchAttendance();
    }
  }, [id, students, selectedDate]);

  const fetchClassData = async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('name, description')
      .eq('id', id)
      .single();
    if (data) setClassData(data);
  };

  const fetchStudents = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('active_students')
      .select('studentid, name, fathername, mobilenumber')
      .eq('class_id', id)
      .order('name');
    if (data) setStudents(data);
  };

  const fetchAttendance = async () => {
    setIsLoading(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('attendance')
      .select('studentid, date, status, students(name, fathername, mobilenumber)')
      .eq('class_id', id)
      .eq('date', dateStr);

    if (data && data.length > 0) {
      const mapped = data.map((row) => ({
        studentid: row.studentid,
        date: row.date,
        status: row.status,
        student: {
          studentid: row.studentid,
          name: row.students?.name || '',
          fathername: row.students?.fathername || '',
          mobilenumber: row.students?.mobilenumber || ''
        }
      }));
      
      // Merge with student list to ensure all students are present even if not in attendance table yet
      const mergedData = students.map(student => {
        const existingRecord = mapped.find((r) => r.studentid === student.studentid);
        return existingRecord || {
          studentid: student.studentid,
          date: dateStr,
          status: 'Unmarked',
          student: student
        };
      });
      
      setAttendanceData(mergedData);
    } else {
      // No records found, initialize all as Unmarked
      setAttendanceData(
        students.map(s => ({
          studentid: s.studentid,
          date: dateStr,
          status: 'Unmarked',
          student: s
        }))
      );
    }
    setIsLoading(false);
  };

  /* ---------------- Logic ---------------- */
  const markAllPresent = () => {
    setAttendanceData(prev => prev.map(a => ({ ...a, status: 'Present' })));
    toast({ title: "Marked All Present", description: "Remember to save changes." });
  };

  const toggleStatus = (studentid) => {
    setAttendanceData(prev =>
      prev.map(a => {
        if (a.studentid !== studentid) return a;
        
        // Cycle: Unmarked -> Present -> Absent -> Present
        let newStatus = 'Present';
        if (a.status === 'Present') newStatus = 'Absent';
        if (a.status === 'Absent') newStatus = 'Present';
        
        return { ...a, status: newStatus };
      })
    );
  };

  const saveAttendance = async () => {
    const hasUnmarked = attendanceData.some(a => a.status === 'Unmarked');
    if (hasUnmarked) {
      toast({ 
        variant: 'destructive', 
        title: 'Incomplete Attendance', 
        description: 'Please mark all students as Present or Absent before saving.' 
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // 1. Delete existing records for this day/class to prevent duplicates
      const { error: delErr } = await supabase
        .from('attendance')
        .delete()
        .eq('class_id', id)
        .eq('date', dateStr);
      if (delErr) throw delErr;

      // 2. Insert new records
      const { error: attErr } = await supabase
        .from('attendance')
        .insert(
          attendanceData.map(a => ({
            studentid: a.studentid,
            class_id: id,
            date: a.date,
            status: a.status
          }))
        );
      if (attErr) throw attErr;

      // 3. Send SMS if enabled
      if (sendAbsenteeMessages) {
        const absentMessages = attendanceData
          .filter(a => a.status === 'Absent' && a.student.mobilenumber)
          .map(a => ({
            student_id: a.studentid,
            class_id: id,
            number: a.student.mobilenumber,
            text: `*Mr./Mrs. ${a.student.fathername}*,\n\nKindly be informed that your child *${a.student.name}* is absent on *${format(selectedDate, 'dd-MM-yyyy')}*. \n*Best Regards,*\nManagement\nDAR-E-ARQAM SCHOOL`
          }));

        if (absentMessages.length > 0) {
          const { error: msgErr } = await supabase
            .from('messages')
            .insert(absentMessages);
          if (msgErr) throw msgErr;
        }
      }

      toast({ variant: 'default', title: 'Success', description: 'Attendance saved successfully.' });
    } catch (error) {
      console.error('Error saving:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------------- UI Render Helpers ---------------- */
  const renderCalendar = () => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    const days = eachDayOfInterval({ start, end });
    const startDayIndex = getDay(start); 

    return (
      <div className="w-full">
        <div className="flex items-center gap-2 mb-4">
          <CalendarIcon className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            Select Date
          </span>
        </div>
        
        {/* Month/Year Selectors */}
        <div className="flex gap-2 mb-4">
          <Select
            value={getMonth(selectedDate).toString()}
            onValueChange={value => setSelectedDate(new Date(getYear(selectedDate), parseInt(value), 1))}
          >
            <SelectTrigger className="w-full bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month, index) => <SelectItem key={month} value={index.toString()}>{month}</SelectItem>)}
            </SelectContent>
          </Select>
          
          <Select
            value={getYear(selectedDate).toString()}
            onValueChange={value => setSelectedDate(new Date(parseInt(value), getMonth(selectedDate), 1))}
          >
            <SelectTrigger className="w-1/3 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => <SelectItem key={year} value={year.toString()}>{year}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Calendar Header - FIXED: Using Inline Styles */}
        <div 
          className="grid gap-1 mb-2 text-center" 
          style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
        >
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
            <div key={day} className="text-center text-xs font-medium text-gray-400">{day}</div>
          ))}
        </div>

        {/* Calendar Body - FIXED: Using Inline Styles */}
        <div 
          className="grid gap-1" 
          style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
        >
          {Array.from({ length: startDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {days.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            return (
              <button
                key={day.toString()}
                onClick={() => setSelectedDate(day)}
                className={`
                  aspect-square rounded-lg flex items-center justify-center text-sm transition-all relative
                  ${isSelected 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 font-bold' 
                    : 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-slate-300'}
                  ${isToday && !isSelected ? 'text-blue-600 font-bold border border-blue-200 dark:border-blue-800' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (isLoading && !classData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0b1220]">
        <div className="flex flex-col items-center">
          <Loader />
          <p className="text-gray-500 text-sm">Loading Attendance Register...</p>
        </div>
      </div>
    );
  }

  const presentCount = attendanceData.filter(a => a.status === 'Present').length;
  const absentCount = attendanceData.filter(a => a.status === 'Absent').length;
  const unmarkedCount = attendanceData.filter(a => a.status === 'Unmarked').length;

  return (
    // Cleaned up padding since footer is static
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />
      
      <div className="container mx-auto max-w-6xl p-4 md:p-8 space-y-6">
        
        {/* Breadcrumbs (Desktop) */}
        <div className="hidden md:block">
          <Breadcrumbs
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: classData?.name || 'Class', href: `/class/${id}` },
              { label: 'Attendance', href: `/attendance-record/${id}` },
            ]}
          />
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="space-y-2 w-full">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => router.back()} 
              className="pl-0 text-gray-500 hover:text-gray-900 dark:text-slate-400 hover:bg-transparent"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Class
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-3">
              <CheckCheck className="h-8 w-8 text-blue-600" />
              Attendance Register
            </h1>
            <p className="text-gray-500 dark:text-slate-400">
              {classData?.name} • {format(selectedDate, 'EEEE, dd MMMM yyyy')}
            </p>
          </div>

          <div className="w-full md:w-auto">
             <Button 
               onClick={markAllPresent} 
               variant="outline"
               className="w-full md:w-auto rounded-full border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
             >
               <CheckCircle2 className="w-4 h-4 mr-2" /> Mark All Present
             </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left: Calendar & Stats */}
          <div className="space-y-6 lg:col-span-1">
            <GlassCard className="p-5">
              {renderCalendar()}
            </GlassCard>

            <GlassCard className="p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-500" /> Summary
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-500/20 border border-green-100 dark:border-green-500/20">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{presentCount}</div>
                  <div className="text-xs text-green-700 dark:text-green-300">Present</div>
                </div>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{absentCount}</div>
                  <div className="text-xs text-red-700 dark:text-red-300">Absent</div>
                </div>
                <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{unmarkedCount}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Unmarked</div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Right: Student List */}
          <div className="lg:col-span-2 space-y-6">
            <GlassCard className="min-h-[500px] flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 flex justify-between items-center">
                <span className="font-semibold text-sm uppercase tracking-wider text-gray-500">
                  Student List ({students.length})
                </span>
                {unmarkedCount > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium animate-pulse flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" /> {unmarkedCount} Remaining
                  </span>
                )}
              </div>

              <div className="divide-y divide-gray-100 dark:divide-white/5">
                {attendanceData.map((record) => (
                  <div 
                    key={record.studentid} 
                    className={`
                      flex items-center justify-between p-4 transition-colors
                      ${record.status === 'Unmarked' ? 'bg-amber-50/30 dark:bg-amber-900/10' : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'}
                    `}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-gray-900 dark:text-slate-100 text-base md:text-lg">
                        {record.student.name}
                      </span>
                      <span className="text-xs md:text-sm text-gray-500 dark:text-slate-400 flex items-center gap-1">
                        <span className="opacity-70">Father:</span> {record.student.fathername || '-'}
                      </span>
                    </div>

                    <button
                      onClick={() => toggleStatus(record.studentid)}
                      className={`
                        relative px-4 py-2 rounded-full font-semibold text-sm md:text-base flex items-center gap-2 transition-all duration-200 active:scale-95 shadow-sm
                        ${record.status === 'Present' 
                          ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30' 
                          : record.status === 'Absent'
                            ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30'
                            : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200 dark:bg-white/10 dark:text-slate-400 dark:border-white/10'
                        }
                      `}
                    >
                      {record.status === 'Present' && <CheckCircle2 className="w-5 h-5" />}
                      {record.status === 'Absent' && <XCircle className="w-5 h-5" />}
                      {record.status === 'Unmarked' && <HelpCircle className="w-5 h-5" />}
                      
                      <span className="min-w-[60px] text-center">
                        {record.status === 'Unmarked' ? 'Mark' : record.status}
                      </span>
                    </button>
                  </div>
                ))}

                {attendanceData.length === 0 && !isLoading && (
                  <div className="p-8 text-center text-gray-500">
                    No students found in this class.
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </div>

      {/* STATIC FOOTER (Not Fixed, Highly Transparent, Vibrant Buttons) */}
      <div className="w-full mt-12 py-6 border-t border-white/20 dark:border-white/5 bg-white/30 dark:bg-black/30 backdrop-blur-xl">
        <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4 px-4">
          
          <div className="flex items-center gap-3 bg-white/40 dark:bg-white/5 px-4 py-2 rounded-full border border-white/30 dark:border-white/10 w-full md:w-auto justify-center md:justify-start backdrop-blur-sm">
            <div className={`p-1.5 rounded-full shadow-lg ${sendAbsenteeMessages ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sendMessages"
                checked={sendAbsenteeMessages}
                onChange={(e) => setSendAbsenteeMessages(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="sendMessages" className="text-sm font-bold text-gray-700 dark:text-slate-200 cursor-pointer select-none">
                Notify Parents via SMS
              </label>
            </div>
          </div>

          <Button 
            onClick={saveAttendance} 
            disabled={isSubmitting}
            className="w-full md:w-auto rounded-full px-10 py-6 text-lg font-bold text-black dark:text-white shadow-xl shadow-blue-500/20 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:via-indigo-700 hover:to-violet-700 transition-all active:scale-[0.98] border border-white/20"
          >
            {isSubmitting ? (
              <><Loader small className="mr-2" /> Saving...</>
            ) : (
              <><Save className="mr-2 h-5 w-5" /> Save Attendance</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
