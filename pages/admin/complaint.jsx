'use client';
import { useEffect, useState, useMemo, useTransition } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { complaintTeacherMessage, hasNoBlockedStaff, staffName } from '../../utils/complaintStaff';
import Navbar from '../../components/Navbar';

// UI component imports
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '../../components/ui/table';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Loader2,
  Plus,
  Pencil,
  Send,
  BarChart2,
  CheckCircle2,
  AlertTriangle,
  Megaphone,
  UserCog,
  ShieldAlert,
  Search,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { queueTeacherAlerts } from '../../utils/staffNotifications';

export default function ComplaintsAdmin() {
  // State management
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [complaints, setComplaints] = useState([]);
  const [isPending, startTransition] = useTransition();

  // State for user management, editing, and status
  const [users, setUsers] = useState([]);
  const [againstUserId, setAgainstUserId] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [editingComplaint, setEditingComplaint] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newAssignedToUserId, setNewAssignedToUserId] = useState('');
  const [newAgainstUserId, setNewAgainstUserId] = useState('');
  const complaintStatuses = ['New', 'In Progress', 'Resolved', 'Closed'];

  // State for filtering
  const [statusFilter, setStatusFilter] = useState('All');

  // WhatsApp Messaging Helper Function
  const sendMessage = async (mobileNumber, messageText, studentId, classId) => {
    const isAdminNumber = mobileNumber === '923085333392';
    let shouldSendMessage = true;

    if (!isAdminNumber) {
      shouldSendMessage = window.confirm(
        `Do you want to send the following message to ${mobileNumber}?\n\n---\n${messageText}\n---`
      );
    }

    if (!shouldSendMessage) {
      console.log('Message sending cancelled by user.');
      return;
    }

    try {
      const { error } = await supabase.from('messages').insert({
        number: mobileNumber,
        text: messageText,
        student_id: studentId,
        class_id: classId,
      });
      if (error) console.error('Error sending message:', error);
    } catch (e) {
      console.error('Exception in sendMessage:', e);
    }
  };

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      const { data: clsData } = await supabase.from('classes').select('id, name');
      if (clsData) setClasses(clsData);
      const { data: usersData } = await supabase
        .from('profiles')
        .select('id, name, mobilenumber, role, is_active')
        .or('is_active.eq.true,is_active.is.null')
        .order('name');
      if (usersData) setUsers(usersData);
      fetchComplaints();
    };
    fetchData();
  }, []);

  const fetchComplaints = async () => {
    const { data: cmps, error } = await supabase
      .from('complaints')
      .select(
        `
          id, title, complaint_text, status, resolution_notes, created_at, student_id,
          students!left(name, mobilenumber, class_id),
          assigned_to:profiles!assigned_to_user_id(id, name, is_active),
          against_user:profiles!against_user_id(id, name, is_active)
        `
      )
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching complaints:', error);
    if (cmps) setComplaints(cmps.filter(hasNoBlockedStaff));
  };

  // Fetch students when a class is selected
  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }
    const fetchStudents = async () => {
      const { data } = await supabase
        .from('active_students')
        .select('*')
        .eq('class_id', selectedClass);
      if (data) setStudents(data);
    };
    fetchStudents();
  }, [selectedClass]);

  // Function to submit a new complaint
  const handleSubmit = async () => {
    if (!selectedStudent || !title || !text || !againstUserId || !assignedToUserId) {
      alert('Please fill all fields, including assigning users.');
      return;
    }
    startTransition(async () => {
      const student = students.find(s => s.studentid === selectedStudent);
      if (!student) {
        alert('Could not find student details.');
        return;
      }
      const { name: studentName, mobilenumber, class_id } = student;

      const { error: cErr } = await supabase.from('complaints').insert({
        parent_number: mobilenumber,
        complaint_text: text,
        title,
        student_id: selectedStudent,
        against_user_id: againstUserId,
        assigned_to_user_id: assignedToUserId,
        status: 'New',
      });
      if (cErr) {
        alert('Error creating complaint: ' + cErr.message);
        return;
      }

      // --- Send Messages on Creation ---
      const assignedToUser = users.find(u => u.id === assignedToUserId);
      const studentMsgReceived = `*Complaint Received* 📬\n\nDear Parent,\nYour complaint regarding "*${title}*" has been successfully lodged. We will look into it shortly.\n\nThank you,\nCampus Administration`;
      await sendMessage(mobilenumber, studentMsgReceived, selectedStudent, class_id);
      const studentMsgAssigned = `*Complaint Update* 🧑‍🏫\n\nDear Parent,\nYour complaint "*${title}*" has been assigned to a concerned staff member for review and resolution.`;
      await sendMessage(mobilenumber, studentMsgAssigned, selectedStudent, class_id);
      const adminMsg = `*New Complaint Alert* ⚠️\n\n*Student:* ${studentName}\n*Title:* ${title}\n*Details:* ${text}\n*Against:* ${staffName(
        users.find(u => u.id === againstUserId),
        'N/A'
      )}\n*Assigned To:* ${staffName(assignedToUser, 'Unassigned')}`;
      await sendMessage('923085333392', adminMsg, selectedStudent, class_id);
      let teacherAlertStatus;
      try {
        const queued = await queueTeacherAlerts([assignedToUserId, againstUserId], teacher =>
          complaintTeacherMessage(teacher, {
            assignedTo: assignedToUserId,
            against: againstUserId,
            title,
            studentName,
          })
        );
        teacherAlertStatus =
          queued === 1 ? '1 teacher alert queued.' : `${queued} teacher alerts queued.`;
      } catch (notificationError) {
        console.error('Unable to queue teacher complaint alerts:', notificationError);
        teacherAlertStatus = 'Teacher alerts could not be queued.';
      }

      alert(`Complaint lodged successfully. ${teacherAlertStatus}`);
      fetchComplaints();
      setTitle('');
      setText('');
      setAgainstUserId('');
      setAssignedToUserId('');
      setSelectedStudent(null);
      setSelectedClass(null);
    });
  };

  // Function to update an existing complaint
  const handleUpdateComplaint = async () => {
    if (!editingComplaint) return;

    startTransition(async () => {
      const originalComplaint = complaints.find(c => c.id === editingComplaint.id);

      const { error } = await supabase
        .from('complaints')
        .update({
          status: newStatus,
          resolution_notes: resolutionNotes,
          assigned_to_user_id: newAssignedToUserId,
          against_user_id: newAgainstUserId,
        })
        .eq('id', editingComplaint.id);
      if (error) {
        alert('Error updating complaint: ' + error.message);
        return;
      }

      const student = editingComplaint.students;

      if (originalComplaint.against_user?.id !== newAgainstUserId) {
        const oldAgainst = staffName(originalComplaint.against_user, 'N/A');
        const newAgainst = staffName(
          users.find(u => u.id === newAgainstUserId),
          'N/A'
        );
        const adminAgainstMsg = `*Complaint Details Updated* 📝\n\n*Title:* ${editingComplaint.title}\n*Student:* ${student.name}\n\nThis complaint's *'Against'* field has been changed.\n*From:* ${oldAgainst}\n*To:* ${newAgainst}`;
        await sendMessage('923085333392', adminAgainstMsg, student.student_id, student.class_id);
      }

      if (originalComplaint.assigned_to?.id !== newAssignedToUserId) {
        const oldTeacher = staffName(originalComplaint.assigned_to, 'Unassigned');
        const newTeacher = staffName(
          users.find(u => u.id === newAssignedToUserId),
          'Unassigned'
        );
        const adminReassignMsg = `*Complaint Re-Assigned* 🔁\n\n*Title:* ${editingComplaint.title}\n*Student:* ${student.name}\n*From:* ${oldTeacher}\n*To:* ${newTeacher}`;
        await sendMessage('923085333392', adminReassignMsg, student.student_id, student.class_id);
        const studentReassignMsg = `*Complaint Update* 🧑‍🏫\n\nDear Parent,\nThere is an update on your complaint "*${editingComplaint.title}*". It has been forwarded to another staff member for further action.`;
        await sendMessage(
          student.mobilenumber,
          studentReassignMsg,
          student.student_id,
          student.class_id
        );
      }

      const changedTeacherIds = [
        originalComplaint.assigned_to?.id !== newAssignedToUserId ? newAssignedToUserId : null,
        originalComplaint.against_user?.id !== newAgainstUserId ? newAgainstUserId : null,
      ];
      let teacherAlertStatus = '';
      if (changedTeacherIds.some(Boolean)) {
        try {
          const queued = await queueTeacherAlerts(changedTeacherIds, teacher =>
            complaintTeacherMessage(teacher, {
              assignedTo: newAssignedToUserId,
              against: newAgainstUserId,
              title: editingComplaint.title,
              studentName: student.name,
              isUpdate: true,
            })
          );
          teacherAlertStatus =
            queued === 1 ? ' 1 teacher alert queued.' : ` ${queued} teacher alerts queued.`;
        } catch (notificationError) {
          console.error('Unable to queue teacher complaint alerts:', notificationError);
          teacherAlertStatus = ' Teacher alerts could not be queued.';
        }
      }

      if (
        originalComplaint.status !== newStatus &&
        (newStatus === 'Resolved' || newStatus === 'Closed')
      ) {
        const studentCloseMsg = `*Complaint ${newStatus}* ✅\n\nDear Parent,\nYour complaint "*${editingComplaint.title}*" has been marked as *${newStatus}*.\n\n*Resolution Notes:*\n${resolutionNotes || 'No additional notes.'}`;
        await sendMessage(
          student.mobilenumber,
          studentCloseMsg,
          student.student_id,
          student.class_id
        );
        const adminCloseMsg = `*Complaint Status Update* 📋\n\n*Title:* ${editingComplaint.title}\n*Student:* ${student.name}\n*New Status:* ${newStatus}\n*Final Notes:* ${resolutionNotes || 'N/A'}`;
        await sendMessage('923085333392', adminCloseMsg, student.student_id, student.class_id);
      }

      alert(`Complaint updated successfully.${teacherAlertStatus}`);
      fetchComplaints();
      setEditingComplaint(null);
    });
  };

  const openEditModal = complaint => {
    setEditingComplaint(complaint);
    setResolutionNotes(complaint.resolution_notes || '');
    setNewStatus(complaint.status || 'New');
    setNewAssignedToUserId(complaint.assigned_to?.id || '');
    setNewAgainstUserId(complaint.against_user?.id || '');
  };

  const stats = useMemo(
    () => ({
      total: complaints.length,
      new: complaints.filter(c => c.status === 'New').length,
      inProgress: complaints.filter(c => c.status === 'In Progress').length,
      resolved: complaints.filter(c => c.status === 'Resolved').length,
    }),
    [complaints]
  );

  const filteredComplaints = useMemo(
    () => complaints.filter(c => (statusFilter === 'All' ? true : c.status === statusFilter)),
    [complaints, statusFilter]
  );

  const getStatusBadgeStyles = status => {
    // Increased brightness for dark mode text (text-X-300 to text-X-200)
    switch (status) {
      case 'Resolved':
        return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200 border-transparent';
      case 'Closed':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200 border-transparent';
      case 'New':
        return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200 border-transparent';
      default:
        return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200 border-transparent';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="container mx-auto max-w-7xl p-4 md:p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex flex-col space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Complaints Admin
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-300">
            Lodge new complaints, assign staff, and track resolutions.
          </p>
        </div>

        {/* Stats Cards - Glass Style */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Total Complaints
              </CardTitle>
              <BarChart2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                New / Unattended
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.new}</div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                In Progress
              </CardTitle>
              <Loader2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.inProgress}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Resolved
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.resolved}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Complaint Form - Stacked on TOP */}
        <div className="w-full">
          <div className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl shadow-sm p-6">
            <div className="mb-4">
              <h2 className="text-base font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-200 flex items-center gap-2 mb-3">
                <Megaphone className="w-5 h-5" /> Lodge New Complaint
              </h2>
            </div>

            <div className="space-y-4">
              {/* 2 Column Grid for Class/Student */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Select Class
                  </Label>
                  <Select
                    onValueChange={value => setSelectedClass(value)}
                    value={selectedClass || ''}
                  >
                    <SelectTrigger className="w-full bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10 dark:text-white">
                      <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#0f172a] dark:text-white">
                      <div className="max-h-[200px] overflow-y-auto">
                        {classes.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </div>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Select Student
                  </Label>
                  <Select
                    onValueChange={value => setSelectedStudent(value)}
                    value={selectedStudent || ''}
                    disabled={!selectedClass}
                  >
                    <SelectTrigger className="w-full bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10 dark:text-white">
                      <SelectValue
                        placeholder={selectedClass ? 'Select Student' : 'Select Class first'}
                      />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#0f172a] dark:text-white">
                      <div className="max-h-[200px] overflow-y-auto">
                        {students.map(s => (
                          <SelectItem key={s.studentid} value={String(s.studentid)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </div>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedStudent && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 gap-4">
                    <Input
                      placeholder="Complaint Title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10 dark:text-white dark:placeholder:text-gray-400"
                    />
                    <textarea
                      placeholder="Detailed description of the issue..."
                      value={text}
                      onChange={e => setText(e.target.value)}
                      className="flex min-h-[80px] w-full rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y"
                    />
                  </div>

                  {/* 2 Column Grid for Users */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                        Against (Staff/User)
                      </Label>
                      <Select value={againstUserId} onValueChange={setAgainstUserId}>
                        <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10 dark:text-white">
                          <SelectValue placeholder="Select User" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-[#0f172a] dark:text-white">
                          {users.map(user => (
                            <SelectItem key={user.id} value={user.id}>
                              {staffName(user)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                        Assign Investigation To
                      </Label>
                      <Select value={assignedToUserId} onValueChange={setAssignedToUserId}>
                        <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10 dark:text-white">
                          <SelectValue placeholder="Select User" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-[#0f172a] dark:text-white">
                          {users.map(user => (
                            <SelectItem key={user.id} value={user.id}>
                              {staffName(user)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSubmit}
                      disabled={isPending}
                      className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
                    >
                      {isPending ? (
                        <Loader2 className="animate-spin mr-2 h-4 w-4" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Submit Complaint & Notify
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Existing Complaints List - Stacked Below */}
        <div className="w-full">
          <div className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5  flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <UserCog className="w-4 h-4 text-blue-500" /> Managed Complaints
              </h2>
              <div className="w-full sm:w-[200px]">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-900 border-gray-300 dark:border-white/20 text-gray-700 dark:text-white">
                    <SelectValue placeholder="Filter Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#0f172a] dark:text-white">
                    <SelectItem value="All">All Statuses</SelectItem>
                    {complaintStatuses.map(s => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-gray-200 dark:border-white/5">
                    <TableHead className="w-[200px] text-gray-500 dark:text-gray-300">
                      Issue
                    </TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-300">Student</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-300">Status</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-300">
                      Assigned / Against
                    </TableHead>
                    <TableHead className="text-right text-gray-500 dark:text-gray-300">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredComplaints.length === 0 ? (
                    <TableRow className="hover:bg-transparent border-gray-100 dark:border-white/5">
                      <TableCell
                        colSpan={5}
                        className="h-24 text-center text-gray-500 dark:text-gray-300"
                      >
                        No complaints found matching criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredComplaints.map(c => (
                      <TableRow
                        key={c.id}
                        className="hover:bg-gray-50 dark:hover:bg-white/5 border-gray-100 dark:border-white/5 transition-colors"
                      >
                        <TableCell className="font-medium text-gray-900 dark:text-white">
                          {c.title}
                          <div className="text-[10px] text-gray-500 dark:text-gray-300 mt-1 truncate max-w-[250px]">
                            {c.complaint_text}
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-200 text-sm">
                          {c.students?.name ?? 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`font-medium shadow-none ${getStatusBadgeStyles(c.status)}`}
                          >
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-gray-500 dark:text-gray-300 flex items-center gap-1">
                              <UserCog className="w-3 h-3" /> To:{' '}
                              {c.assigned_to ? staffName(c.assigned_to) : 'Unassigned'}
                            </span>
                            <span className="text-[10px] text-red-500/70 dark:text-red-300/80 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> Vs:{' '}
                              {c.against_user ? staffName(c.against_user) : 'N/A'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditModal(c)}
                            className="h-8 border-gray-200 dark:border-white/20 text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Edit Dialog - MADE SMALLER (sm:max-w-[425px]) */}
        <Dialog open={!!editingComplaint} onOpenChange={() => setEditingComplaint(null)}>
          {/* Changes: max-w updated, padding reduced */}
          <DialogContent className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white sm:max-w-[425px] p-0 overflow-hidden gap-0 shadow-2xl">
            <DialogHeader className="p-4 border-b border-gray-100 dark:border-white/5">
              <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                Manage Complaint
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 dark:text-gray-300 mt-1">
                Updating:{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {editingComplaint?.title}
                </span>
              </DialogDescription>
            </DialogHeader>

            {/* Reduced padding p-6 to p-4 and space-y-4 to space-y-3 */}
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Complaint Against
                  </Label>
                  <Select value={newAgainstUserId} onValueChange={setNewAgainstUserId}>
                    <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10 dark:text-white">
                      <SelectValue placeholder="Select User" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#0f172a] dark:text-white">
                      {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {staffName(user)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                    Assigned To
                  </Label>
                  <Select value={newAssignedToUserId} onValueChange={setNewAssignedToUserId}>
                    <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10 dark:text-white">
                      <SelectValue placeholder="Assign User" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#0f172a] dark:text-white">
                      {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {staffName(user)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Status
                </Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10 dark:text-white">
                    <SelectValue placeholder="Set status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#0f172a] dark:text-white">
                    {complaintStatuses.map(status => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Resolution Notes
                </Label>
                <textarea
                  placeholder="Add resolution details..."
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  rows={4}
                  className="flex w-full rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                />
              </div>
            </div>

            <DialogFooter className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" size="sm" className="text-gray-600 dark:text-gray-300">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                size="sm"
                onClick={handleUpdateComplaint}
                disabled={isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isPending && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
