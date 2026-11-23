"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import Navbar from "../../../../components/Navbar";
import Loader from "../../../../components/Loader";
import { Input } from "../../../../components/ui/input";
import { Button } from "../../../../components/ui/button";
import { Label } from "../../../../components/ui/label";

import {
  Plus, Trash2, ArrowLeft, Save,
  GraduationCap, Users, FileText, BadgeCheck,
  MessageSquare, Pencil, Check, X
} from "lucide-react";

import { getPakistanDate } from "../../../../utils/constants";
import { insertInquiry } from "../../../../utils/inquiryService";
import { printFeeQuote } from "../../../../utils/printUtils";
import { useToast } from "../../../../hooks/use-toast";
import { supabase } from "../../../../utils/supabaseClient";
import { admissionInquiryMessage } from '../../../../utils/messageTemplates';
import { cleanMessageText } from '../../../../utils/parentMessages';

// ─── Default fee values ───────────────────────────────────────────────────────
const DEFAULT_FEE = { admission: 8000, monthly: 5000, annual: 5000, stationery: 5000 };

function makeFeeJson(feeObj) {
  return JSON.stringify(feeObj);
}

function blankStudent(shared = {}) {
  return {
    name: "",
    class: "PG",
    quoted_fee: { ...DEFAULT_FEE },
    previous_school: shared.previous_school || "",
    address: shared.address || "",
    session: shared.session || "Fall",
    year: shared.year || getPakistanDate().getFullYear(),
  };
}

export default function AddInquiryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [sharedForm, setSharedForm] = useState({
    fathername: "",
    mobilenumber: "",
    address: "",
    date: format(getPakistanDate(), "yyyy-MM-dd"),
    session: "Fall",
    year: getPakistanDate().getFullYear(),
  });

  const [siblings, setSiblings] = useState([blankStudent()]);

  // ── Message state ──
  const [messageText, setMessageText] = useState("");
  const [editingMessage, setEditingMessage] = useState(false);
  const [messageCustomised, setMessageCustomised] = useState(false);

  const getPreviewMessage = () => {
    if (messageCustomised) return messageText;
    return admissionInquiryMessage(siblings.map(s => s.name));
  };

  const handleOpenMessageEditor = () => {
    if (!messageCustomised) {
      setMessageText(admissionInquiryMessage(siblings.map(s => s.name)));
    }
    setEditingMessage(true);
  };

  const handleResetMessage = () => {
    setMessageText(admissionInquiryMessage(siblings.map(s => s.name)));
    setMessageCustomised(false);
    setEditingMessage(false);
  };

  // ── Sibling helpers ──
  const updateSibling = (idx, field, val) => {
    setSiblings(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  };

  const updateSiblingFeeField = (idx, field, val) => {
    setSiblings(prev => prev.map((s, i) => i === idx ? { ...s, quoted_fee: { ...s.quoted_fee, [field]: val } } : s));
  };

  const addSibling = () => setSiblings(prev => [...prev, blankStudent(sharedForm)]);
  const removeSibling = (idx) => setSiblings(prev => prev.filter((_, i) => i !== idx));

  // ── Submit ──
  const handleSubmit = async () => {
    if (!sharedForm.fathername.trim() || !sharedForm.mobilenumber.trim()) {
      toast({ title: "Please fill in Father's Name and WhatsApp Contact.", variant: "destructive" });
      return;
    }
    if (siblings.some(s => !s.name.trim())) {
      toast({ title: "Please fill in all student names.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const inserted = [];

    for (const sib of siblings) {
      const payload = {
        ...sharedForm,
        name: sib.name.trim(),
        class: sib.class,
        previous_school: sib.previous_school,
        address: sib.address || sharedForm.address,
        quoted_fee: makeFeeJson(sib.quoted_fee),
        status: "Inquiry",
        follow_up_count: 0,
      };
      try {
        const rec = await insertInquiry(payload);
        inserted.push({ ...rec, quoted_fee: sib.quoted_fee });
      } catch (e) {
        console.error("Error saving sibling:", e);
        toast({ title: `Failed to save ${sib.name}`, variant: "destructive" });
      }
    }

    if (inserted.length > 0) {
      printFeeQuote(inserted.map(r => ({
        ...r,
        fathername: sharedForm.fathername,
        mobilenumber: sharedForm.mobilenumber,
        address: sharedForm.address,
      })));

      // ── Insert ONE message per family ──
      const defaultMessage = admissionInquiryMessage(siblings.map(s => s.name));
      const finalMessage = messageCustomised ? cleanMessageText(messageText) || defaultMessage : defaultMessage;

      const { error: msgError } = await supabase
        .from("messages")
        .insert([{
          text: finalMessage,
          number: sharedForm.mobilenumber,
          sent: false,
        }]);

      if (msgError) {
        console.error("Message insert error:", msgError);
        toast({ title: "Inquiry saved, but message queuing failed.", variant: "destructive" });
      } else {
        toast({ title: `${inserted.length} record(s) saved & message queued! 🎉` });
      }
    }

    setSubmitting(false);
    router.push("/admin/inquiries");
  };

  // ─── Glassmorphic Styles ───────────────────────────────────────────────────
  const glassCardClass =
    "relative overflow-hidden rounded-2xl border border-white/20 bg-white/40 dark:bg-black/40 backdrop-blur-xl shadow-xl p-6 transition-all hover:border-white/30";
  const glassInputClass =
    "bg-white/50 dark:bg-white/5 border-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 placeholder:text-gray-500/70";

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-[#0b1220] dark:via-[#1a1c2e] dark:to-[#0f0718] p-4 md:p-8 transition-colors duration-500">
        <div className="max-w-5xl mx-auto">

          {/* HEADER */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => router.push("/admin/inquiries")}
                className="rounded-full h-10 w-10 bg-white/30 backdrop-blur border-white/20 hover:bg-white/50"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white drop-shadow-sm">
                  New Application
                </h1>
                <p className="text-gray-600 dark:text-slate-400 text-sm font-medium">
                  Register one or more siblings in a single submission
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">

            {/* 1. GUARDIAN / FAMILY DETAILS CARD */}
            <div className={glassCardClass}>
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <Users className="w-24 h-24" />
              </div>

              <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-gray-800 dark:text-white">
                <BadgeCheck className="w-6 h-6 text-blue-600 dark:text-white" />
                Guardian / Family Details
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">
                    Father's Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    className={glassInputClass}
                    placeholder="Guardian Name"
                    value={sharedForm.fathername}
                    onChange={e => setSharedForm({ ...sharedForm, fathername: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">
                    WhatsApp Contact <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    className={`font-mono ${glassInputClass}`}
                    placeholder="92300xxxxxxx"
                    value={sharedForm.mobilenumber}
                    onChange={e => setSharedForm({ ...sharedForm, mobilenumber: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Address</Label>
                  <Input
                    className={glassInputClass}
                    placeholder="Home address"
                    value={sharedForm.address}
                    onChange={e => setSharedForm({ ...sharedForm, address: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Date</Label>
                  <Input
                    type="date"
                    className={glassInputClass}
                    value={sharedForm.date}
                    onChange={e => setSharedForm({ ...sharedForm, date: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Session</Label>
                  <select
                    className={`flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${glassInputClass}`}
                    value={sharedForm.session}
                    onChange={e => setSharedForm({ ...sharedForm, session: e.target.value })}
                  >
                    <option value="Fall" className="dark:bg-slate-800">Fall</option>
                    <option value="Spring" className="dark:bg-slate-800">Spring</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 text-gray-700 dark:text-gray-300">Year</Label>
                  <Input
                    type="number"
                    className={glassInputClass}
                    value={sharedForm.year}
                    onChange={e => setSharedForm({ ...sharedForm, year: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            {/* 2. STUDENTS CARD */}
            <div className={glassCardClass}>
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <GraduationCap className="w-24 h-24" />
              </div>

              <div className="flex items-center justify-between mb-6 relative z-10">
                <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-white">
                  <GraduationCap className="w-6 h-6 text-purple-600 dark:text-white" />
                  Students ({siblings.length})
                </h2>
                <Button
                  onClick={addSibling}
                  variant="outline"
                  className="bg-white/30 backdrop-blur hover:bg-white/50 border border-white/20 text-blue-700 dark:text-blue-300"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Sibling
                </Button>
              </div>

              <div className="space-y-5 relative z-10">
                {siblings.map((sib, idx) => {
                  const totalFee =
                    (Number(sib.quoted_fee.admission) || 0) +
                    (Number(sib.quoted_fee.monthly) || 0) +
                    (Number(sib.quoted_fee.annual) || 0) +
                    (Number(sib.quoted_fee.stationery) || 0);

                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/20 bg-white/30 dark:bg-white/5 backdrop-blur-md p-5 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-widest">
                          <GraduationCap className="w-4 h-4" />
                          Student {idx + 1}
                        </span>
                        {siblings.length > 1 && (
                          <button
                            onClick={() => removeSibling(idx)}
                            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-semibold px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5 sm:col-span-1">
                          <Label className="ml-1 text-gray-700 dark:text-gray-300">
                            Student Full Name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            className={glassInputClass}
                            placeholder="Student Full Name"
                            value={sib.name}
                            onChange={e => updateSibling(idx, "name", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="ml-1 text-gray-700 dark:text-gray-300">Class</Label>
                          <Input
                            className={glassInputClass}
                            placeholder="e.g. PG"
                            value={sib.class}
                            onChange={e => updateSibling(idx, "class", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="ml-1 text-gray-700 dark:text-gray-300">Previous School</Label>
                          <Input
                            className={glassInputClass}
                            placeholder="Previous School"
                            value={sib.previous_school}
                            onChange={e => updateSibling(idx, "previous_school", e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-blue-300/50 bg-blue-50/40 dark:bg-white/20 backdrop-blur-md overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-blue-200/30 dark:border-white/10">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-orange-500/20 text-orange-600">
                              <FileText className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-bold text-gray-800 dark:text-white">Fee Breakdown</span>
                          </div>
                          <span className="text-sm font-black text-blue-700 dark:text-blue-300">
                            PKR {totalFee.toLocaleString()}
                          </span>
                        </div>

                        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {[
                            { key: "admission", label: "Admission Fee" },
                            { key: "monthly", label: "Monthly Fee" },
                            { key: "annual", label: "Annual Charges" },
                            { key: "stationery", label: "Stationery/Books" },
                          ].map(({ key, label }) => (
                            <div key={key} className="space-y-1">
                              <Label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{label}</Label>
                              <Input
                                type="number"
                                placeholder="0"
                                value={sib.quoted_fee[key]}
                                onChange={e => updateSiblingFeeField(idx, key, e.target.value)}
                                className={glassInputClass}
                              />
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between items-end gap-4 bg-white/30 dark:bg-black/20 px-5 py-4 border-t border-white/20">
                          <p className="text-xs text-gray-600 dark:text-gray-400 italic max-w-xs">
                            Total = Admission + Monthly + Annual + Stationery
                          </p>
                          <div className="text-right">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Quoted Total</p>
                            <p className="text-3xl font-black text-gray-900 dark:text-white leading-none drop-shadow-sm">
                              <span className="text-sm font-normal text-gray-500 mr-1">PKR</span>
                              {totalFee.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. WHATSAPP MESSAGE CARD */}
            <div className={`${glassCardClass} border-green-300/40 bg-green-50/30 dark:bg-green-900/10`}>
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <MessageSquare className="w-24 h-24" />
              </div>

              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-green-500/20 text-green-600 dark:text-green-400 shadow-sm">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                      Parent Notification Message
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  Customize message from customize button  
                  </p>
                  </div>
                </div>

                {!editingMessage ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleOpenMessageEditor}
                    className="bg-white/30 backdrop-blur hover:bg-white/50 border border-white/20 text-green-700 dark:text-green-300 gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Message
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => { setMessageCustomised(true); setEditingMessage(false); }}
                      className="bg-green-600/90 hover:bg-green-700 text-white gap-1"
                    >
                      <Check className="w-4 h-4" /> Done
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleResetMessage}
                      className="hover:bg-white/20 gap-1 text-gray-500"
                    >
                      <X className="w-4 h-4" /> Reset
                    </Button>
                  </div>
                )}
              </div>

              <div className="relative z-10 space-y-3 pt-4 border-t border-green-200/30 dark:border-white/10">
                {/* Recipient row */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">To:</span>
                  <span className="font-mono bg-white/50 dark:bg-white/10 px-2 py-0.5 rounded-md border border-white/20 text-gray-800 dark:text-gray-200">
                    {sharedForm.mobilenumber || "—"}
                  </span>
                  <span className="text-gray-400">
                    ({sharedForm.fathername || "Guardian"})
                  </span>
                  {messageCustomised && (
                    <span className="ml-auto text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-900/20 px-2 py-0.5 rounded-full border border-amber-300/30">
                      ✏️ Custom
                    </span>
                  )}
                </div>

                {/* Message textarea or read-only preview */}
                {editingMessage ? (
                  <textarea
                    rows={11}
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    className={`w-full rounded-xl px-4 py-3 text-sm font-mono resize-y leading-relaxed ${glassInputClass}`}
                  />
                ) : (
                  <div
                    onClick={handleOpenMessageEditor}
                    title="Click to edit"
                    className="w-full rounded-xl px-4 py-3 text-sm font-mono leading-relaxed whitespace-pre-wrap bg-white/30 dark:bg-white/5 border border-white/20 text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-white/40 transition-colors min-h-[180px]"
                  >
                    {getPreviewMessage()}
                  </div>
                )}

                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                  No fee details or address will be included. Message is saved with{" "}
                  <code className="bg-white/20 dark:bg-white/10 px-1 rounded">sent = false</code> and can be dispatched from your messages panel.
                </p>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex justify-end gap-4 pt-4 pb-12">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push("/admin/inquiries")}
                className="hover:bg-white/20"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-blue-500/30 transition-all rounded-lg px-8 h-12"
              >
                {submitting ? (
                  <Loader small />
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    Save {siblings.length > 1 ? `${siblings.length} Students` : "Record"} & Queue Message
                  </>
                )}
              </Button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
