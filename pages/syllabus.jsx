"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
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
  LayoutList,
  BookOpen,
  Search,
  Hash
} from "lucide-react";

export default function SyllabusTracker() {
  const [records, setRecords] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [weekNum, setWeekNum] = useState("");
  const [description, setDescription] = useState("");

  // Filter state
  const [search, setSearch] = useState("");

  const SUBJECTS_ENUM = {
    group1: ["English", "Urdu", "Maths", "Meri Dilchasp Dunya", "Islamiyat", "Conversation"],
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
    group3: [
      "English",
      "Urdu",
      "Maths",
      "Physics",
      "Chemistry",
      "Biology",
      "Computer",
      "Islamiat",
      "Tarjuma tul Quran",
      "Pak Studies",
    ],
  };

  const orderPG = ["PG", "Nursery", "Prep"];
  const order12 = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
  const order910 = ["Pre-Nine", "Nine", "Ten", "Trial"]; // Added generic order for group 3 based on code inference

  const getGroupName = (className) => {
    if (!className) return null;
    if (orderPG.includes(className)) return "group1";
    if (order12.includes(className)) return "group2";
    // Catch-all for High School if not explicitly in a list, or check specific names
    if (["Nine", "Ten", "Pre-Nine", "Trial"].includes(className)) return "group3";
    return null;
  };

  const getOrderedClasses = (classList) => {
    // Explicit ordering logic
    const g1 = orderPG.map((n) => classList.find((c) => c.name === n)).filter(Boolean);
    const g2 = order12.map((n) => classList.find((c) => c.name === n)).filter(Boolean);
    // Filter remaining for group 3
    const g3 = classList.filter(c => !g1.includes(c) && !g2.includes(c));
    return [...g1, ...g2, ...g3];
  };

  useEffect(() => {
    fetchClassesAndRecords();
  }, []);

  const fetchClassesAndRecords = async () => {
    setLoading(true);
    const access = await getClassAccess();
    if (access.role === "teacher" && !access.classIds?.length) {
      setClasses([]);
      setRecords([]);
      setLoading(false);
      return;
    }
    let classesQuery = supabase.from("classes").select("id, name");
    if (access.role === "teacher") classesQuery = classesQuery.in("id", access.classIds || []);
    const { data: classData, error: classError } = await classesQuery;
    
    // Fetch generic syllabus records
    let recordsQuery = supabase
      .from("syllabus_tracking")
      .select("*")
      .order("created_at", { ascending: false });
    if (access.role === "teacher") {
      if (!access.classIds?.length) {
        setClasses([]);
        setRecords([]);
        setLoading(false);
        return;
      }
      recordsQuery = recordsQuery.in("class_id", access.classIds || []);
    }
    const { data: recordData, error: recError } = await recordsQuery;

    if (!classError && classData) setClasses(getOrderedClasses(classData));
    if (!recError && recordData) setRecords(recordData || []);
    setLoading(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!selectedClass || !selectedSubject || !weekNum || !description.trim()) {
      return alert("Please fill all fields");
    }
    if (!canAccessClass(await getClassAccess(), selectedClass)) {
      return alert("You can only add syllabus records for your assigned classes.");
    }

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return alert("Not logged in");

    const payload = {
      class_id: Number(selectedClass),
      subject: selectedSubject,
      week_or_fortnight: Number(weekNum),
      description: description.trim(),
      teacher_id: user.id,
    };

    startTransition(async () => {
      const { error } = await supabase.from("syllabus_tracking").insert([payload]);
      if (error) {
        alert(error.message);
      } else {
        setSelectedClass("");
        setSelectedSubject("");
        setWeekNum("");
        setDescription("");
        await fetchClassesAndRecords();
      }
    });
  };

  // Helper: Get latest record per class/subject
  const getLatestRecords = (classIds) => {
    const latestMap = {};
    for (const rec of records) {
      if (classIds.includes(rec.class_id)) {
        const key = rec.class_id + "|" + rec.subject;
        // Since we ordered by created_at desc, the first one we see is the latest
        // But the previous logic used date comparison, preserving that:
        if (!latestMap[key] || new Date(rec.created_at) > new Date(latestMap[key].created_at)) {
          latestMap[key] = rec;
        }
      }
    }
    return latestMap;
  };

  // Helper: Color logic with Glow
  function getColorRelativeToAvg(value, avg) {
    if (value === undefined || value === null || avg === undefined)
      return "text-gray-400 dark:text-slate-500";
    if (value >= avg) return "text-green-600 dark:text-green-400 font-bold drop-shadow-[0_0_8px_rgba(74,222,128,0.3)]";
    return "text-red-500 dark:text-red-400 font-bold drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]";
  }

  // Filter Logic
  const filteredClasses = useMemo(() => {
    if (!search.trim()) return classes;
    const q = search.toLowerCase();
    return classes.filter((c) => c.name.toLowerCase().includes(q));
  }, [classes, search]);

  // Grouping Logic
  const group1Ids = useMemo(() => filteredClasses.filter((c) => getGroupName(c.name) === "group1").map(c => c.id), [filteredClasses]);
  const group2Ids = useMemo(() => filteredClasses.filter((c) => getGroupName(c.name) === "group2").map(c => c.id), [filteredClasses]);
  const group3Ids = useMemo(() => filteredClasses.filter((c) => getGroupName(c.name) === "group3").map(c => c.id), [filteredClasses]);

  // UI Constants
  const glassCardClass = "rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl shadow-sm dark:shadow-xl";
  const labelClass = "text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block";
  const inputClass = "w-full bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/20 rounded-md";

  function renderTable(classIds, title, subtitle) {
    const latestMap = getLatestRecords(classIds);
    // Find subjects based on the first class in the list
    const firstClass = classes.find((c) => c.id === classIds[0]);
    const groupName = getGroupName(firstClass?.name);
    const subjects = groupName ? SUBJECTS_ENUM[groupName] : [];

    // Calculate Averages
    const colAvg = {};
    for (const s of subjects) {
      let total = 0;
      let count = 0;
      for (const cid of classIds) {
        const key = `${cid}|${s}`;
        const rec = latestMap[key];
        if (rec?.week_or_fortnight) {
          total += rec.week_or_fortnight;
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
             <p className="text-gray-500 dark:text-slate-400 text-sm">No syllabus data found.</p>
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
                      className="group hover:bg-gray-50 dark:hover:bg-white/10 transition-colors border-none"
                    >
                      <TableCell className="font-medium text-gray-900 dark:text-slate-200 bg-gray-50/50 dark:bg-white/10">
                        {cls?.name ?? "—"}
                      </TableCell>
                      {subjects.map((s) => {
                        const key = `${cid}|${s}`;
                        const rec = latestMap[key];
                        const value = rec?.week_or_fortnight;
                        
                        return (
                          <TableCell key={s} className="text-center text-base">
                            {value !== undefined ? (
                                <div className="flex flex-col items-center justify-center">
                                    <span className={getColorRelativeToAvg(value, colAvg[s])}>
                                        {value}
                                    </span>
                                    {rec.created_at && (
                                        <span className="text-[10px] text-gray-400 mt-1">
                                            {new Date(rec.created_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric'})}
                                        </span>
                                    )}
                                </div>
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
                  <TableCell className="text-gray-900 dark:text-slate-100">Avg Wk</TableCell>
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
            <h1 className="text-3xl font-semibold tracking-tight">Syllabus Tracker</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Monitor weekly/fortnightly progress per class and subject.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-slate-400" />
                <Input 
                    placeholder="Filter classes..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={`${inputClass} pl-9 w-full sm:w-48 bg-white dark:bg-white/5 border-transparent shadow-sm`}
                />
            </div>
            <Button
                variant="outline"
                onClick={() => fetchClassesAndRecords()}
                disabled={loading || isPending}
                className="w-full sm:w-auto rounded-full border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 bg-white dark:bg-white/5 text-gray-700 dark:text-slate-300"
            >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
            </Button>
          </div>
        </div>

        {/* Input Form Card */}
        <div className={glassCardClass}>
            <div className="p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/10">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Plus className="h-4 w-4 text-blue-500" /> Update Syllabus
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
                                (function() {
                                    const clsName = classes.find(c => c.id === Number(selectedClass))?.name;
                                    const gName = getGroupName(clsName);
                                    if(gName && SUBJECTS_ENUM[gName]) {
                                        return SUBJECTS_ENUM[gName].map(s => (
                                            <option key={s} value={s} className="dark:bg-slate-900">{s}</option>
                                        ));
                                    }
                                })()
                            }
                        </select>
                    </div>

                    {/* Week/Fortnight Input */}
                    <div className="md:col-span-2 space-y-1">
                        <label className={labelClass}>
                            <Hash className="w-3 h-3 inline mr-1 mb-0.5" /> Week No.
                        </label>
                        <Input
                            type="number"
                            placeholder="#"
                            value={weekNum}
                            onChange={(e) => setWeekNum(e.target.value)}
                            required
                            className={inputClass}
                        />
                    </div>

                    {/* Description */}
                    <div className="md:col-span-4 space-y-1">
                        <label className={labelClass}>Description</label>
                        <Input
                            type="text"
                            placeholder="Briefly describe topics covered"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                            className={inputClass}
                        />
                    </div>

                    {/* Submit Button */}
                    <div className="md:col-span-2">
                        <Button 
                            type="submit" 
                            disabled={isPending} 
                            className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-blue-500/20 transition-all"
                        >
                            {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Plus className="h-4 w-4 mr-2" />} 
                            Update
                        </Button>
                    </div>
                </form>
            </div>
        </div>

        {/* Data Tables */}
        {loading ? (
           <div className="flex flex-col items-center justify-center py-20">
             <Loader2 className="h-10 w-10 animate-spin text-blue-600 dark:text-blue-400" />
             <p className="text-gray-500 dark:text-slate-400 mt-4 animate-pulse">Fetching syllabus records...</p>
           </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {group1Ids.length > 0 && renderTable(group1Ids, "Junior Section", "Progress for PG, Nursery, and Prep")}
            {group2Ids.length > 0 && renderTable(group2Ids, "Senior Section", "Progress for Classes One to Eight")}
            {group3Ids.length > 0 && renderTable(group3Ids, "High School", "Progress for Pre-Nine, Nine, Ten & Trial")}
          </div>
        )}
      </div>
    </div>
  );
}