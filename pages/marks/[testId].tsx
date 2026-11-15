import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../utils/supabaseClient'
import { canAccessClass, getClassAccess } from '../../utils/classAccess'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import Navbar from '../../components/Navbar'
import { useToast } from '../../hooks/use-toast'
import { Loader2, Trash2, X, Save, Calendar } from 'lucide-react'

interface Student {
  studentid: string
  name: string
  fathername: string
  mobilenumber?: string
}
interface Test {
  id: number
  class_id: number
  test_name: string
  date?: string
}
type MarkState = Record<string, { obtained: string; markId?: number }>

export default function MarksEntryPage() {
  const router = useRouter()
  const { testId } = router.query
  const { toast } = useToast()

  const [students, setStudents] = useState<Student[]>([])
  const [marks, setMarks] = useState<MarkState>({})
  const [test, setTest] = useState<Test | null>(null)
  
  // New States for editing test details
  const [testName, setTestName] = useState('')
  const [testDate, setTestDate] = useState('')

  const [totalMarks, setTotalMarks] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendToParents, setSendToParents] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const parsedTotal = useMemo(() => {
    const n = Number(totalMarks)
    return Number.isFinite(n) && n >= 0 ? n : NaN
  }, [totalMarks])

  useEffect(() => {
    if (!testId || Array.isArray(testId)) return
    const loadData = async () => {
      try {
        setLoading(true)

        // Load Test
        const { data: testData, error: testErr } = await supabase
          .from('tests')
          .select('*')
          .eq('id', Number(testId))
          .single()
        if (testErr) throw testErr
        if (!canAccessClass(await getClassAccess(), testData.class_id)) {
          toast({ variant: 'destructive', title: 'Not allowed', description: 'You can only access tests for your assigned classes.' })
          router.replace('/marks')
          return
        }
        
        setTest(testData)
        // Initialize editable states
        setTestName(testData.test_name)
        setTestDate(testData.date || '')

        // Load Students (with mobilenumber)
        const { data: studentData, error: stuErr } = await supabase
          .from('active_students')
          .select('studentid, name, fathername, mobilenumber')
          .eq('class_id', testData.class_id)
          .order('studentid', { ascending: true })
        if (stuErr) throw stuErr

        // Load Marks
        const { data: marksData, error: marksErr } = await supabase
          .from('marks')
          .select('*')
          .eq('test_id', Number(testId))
        if (marksErr) throw marksErr

        // Map marks to state
        const mm: MarkState = {}
        for (const s of studentData || []) {
          const existing = marksData?.find(m => m.studentid === s.studentid)
          mm[s.studentid] = existing
            ? { obtained: String(existing.obtained_marks ?? 0), markId: existing.id }
            : { obtained: '0' }
        }
        setStudents(studentData || [])
        setMarks(mm)

        if (marksData?.length > 0 && marksData[0].total_marks != null) {
          setTotalMarks(String(marksData[0].total_marks))
        }
      } catch (err) {
        console.error(err)
        toast({ variant: 'destructive', title: 'Load failed', description: 'Could not load marks page.' })
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [testId, toast])

  const sanitizeObtained = (val: string) => {
    let n = Number(val)
    if (!Number.isFinite(n)) n = 0
    if (parsedTotal === parsedTotal) {
      if (n < 0) n = 0
      if (n > parsedTotal) n = parsedTotal
    } else if (n < 0) n = 0
    return String(n)
  }

  const saveMarks = async () => {
    if (!testId || Array.isArray(testId) || saving) return

    if (parsedTotal !== parsedTotal) {
      toast({ variant: 'destructive', title: 'Invalid total', description: 'Please enter a valid Total Marks.' })
      return
    }

    if (!testName.trim()) {
      toast({ variant: 'destructive', title: 'Missing Name', description: 'Test Name is required.' })
      return
    }

    setSaving(true)
    try {
      const tid = Number(testId)
      if (!test || !canAccessClass(await getClassAccess(), test.class_id)) {
        throw new Error('You can only update tests for your assigned classes.')
      }

      // 1. Update Test Details (Name & Date) in 'tests' table
      const { error: testUpdateError } = await supabase
        .from('tests')
        .update({ 
          test_name: testName, 
          date: testDate || null 
        })
        .eq('id', tid)

      if (testUpdateError) throw testUpdateError

      // 2. Prepare Marks Payload
      const filteredMarks = Object.entries(marks).filter(([studentid]) => !excluded.has(studentid))
      const normalizedPayload = filteredMarks.map(([studentid, { obtained }]) => ({
        test_id: tid,
        studentid,
        total_marks: parsedTotal,
        obtained_marks: Number(sanitizeObtained(obtained))
      }))

      // Ensure no duplicate marks
      await supabase.rpc('remove_duplicates_for_test', { testid_param: tid })

      const { error: upsertErr } = await supabase
        .from('marks')
        .upsert(normalizedPayload, { onConflict: 'test_id,studentid' })
      if (upsertErr) throw upsertErr

      // 3. Send to parents if enabled
      if (sendToParents) {
        const displayDate = testDate ? new Date(testDate).toLocaleDateString('en-GB') : ''
        const messagesPayload = students
          .filter((s) => !excluded.has(s.studentid))
          .map((s) => {
            const obtained = Number(sanitizeObtained(marks[s.studentid]?.obtained || '0'))
            const percentage = parsedTotal ? ((obtained / parsedTotal) * 100).toFixed(1) : '0'
            return {
              student_id: s.studentid,
              class_id: test?.class_id || null,
              number: s.mobilenumber || null,
              text: `Respected Parents,\n\n${s.name}'s marks in ${testName} held on ${displayDate} are ${obtained}/${parsedTotal} (Percentage: ${percentage}%).\n\nRegards,\nManagement\nDAR-E-ARQAM SCHOOL`,
              created_at: new Date().toISOString(),
              sent: false
            }
          })
        const { error: msgErr } = await supabase.from('messages').insert(messagesPayload)
        if (msgErr) throw msgErr
      }

      toast({ variant: 'success', title: 'Saved', description: 'Test details and marks updated.' })
      
      // Optional: Update local test object to reflect changes
      setTest(prev => prev ? { ...prev, test_name: testName, date: testDate } : null)
      
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: error?.message ?? 'Unknown error' })
    } finally {
      setSaving(false)
    }
  }

  const deleteTest = async () => {
    if (!testId || Array.isArray(testId)) return
    if (!confirm('Delete this test and all associated marks?')) return
    if (!test || !canAccessClass(await getClassAccess(), test.class_id)) {
      toast({ variant: 'destructive', title: 'Not allowed', description: 'You can only delete tests for your assigned classes.' })
      return
    }
    const { error } = await supabase.from('tests').delete().eq('id', Number(testId)).eq('class_id', test.class_id)
    if (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: error.message })
    } else {
      toast({ variant: 'success', title: 'Deleted', description: 'Test removed.' })
      router.push('/marks')
    }
  }

  const toggleExclude = (studentid: string) => {
    setExcluded((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(studentid)) newSet.delete(studentid)
      else newSet.add(studentid)
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-100 to-gray-300 dark:from-slate-900 dark:to-black">
        <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-slate-300" />
      </div>
    )
  }
  if (!test) return <div className="p-6 text-gray-800 dark:text-slate-200">No test found.</div>

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />
      <div className="container mx-auto p-6">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
          <div className="w-full md:w-auto flex-1">
             <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Editing Marks For</div>
             
             {/* EDITABLE TEST NAME AND DATE */}
             <div className="flex flex-col sm:flex-row gap-3">
                <Input 
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="Test Name"
                  className="text-lg font-semibold bg-white/50 dark:bg-white/10 border-transparent hover:border-gray-300 focus:border-gray-500 transition-all w-full sm:w-64"
                />
                <div className="relative">
                  <Input 
                    type="date"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                    className="w-full sm:w-48 bg-white/50 dark:bg-white/10 border-transparent hover:border-gray-300 focus:border-gray-500"
                  />
                </div>
             </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={deleteTest}
              className="rounded-full bg-red-600 hover:bg-red-700 shadow hover:shadow-red-500/20 transition-all"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
            
            {/* Primary Save Button at top as well */}
            <Button
              onClick={saveMarks}
              disabled={saving}
              className="rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow hover:shadow-blue-500/20 transition-all"
            >
               {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
               Save All
            </Button>
          </div>
        </div>

        {/* Total marks card */}
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl">
          <div className="p-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Total Marks (Max Score)</label>
            <Input
              type="number"
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
              placeholder="e.g., 100"
              disabled={saving}
              className="bg-transparent border-gray-300 dark:border-slate-600 focus:border-gray-500 dark:focus:border-slate-300 text-gray-900 dark:text-slate-100 max-w-xs"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] backdrop-blur-xl shadow-sm dark:shadow-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-600 dark:text-slate-300 border-b border-gray-200 dark:border-white/10">
                <th className="p-3 font-medium w-12"></th>
                <th className="p-3 font-medium text-left">Student ID</th>
                <th className="p-3 font-medium text-left">Name</th>
                <th className="p-3 font-medium text-left">Father Name</th>
                <th className="p-3 font-medium text-left w-32">Obtained</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, idx) => {
                const isExcluded = excluded.has(s.studentid)
                return (
                  <tr
                    key={s.studentid}
                    className={`${idx % 2 ? 'bg-gray-50 dark:bg-white/0' : 'bg-gray-100 dark:bg-white/[0.03]'} transition-colors ${
                      isExcluded ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="p-3 text-center">
                      <button
                        onClick={() => toggleExclude(s.studentid)}
                        className={`p-1 rounded-full ${
                          isExcluded
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-red-600 hover:bg-red-700'
                        } text-white transition`}
                        title={isExcluded ? 'Undo Skip' : 'Skip this student'}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </td>
                    <td className="p-3">{s.studentid}</td>
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3 text-gray-500 dark:text-slate-400">{s.fathername}</td>
                    <td className="p-3">
                      <Input
                        type="number"
                        inputMode="numeric"
                        disabled={saving || isExcluded}
                        value={marks[s.studentid]?.obtained ?? '0'}
                        onChange={(e) =>
                          setMarks((prev) => ({
                            ...prev,
                            [s.studentid]: {
                              ...prev[s.studentid],
                              obtained: e.target.value
                            }
                          }))
                        }
                        onBlur={(e) =>
                          setMarks((prev) => ({
                            ...prev,
                            [s.studentid]: {
                              ...prev[s.studentid],
                              obtained: sanitizeObtained(e.target.value)
                            }
                          }))
                        }
                        className="bg-transparent border-gray-300 dark:border-slate-600 focus:border-gray-500 dark:focus:border-slate-300 text-gray-900 dark:text-slate-100"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 p-4 bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendToParents}
              onChange={(e) => setSendToParents(e.target.checked)}
              disabled={saving}
              className="w-4 h-4 accent-green-600 rounded"
            />
            Send marks to parents via SMS
          </label>
          <Button
            onClick={saveMarks}
            disabled={saving}
            className="rounded-full px-8 py-2 font-medium bg-gray-900 text-white hover:bg-black dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition-all shadow-lg"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
