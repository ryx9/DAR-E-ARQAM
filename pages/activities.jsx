import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link"; // Assuming next/link is used based on context
import { supabase } from "../utils/supabaseClient";
import { canAccessClass, getClassAccess } from "../utils/classAccess";
import Navbar from "../components/Navbar";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "../components/ui/table";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { 
  Loader2, 
  RefreshCw, 
  Plus, 
  Calendar as CalendarIcon, 
  Filter, 
  LayoutList,
  BookOpen
} from "lucide-react";

export default function ActivitiesTracker() {
  const [records, setRecords] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");

  // Date range filter
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Subjects mapping
  const SUBJECTS_ENUM = {
    group1: [
      "English",
      "Urdu",
      "Maths",
      "Meri Dilchasp Dunya",
      "Islamiyat",
      "Conversation",
    ],
    group2: [
      "English",
      "Urdu",
      "Maths",
      "WA/SST/His-Geo",
      "Islamiat",
      "Computer",
      "Science",
      "Tarjuma tul Quran",
    ],
  };

  const orderPG = ["PG", "Nursery", "Prep"];
  const order12 = [
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
  ];

  const getGroupName = (className) => {
    if (!className) return null;
    if (orderPG.includes(className)) return "group1";
    if (order12.includes(className)) return "group2";
    return null;
  };

  const getOrderedClasses = (list) => {
    const g1 = orderPG
      .map((n) => list.find((c) => c.name === n))
      .filter(Boolean);
    const g2 = order12
      .map((n) => list.find((c) => c.name === n))
      .filter(Boolean);
    return [...g1, ...g2];
  };

  // Initial load
  useEffect(() => {
    fetchClasses();
  }, []);

  // Refetch activities when date range changes
  useEffect(() => {
    fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  async function fetchClasses() {
    setLoading(true);
    const access = await getClassAccess();
    if (access.role === "teacher" && !access.classIds?.length) {
      setClasses([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("classes")
      .select("id, name")
      .order("id", { ascending: true });
    if (access.role === "teacher") query = query.in("id", access.classIds || []);
    const { data, error } = await query;
    if (error) {
      console.error(error);
    } else if (data) {
      setClasses(getOrderedClasses(data));
    }
    setLoading(false);
  }

  async function fetchActivities() {
    setLoading(true);
    const access = await getClassAccess();
    if (access.role === "teacher" && !access.classIds?.length) {
      setRecords([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("activities")
      .select("id, class_id, subject, description, date, created_at")
      .order("date", { ascending: false });

    if (access.role === "teacher") query = query.in("class_id", access.classIds || []);
    if (startDate) query = query.gte("date", startDate);
    if (endDate) query = query.lte("date", endDate);

    const { data, error } = await query;
    if (error) console.error(error);
    else setRecords(data || []);
    setLoading(false);
  }

  // Insert a single activity row
  async function handleAdd(e) {
    e.preventDefault();
    if (!selectedClass || !selectedSubject || !description.trim()) {
      alert("Please fill all fields");
      return;
    }
    if (!canAccessClass(await getClassAccess(), selectedClass)) {
      alert("You can only add activities for your assigned classes.");
      return;
    }

    const payload = {
      class_id: Number(selectedClass),
      subject: selectedSubject,
      description: description.trim(),
      date: date || new Date().toISOString().split("T")[0],
    };

    startTransition(async () => {
      const { error } = await supabase.from("activities").insert(payload);
      if (error) {
        alert(error.message);
      } else {
        setSelectedClass("");
        setSelectedSubject("");
        setDescription("");
        setDate("");
        await fetchActivities();
      }
    });
  }

  // Calculate the total count of activities for each class and subject
  const activityCountsByKey = useMemo(() => {
    const counts = {};
    for (const rec of records) {
      const key = `${rec.class_id}|${rec.subject}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [records]);

  const group1Ids = useMemo(
    () => classes.filter((c) => orderPG.includes(c.name)).map((c) => c.id),
    [classes]
  );
  const group2Ids = useMemo(
    () => classes.filter((c) => order12.includes(c.name)).map((c) => c.id),
    [classes]
  );

  function getSubjectsForClassId(classId) {
    const name = classes.find((c) => c.id === classId)?.name;
    const group = getGroupName(name);
    return group ? SUBJECTS_ENUM[group] : [];
  }

  function getColorRelativeToAvg(value, avg) {
    if (value === undefined || value === null || avg === undefined)
      return "text-gray-400 dark:text-slate-500";
    if (value >= avg) return "text-green-600 dark:text-green-400 font-bold drop-shadow-[0_0_8px_rgba(74,222,128,0.3)]";
    return "text-red-500 dark:text-red-400 font-bold drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]";
  }

  // Reusable styling classes
  const glassCardClass = "rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl";
  const labelClass = "text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block";
  const inputClass = "w-full bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/20 rounded-md";

  function renderTable(classIds, title, subtitle) {
    const firstName = classes.find((c) => c.id === classIds[0])?.name;
    const group = getGroupName(firstName);
    const subjects = group ? SUBJECTS_ENUM[group] : [];

    // Column averages
    const colAvg = {};
    for (const s of subjects) {
      let total = 0;
      let count = 0;
      for (const cid of classIds) {
        const key = `${cid}|${s}`;
        const v = activityCountsByKey[key];
        if (typeof v === "number") {
          total += v;
          count++;
        }
      }
      colAvg[s] = count ? total / count : 0;
    }

    return (
      <div className={`${glassCardClass} overflow-hidden`}>
        <div className="p-4 border-b border-gray-200 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
                <h2 className="font-semibold text-lg flex items-center gap-2 text-gray-900 dark:text-slate-100">
                    <LayoutList className="h-5 w-5 text-blue-500" />
                    {title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>
            </div>
        </div>

        {subjects.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-12 text-center">
             <div className="bg-gray-100 dark:bg-white/10 p-4 rounded-full mb-3">
               <BookOpen className="h-8 w-8 text-gray-400 dark:text-slate-500" />
             </div>
             <p className="text-gray-500 dark:text-slate-400 text-sm">No activity entries found.</p>
           </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50 dark:bg-white/5">
                <TableRow className="border-b border-gray-200 dark:border-white/10 hover:bg-transparent">
                  <TableHead className="text-gray-500 dark:text-slate-400 font-semibold uppercase text-xs w-[120px]">Class</TableHead>
                  {subjects.map((s) => (
                    <TableHead key={s} className="text-gray-500 dark:text-slate-400 font-semibold uppercase text-xs text-center min-w-[100px]">
                      {s}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
                {classIds.map((cid) => {
                  const cls = classes.find((c) => c.id === cid);
                  return (
                    <TableRow
                      key={cid}
                      className="group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors border-none"
                    >
                      <TableCell className="font-medium text-gray-900 dark:text-slate-200 bg-gray-50/50 dark:bg-white/[0.02]">
                        {cls?.name ?? "—"}
                      </TableCell>
                      {subjects.map((s) => {
                        const key = `${cid}|${s}`;
                        const value = activityCountsByKey[key];
                        return (
                          <TableCell key={s} className="text-center text-base">
                            {value !== undefined ? (
                              <span className={getColorRelativeToAvg(value, colAvg[s])}>
                                {value}
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-slate-700 text-sm">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {/* Average Row */}
                <TableRow className="bg-gray-100/50 dark:bg-white/5 font-semibold border-t border-gray-200 dark:border-white/10">
                  <TableCell className="text-gray-900 dark:text-slate-100">Avg</TableCell>
                  {subjects.map((s) => (
                    <TableCell key={s} className="text-center text-gray-600 dark:text-slate-300">
                      {colAvg[s] ? colAvg[s].toFixed(1) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <div className="container mx-auto max-w-6xl p-4 md:p-8 space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Activities Tracker</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Monitor daily class performance and subject coverage.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => fetchActivities()}
            disabled={loading || isPending}
            className="w-full sm:w-auto rounded-full border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 bg-white dark:bg-white/5 text-gray-700 dark:text-slate-300"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>

        {/* Input Form Card */}
        <div className={glassCardClass}>
            <div className="p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/10">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Plus className="h-4 w-4 text-blue-500" /> New Activity Entry
                </h3>
            </div>
            <div className="p-5">
                <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    
                    {/* Class Select */}
                    <div className="md:col-span-2 space-y-1">
                        <label className={labelClass}>Class</label>
                        <select
                            className={`${inputClass} h-10 px-3`}
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                            required
                        >
                            <option value="">Select...</option>
                            {classes.map((c) => (
                            <option key={c.id} value={c.id} className="dark:bg-slate-900">
                                {c.name}
                            </option>
                            ))}
                        </select>
                    </div>

                    {/* Subject Select */}
                    <div className="md:col-span-2 space-y-1">
                        <label className={labelClass}>Subject</label>
                        <select
                            className={`${inputClass} h-10 px-3 disabled:opacity-50`}
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            required
                            disabled={!selectedClass}
                        >
                            <option value="">Select...</option>
                            {!!selectedClass &&
                            getSubjectsForClassId(Number(selectedClass)).map((s) => (
                                <option key={s} value={s} className="dark:bg-slate-900">
                                {s}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Description */}
                    <div className="md:col-span-4 space-y-1">
                        <label className={labelClass}>Description</label>
                        <Input
                            type="text"
                            placeholder="What was covered?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                            className={inputClass}
                        />
                    </div>

                    {/* Date */}
                    <div className="md:col-span-2 space-y-1">
                        <label className={labelClass}>Date</label>
                        <div className="relative">
                            <Input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className={`${inputClass} dark:[color-scheme:dark]`}
                            />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="md:col-span-2">
                        <Button 
                            type="submit" 
                            disabled={isPending} 
                            className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-blue-500/20 transition-all"
                        >
                            {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Plus className="h-4 w-4 mr-2" />} 
                            Add
                        </Button>
                    </div>
                </form>
            </div>
        </div>

        {/* Filters Card */}
        <div className={`${glassCardClass} p-5`}>
            <div className="flex flex-col md:flex-row items-end gap-4">
                <div className="w-full md:w-auto space-y-1">
                    <label className={labelClass}>
                        <CalendarIcon className="w-3 h-3 inline mr-1 mb-0.5" /> Start Date
                    </label>
                    <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className={`${inputClass} w-full md:w-48 dark:[color-scheme:dark]`}
                    />
                </div>
                <div className="w-full md:w-auto space-y-1">
                    <label className={labelClass}>
                        <CalendarIcon className="w-3 h-3 inline mr-1 mb-0.5" /> End Date
                    </label>
                    <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className={`${inputClass} w-full md:w-48 dark:[color-scheme:dark]`}
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                     <Button
                        type="button"
                        onClick={() => fetchActivities()}
                        className="flex-1 md:flex-none rounded-md bg-gray-900 text-white hover:bg-black dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white shadow-lg"
                    >
                        <Filter className="mr-2 h-4 w-4" /> Apply Filter
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                        setStartDate("");
                        setEndDate("");
                        }}
                        className="flex-1 md:flex-none hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:text-slate-400"
                    >
                        Clear
                    </Button>
                </div>
            </div>
        </div>

        {/* Data Tables */}
        {loading ? (
           <div className="flex flex-col items-center justify-center py-20">
             <Loader2 className="h-10 w-10 animate-spin text-blue-600 dark:text-blue-400" />
             <p className="text-gray-500 dark:text-slate-400 mt-4 animate-pulse">Fetching records...</p>
           </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {renderTable(group1Ids, "Junior Section", "Performance for PG, Nursery, and Prep")}
            {renderTable(group2Ids, "Senior Section", "Performance for Classes One to Eight")}
          </div>
        )}
      </div>
    </div>
  );
}
