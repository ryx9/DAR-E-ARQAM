/**
 * reportingEngine.js
 * Pure calculation functions for the Academic Reporting System.
 * All inputs are raw data from Supabase; all outputs are normalized metrics.
 *
 * IMPORTANT RULES:
 * - Always normalize to percentages before comparing across assessments.
 * - Never treat missing marks as zero — treat them as absent/excluded.
 * - Pass threshold: 33%
 * - Grade scale: A+(≥90), A(≥80), B(≥70), C(≥60), D(≥50), E(≥33), F(<33)
 */

// ─────────────────────────────────────────────
// Grade helpers
// ─────────────────────────────────────────────

export const GRADE_SCALE = [
  { label: 'A+', min: 90, color: '#16a34a', bg: '#dcfce7' },
  { label: 'A', min: 80, color: '#2563eb', bg: '#dbeafe' },
  { label: 'B', min: 70, color: '#d97706', bg: '#fef3c7' },
  { label: 'C', min: 60, color: '#ea580c', bg: '#ffedd5' },
  { label: 'D', min: 50, color: '#dc2626', bg: '#fee2e2' },
  { label: 'E', min: 33, color: '#9333ea', bg: '#f3e8ff' },
  { label: 'F', min: 0, color: '#1f2937', bg: '#f9fafb' },
];

export function gradeFromPercent(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return 'N/A';
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  if (pct >= 33) return 'E';
  return 'F';
}

export const getGrade = gradeFromPercent;

export function gradeColor(grade) {
  const g = GRADE_SCALE.find(g => g.label === grade);
  return g ? g.color : '#1f2937';
}

export function gradeBg(grade) {
  const g = GRADE_SCALE.find(g => g.label === grade);
  return g ? g.bg : '#f9fafb';
}

export const PASS_THRESHOLD = 33;

// ─────────────────────────────────────────────
// Statistical primitives
// ─────────────────────────────────────────────

/** Returns null if array is empty */
export function mean(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Returns null if array is empty */
export function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Population standard deviation */
export function stdDev(values) {
  if (!values || values.length < 2) return null;
  const avg = mean(values);
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function minOf(values) {
  if (!values || values.length === 0) return null;
  return Math.min(...values);
}

export function maxOf(values) {
  if (!values || values.length === 0) return null;
  return Math.max(...values);
}

// ─────────────────────────────────────────────
// Data transformation helpers
// ─────────────────────────────────────────────

/**
 * Normalizes a raw marks row into a flat record.
 */
export function flattenMark(m) {
  const test = m.tests || {};
  const total = test.total_marks || m.total_marks || 0;
  const obtained = m.marks_obtained !== undefined ? m.marks_obtained : m.obtained_marks;
  const pct = total > 0 ? (obtained / total) * 100 : null;
  const subjectName =
    test.subjects?.subject_name || test.subject || test.test_name || '';

  return {
    studentid: m.student_id || m.studentid,
    obtained,
    total,
    pct,
    grade: pct !== null ? gradeFromPercent(pct) : null,
    passed: pct !== null ? pct >= PASS_THRESHOLD : null,
    testId: test.id || m.test_id,
    testName: test.test_name || '',
    subject: subjectName,
    testType: test.test_type || '',
    date: test.test_date || test.date || '',
    classId: test.class_id,
    className: test.class_name || '',
  };
}

// ─────────────────────────────────────────────
// Student-level metrics
// ─────────────────────────────────────────────

/**
 * Build a student performance profile.
 * Supports both signatures:
 * Signature A: (studentId, studentInfo, flatMarks, attendanceInfo)
 * Signature B: (studentId, marks, tests, students, attendanceInfo)
 */
export function buildStudentProfile(studentId, arg2, arg3, arg4, arg5) {
  let studentInfo = {};
  let studentMarks = [];
  let testsMap = {};
  let attendanceInfo = null;

  // Detect signature
  if (Array.isArray(arg2)) {
    // Signature B: (studentId, marks, tests, students, attendanceInfo)
    const marks = arg2 || [];
    const tests = arg3 || [];
    const students = arg4 || [];
    attendanceInfo = arg5 || null;

    tests.forEach(t => {
      testsMap[t.id] = t;
    });

    const foundStudent = students.find(
      s => String(s.id) === String(studentId) || String(s.studentid) === String(studentId)
    );
    if (foundStudent) {
      studentInfo = foundStudent;
    }

    const rawStudentMarks = marks.filter(
      m => String(m.student_id || m.studentid) === String(studentId)
    );

    studentMarks = rawStudentMarks.map(m => {
      const test = testsMap[m.test_id] || m.tests || {};
      const total = m.total_marks || test.total_marks || 0;
      const obtained = m.obtained_marks !== undefined ? m.obtained_marks : m.marks_obtained;
      const pct = total > 0 && obtained !== null && obtained !== undefined ? (obtained / total) * 100 : null;
      const subjectName =
        test.subject || test.test_name || test.subjects?.subject_name || 'Subject';

      return {
        studentid: studentId,
        obtained: obtained ?? 0,
        total: total ?? 0,
        pct,
        grade: pct !== null ? gradeFromPercent(pct) : null,
        passed: pct !== null ? pct >= PASS_THRESHOLD : null,
        testId: test.id || m.test_id,
        testDate: test.date || test.test_date || '',
        testName: test.test_name || '',
        subject: subjectName,
        subjectName,
        marksObtained: obtained ?? 0,
        totalMarks: total ?? 0,
        percentage: pct !== null ? Number(pct.toFixed(1)) : 0,
        isPassed: pct !== null ? pct >= PASS_THRESHOLD : false,
      };
    });
  } else {
    // Signature A: (studentId, studentInfo, flatMarks, attendanceInfo)
    studentInfo = arg2 || {};
    const flatMarks = arg3 || [];
    attendanceInfo = arg4 || null;

    studentMarks = flatMarks
      .filter(m => String(m.studentid) === String(studentId))
      .map(m => ({
        ...m,
        subjectName: m.subject,
        testDate: m.date,
        marksObtained: m.obtained,
        totalMarks: m.total,
        percentage: m.pct !== null ? Number(m.pct.toFixed(1)) : 0,
        isPassed: m.passed,
      }));
  }

  // Aggregate per subject
  const subjectMap = {};
  for (const m of studentMarks) {
    const key = m.subjectName || m.subject || 'General';
    if (!subjectMap[key]) subjectMap[key] = { obtained: 0, total: 0, tests: [] };
    subjectMap[key].obtained += m.marksObtained ?? m.obtained ?? 0;
    subjectMap[key].total += m.totalMarks ?? m.total ?? 0;
    subjectMap[key].tests.push(m);
  }

  const subjects = Object.entries(subjectMap)
    .map(([subject, data]) => {
      const pct = data.total > 0 ? (data.obtained / data.total) * 100 : null;
      return {
        subject,
        obtained: data.obtained,
        total: data.total,
        pct,
        grade: pct !== null ? gradeFromPercent(pct) : null,
        passed: pct !== null ? pct >= PASS_THRESHOLD : null,
        testCount: data.tests.length,
        tests: data.tests,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const totalObtained = subjects.reduce((s, sub) => s + sub.obtained, 0);
  const totalMax = subjects.reduce((s, sub) => s + sub.total, 0);
  const overallPct = totalMax > 0 ? (totalObtained / totalMax) * 100 : null;
  const passedAssessmentsCount = studentMarks.filter(m => m.isPassed).length;

  return {
    studentid: studentId,
    name: studentInfo?.name || '',
    fathername: studentInfo?.fathername || studentInfo?.father_name || '',
    mobilenumber: studentInfo?.mobilenumber || studentInfo?.mobile_number || '',
    isClear: studentInfo?.Clear ?? studentInfo?.is_cleared ?? true,
    student: {
      id: studentId,
      name: studentInfo?.name || '',
      father_name: studentInfo?.fathername || studentInfo?.father_name || '',
      mobile_number: studentInfo?.mobilenumber || studentInfo?.mobile_number || '',
      roll_number: studentInfo?.roll_number || studentInfo?.studentid || '',
      is_cleared: studentInfo?.Clear ?? studentInfo?.is_cleared ?? true,
    },
    subjects,
    assessments: studentMarks,
    assessmentsCount: studentMarks.length,
    passedCount: passedAssessmentsCount,
    totalObtained,
    totalMax,
    overallPct,
    overallPercentage: overallPct !== null ? Number(overallPct.toFixed(1)) : 0,
    overallGrade: overallPct !== null ? gradeFromPercent(overallPct) : null,
    passed: overallPct !== null ? overallPct >= PASS_THRESHOLD : null,
    assessmentCount: studentMarks.length,
    attendance: attendanceInfo || {
      total: 0,
      present: 0,
      absent: 0,
      percent: 0,
    },
  };
}

// ─────────────────────────────────────────────
// Class-level metrics
// ─────────────────────────────────────────────

/**
 * Compute comprehensive stats for a single class.
 * @param {Array} studentProfiles - array of buildStudentProfile() results
 * @param {string} classId
 * @param {string} className
 */
export function buildClassStats(studentProfiles, classId, className) {
  const profiles = (studentProfiles || []).filter(p => p.overallPct !== null);

  if (profiles.length === 0) {
    return {
      classId,
      className,
      studentCount: studentProfiles?.length || 0,
      testedCount: 0,
      mean: null,
      median: null,
      stdDev: null,
      min: null,
      max: null,
      passRate: null,
      failRate: null,
      gradeDistribution: {},
      subjectStats: {},
      rankedStudents: [],
    };
  }

  const pcts = profiles.map(p => p.overallPct);
  const passCount = profiles.filter(p => p.passed).length;

  // Grade distribution
  const gradeDistribution = {};
  for (const grade of GRADE_SCALE.map(g => g.label)) gradeDistribution[grade] = 0;
  for (const p of profiles) {
    if (p.overallGrade)
      gradeDistribution[p.overallGrade] = (gradeDistribution[p.overallGrade] || 0) + 1;
  }

  // Subject-level stats across all students in this class
  const subjectMap = {};
  for (const profile of studentProfiles) {
    for (const sub of profile.subjects) {
      if (!subjectMap[sub.subject])
        subjectMap[sub.subject] = { pcts: [], obtained: 0, total: 0, students: 0 };
      if (sub.pct !== null) {
        subjectMap[sub.subject].pcts.push(sub.pct);
        subjectMap[sub.subject].obtained += sub.obtained;
        subjectMap[sub.subject].total += sub.total;
        subjectMap[sub.subject].students++;
      }
    }
  }

  const subjectStats = {};
  for (const [subject, data] of Object.entries(subjectMap)) {
    const subPcts = data.pcts;
    const subPassCount = subPcts.filter(p => p >= PASS_THRESHOLD).length;
    subjectStats[subject] = {
      subject,
      mean: mean(subPcts),
      median: median(subPcts),
      stdDev: stdDev(subPcts),
      min: minOf(subPcts),
      max: maxOf(subPcts),
      passRate: subPcts.length > 0 ? (subPassCount / subPcts.length) * 100 : null,
      studentCount: data.students,
      grade: mean(subPcts) !== null ? gradeFromPercent(mean(subPcts)) : null,
    };
  }

  // Ranked students
  const rankedStudents = [...profiles]
    .sort((a, b) => (b.overallPct ?? -1) - (a.overallPct ?? -1))
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return {
    classId,
    className,
    studentCount: studentProfiles.length,
    testedCount: profiles.length,
    mean: mean(pcts),
    median: median(pcts),
    stdDev: stdDev(pcts),
    min: minOf(pcts),
    max: maxOf(pcts),
    passCount,
    failCount: profiles.length - passCount,
    passRate: (passCount / profiles.length) * 100,
    failRate: ((profiles.length - passCount) / profiles.length) * 100,
    gradeDistribution,
    subjectStats,
    rankedStudents,
  };
}

/**
 * calculateStats: Helper to calculate overall statistics from marks & tests.
 */
export function calculateStats(marks, tests) {
  if (!marks || marks.length === 0) return null;

  const testMap = {};
  (tests || []).forEach(t => {
    testMap[t.id] = t;
  });

  const pcts = [];
  const gradeCounts = { 'A+': 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  let passedCount = 0;

  marks.forEach(m => {
    const test = testMap[m.test_id] || m.tests || {};
    const total = m.total_marks || test.total_marks || 0;
    const obtained = m.obtained_marks !== undefined ? m.obtained_marks : m.marks_obtained;
    if (total > 0 && obtained !== null && obtained !== undefined) {
      const pct = (obtained / total) * 100;
      pcts.push(pct);
      const grade = gradeFromPercent(pct);
      if (gradeCounts[grade] !== undefined) gradeCounts[grade]++;
      if (pct >= PASS_THRESHOLD) passedCount++;
    }
  });

  if (pcts.length === 0) return null;

  const m = mean(pcts);
  const med = median(pcts);
  const sd = stdDev(pcts);
  const minVal = minOf(pcts);
  const maxVal = maxOf(pcts);

  return {
    mean: Number((m ?? 0).toFixed(1)),
    median: Number((med ?? 0).toFixed(1)),
    stdDev: Number((sd ?? 0).toFixed(1)),
    min: Number((minVal ?? 0).toFixed(1)),
    max: Number((maxVal ?? 0).toFixed(1)),
    passRate: Number(((passedCount / pcts.length) * 100).toFixed(1)),
    passedCount,
    totalAssessments: pcts.length,
    testsCount: tests?.length || 0,
    gradeCounts,
  };
}

/**
 * analyzeSubjects: Analyzes subject performance across given marks and tests.
 */
export function analyzeSubjects(marks, tests) {
  if (!tests || tests.length === 0) return [];

  const testMap = {};
  tests.forEach(t => {
    testMap[t.id] = t;
  });

  const subjectMap = {};

  (marks || []).forEach(m => {
    const test = testMap[m.test_id] || m.tests || {};
    const subName =
      test.subject || test.test_name || test.subjects?.subject_name || 'General';
    const subId = subName;
    const total = m.total_marks || test.total_marks || 0;
    const obtained = m.obtained_marks !== undefined ? m.obtained_marks : m.marks_obtained;

    if (!subjectMap[subId]) {
      subjectMap[subId] = {
        subject_id: subId,
        subject_name: subName,
        testIds: new Set(),
        marksCount: 0,
        pcts: [],
      };
    }

    if (test.id) subjectMap[subId].testIds.add(test.id);

    if (total > 0 && obtained !== null && obtained !== undefined) {
      const pct = (obtained / total) * 100;
      subjectMap[subId].pcts.push(pct);
      subjectMap[subId].marksCount++;
    }
  });

  return Object.values(subjectMap).map(sub => {
    const pcts = sub.pcts;
    const passCount = pcts.filter(p => p >= PASS_THRESHOLD).length;
    const avgPct = mean(pcts) ?? 0;
    return {
      subject_id: sub.subject_id,
      subject_name: sub.subject_name,
      testsCount: sub.testIds.size || 1,
      marksCount: sub.marksCount,
      averagePercentage: Number(avgPct.toFixed(1)),
      passRate: pcts.length > 0 ? Number(((passCount / pcts.length) * 100).toFixed(1)) : 0,
      minPercentage: Number((minOf(pcts) ?? 0).toFixed(1)),
      maxPercentage: Number((maxOf(pcts) ?? 0).toFixed(1)),
      grade: gradeFromPercent(avgPct),
    };
  });
}

/**
 * compareClasses: Compares multiple classes based on their tests and marks.
 */
export function compareClasses(classesList, tests, marks) {
  const marksMap = {};
  const testsMap = {};

  (tests || []).forEach(t => {
    testsMap[t.id] = t;
    const cid = String(t.class_id);
    if (!marksMap[cid]) marksMap[cid] = [];
  });

  (marks || []).forEach(m => {
    const test = testsMap[m.test_id];
    if (test) {
      const cid = String(test.class_id);
      if (!marksMap[cid]) marksMap[cid] = [];
      marksMap[cid].push({ ...m, tests: test });
    }
  });

  const comparisons = (classesList || []).map(cls => {
    const cid = String(cls.id);
    const classTests = (tests || []).filter(t => String(t.class_id) === cid);
    const classMarks = marksMap[cid] || [];

    const stats = calculateStats(classMarks, classTests);
    const subjects = analyzeSubjects(classMarks, classTests);

    const sortedSubjects = [...subjects].sort(
      (a, b) => b.averagePercentage - a.averagePercentage
    );
    const highestSubject =
      sortedSubjects.length > 0
        ? { name: sortedSubjects[0].subject_name, avg: sortedSubjects[0].averagePercentage }
        : null;
    const lowestSubject =
      sortedSubjects.length > 0
        ? {
            name: sortedSubjects[sortedSubjects.length - 1].subject_name,
            avg: sortedSubjects[sortedSubjects.length - 1].averagePercentage,
          }
        : null;

    return {
      classId: cls.id,
      className: cls.name,
      averagePercentage: stats ? stats.mean : 0,
      median: stats ? stats.median : 0,
      passRate: stats ? stats.passRate : 0,
      stdDev: stats ? stats.stdDev : 0,
      min: stats ? stats.min : 0,
      max: stats ? stats.max : 0,
      testedCount: stats ? stats.totalAssessments : 0,
      testsCount: classTests.length,
      highestSubject,
      lowestSubject,
      subjects,
    };
  });

  return comparisons
    .sort((a, b) => b.averagePercentage - a.averagePercentage)
    .map((c, idx) => ({ ...c, rank: idx + 1 }));
}

/**
 * calculateDeciles: Calculates 10% bins for marks.
 */
export function calculateDeciles(marks, tests) {
  const testMap = {};
  (tests || []).forEach(t => {
    testMap[t.id] = t;
  });

  const pcts = [];
  (marks || []).forEach(m => {
    const test = testMap[m.test_id] || m.tests || {};
    const total = m.total_marks || test.total_marks || 0;
    const obtained = m.obtained_marks !== undefined ? m.obtained_marks : m.marks_obtained;
    if (total > 0 && obtained !== null && obtained !== undefined) {
      pcts.push((obtained / total) * 100);
    }
  });

  const buckets = [
    { range: '0-9%', count: 0 },
    { range: '10-19%', count: 0 },
    { range: '20-29%', count: 0 },
    { range: '30-39%', count: 0 },
    { range: '40-49%', count: 0 },
    { range: '50-59%', count: 0 },
    { range: '60-69%', count: 0 },
    { range: '70-79%', count: 0 },
    { range: '80-89%', count: 0 },
    { range: '90-100%', count: 0 },
  ];

  for (const pct of pcts) {
    const idx = Math.min(Math.floor(pct / 10), 9);
    buckets[idx].count++;
  }

  return buckets;
}

// ─────────────────────────────────────────────
// Subject-level metrics (across classes)
// ─────────────────────────────────────────────

/**
 * Build subject comparison data across multiple classes.
 */
export function buildSubjectCrossClassStats(classSets, subject) {
  return classSets.map(({ classId, className, flatMarks }) => {
    const subjectMarks = flatMarks.filter(m => m.subject === subject);
    const pcts = subjectMarks.map(m => m.pct).filter(p => p !== null);
    const passCount = pcts.filter(p => p >= PASS_THRESHOLD).length;

    return {
      classId,
      className,
      studentCount: new Set(subjectMarks.map(m => m.studentid)).size,
      mean: mean(pcts),
      median: median(pcts),
      stdDev: stdDev(pcts),
      min: minOf(pcts),
      max: maxOf(pcts),
      passRate: pcts.length > 0 ? (passCount / pcts.length) * 100 : null,
      grade: mean(pcts) !== null ? gradeFromPercent(mean(pcts)) : null,
      pcts,
    };
  });
}

// ─────────────────────────────────────────────
// Score distribution buckets
// ─────────────────────────────────────────────

/** Returns histogram buckets: 0-9, 10-19, ..., 90-100 */
export function scoreDistribution(pcts) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    label: i === 9 ? '90-100' : `${i * 10}-${i * 10 + 9}`,
    min: i * 10,
    max: i === 9 ? 100 : i * 10 + 9,
    count: 0,
  }));

  for (const pct of pcts) {
    if (pct === null || pct === undefined) continue;
    const idx = Math.min(Math.floor(pct / 10), 9);
    buckets[idx].count++;
  }

  return buckets;
}

export const calculateScoreDistribution = scoreDistribution;

// ─────────────────────────────────────────────
// Performance trend (over time / test type)
// ─────────────────────────────────────────────

/**
 * Group marks by test_type and calculate average % per period.
 */
export function buildTrendByTestType(flatMarks) {
  const typeOrder = ['Midterm-1', 'Midterm-2', 'Terminal-1', 'Terminal-2', 'Monthly'];
  const byType = {};

  for (const m of flatMarks) {
    if (!m.testType) continue;
    if (!byType[m.testType]) byType[m.testType] = { pcts: [], obtained: 0, total: 0 };
    if (m.pct !== null) {
      byType[m.testType].pcts.push(m.pct);
      byType[m.testType].obtained += m.obtained;
      byType[m.testType].total += m.total;
    }
  }

  return typeOrder
    .filter(t => byType[t])
    .map(t => ({
      period: t,
      mean: mean(byType[t].pcts),
      pcts: byType[t].pcts,
      studentCount: byType[t].pcts.length,
      passRate:
        byType[t].pcts.length > 0
          ? (byType[t].pcts.filter(p => p >= PASS_THRESHOLD).length / byType[t].pcts.length) * 100
          : null,
    }));
}

/**
 * Group marks by month (YYYY-MM) for temporal trend charts.
 */
export function buildTrendByMonth(flatMarks) {
  const byMonth = {};

  for (const m of flatMarks) {
    if (!m.date || m.pct === null) continue;
    const month = m.date.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = { pcts: [] };
    byMonth[month].pcts.push(m.pct);
  }

  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      label: new Date(month + '-01').toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
      }),
      mean: mean(data.pcts),
      count: data.pcts.length,
    }));
}
