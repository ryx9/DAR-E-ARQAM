"use client";
import { useEffect, useState, useMemo, useTransition } from "react";
import { supabase } from "../utils/supabaseClient";
import { hasNoBlockedStaff, staffName } from "../utils/complaintStaff";
import Navbar from "../components/Navbar";

// UI component imports
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "../components/ui/card";
import {
  Loader2,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ShieldAlert,
  Inbox,
  User,
  Calendar,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";

export default function MyComplaints() {
  const [user, setUser] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [editingComplaint, setEditingComplaint] = useState(null);
  const [isPending, startTransition] = useTransition();

  // Pagination / Load More state
  const [visibleCount, setVisibleCount] = useState(6);

  const [resolutionNotes, setResolutionNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const complaintStatuses = ["New", "In Progress", "Resolved", "Closed"];

  // --- WhatsApp Messaging Helper Function ---
  const sendMessage = async (mobileNumber, messageText, studentId, classId) => {
    try {
      const { error } = await supabase.from("messages").insert({
        number: mobileNumber,
        text: messageText,
        student_id: studentId,
        class_id: classId,
      });
      if (error) {
        console.error("Error sending message:", error);
      }
    } catch (e) {
      console.error("An exception occurred while sending message:", e);
    }
  };

  useEffect(() => {
    const fetchUserDataAndComplaints = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        fetchUserComplaints(user.id);
      } else {
        console.log("No user logged in.");
      }
    };
    fetchUserDataAndComplaints();
  }, []);

  const fetchUserComplaints = async (userId) => {
    const { data, error } = await supabase
      .from("complaints")
      .select(`
        id, title, complaint_text, status, resolution_notes, created_at, student_id,
        students!left(name, mobilenumber, class_id),
        assigned_to:profiles!assigned_to_user_id(id, name, is_active),
        against_user:profiles!against_user_id(id, name, is_active)
      `)
      .or(`assigned_to_user_id.eq.${userId},against_user_id.eq.${userId}`)
      .order("created_at", { ascending: false }); // Show newest first

    if (error) {
      console.error("Error fetching user complaints:", error);
    } else {
      setComplaints((data || []).filter(hasNoBlockedStaff));
    }
  };

  // --- Complaint update function ---
  const handleUpdateComplaint = async () => {
    if (!editingComplaint || editingComplaint.assigned_to.id !== user.id) {
      alert("You do not have permission to edit this complaint.");
      return;
    }

    startTransition(async () => {
      const { error } = await supabase
        .from("complaints")
        .update({ status: newStatus, resolution_notes: resolutionNotes })
        .eq("id", editingComplaint.id);

      if (error) {
        alert("Error updating complaint: " + error.message);
        return;
      }

      if (
        editingComplaint.status !== newStatus &&
        (newStatus === "Resolved" || newStatus === "Closed")
      ) {
        const student = editingComplaint.students;
        if (student && student.mobilenumber) {
          const studentCloseMsg = `*Complaint ${newStatus}* ✅\n\nDear Parent,\nYour complaint "*${
            editingComplaint.title
          }*" has been marked as *${newStatus}*.\n\n*Resolution Notes:*\n${
            resolutionNotes || "No additional notes."
          }`;
          await sendMessage(
            student.mobilenumber,
            studentCloseMsg,
            student.student_id,
            student.class_id
          );

          const adminCloseMsg = `*Complaint Resolved by Staff* 👨‍🏫\n\n*Complaint:* ${
            editingComplaint.title
          }\n*Student:* ${student.name}\n*Resolved By:* ${
            staffName([editingComplaint.assigned_to, editingComplaint.against_user].find(
              profile => profile?.id === user.id
            ))
          }\n*New Status:* ${newStatus}\n*Notes:* ${
            resolutionNotes || "N/A"
          }`;
          await sendMessage(
            "923085333392",
            adminCloseMsg,
            student.student_id,
            student.class_id
          );
        }
      }

      fetchUserComplaints(user.id);
      setEditingComplaint(null);
    });
  };

  const openModal = (complaint) => {
    setEditingComplaint(complaint);
    setResolutionNotes(complaint.resolution_notes || "");
    setNewStatus(complaint.status || "New");
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 6);
  };

  const stats = useMemo(
    () => ({
      total: complaints.length,
      assignedToMe: complaints.filter((c) => c.assigned_to?.id === user?.id)
        .length,
      againstMe: complaints.filter((c) => c.against_user?.id === user?.id)
        .length,
      needsAction: complaints.filter(
        (c) =>
          c.assigned_to?.id === user?.id &&
          c.status !== "Resolved" &&
          c.status !== "Closed"
      ).length,
    }),
    [complaints, user]
  );

  const getStatusBadgeStyles = (status) => {
    switch (status) {
      case "Resolved":
        return "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300 border-green-200 dark:border-green-500/30";
      case "Closed":
        return "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-white border-gray-200 dark:border-gray-500/30";
      case "New":
        return "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border-red-200 dark:border-red-500/30";
      default:
        return "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200 dark:border-blue-500/30";
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    // MASTER CONTAINER
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 dark:from-[#0b1220] dark:to-[#05070c] text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="container mx-auto max-w-7xl p-4 md:p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex flex-col space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage complaints assigned to you and view reports involving you.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Inbox
              </CardTitle>
              <Inbox className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.total}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400">
                Assigned To Me
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.assignedToMe}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400">
                Reports Against Me
              </CardTitle>
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.againstMe}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400">
                Pending Action
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.needsAction}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* COMPLAINTS GRID */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              Complaint Inbox
            </h2>
            <Badge variant="outline" className="text-gray-500">
              Showing {Math.min(visibleCount, complaints.length)} of{" "}
              {complaints.length}
            </Badge>
          </div>

          {complaints.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-white/5 rounded-xl border border-dashed border-gray-300 dark:border-white/10">
              <p className="text-gray-500 dark:text-gray-400">
                No complaints found.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {complaints.slice(0, visibleCount).map((c) => {
                const isAssignedToMe = c.assigned_to?.id === user?.id;
                return (
                  <Card
                    key={c.id}
                    className="flex flex-col bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 hover:shadow-md transition-all duration-200 group"
                  >
                    {/* Card Header: Status & Title */}
                    <CardHeader className="p-5 pb-3 space-y-3">
                      <div className="flex justify-between items-start">
                        <Badge
                          variant="outline"
                          className={`font-medium shadow-none px-2 py-0.5 rounded-md ${getStatusBadgeStyles(
                            c.status
                          )}`}
                        >
                          {c.status}
                        </Badge>
                        <div className="flex items-center text-xs text-gray-400 dark:text-gray-500">
                          <Calendar className="w-3 h-3 mr-1" />
                          {formatDate(c.created_at)}
                        </div>
                      </div>
                      <CardTitle className="text-base font-bold leading-tight text-gray-900 dark:text-white line-clamp-1">
                        {c.title}
                      </CardTitle>
                    </CardHeader>

                    {/* Card Content: Details */}
                    <CardContent className="p-5 pt-0 flex-grow">
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 h-[40px]">
                        {c.complaint_text}
                      </p>

                      <div className="flex flex-col gap-2 pt-4 border-t border-gray-100 dark:border-white/5">
                        {/* Student Detail */}
                        <div className="flex items-center text-sm font-medium text-gray-700 dark:text-white">
                          <User className="w-4 h-4 mr-2 text-gray-400" />
                          <span className="text-gray-500 dark:text-gray-400 mr-1 font-normal">Student:</span> 
                          {c.students?.name ?? "Unknown Student"}
                        </div>
                        
                        {/* Against User Detail */}
                        <div className="flex items-center text-sm font-medium text-gray-700 dark:text-white">
                          <ShieldAlert className="w-4 h-4 mr-2 text-amber-500" />
                          <span className="text-gray-500 dark:text-gray-400 mr-1 font-normal">Against:</span> 
                          {c.against_user ? staffName(c.against_user) : "N/A"}
                        </div>
                      </div>
                    </CardContent>

                    {/* Card Footer: Role & Action */}
                    <CardFooter className="p-4 bg-gray-50/50 dark:bg-white/10 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
                      {isAssignedToMe ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wide">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Assigned To You
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Involved
                        </div>
                      )}

                      <Button
                        size="sm"
                        onClick={() => openModal(c)}
                        variant={isAssignedToMe ? "default" : "secondary"}
                        className={
                          isAssignedToMe
                            ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-8"
                            : "bg-white dark:bg-white/10 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/10 hover:bg-gray-100 h-8"
                        }
                      >
                        {isAssignedToMe ? (
                          <>
                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Manage
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5 mr-1.5" /> Details
                          </>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Load More Button */}
          {visibleCount < complaints.length && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                className="bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-white/10 min-w-[150px]"
              >
                <ChevronDown className="mr-2 h-4 w-4" />
                Show More
              </Button>
            </div>
          )}
        </div>

        {/* Dialog / Modal - UPDATED TO HIDE DETAILS */}
        <Dialog
          open={!!editingComplaint}
          onOpenChange={() => setEditingComplaint(null)}
        >
          <DialogContent className="bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 text-gray-900 dark:text-gray-100 sm:max-w-[500px] p-0 overflow-hidden gap-0 shadow-2xl">
            <DialogHeader className="p-6 border-b border-gray-100 dark:border-white/5">
              <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingComplaint?.assigned_to?.id === user?.id
                  ? "Update Complaint"
                  : "View Complaint Status"}
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Update status and add resolution notes below.
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-5">
              {/* Form Controls - Details box removed */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="status"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Status
                  </Label>
                  <Select
                    value={newStatus}
                    onValueChange={setNewStatus}
                    disabled={editingComplaint?.assigned_to?.id !== user?.id}
                  >
                    <SelectTrigger
                      id="status"
                      className="w-full bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/50"
                    >
                      <SelectValue placeholder="Set status" />
                    </SelectTrigger>

                    <SelectContent className="bg-white dark:bg-[#0f172a] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white z-[9999]">
                      {complaintStatuses.map((s) => (
                        <SelectItem
                          key={s}
                          value={s}
                          className="cursor-pointer focus:bg-gray-100 dark:focus:bg-white/10 focus:text-gray-900 dark:focus:text-white"
                        >
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="notes"
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Resolution Notes
                  </Label>
                  <textarea
                    id="notes"
                    placeholder="Add internal notes or resolution details here..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    rows={4}
                    className="flex min-h-[100px] w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                    readOnly={editingComplaint?.assigned_to?.id !== user?.id}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="p-6 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex justify-end gap-3">
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  className="text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                >
                  Cancel
                </Button>
              </DialogClose>
              {editingComplaint?.assigned_to?.id === user?.id && (
                <Button
                  onClick={handleUpdateComplaint}
                  disabled={isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isPending && (
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
