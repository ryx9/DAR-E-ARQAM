"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { messageDate, SCHOOL_NAME } from '../utils/parentMessages';
import { canAccessClass, getClassAccess } from '../utils/classAccess';
import Navbar from '../components/Navbar';
import Groq from 'groq-sdk';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import {
  Loader2,
  BookOpen,
  Calendar,
  Send,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Wand2,
  Sparkles,
  Lock
} from "lucide-react";

// --- AI CONFIGURATION ---
const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;

if (!apiKey) {
  throw new Error("Missing NEXT_PUBLIC_GROQ_API_KEY in .env.local");
}

const groq = new Groq({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true
});

const diaryHeader = (className: string, date: string) =>
  `🏫 *${className}* | 📅 *${messageDate(date)}*`;

// Diary is intentionally more expressive than other parent notices. Do not use
// cleanMessageText here: it removes the WhatsApp-friendly subject emojis.
const cleanDiaryText = (value: string) =>
  String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// WhatsApp style + script lock + strict English correction.
const generateFormatPrompt = (className: string, date: string) => `
You are the final editor for a school WhatsApp class diary. Return ONLY the finished diary, with no explanation, code fence, greeting or signature.

MANDATORY OUTPUT FORMAT:
${diaryHeader(className, date)}

*Subject name:* one relevant emoji
_A concise complete instruction sentence._

Repeat the two-line subject format for every subject. Use a relevant, tasteful emoji for each subject (for example: 📘 Maths, 🔬 Science, 📖 English/Urdu, 🕌 Islamiat, 🎨 Art, 💻 Computer). Keep notices in the same WhatsApp style after the subjects.

STRICT LANGUAGE RULES:
- Preserve Urdu exactly in Urdu script. Never translate Urdu into English, Roman Urdu, or another script. Do not correct Urdu unless an obvious accidental character is present.
- For English, correct every spelling, punctuation, grammar, capitalisation, and fragment. Rewrite shorthand into a complete, parent-ready instruction without changing its meaning or adding facts.
- Expand common school shorthand before writing the sentence: HW/homework = homework, CW/classwork = classwork, rev = revision, ch = chapter, pg/p = page, q = question, ans = answer, ex = exercise, and w/b = workbook. Never leave these abbreviations in the final diary unless they are part of an official book title.
- Example: "test pg 72" must become "_Prepare for the test from the content on page 72._"
- Example: "learn ch 3 q ans" must become "_Learn the questions and answers from Chapter 3._"
- Example: "hw ex 2" must become "_Complete homework exercise 2._" and "rev ch 4" must become "_Revise Chapter 4._"
- Never let shorthand, broken English, bare page references, or spelling mistakes pass through.
- Preserve subjects, tasks, page numbers, deadlines and provided facts. Do not invent homework, dates, marks, books, or deadlines.
- Use WhatsApp markup only: *bold* for labels and _italics_ for instruction/details. Keep it concise and professional.
`;

// 2. POLICY PROMPT (Guardrail)
const POLICY_SYSTEM_PROMPT = `
You are a School Compliance AI. Review the diary entry.
RULES:
1. Content must be educational. No personal contact details other than 03234447292 or school address.
2. No abusive language. Nothing bad about school or staff's personal issues.
3. RETURN JSON ONLY: { "allowed": boolean, "reason": "string" }.
4. Be strict: block an entry with English spelling/grammar mistakes, shorthand, fragments, missing subject labels, or content that does not follow the WhatsApp diary structure. Ignore Urdu grammar and retain Urdu script. Also block empty diaries with no subject information.
`;

interface Class {
  id: number;
  name: string;
}

interface Diary {
  id: number;
  class_id: number;
  diary: string;
  created_at: string;
}

export default function DiaryPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [diary, setDiary] = useState('');
  const [date, setDate] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);

  const [expanded, setExpanded] = useState<number | null>(null);
  const { toast } = useToast();

  // --- DESIGN TOKENS ---
  const glassCardClass = "rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl";
  const labelClass = "text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block";
  const inputClass = "w-full bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/20 rounded-md p-2.5 text-sm transition-all";

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchClasses(), fetchTodayDiaries()]);
    setLoading(false);
  };

  const fetchClasses = async () => {
    const access = await getClassAccess();
    if (access.role === 'teacher' && !access.classIds?.length) {
      setClasses([]);
      return;
    }
    let query = supabase.from('classes').select('id, name').order('name');
    if (access.role === 'teacher') query = query.in('id', access.classIds || []);
    const { data, error } = await query;
    if (error) toast({ variant: 'destructive', title: 'Error', description: 'Failed to fetch classes' });
    else setClasses(data || []);
  };

  const fetchTodayDiaries = async () => {
    const access = await getClassAccess();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let query = supabase
      .from('diary')
      .select('*')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false });
    if (access.role === 'teacher') {
      if (!access.classIds?.length) {
        setDiaries([]);
        return;
      }
      query = query.in('class_id', access.classIds || []);
    }
    const { data, error } = await query;

    if (error) toast({ variant: 'destructive', title: 'Error', description: 'Failed to fetch diaries' });
    else setDiaries(data || []);
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClassId = e.target.value;
    setClassId(newClassId);

    if (newClassId) {
      const selectedClass = classes.find(c => String(c.id) === newClassId);
      if (selectedClass) {
        setDiary(`${diaryHeader(selectedClass.name, date)}\n\n`);
      }
    } else {
      setDiary('');
    }
  };

  const formatDiaryWithAI = async (showToast = false) => {
    if (!classId) return '';
    const selectedClass = classes.find(c => String(c.id) === classId)?.name || "Class";
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: generateFormatPrompt(selectedClass, date) },
          { role: "user", content: diary }
        ],
        // UPDATED MODEL: Using Llama 3.3 (Versatile) for superior instruction following
        model: "openai/gpt-oss-120b",
        temperature: 0,
        top_p: 0.1,
        max_tokens: 1024,
      });

      const formattedText = cleanDiaryText(completion.choices[0]?.message?.content || '');
      if (!formattedText) throw Error('The formatter returned an empty diary.');
      if (showToast) toast({ title: "Formatted", description: "WhatsApp style, emojis and strict language review applied.", className: "bg-purple-600 text-white border-none" });
      return formattedText;
    } catch (error) {
      console.error("AI Error", error);
      throw error;
    }
  };

  const handleSmartFormat = async () => {
    if (!classId) return;
    setIsFormatting(true);
    try {
      setDiary(await formatDiaryWithAI(true));
    } catch {
      toast({ title: "AI Error", description: "The strict formatter is unavailable. Please try again.", variant: "destructive" });
    } finally { setIsFormatting(false); }
  };

  const checkPolicy = async (textToCheck: string) => {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: POLICY_SYSTEM_PROMPT },
          { role: "user", content: textToCheck }
        ],
        model: "openai/gpt-oss-120b", // Updated for better safety check
        temperature: 0,
        response_format: { type: "json_object" }
      });
      const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return result;
    } catch (error) {
      return { allowed: false, reason: "AI Service Unavailable" };
    }
  };

  const addDiary = async () => {
    const cleaned = cleanDiaryText(diary);
    if (!classId || !cleaned || !date) {
      toast({ variant: 'destructive', title: 'Required', description: 'Please fill all fields' });
      return;
    }
    if (!canAccessClass(await getClassAccess(), classId)) {
      toast({ variant: 'destructive', title: 'Not allowed', description: 'You can only add diary entries for your assigned classes.' });
      return;
    }

    const selectedClass = classes.find(c => String(c.id) === classId);

    setSubmitting(true);

    // Every outgoing diary is formatted again, even if the sender skipped the
    // button. This prevents shorthand and English mistakes reaching parents.
    let formattedDiary = '';
    try {
      formattedDiary = await formatDiaryWithAI();
      setDiary(formattedDiary);
    } catch {
      setSubmitting(false);
      toast({ variant: 'destructive', title: 'Formatting unavailable', description: 'The diary was not sent. Please try again when the strict formatter is available.' });
      return;
    }
    if (selectedClass && !formattedDiary.includes(selectedClass.name)) {
      setSubmitting(false);
      toast({ variant: 'destructive', title: 'Format error', description: 'The formatted diary is missing the selected class. Please format it again.' });
      return;
    }
    const policy = await checkPolicy(formattedDiary);
    if (!policy.allowed) {
      setSubmitting(false);
      toast({ variant: 'destructive', title: 'Policy Violation', description: policy.reason });
      return;
    }

    const isoDate = new Date(date).toISOString();
    const diaryText = formattedDiary.endsWith(SCHOOL_NAME) ? formattedDiary : `${formattedDiary}\n\n${SCHOOL_NAME}`;

    // Insert Diary
    const { data: inserted, error } = await supabase
      .from('diary')
      .insert([{ class_id: Number(classId), diary: diaryText, date: isoDate }])
      .select();

    if (error || !inserted?.length) {
      toast({ variant: 'destructive', title: 'Error', description: 'Database save failed' });
      setSubmitting(false);
      return;
    }

    // Queue Messages
    const { data: students, error: recipientsError } = await supabase
      .from('active_students')
      .select('studentid, mobilenumber')
      .eq('class_id', classId);

    try {
      if (recipientsError) throw recipientsError;
      const recipients = (students || []).filter(s => s.mobilenumber?.trim());
      const queuedAt = new Date().toISOString();
      const batch = crypto.randomUUID();
      const messages = recipients.map(s => ({
        student_id: s.studentid,
        class_id: classId,
        number: s.mobilenumber,
        text: diaryText,
        type: 'notice',
        sent: false,
        created_at: isoDate,
        notice_batch_id: batch,
        notice_template: diaryText,
        notice_queued_at: queuedAt,
        notice_scheduled_for: null,
      }));
      if (messages.length) {
        const { error: queueError } = await supabase.from('messages').insert(messages);
        if (queueError) throw queueError;
        toast({ title: 'Diary saved and messages queued' });
      } else {
        toast({ title: 'Diary saved', description: 'No student phone numbers were available.' });
      }
    } catch (queueError) {
      console.error('Unable to queue diary messages:', queueError);
      toast({ variant: 'destructive', title: 'Diary saved, but messages could not be queued' });
    }

    setDiary('');
    setClassId('');
    fetchTodayDiaries();
    setSubmitting(false);
  };

  const diaryMap = new Map<number, Diary>();
  diaries.forEach((d) => {
    if (!diaryMap.has(d.class_id)) diaryMap.set(d.class_id, d);
  });

  const toggleExpand = (id: number) => setExpanded(expanded === id ? null : id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <div className="container mx-auto max-w-6xl p-4 md:p-8 space-y-8">

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Diary Management</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              AI-Assisted Daily Updates & Tracking
            </p>
          </div>

          <Button
            variant="outline"
            onClick={fetchData}
            disabled={loading}
            className="rounded-full border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 bg-white dark:bg-white/5 text-gray-700 dark:text-slate-300"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* LEFT COLUMN: Input Form */}
          <div className="lg:col-span-4 space-y-6">
            <div className={glassCardClass}>
              <div className="p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/10">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-500" /> Compose Entry
                </h3>
              </div>

              <div className="p-5 space-y-4">
                {/* Date Picker */}
                <div>
                  <label className={labelClass}>
                    <Calendar className="w-3 h-3 inline mr-1 mb-0.5" /> Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (classId) {
                        const cls = classes.find(c => String(c.id) === classId)?.name;
                        if (cls) setDiary(`${diaryHeader(cls, e.target.value)}\n\n` + diary.split('\n\n').slice(1).join('\n\n'));
                      }
                    }}
                    className={inputClass}
                  />
                </div>

                {/* Class Selector */}
                <div>
                  <label className={labelClass}>Class</label>
                  <select
                    value={classId}
                    onChange={handleClassChange}
                    className={inputClass}
                  >
                    <option value="">Select a class to start...</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id} className="dark:bg-slate-900">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Text Area & AI Button */}
                <div>
                  <label className={labelClass}>
                    <BookOpen className="w-3 h-3 inline mr-1 mb-0.5" /> Message
                  </label>

                  <button
                    onClick={handleSmartFormat}
                    disabled={isFormatting || !classId}
                    className={`
                        w-full mb-2 flex items-center justify-center gap-2 p-2 rounded-md font-medium text-xs transition-all border
                        ${!classId
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border-transparent shadow-md'
                      }
                     `}
                  >
                    {isFormatting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {isFormatting ? 'AI Formatting (Llama 3.3)...' : 'AI Format'}
                  </button>

                  <div className="relative">
                    <textarea
                      value={diary}
                      onChange={(e) => setDiary(e.target.value)}
                      disabled={!classId}
                      placeholder={!classId ? "⚠️ Select a class above to enable typing..." : "Type details here (Eng or Urdu)..."}
                      className={`${inputClass} min-h-[160px] resize-y font-mono text-sm leading-relaxed ${!classId ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-900' : ''}`}
                    />
                    {!classId && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Lock className="w-6 h-6 text-gray-400 opacity-20" />
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-gray-400 mt-1.5 flex justify-between">
                    <span>* Scripts preserved (Eng stays Eng, Urdu stays Urdu).</span>
                  </p>
                </div>

                <Button
                  onClick={addDiary}
                  disabled={submitting || !classId}
                  className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-blue-500/20 transition-all h-10"
                >
                  {submitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  {submitting ? 'Verifying Policy...' : 'Send to Students'}
                </Button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Status Grid */}
          <div className="lg:col-span-8">
            <div className={`${glassCardClass} h-full flex flex-col`}>
              <div className="p-4 border-b border-gray-200 dark:border-white/10 flex justify-between items-center">
                <h3 className="font-semibold text-sm">Today's Status</h3>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {diaries.length} / {classes.length} Sent
                </span>
              </div>

              <div className="p-5">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                    <p className="text-gray-500 dark:text-slate-400 mt-2 text-sm">Loading status...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {classes.map((c) => {
                      const entry = diaryMap.get(c.id);
                      const isExpanded = expanded === c.id;

                      return (
                        <div
                          key={c.id}
                          onClick={() => entry && toggleExpand(c.id)}
                          className={`
                                 relative p-4 rounded-lg border transition-all duration-200
                                 ${entry
                              ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800 cursor-pointer hover:border-green-300 dark:hover:border-green-700'
                              : 'bg-gray-50/50 dark:bg-white/5 border-gray-200 dark:border-white/10 opacity-80'
                            }
                               `}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium text-sm text-gray-900 dark:text-slate-100 flex items-center gap-2">
                                {c.name}
                                {entry && <span className="text-[10px] bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200 px-1.5 py-0.5 rounded-full">Sent</span>}
                              </h4>
                            </div>
                            {entry ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-gray-300 dark:text-slate-600" />
                            )}
                          </div>

                          {entry && (
                            <div className={`mt-3 pt-3 border-t border-green-200 dark:border-green-800/30 text-sm text-gray-600 dark:text-slate-300 font-mono whitespace-pre-wrap ${!isExpanded && 'line-clamp-2'}`}>
                              {entry.diary}
                            </div>
                          )}

                          {entry && entry.diary.length > 60 && (
                            <div className="flex justify-center mt-2">
                              {isExpanded ? <ChevronUp className="h-3 w-3 text-green-500" /> : <ChevronDown className="h-3 w-3 text-green-500" />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
