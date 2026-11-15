import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../utils/supabaseClient'
import { canAccessClass, getClassAccess } from '../../utils/classAccess'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../../components/ui/select'
import Navbar from '../../components/Navbar'
import { useToast } from '../../hooks/use-toast'
import { ArrowLeft, BookOpen, Calendar, GraduationCap, Layers, Loader2, Save, Type } from 'lucide-react'

interface ClassData {
  id: number
  name: string
}

type TestType = 'Midterm-1' | 'Midterm-2' | 'Terminal-1' | 'Terminal-2' | 'Monthly'

type SubjectName =
  | 'English' | 'Urdu' | 'Waqfiyat-e-Aama' | 'Muashrati Uloom' | 'Islamiyat'
  | 'Mathematics' | 'Science' | 'SVT' | 'Computer' | 'General Knowledge'
  | 'Conversation' | 'Meri Dilchasp Dunya' | 'Chemistry' | 'Physics'
  | 'Biology' | 'Tarjuma-tul-Quran' | 'Nazra' | 'History' | 'Geography'
  | 'Pak Studies' | 'Civics' | 'Arts' | 'Physical Education'

export default function NewTestPage() {
  const router = useRouter()
  const { toast } = useToast()
  
  const [classes, setClasses] = useState<ClassData[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingClasses, setFetchingClasses] = useState(true)
  
  const [form, setForm] = useState<{
    test_name: string
    test_type: TestType | ''
    subject: SubjectName | ''
    class_id: string
    date: string
  }>({
    test_name: '',
    test_type: '',
    subject: '',
    class_id: '',
    date: ''
  })

  useEffect(() => {
    const loadClasses = async () => {
      try {
        const access = await getClassAccess()
        if (access.role === 'teacher' && !access.classIds?.length) {
          setClasses([])
          return
        }
        let query = supabase
          .from('classes')
          .select('id, name')
          .order('name')
        if (access.role === 'teacher') query = query.in('id', access.classIds || [])
        const { data } = await query
        setClasses(data || [])
      } catch (e) {
        console.error(e)
      } finally {
        setFetchingClasses(false)
      }
    }
    loadClasses()
  }, [])

  const handleSubmit = async () => {
    if (!form.test_name || !form.test_type || !form.subject || !form.class_id || !form.date) {
      toast({ variant: 'destructive', title: 'Missing Fields', description: 'Please fill in all the details.' })
      return
    }

    setLoading(true)
    try {
      if (!canAccessClass(await getClassAccess(), form.class_id)) {
        throw new Error('You can only create tests for your assigned classes.')
      }
      const selectedClass = classes.find(c => String(c.id) === form.class_id)

      const { error } = await supabase.from('tests').insert([{
        test_name: form.test_name,
        test_type: form.test_type,
        subject: form.subject,
        class_id: form.class_id,
        class_name: selectedClass?.name || '', 
        date: form.date
      }])

      if (error) throw error

      toast({ variant: 'success', title: 'Success', description: 'Test created successfully.' })
      router.push('/marks')
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message })
    } finally {
      setLoading(false)
    }
  }

  const testTypes: TestType[] = ['Midterm-1', 'Midterm-2', 'Terminal-1', 'Terminal-2', 'Monthly']
  const subjects: SubjectName[] = [
    'English', 'Urdu', 'Waqfiyat-e-Aama', 'Muashrati Uloom', 'Islamiyat',
    'Mathematics', 'Science', 'SVT', 'Computer', 'General Knowledge', 'Conversation',
    'Meri Dilchasp Dunya', 'Chemistry', 'Physics', 'Biology', 'Tarjuma-tul-Quran',
    'Nazra', 'History', 'Geography', 'Pak Studies', 'Civics', 'Arts', 'Physical Education'
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />
      
      <div className="container mx-auto max-w-2xl p-6">
        
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/marks" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Create New Test</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
            Schedule a new test and assign it to a class.
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl p-6 md:p-8">
          <div className="space-y-6">
            
            {/* Test Name */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-2">
                <Type className="w-3 h-3" /> Test Name
              </label>
              <Input
                placeholder="e.g. Science Monthly Test Dec"
                value={form.test_name}
                onChange={e => setForm({ ...form, test_name: e.target.value })}
                className="bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-400 transition-all"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Class Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-2">
                  <GraduationCap className="w-3 h-3" /> Class
                </label>
                <Select onValueChange={v => setForm({ ...form, class_id: v })}>
                  <SelectTrigger className="bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10">
                    <SelectValue placeholder={fetchingClasses ? "Loading..." : "Select Class"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> Date
                </label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  className="bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10 block w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Test Type */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-2">
                  <Layers className="w-3 h-3" /> Test Type
                </label>
                <Select onValueChange={v => setForm({ ...form, test_type: v as TestType })}>
                  <SelectTrigger className="bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {testTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center gap-2">
                  <BookOpen className="w-3 h-3" /> Subject
                </label>
                <Select onValueChange={v => setForm({ ...form, subject: v as SubjectName })}>
                  <SelectTrigger className="bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10">
                    <SelectValue placeholder="Select Subject" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button 
                onClick={handleSubmit} 
                disabled={loading}
                className="w-full md:w-auto md:min-w-[150px] rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-blue-500/25 transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {loading ? 'Creating...' : 'Create Test'}
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
