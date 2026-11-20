import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { accessMigrationPending } from '../utils/adminDataAccess';

export default function StudentRecordsPage() {
    const [studentId, setStudentId] = useState('');
    const [studentDetails, setStudentDetails] = useState(null); 
    const [attendance, setAttendance] = useState([]);
    const [marks, setMarks] = useState([]);
    const [messages, setMessages] = useState([]);
    const [complaints, setComplaints] = useState([]); // ⬅️ NEW: To store complaint history
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // UI State
    const [recordsFetched, setRecordsFetched] = useState(false);
    const [showAttendance, setShowAttendance] = useState(false);
    const [showMarks, setShowMarks] = useState(false);
    const [showMessages, setShowMessages] = useState(false);
    const [showComplaints, setShowComplaints] = useState(false); // ⬅️ NEW: To toggle complaint view
    const [expandedMessageId, setExpandedMessageId] = useState(null);

    // Complaint State
    const [complaintTitle, setComplaintTitle] = useState('');
    const [complaintDetails, setComplaintDetails] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const sendMessage = async (mobileNumber, messageText, studentId, classId) => {
        try {
            const { error } = await supabase.from('messages').insert({
                mobilenumber: mobileNumber,
                text: messageText,
                student_id: studentId,
                class_id: classId,
            });
            if (error) {
                console.error("Error sending message:", error.message);
            }
        } catch (e) {
            console.error("Exception in sendMessage:", e);
        }
    };

    const fetchRecords = async () => {
        if (!studentId) return;
        setLoading(true);
        setError('');
        resetSearch(true);

        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        try {
            let { data: studentData, error: studentErr } = await supabase.rpc('lookup_public_student', {
                p_das: studentId, p_page: 'parents'
            });
            if (accessMigrationPending(studentErr)) {
                ({ data: studentData, error: studentErr } = await supabase.from('students')
                    .select('name, mobilenumber, class_id').eq('studentid', studentId).single());
            }

            if (studentErr || !studentData) {
                throw new Error("Student ID not found. Please check and try again.");
            }
            setStudentDetails(studentData);

            // Fetch all records in parallel for better performance
            const [
                { data: attData, error: attErr },
                { data: testsData, error: testsErr },
                { data: msgsData, error: msgsErr },
                { data: cmpsData, error: cmpsErr }, // ⬅️ NEW: Fetch complaints
            ] = await Promise.all([
                supabase.from('attendance').select('date,status').eq('studentid', studentId).gte('date', startDate).lte('date', endDate).order('date', { ascending: true }),
                supabase.from('tests').select('id').gte('date', startDate).lte('date', endDate),
                supabase.from('messages').select('id, text, created_at').eq('student_id', studentId).order('created_at', { ascending: false }),
                supabase.from('complaints').select('title, complaint_text, status, created_at, resolution_notes').eq('student_id', studentId).order('created_at', { ascending: false }),
            ]);

            if (attErr || testsErr || msgsErr || cmpsErr) {
                throw attErr || testsErr || msgsErr || cmpsErr;
            }

            const testIds = testsData?.map(test => test.id) || [];
            const { data: mkData, error: mkErr } = await supabase.from('marks').select(`obtained_marks, total_marks, tests(test_name, date)`).eq('studentid', studentId).in('test_id', testIds).order('date', { foreignTable: 'tests', ascending: true });
            if (mkErr) throw mkErr;

            setAttendance(attData || []);
            setMarks(mkData || []);
            setMessages(msgsData || []);
            setComplaints(cmpsData || []); // ⬅️ NEW: Set complaints state
            setRecordsFetched(true);
        } catch (err) {
            setError(err.message || 'Something went wrong');
            resetSearch();
        }
        setLoading(false);
    };

    const handleLodgeComplaint = async () => {
        if (!complaintTitle || !complaintDetails) {
            alert("Please fill in both the title and details for the complaint.");
            return;
        }
        setIsSubmitting(true);
        try {
            const { data: newComplaint, error: insertError } = await supabase.from('complaints').insert({
                student_id: studentId,
                title: complaintTitle,
                complaint_text: complaintDetails,
                status: 'New',
                parent_number: studentDetails?.mobilenumber,
            }).select().single(); // Get the new complaint back

            if (insertError) throw insertError;

            // Add the new complaint to the top of the existing list
            setComplaints([newComplaint, ...complaints]);

            if (studentDetails) {
                const parentMessage = `*Complaint Received* 📬\n\nDear Parent,\nYour complaint regarding "*${complaintTitle}*" has been successfully lodged. Our team will review it shortly.\n\nThank you.`;
                await sendMessage(studentDetails.mobilenumber, parentMessage, studentId, studentDetails.class_id);

                const adminMessage = `*New Parent Complaint* ⚠️\n\n*Student:* ${studentDetails.name} (ID: ${studentId})\n*Title:* ${complaintTitle}\n*Details:* ${complaintDetails}`;
                await sendMessage('923085333392', adminMessage, studentId, studentDetails.class_id);
            }

            alert("Complaint lodged successfully! A confirmation message has been sent.");
            setComplaintTitle('');
            setComplaintDetails('');
        } catch (err) {
            alert(`Error lodging complaint: ${err.message}`);
        }
        setIsSubmitting(false);
    };

    const resetSearch = (isRefetch = false) => {
        if (!isRefetch) {
            setStudentId('');
        }
        setStudentDetails(null);
        setRecordsFetched(false);
        setAttendance([]);
        setMarks([]);
        setMessages([]);
        setComplaints([]); // ⬅️ NEW: Reset complaints
    };

    const toggleMessage = (id) => {
        setExpandedMessageId(expandedMessageId === id ? null : id);
    };
    
    // Helper function to get badge color based on status
    const getStatusBadgeColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'new': return 'bg-red-100 text-red-800';
            case 'in progress': return 'bg-blue-100 text-blue-800';
            case 'resolved': return 'bg-green-100 text-green-800';
            case 'closed': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const presentCount = attendance.filter(a => a.status?.toLowerCase() === 'present').length;
    const absentCount = attendance.filter(a => a.status?.toLowerCase() === 'absent').length;
    const avgPercent = marks.length ? (marks.reduce((s, m) => s + (Number(m.obtained_marks || 0) / Number(m.total_marks || 1)) * 100, 0) / marks.length).toFixed(1) : 0;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center p-6">
            <div className="bg-white border border-green-200 shadow-xl rounded-2xl p-8 w-full max-w-3xl">
                <h1 className="text-3xl font-extrabold text-center mb-8 text-green-700">🎓 Student Portal</h1>
                
                {!recordsFetched ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <input type="text" placeholder="Enter Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="px-4 py-3 border border-green-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400" />
                        <button onClick={fetchRecords} disabled={loading || !studentId} className="px-6 py-3 rounded-xl bg-green-500 text-white font-semibold shadow hover:bg-green-600 transition disabled:opacity-40">{loading ? 'Fetching…' : 'Fetch Records'}</button>
                    </div>
                ) : (
                    <div className="text-center bg-green-50 p-4 rounded-xl mb-6">
                        <h2 className="text-2xl font-bold text-green-800">Welcome, {studentDetails?.name}!</h2>
                        <p className="text-sm text-gray-600 mt-1">Viewing last 30 days of records for Student ID: {studentId}</p>
                        <button onClick={() => resetSearch()} className="mt-2 text-sm text-green-600 hover:underline font-semibold">Search for Another Student</button>
                    </div>
                )}

                {error && <p className="text-red-500 mb-4 text-center font-semibold">{error}</p>}

                {recordsFetched && (
                    <>
                        {messages.length > 0 && (
                            <div className="bg-blue-50 text-blue-800 p-4 rounded-xl mb-6 shadow-inner">
                                <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowMessages(!showMessages)}>
                                    <h3 className="font-semibold text-lg">🔔 Messages ({messages.length})</h3>
                                    <span className="text-sm font-medium text-blue-600">{showMessages ? 'Hide' : 'Show'}</span>
                                </div>
                                {showMessages && (
                                    <div className="space-y-3 mt-4">{messages.map((msg) => (<div key={msg.id} onClick={() => toggleMessage(msg.id)} className="bg-white p-3 rounded-lg cursor-pointer hover:bg-blue-100 transition shadow-sm"><div className="flex justify-between items-center mb-1"><span className="font-medium">Message from {new Date(msg.created_at).toLocaleDateString()}</span><span className="text-xs text-blue-500">{expandedMessageId === msg.id ? 'Less' : 'More'}</span></div><p className="text-sm text-gray-700">{expandedMessageId === msg.id ? msg.text : `${msg.text.slice(0, 100)}...`}</p></div>))}</div>
                                )}
                            </div>
                        )}
                        
                        {/* --- NEW: Complaint History Section --- */}
                        {complaints.length > 0 && (
                            <div className="bg-yellow-50 text-yellow-800 p-4 rounded-xl mb-6 shadow-inner">
                                <div className="flex justify-between items-center cursor-pointer" onClick={() => setShowComplaints(!showComplaints)}>
                                    <h3 className="font-semibold text-lg">📋 Complaint History ({complaints.length})</h3>
                                    <span className="text-sm font-medium text-yellow-600">{showComplaints ? 'Hide' : 'Show'}</span>
                                </div>
                                {showComplaints && (
                                    <div className="space-y-4 mt-4">
                                        {complaints.map((c, idx) => (
                                            <div key={idx} className="bg-white p-4 rounded-lg shadow-sm">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-gray-800">{c.title}</h4>
                                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${getStatusBadgeColor(c.status)}`}>{c.status}</span>
                                                </div>
                                                <p className="text-sm text-gray-600 mb-2">{c.complaint_text}</p>
                                                {(c.status === 'Resolved' || c.status === 'Closed') && c.resolution_notes && (
                                                    <div className="bg-green-50 border-l-4 border-green-400 p-2 mt-2 rounded">
                                                        <p className="text-sm font-semibold text-green-800">Resolution Notes:</p>
                                                        <p className="text-sm text-green-700">{c.resolution_notes}</p>
                                                    </div>
                                                )}
                                                <p className="text-xs text-gray-400 text-right mt-2">Lodged on: {new Date(c.created_at).toLocaleDateString()}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Summary Cards, Tables, and Complaint Form */}
                        {attendance.length > 0 || marks.length > 0 ? (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"><div className="bg-green-100 text-green-700 rounded-xl p-5 text-center shadow"><p className="text-lg font-medium">Present</p><p className="text-3xl font-bold">{presentCount}</p></div><div className="bg-red-100 text-red-600 rounded-xl p-5 text-center shadow"><p className="text-lg font-medium">Absent</p><p className="text-3xl font-bold">{absentCount}</p></div><div className="bg-blue-100 text-blue-800 rounded-xl p-5 text-center shadow"><p className="text-lg font-medium">Avg. Percentage</p><p className="text-3xl font-bold">{avgPercent}%</p></div></div>
                                <div className="flex flex-wrap justify-center gap-4 mb-6"><button onClick={() => setShowAttendance((s) => !s)} className="px-5 py-2 bg-green-500 text-white rounded-lg shadow hover:bg-green-600 transition">{showAttendance ? 'Hide Attendance' : 'Show Attendance'}</button><button onClick={() => setShowMarks((s) => !s)} className="px-5 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition">{showMarks ? 'Hide Marks' : 'Show Marks'}</button></div>
                                {showAttendance && (<div className="overflow-x-auto mb-10"><table className="w-full text-sm text-left border border-green-200 shadow rounded-xl"><thead className="bg-green-50 text-green-700"><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Status</th></tr></thead><tbody>{attendance.map((a, idx) => (<tr key={idx} className="border-t hover:bg-green-50"><td className="px-4 py-2">{a.date}</td><td className={`px-4 py-2 font-medium ${a.status?.toLowerCase() === 'present' ? 'text-green-600' : 'text-red-500'}`}>{a.status}</td></tr>))}</tbody></table></div>)}
                                {showMarks && (<div className="overflow-x-auto"><table className="w-full text-sm text-left border border-blue-200 shadow rounded-xl"><thead className="bg-blue-50 text-blue-700"><tr><th className="px-4 py-2">Test</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Obtained</th><th className="px-4 py-2">Total</th><th className="px-4 py-2">%</th></tr></thead><tbody>{marks.map((m, idx) => { const percent = m.total_marks ? ((Number(m.obtained_marks) / Number(m.total_marks)) * 100).toFixed(1) : 0; return (<tr key={idx} className="border-t hover:bg-blue-50"><td className="px-4 py-2">{m.tests?.test_name}</td><td className="px-4 py-2">{m.tests?.date}</td><td className="px-4 py-2 text-blue-700">{m.obtained_marks}</td><td className="px-4 py-2 text-blue-700">{m.total_marks}</td><td className={`px-4 py-2 font-medium ${percent >= 50 ? 'text-green-600' : 'text-red-500'}`}>{percent}%</td></tr>); })}</tbody></table></div>)}
                            </>
                        ) : (<p className="text-center text-gray-500 py-4">No attendance or marks records found for this student in the last 30 days.</p>)}

                        <div className="mt-10 pt-6 border-t-2 border-green-100"><h2 className="text-2xl font-bold text-center mb-4 text-green-700">Lodge a Complaint</h2><div className="space-y-4"><input type="text" placeholder="Complaint Title" value={complaintTitle} onChange={(e) => setComplaintTitle(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-400" /><textarea placeholder="Complaint Details..." value={complaintDetails} onChange={(e) => setComplaintDetails(e.target.value)} rows="4" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-400" /><button onClick={handleLodgeComplaint} disabled={isSubmitting} className="w-full px-6 py-3 rounded-xl bg-red-500 text-white font-semibold shadow hover:bg-red-600 transition disabled:opacity-50">{isSubmitting ? 'Submitting...' : 'Submit Complaint'}</button></div></div>
                    </>
                )}
            </div>
        </div>
    );
}
