// pages/bulk-message.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import Navbar from '../components/Navbar';
import Groq from 'groq-sdk';
import Loader from '../components/Loader';
import { Button } from '../components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../components/ui/select';
import {
  Search,
  Users,
  FileText,
  Send,
  CheckSquare,
  Square,
  ShieldCheck,
  Loader2,
  RefreshCcw,
  Sparkles,
  Bot,
  Clock,
  Calendar,
  X,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// --- CONFIGURATION ---
const groq = new Groq({
  apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY,
  dangerouslyAllowBrowser: true
});

// Pakistan Standard Time is always UTC+5 (no DST)
const PKT_TZ = 'Asia/Karachi';

/**
 * Returns "YYYY-MM-DDTHH:mm" in PKT for use as the datetime-local input value/min.
 * Uses Intl to ask the browser "what time is it right now in Karachi?" — 
 * no manual offset arithmetic, immune to the user's local timezone.
 */
function getPKTNowInputValue(offsetMinutes = 0) {
  const now = new Date(Date.now() + offsetMinutes * 60000);
  // Format each part in PKT using Intl
  const fmt = (unit) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: PKT_TZ, [unit]: '2-digit' }).format(now);
  const year = new Intl.DateTimeFormat('en-CA', { timeZone: PKT_TZ, year: 'numeric' }).format(now);
  const month = fmt('month');
  const day = fmt('day');
  const hour = new Intl.DateTimeFormat('en-CA', { timeZone: PKT_TZ, hour: '2-digit', hour12: false }).format(now);
  const min = fmt('minute');
  return `${year}-${month}-${day}T${hour}:${min}`;
}

/**
 * The datetime-local input gives us "YYYY-MM-DDTHH:mm" which the user sees as PKT.
 * We just append the PKT offset so Postgres/Supabase gets a timezone-aware timestamp
 * and can convert to UTC itself — no manual arithmetic.
 */
function pktInputToISO(localDateTimeStr) {
  // "2025-06-15T14:30" → "2025-06-15T14:30:00+05:00"
  return `${localDateTimeStr}:00+05:00`;
}

/**
 * Display a PKT datetime string (with +05:00) in a human-readable format.
 */
function formatPKTDisplay(isoWithOffset) {
  return new Date(isoWithOffset).toLocaleString('en-PK', {
    timeZone: PKT_TZ,
    hour12: true,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// --- AI PROMPTS ---
const AI_DRAFTER_PROMPT = `
You are the **AI Communications Director** for "DAR-E-ARQAM SCHOOL".
Your goal is to write professional, polite, and clear SMS broadcasts to parents based on the user's rough input.

### CORE INSTRUCTIONS
1. **ENGLISH ONLY**: The final output must be in professional English. If the input is in Urdu or Roman Urdu, translate and refine it to English.
2. **ACTION**: 
   - If the user provides a topic (e.g., "fee reminder"), write a full message from scratch.
   - If the user provides a rough draft, polish and fix grammar.
3. **TONE**: Formal, respectful, and authoritative yet gentle. Use "Respected Parent" as the salutation.
4. **FORMAT**: Add 1-2 emojis (like calendar,school,pencil etc) per message and MUST use ** and _ _ for bold and italic very often

### MANDATORY VARIABLES
You MUST seamlessly integrate these placeholders where they make sense naturally:
- {{name}} (Student Name)
- {{fathername}} (Father's Name) - *Optional, use if flow allows*
- {{id}} (Student ID) - *Good for official notices*
- {{class}} (Class Name)

### FORMATTING RULES
- Do not use "Subject:" lines.
- Keep it under 400 characters if possible (SMS friendly).
- Use spacing for readability.
- Ends with "Regards, 
Administration".
`;

const SCHOOL_POLICY_CONTEXT = `
You are a strict AI Compliance Officer for a School Administration System. 
Your task is to review the message text provided by the user to ensure it adheres to school policy.

STRICT OUTPUT FORMAT:
You must return ONLY a JSON object in this exact format:
{
  "allowed": boolean,
  "reason": "Short explanation if rejected, or 'OK' if allowed"
}

POLICY RULES:
1. Language must be professional, polite, and grammatically correct.
2. No threatening, abusive, or slang language. No bad remarks about the school.
3. Messages must be relevant to school activities (Fees, Exams, Attendance, Holidays, or moral lessons).
4. Teachers are not allowed to share personal contacts (Only school address and 03234447292 allowed).

Do not provide conversational text, only the JSON.
`;

// --- INLINE TOAST / DIALOG SYSTEM ---
function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const icons = {
    success: <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />,
    error: <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />,
    info: <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />,
  };

  const styles = {
    success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-900 dark:text-green-100',
    error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-900 dark:text-red-100',
    info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-900 dark:text-blue-100',
    warning: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-100',
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 max-w-sm w-full border rounded-xl p-4 shadow-lg flex items-start gap-3 animate-slide-up ${styles[toast.type] || styles.info}`}>
      {icons[toast.type] || icons.info}
      <div className="flex-1 text-sm leading-relaxed">{toast.message}</div>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ConfirmDialog({ dialog, onConfirm, onCancel }) {
  if (!dialog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          {dialog.icon || <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-base">{dialog.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{dialog.body}</p>
          </div>
        </div>
        {dialog.detail && (
          <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400 font-mono leading-relaxed max-h-32 overflow-y-auto">
            {dialog.detail}
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            {dialog.cancelLabel || 'Cancel'}
          </Button>
          <Button
            className={`flex-[2] text-white ${dialog.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            onClick={onConfirm}
          >
            {dialog.confirmLabel || 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BulkMessagePage() {
  const router = useRouter();
  const { student: urlStudentId, class: urlClassId } = router.query;

  const [classes, setClasses] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [filterClear, setFilterClear] = useState('all');
  const [students, setStudents] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [query, setQuery] = useState('');

  // --- SCHEDULING STATE ---
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledPKT, setScheduledPKT] = useState(''); // "YYYY-MM-DDTHH:mm" in PKT
  const [scheduleExpanded, setScheduleExpanded] = useState(false);

  // --- UI FEEDBACK ---
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const dialogResolveRef = useRef(null);

  const showToast = (message, type = 'info', duration = 4000) => {
    setToast({ message, type, duration });
  };

  const showDialog = (config) => {
    return new Promise((resolve) => {
      dialogResolveRef.current = resolve;
      setDialog(config);
    });
  };

  const handleDialogConfirm = () => {
    setDialog(null);
    dialogResolveRef.current?.(true);
  };

  const handleDialogCancel = () => {
    setDialog(null);
    dialogResolveRef.current?.(false);
  };

  // Derive scheduled time label for UI
  const scheduleSummary = useMemo(() => {
    if (!scheduleEnabled || !scheduledPKT) return null;
    try {
      return formatPKTDisplay(pktInputToISO(scheduledPKT));
    } catch {
      return null;
    }
  }, [scheduleEnabled, scheduledPKT]);

  // Initialize schedule to now+10min in PKT
  useEffect(() => {
    setScheduledPKT(getPKTNowInputValue(10));
  }, []);

  useEffect(() => {
    if (router.isReady && urlClassId && !urlStudentId) {
      const classIds = Array.isArray(urlClassId) ? urlClassId : [urlClassId];
      setSelectedClasses(classIds.map(String));
    }
  }, [router.isReady, urlClassId, urlStudentId]);

  useEffect(() => {
    supabase
      .from('classes')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('Classes fetch error', error);
        else setClasses(data || []);
      });
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    const fetchStudents = async () => {
      setLoading(true);
      setStudents([]);
      setSelectedIds(new Set());
      setSelectAll(false);

      try {
        if (urlStudentId) {
          const { data, error } = await supabase
            .from('active_students')
            .select('studentid, name, fathername, class_id, mobilenumber, Clear, classes(name)')
            .eq('studentid', urlStudentId)
            .limit(1);

          if (error) throw error;

          if (data && data.length > 0) {
            const formatted = data.map(s => ({ ...s, class: s.classes?.name || '' }));
            setStudents(formatted);
            setSelectedIds(new Set([formatted[0].studentid]));
            setSelectedClasses([String(formatted[0].class_id)]);
          }
        } else if (selectedClasses.length > 0) {
          const { data, error } = await supabase
            .from('active_students')
            .select('studentid, name, fathername, class_id, mobilenumber, Clear, classes(name)')
            .in('class_id', selectedClasses)
            .order('name', { ascending: true });

          if (error) throw error;

          const withClass = (data || []).map(s => ({ ...s, class: s.classes?.name || '' }));
          setStudents(withClass);
        }
      } catch (error) {
        console.error('Error fetching students:', error);
        setStudents([]);
        showToast('Failed to load students. Check your connection.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [selectedClasses, urlStudentId, router.isReady]);

  const filtered = useMemo(() => {
    let result = students;
    if (filterClear === 'true') result = result.filter(s => s.Clear === true);
    else if (filterClear === 'false') result = result.filter(s => s.Clear !== true);

    const q = query.trim().toLowerCase();
    if (!q) return result;

    return result.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.fathername || '').toLowerCase().includes(q) ||
      String(s.studentid).toLowerCase().includes(q) ||
      (s.mobilenumber || '').toLowerCase().includes(q) ||
      (s.class || '').toLowerCase().includes(q)
    );
  }, [students, query, filterClear]);

  const toggleSelect = (studentid) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(studentid)) next.delete(studentid);
      else next.add(studentid);
      setSelectAll(next.size === filtered.length && filtered.length > 0);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(filtered.map(s => s.studentid)));
      setSelectAll(true);
    }
  };

  const invertSelection = () => {
    setSelectedIds(prev => {
      const next = new Set();
      filtered.forEach(s => { if (!prev.has(s.studentid)) next.add(s.studentid); });
      setSelectAll(next.size === filtered.length && filtered.length > 0);
      return next;
    });
  };

  const handleSmartDraft = async () => {
    if (!message.trim()) {
      showToast('Type a topic or rough draft first — e.g. "fee reminder" or "kal chuti hai".', 'warning');
      return;
    }

    setIsDrafting(true);
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: AI_DRAFTER_PROMPT },
          { role: "user", content: `User Input: "${message}"` }
        ],
        model: "openai/gpt-oss-120b",
        temperature: 0.2,
        max_completion_tokens: 600,
      });

      const draftedText = chatCompletion.choices[0]?.message?.content;
      if (draftedText) {
        setMessage(draftedText);
        showToast('Message drafted! Review and adjust before sending.', 'success');
      }
    } catch (error) {
      console.error("Drafting failed:", error);
      showToast('AI service unavailable. Check your connection and try again.', 'error');
    } finally {
      setIsDrafting(false);
    }
  };

  const checkContentPolicy = async (textToCheck) => {
    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: SCHOOL_POLICY_CONTEXT },
          { role: "user", content: `Message Content: "${textToCheck}"` }
        ],
        model: "openai/gpt-oss-120b",
        temperature: 0,
        max_completion_tokens: 2048,
        response_format: { type: 'json_object' },
        stream: false
      });

      const content = chatCompletion.choices[0]?.message?.content;
      return JSON.parse(content || '{}');
    } catch (error) {
      console.error("Policy check failed:", error);
      return { allowed: false, reason: "Error connecting to Policy Server" };
    }
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      showToast('Select at least one student before sending.', 'warning');
      return;
    }
    if (!message.trim()) {
      showToast('Write a message before sending.', 'warning');
      return;
    }

    // Validate schedule time
    if (scheduleEnabled && scheduledPKT) {
      const scheduledUTC = new Date(pktInputToISO(scheduledPKT));
      if (scheduledUTC <= new Date()) {
        showToast('Scheduled time must be in the future (Pakistan time).', 'warning');
        return;
      }
    }

    const selectedArray = Array.from(selectedIds);
    const missingNumberStudents = selectedArray
      .map(id => students.find(s => s.studentid === id))
      .filter(s => !s || !s.mobilenumber);

    if (missingNumberStudents.length > 0) {
      const names = missingNumberStudents
        .map(s => (s ? `${s.name} (ID: ${s.studentid})` : '(unknown)'))
        .join('\n');

      await showDialog({
        title: 'Missing Mobile Numbers',
        body: `${missingNumberStudents.length} selected student(s) have no mobile number on record. Update their profiles before sending.`,
        detail: names,
        icon: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />,
        confirmLabel: 'Got it',
        cancelLabel: 'Close',
      });
      return;
    }

    // Confirm before sending
    const isScheduled = scheduleEnabled && scheduledPKT;
    const confirmed = await showDialog({
      title: isScheduled ? 'Schedule Messages?' : 'Send Messages Now?',
      body: isScheduled
        ? `This will schedule personalized messages for ${selectedIds.size} student(s) to send at ${scheduleSummary} (Pakistan time).`
        : `This will send personalized messages immediately to ${selectedIds.size} student(s). This action cannot be undone.`,
      icon: isScheduled
        ? <Clock className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        : <Send className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />,
      confirmLabel: isScheduled ? `Schedule for ${selectedIds.size} students` : `Send to ${selectedIds.size} students`,
      cancelLabel: 'Go back',
    });

    if (!confirmed) return;

    setSaving(true);

    const policyResult = await checkContentPolicy(message);

    if (!policyResult.allowed) {
      setSaving(false);
      await showDialog({
        title: 'Policy Violation Detected',
        body: `The message did not pass our content policy check and was not sent. Please revise and try again.`,
        detail: `Reason: ${policyResult.reason}`,
        icon: <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />,
        confirmLabel: 'Understood',
        cancelLabel: 'Close',
        destructive: true,
      });
      return;
    }

    const today = new Date().toLocaleDateString();

    // Determine created_at: if scheduled, convert PKT input to UTC ISO; otherwise now
    const createdAt = isScheduled
      ? pktInputToISO(scheduledPKT)
      : new Date().toISOString();

    try {
      const payload = selectedArray.map(studentid => {
        const student = students.find(s => s.studentid === studentid);
        const customizedMessage = message
          .replace(/{{name}}/g, student?.name || '')
          .replace(/{{fathername}}/g, student?.fathername || '')
          .replace(/{{id}}/g, student?.studentid || '')
          .replace(/{{class}}/g, student?.class || '')
          .replace(/{{date}}/g, today);

        return {
          student_id: studentid,
          number: student?.mobilenumber || '',
          sent: false,
          class_id: student?.class_id,
          text: customizedMessage.trim(),
          created_at: createdAt,
          type: "notice"
        };
      });

      const { error } = await supabase.from('messages').insert(payload);

      if (error) {
        console.error('Save error', error);
        showToast('Failed to save messages. Check the console for details.', 'error', 6000);
      } else {
        if (isScheduled) {
          showToast(`Scheduled ${payload.length} message(s) for ${scheduleSummary} (PKT).`, 'success', 6000);
        } else {
          showToast(`Sent personalized messages to ${payload.length} student(s).`, 'success', 5000);
        }

        setMessage('');
        setScheduleEnabled(false);

        if (!urlStudentId) {
          setSelectedIds(new Set());
          setSelectAll(false);
        }
      }
    } catch (err) {
      console.error('Unexpected save error', err);
      showToast('Unexpected error while saving. Check the console.', 'error', 6000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedIds(new Set());
    setSelectAll(false);
    setMessage('');
    setScheduleEnabled(false);
  };

  const isScheduled = scheduleEnabled && scheduledPKT;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />

      {/* Inline Toast */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Confirm Dialog */}
      <ConfirmDialog dialog={dialog} onConfirm={handleDialogConfirm} onCancel={handleDialogCancel} />

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.2s ease-out; }
      `}</style>

      <main className="container mx-auto max-w-7xl p-4 md:p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bulk Messaging</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Select classes, compose a message, and send or schedule broadcasts.
          </p>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl p-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

            {(!urlClassId && !urlStudentId) && (
              <div className="md:col-span-4 flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Select Class(es)</label>
                  {selectedClasses.length > 0 && (
                    <button
                      onClick={() => setSelectedClasses([])}
                      className="text-[10px] text-blue-500 hover:text-blue-600 dark:text-blue-400 transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto p-2 border border-gray-200 dark:border-white/10 rounded-md bg-gray-50 dark:bg-white/5 scrollbar-thin">
                  {classes.map(c => {
                    const isSelected = selectedClasses.includes(String(c.id));
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedClasses(prev =>
                            prev.includes(String(c.id))
                              ? prev.filter(id => id !== String(c.id))
                              : [...prev, String(c.id)]
                          );
                        }}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                          }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                  {classes.length === 0 && <span className="text-xs text-gray-400">Loading classes...</span>}
                </div>
              </div>
            )}

            {!urlStudentId && (
              <>
                <div className={`${urlClassId ? 'md:col-span-4' : 'md:col-span-3'}`}>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 block">Status</label>
                  <Select value={filterClear} onValueChange={setFilterClear}>
                    <SelectTrigger className="w-full bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Students</SelectItem>
                      <SelectItem value="true">Cleared Only</SelectItem>
                      <SelectItem value="false">Not Cleared</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={`${urlClassId ? 'md:col-span-8' : 'md:col-span-5'}`}>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, ID or mobile..."
                      className="w-full pl-9 pr-4 py-2 rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            {(urlClassId || urlStudentId) && (
              <div className="md:col-span-12 flex items-center gap-2 text-sm text-blue-500 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-200 dark:border-blue-800">
                <span className="font-semibold">Mode:</span>
                {urlStudentId
                  ? <span>Direct Student Messaging (ID: {urlStudentId})</span>
                  : <span>Targeted Class Context</span>
                }
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* Left Col: Student List */}
          <div className="md:col-span-7 flex flex-col">
            <div className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden h-[500px] md:h-[600px]">

              <div className="p-4 border-b border-gray-100 dark:border-white/5 flex flex-wrap gap-2 items-center justify-between bg-gray-50/50 dark:bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold text-sm">
                    {loading ? 'Loading...' : `${filtered.length} Students`}
                  </span>
                  {selectedIds.size > 0 && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                      {selectedIds.size} selected
                    </span>
                  )}
                </div>
                {!urlStudentId && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAll}
                      disabled={!students.length}
                      className="h-8 text-xs border-gray-200 dark:border-white/10"
                    >
                      {selectAll ? <CheckSquare className="w-3 h-3 mr-1" /> : <Square className="w-3 h-3 mr-1" />}
                      {selectAll ? 'Unselect All' : 'Select All'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={invertSelection}
                      disabled={!students.length}
                      className="h-8 text-xs border-gray-200 dark:border-white/10"
                    >
                      <RefreshCcw className="w-3 h-3 mr-1" /> Invert
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10">
                {loading && (
                  <div className="flex flex-col items-center justify-center h-40">
                    <Loader />
                  </div>
                )}

                {!loading && filtered.length === 0 && (
                  <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    {selectedClasses.length === 0
                      ? "Select one or more classes above to load students."
                      : "No students match the current filters."}
                  </div>
                )}

                <ul className="divide-y divide-gray-100 dark:divide-white/5">
                  {filtered.map(s => {
                    const checked = selectedIds.has(s.studentid);
                    return (
                      <li
                        key={s.studentid}
                        onClick={() => toggleSelect(s.studentid)}
                        className={`group flex items-center gap-3 p-2.5 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${checked ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 text-transparent'}`}>
                          <CheckSquare className="w-3 h-3" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm font-medium truncate ${checked ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                              {s.name}
                            </span>
                            {s.Clear
                              ? <span className="text-[10px] whitespace-nowrap inline-flex items-center gap-1 bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">
                                <ShieldCheck className="w-3 h-3" /> Clear
                              </span>
                              : <span className="text-[10px] whitespace-nowrap inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
                                Pending
                              </span>
                            }
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            <span className="truncate bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded-sm">{s.class}</span>
                            <span className="truncate">ID: {s.studentid}</span>
                            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0"></span>
                            <span className="truncate">{s.fathername}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>

          {/* Right Col: Message Composer */}
          <div className="md:col-span-5 flex flex-col">
            <div className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl shadow-sm p-5 h-auto min-h-[500px] md:h-[600px] flex flex-col relative overflow-hidden">

              {/* AI Assistant */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-500" /> AI Assistant
                  </h2>
                </div>
                <button
                  onClick={handleSmartDraft}
                  disabled={isDrafting || !message}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg shadow-md transition-all font-medium disabled:opacity-70 disabled:cursor-not-allowed group"
                >
                  {isDrafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                  {isDrafting ? 'Drafting Professional Message...' : 'Generate Professional Message with AI'}
                </button>
                <p className="text-[10px] text-gray-400 text-center mt-2">
                  Type a topic or rough draft below, then click Generate.
                </p>
              </div>

              {/* Message Editor */}
              <div className="flex-1 flex flex-col min-h-0">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4" /> Message Editor
                </label>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={"1. Type your idea here... (e.g., 'Tell parents school is closed tomorrow')\n2. Click the AI button above to draft it."}
                  className="flex-1 w-full p-4 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none font-mono min-h-[160px]"
                />

                {/* Character count hint */}
                <div className="flex items-center justify-between mt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {['{{name}}', '{{fathername}}', '{{id}}', '{{class}}', '{{date}}'].map(v => (
                      <button
                        key={v}
                        onClick={() => setMessage(m => m + v)}
                        className="text-[10px] bg-gray-100 dark:bg-white/10 hover:bg-blue-100 dark:hover:bg-blue-900/30 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                        title={`Insert ${v}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <span className={`text-[10px] flex-shrink-0 ml-2 ${message.length > 400 ? 'text-amber-500' : 'text-gray-400'}`}>
                    {message.length} chars
                  </span>
                </div>
              </div>

              {/* Scheduling Panel */}
              <div className="mt-4 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
                <button
                  onClick={() => setScheduleExpanded(v => !v)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors ${scheduleEnabled
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>
                      {scheduleEnabled && scheduleSummary
                        ? <>Scheduled: <span className="font-semibold">{scheduleSummary}</span> <span className="text-xs opacity-70">(PKT)</span></>
                        : 'Schedule for later'
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {scheduleEnabled && (
                      <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full">Scheduled</span>
                    )}
                    {scheduleExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {scheduleExpanded && (
                  <div className="p-4 space-y-3 bg-white dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <div
                          onClick={() => setScheduleEnabled(v => !v)}
                          className={`w-9 h-5 rounded-full transition-colors relative ${scheduleEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${scheduleEnabled ? 'translate-x-4' : ''}`} />
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {scheduleEnabled ? 'Scheduling enabled' : 'Enable scheduling'}
                        </span>
                      </label>
                    </div>

                    {scheduleEnabled && (
                      <>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Send at (Pakistan Standard Time — UTC+5)
                          </label>
                          <input
                            type="datetime-local"
                            value={scheduledPKT}
                            min={getPKTNowInputValue()}
                            onChange={e => setScheduledPKT(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-slate-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>

                        {scheduleSummary && (
                          <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                            <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                              Messages will be queued with <code className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">created_at</code> set to <strong>{scheduleSummary}</strong> (PKT). Your SMS service picks them up at that time.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
                <Button
                  onClick={handleReset}
                  disabled={saving}
                  variant="ghost"
                  className="flex-1 min-w-[100px]"
                >
                  Reset
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || selectedIds.size === 0 || !message.trim()}
                  className={`flex-[2] min-w-[180px] text-white shadow-lg ${isScheduled
                    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                    }`}
                >
                  {saving
                    ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    : isScheduled
                      ? <Clock className="w-4 h-4 mr-2" />
                      : <Send className="w-4 h-4 mr-2" />
                  }
                  {saving
                    ? 'Verifying & Saving...'
                    : isScheduled
                      ? `Schedule for ${selectedIds.size} student${selectedIds.size !== 1 ? 's' : ''}`
                      : `Send to ${selectedIds.size} student${selectedIds.size !== 1 ? 's' : ''}`
                  }
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
