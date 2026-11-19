"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../utils/supabaseClient"
import Navbar from "../../components/Navbar"
import Loader from "../../components/Loader"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import {
  Plus, Edit, Trash2, Filter, Search, Shield, ShieldAlert,
  CheckCircle2, XCircle, UserX, UserCheck, EyeOff, Eye,
  Mail, Phone, Ban, UserCog
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useToast } from "../../hooks/use-toast"
import { timetableRows } from "../../utils/timetable.mjs"

export default function ProfilesPage() {
  const { toast } = useToast()
  const router = useRouter()

  const [profiles, setProfiles] = useState([])
  const [allProfiles, setAllProfiles] = useState([])
  const [availableClasses, setAvailableClasses] = useState([])
  const [timetableClasses, setTimetableClasses] = useState([])
  
  // Filters
  const [filterRoles, setFilterRoles] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [showBlocked, setShowBlocked] = useState(false) 

  // Bulk Actions
  const [selectedProfiles, setSelectedProfiles] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [targetRole, setTargetRole] = useState("")
  const [bulkRoleLoading, setBulkRoleLoading] = useState(false)

  // Loading States
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)

  // Edit Modal State
  const [editingProfile, setEditingProfile] = useState(null)
  const [editForm, setEditForm] = useState({ name: "", mobilenumber: "", role: "", selectedClasses: [] })
  const [saveLoading, setSaveLoading] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const roles = ["teacher", "admin", "superadmin"]

  useEffect(() => {
    fetchProfiles()
    fetchClasses()
  }, [])

  const fetchProfiles = async () => {
    setLoading(true)
    const { data, error } = await supabase.from("profiles").select("*").order('name', { ascending: true })
    if (error) {
      toast({ title: "Failed to fetch profiles", variant: "destructive" })
    } else {
      setAllProfiles(data || [])
    }
    setLoading(false)
  }

  const fetchClasses = async () => {
    const { data, error } = await supabase.from("classes").select("id, name").order('name')
    if (!error && data) {
      setAvailableClasses(data)
    }
  }

  // Filtering Logic
  useEffect(() => {
    let filtered = [...allProfiles]

    if (showBlocked) {
      filtered = filtered.filter(p => p.is_active === false)
    } else {
      filtered = filtered.filter(p => p.is_active !== false)
    }

    if (filterRoles.length > 0) {
      filtered = filtered.filter(p => filterRoles.includes(p.role))
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) || 
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.mobilenumber && String(p.mobilenumber).includes(q))
      )
    }

    setProfiles(filtered)
  }, [filterRoles, searchQuery, allProfiles, showBlocked])

  // Single Actions
  const handleToggleActive = async (id, currentStatus) => {
    const newStatus = !currentStatus
    const actionWord = newStatus ? "Unblock" : "Block"
    if (!window.confirm(`Are you sure you want to ${actionWord.toLowerCase()} this user?`)) return
    
    setActionLoading(id)
    const { error } = await supabase.from("profiles").update({ is_active: newStatus }).eq("id", id)
    
    if (error) {
      toast({ title: `Failed to ${actionWord.toLowerCase()} user`, variant: "destructive" })
    } else {
      setAllProfiles(prev => prev.map(p => p.id === id ? { ...p, is_active: newStatus } : p))
      toast({ title: `User ${newStatus ? 'reactivated ✅' : 'blocked 🚫'}` })
    }
    setActionLoading(null)
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure? This will permanently delete the profile.")) return
    setActionLoading(id)
    const { error } = await supabase.from("profiles").delete().eq("id", id)
    if (error) {
      toast({ title: "Failed to delete profile", variant: "destructive" })
    } else {
      setAllProfiles(prev => prev.filter(p => p.id !== id))
      toast({ title: "Profile deleted 🗑️" })
    }
    setActionLoading(null)
  }

  // Edit Modal Handlers
  const openEditModal = async (profile) => {
    setTimetableClasses([])
    setEditingProfile(profile.id)
    setNewPassword("")
    setConfirmPassword("")
    setShowNewPassword(false)
    setEditForm({ 
      name: profile.name || "", 
      mobilenumber: profile.mobilenumber || "", 
      role: profile.role || "teacher",
      selectedClasses: []
    })
    
    setModalLoading(true)
    
    // Fetch currently assigned classes using new schema fields
    if (profile.role === 'teacher') {
      const { data: timetable } = await supabase.from('school_timetable').select('published').eq('id', 1).maybeSingle()
      setTimetableClasses([...new Set(timetableRows(timetable?.published).filter(row => row.teacherIds.includes(profile.id)).map(row => String(row.classId)))])
      const { data, error } = await supabase
        .from("teacher_class")
        .select("class") 
        .eq("teacher_profile", profile.id) 
        
      if (!error && data) {
        setEditForm(prev => ({
          ...prev,
          selectedClasses: data.map(d => d.class)
        }))
      }
    }
    setModalLoading(false)
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" })
      return
    }

    setPasswordLoading(true)
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session) throw new Error("Your session has expired. Please sign in again.")

      const response = await fetch(`/api/admin/profiles/${encodeURIComponent(editingProfile)}/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ password: newPassword })
      })
      const result = await response.json()

      if (!response.ok) throw new Error(result.error || "Failed to change password")

      toast({ title: "Password changed successfully" })
      setNewPassword("")
      setConfirmPassword("")
    } catch (error) {
      toast({
        title: "Failed to change password",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive"
      })
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaveLoading(true)
    
    try {
      // 1. Update the base profile data
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ name: editForm.name, mobilenumber: editForm.mobilenumber, role: editForm.role })
        .eq("id", editingProfile)

      if (profileError) throw profileError

      // 2. Handle Many-to-Many Classes relation
      if (editForm.role === 'teacher') {
        
        // Step A: ALWAYS clear existing relations first
        const { error: deleteError } = await supabase
          .from("teacher_class")
          .delete()
          .eq("teacher_profile", editingProfile)
          
        if (deleteError) throw deleteError

        // Step B: Insert the new selected classes (if any are checked)
        if (editForm.selectedClasses.length > 0) {
          const classInserts = editForm.selectedClasses.map(classId => ({
            teacher_profile: editingProfile,
            class: classId
          }))
          
          const { error: insertError } = await supabase
            .from("teacher_class")
            .insert(classInserts)
            
          if (insertError) throw insertError
        }
        
      } else {
        // If they are no longer a teacher, wipe their teaching classes to keep DB clean
        const { error: cleanupError } = await supabase
          .from("teacher_class")
          .delete()
          .eq("teacher_profile", editingProfile)
          
        if (cleanupError) throw cleanupError
      }

      // 3. Update local state
      setAllProfiles(prev => prev.map(p => p.id === editingProfile ? { 
        ...p, 
        name: editForm.name, 
        mobilenumber: editForm.mobilenumber, 
        role: editForm.role 
      } : p))
      
      toast({ title: "Profile and classes updated successfully ✨" })
      setEditingProfile(null)

    } catch (error) {
      console.error("Save Error:", error)
      toast({ 
        title: "Failed to save changes", 
        description: error.message || "A database error occurred.", 
        variant: "destructive" 
      })
    } finally {
      setSaveLoading(false)
    }
  }

  const handleClassToggle = (classId) => {
    setEditForm(prev => {
      const isSelected = prev.selectedClasses.includes(classId)
      return {
        ...prev,
        selectedClasses: isSelected 
          ? prev.selectedClasses.filter(id => id !== classId)
          : [...prev.selectedClasses, classId]
      }
    })
  }

  // Bulk Actions
  const handleBulkStatus = async (status) => {
    if (selectedProfiles.length === 0) return
    setBulkLoading(true)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: status })
        .in("id", selectedProfiles)
      if (error) throw error
      
      setAllProfiles(prev => prev.map(p =>
        selectedProfiles.includes(p.id) ? { ...p, is_active: status } : p
      ))
      toast({ title: `${selectedProfiles.length} users ${status ? "unblocked ✅" : "blocked 🚫"}` })
      setSelectedProfiles([])
    } catch (error) {
      toast({ title: "Bulk update failed", variant: "destructive" })
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkRoleUpdate = async () => {
    if (!targetRole || selectedProfiles.length === 0) return
    setBulkRoleLoading(true)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: targetRole })
        .in("id", selectedProfiles)
      if (error) throw error
      
      setAllProfiles(prev => prev.map(p =>
        selectedProfiles.includes(p.id) ? { ...p, role: targetRole } : p
      ))
      toast({ title: `Assigned ${targetRole} role to ${selectedProfiles.length} users 🛡️` })
      setSelectedProfiles([])
      setTargetRole("")
    } catch (error) {
      toast({ title: "Role update failed", variant: "destructive" })
    } finally {
      setBulkRoleLoading(false)
    }
  }

  const toggleRoleFilter = (role) => {
    setFilterRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])
  }

  const getRoleBadge = (role) => {
    switch(role) {
      case 'superadmin': return <span className="px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded text-xs font-bold uppercase flex items-center gap-1 w-max"><ShieldAlert className="w-3 h-3"/> Super Admin</span>
      case 'admin': return <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded text-xs font-bold uppercase flex items-center gap-1 w-max"><Shield className="w-3 h-3"/> Admin</span>
      default: return <span className="px-2 py-1 bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 rounded text-xs font-bold uppercase flex items-center gap-1 w-max"><UserCog className="w-3 h-3"/> Teacher</span>
    }
  }

  const blockedCount = allProfiles.filter(p => p.is_active === false).length

  return (
    <>
      <Navbar />

      <div className="min-h-screen transition-colors duration-300 bg-gradient-to-b from-gray-50 to-gray-200 dark:from-slate-900 dark:to-slate-950 text-gray-900 dark:text-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

          {/* --- HEADER ROW --- */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Staff Profiles</h1>
              <p className="text-gray-500 dark:text-slate-400 mt-1">
                Manage roles, access, and contact details.
                {showBlocked && (
                  <span className="ml-2 text-red-500 dark:text-red-400 font-medium">Viewing blocked users</span>
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative flex-grow sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-slate-500" />
                <Input
                  placeholder="Search name, email, or phone..."
                  className="pl-10 h-10 rounded-lg bg-white border-gray-200 text-gray-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <Button
                onClick={() => {
                  setShowBlocked(prev => !prev)
                  setSelectedProfiles([])
                }}
                variant="outline"
                className={`h-10 px-4 rounded-lg border transition-all gap-2 ${
                  showBlocked
                    ? "bg-red-50 border-red-300 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {showBlocked ? (
                  <><Eye className="w-4 h-4" /> Active Staff</>
                ) : (
                  <>
                    <Ban className="w-4 h-4" /> Blocked
                    {blockedCount > 0 && (
                      <span className="ml-1 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {blockedCount}
                      </span>
                    )}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* --- FILTERS --- */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
              <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 mr-2 shrink-0">
                <Filter className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Role</span>
              </div>

              <button
                onClick={() => setFilterRoles([])}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  filterRoles.length === 0
                    ? "bg-blue-600 text-white border-blue-600 shadow-md"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                All Roles
              </button>

              {roles.map(role => {
                const isActive = filterRoles.includes(role)
                return (
                  <button
                    key={role}
                    onClick={() => toggleRoleFilter(role)}
                    className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all border capitalize ${
                      isActive
                        ? "bg-blue-600 text-white border-blue-600 shadow-md"
                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {role}
                  </button>
                )
              })}
            </div>
          </div>

          {/* --- BULK ACTION BAR --- */}
          <AnimatePresence>
            {selectedProfiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div className="bg-blue-50/80 backdrop-blur-md border border-blue-200 dark:bg-blue-900/30 dark:border-blue-800/50 rounded-lg p-3 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-md">
                      {selectedProfiles.length} Selected
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 w-full md:w-auto md:flex-1 md:justify-end">
                    <div className="flex items-center gap-2">
                      {bulkLoading ? <Loader small /> : (
                        <>
                          {showBlocked ? (
                            <Button size="sm" onClick={() => handleBulkStatus(true)} className="bg-green-600 hover:bg-green-700 text-white border-none h-8">
                              <UserCheck className="w-3 h-3 mr-1.5" /> Unblock Users
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => handleBulkStatus(false)} className="bg-red-600 hover:bg-red-700 text-white border-none h-8">
                              <Ban className="w-3 h-3 mr-1.5" /> Block Users
                            </Button>
                          )}
                        </>
                      )}
                    </div>

                    {!showBlocked && (
                      <div className="flex items-center gap-2 md:pl-4 md:border-l md:border-blue-200 dark:md:border-blue-800/60">
                        <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <select
                          value={targetRole}
                          onChange={(e) => setTargetRole(e.target.value)}
                          className="h-8 text-black bg-white text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-200 capitalize"
                        >
                          <option value="">Change role...</option>
                          {roles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>

                        {targetRole && (
                          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                            <Button size="sm" onClick={handleBulkRoleUpdate} disabled={bulkRoleLoading} className="bg-blue-600 hover:bg-blue-700 text-white h-8">
                              {bulkRoleLoading ? <Loader small /> : "Apply"}
                            </Button>
                          </motion.div>
                        )}
                      </div>
                    )}

                    <Button size="sm" variant="ghost" onClick={() => { setSelectedProfiles([]); setTargetRole(""); }} className="text-gray-600 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200 h-8 ml-auto md:ml-0">
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* --- TABLE CONTAINER --- */}
          <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-xl shadow-sm dark:shadow-xl">
            {loading ? (
              <div className="p-12 flex justify-center"><Loader /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[900px]">
                  <thead className="text-xs uppercase font-semibold bg-gray-50 text-gray-500 border-b border-gray-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-800">
                    <tr>
                      <th className="py-4 pl-6 w-10">
                        <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-600 dark:bg-slate-700 dark:checked:bg-blue-600"
                          onChange={e => setSelectedProfiles(e.target.checked ? profiles.map(p => p.id) : [])}
                          checked={profiles.length > 0 && selectedProfiles.length === profiles.length}
                        />
                      </th>
                      <th className="py-4 px-3">Name</th>
                      <th className="py-4 px-3">Contact</th>
                      <th className="py-4 px-3">Role</th>
                      <th className="py-4 px-3">Status</th>
                      <th className="py-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800/50">
                    {profiles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-500 dark:text-slate-500 italic">
                          {showBlocked ? "No blocked users found." : "No profiles match your filters."}
                        </td>
                      </tr>
                    ) : (
                      profiles.map(p => (
                        <tr key={p.id} className={`group transition-colors ${
                          selectedProfiles.includes(p.id) ? "bg-blue-50 dark:bg-blue-900/20" : 
                          !p.is_active ? "bg-red-50/30 hover:bg-red-50/60 dark:bg-red-900/10 dark:hover:bg-red-900/20" : 
                          "hover:bg-gray-50 dark:hover:bg-slate-800/50"
                        }`}>
                          <td className="py-3 pl-6">
                            <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-600 dark:bg-slate-700 dark:checked:bg-blue-600"
                              checked={selectedProfiles.includes(p.id)}
                              onChange={e => setSelectedProfiles(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                            />
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-gray-900 dark:text-slate-200">
                              {p.name || <span className="text-gray-400 italic">Unnamed</span>}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-slate-500 font-mono mt-0.5 truncate w-32 md:w-auto" title={p.id}>
                              ID: {p.id.split('-')[0]}...
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center text-gray-600 dark:text-slate-400 text-sm mb-1">
                              <Mail className="w-3 h-3 mr-1.5 shrink-0" /> {p.email}
                            </div>
                            <div className="flex items-center text-gray-500 dark:text-slate-500 text-xs font-mono">
                              <Phone className="w-3 h-3 mr-1.5 shrink-0" /> {p.mobilenumber || "-"}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {getRoleBadge(p.role)}
                          </td>
                          <td className="py-3 px-3">
                            {p.is_active ? (
                              <span className="flex items-center text-green-600 dark:text-green-400 text-xs font-medium">
                                <CheckCircle2 className="w-4 h-4 mr-1" /> Active
                              </span>
                            ) : (
                              <span className="flex items-center text-red-500 dark:text-red-400 text-xs font-medium">
                                <Ban className="w-4 h-4 mr-1" /> Blocked
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-6 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="sm" variant="ghost" className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30" onClick={() => openEditModal(p)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className={`h-8 px-2 ${p.is_active ? "text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30" : "text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30"}`} onClick={() => handleToggleActive(p.id, p.is_active)} disabled={actionLoading === p.id}>
                                {actionLoading === p.id ? <Loader small /> : p.is_active ? <Ban className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30" onClick={() => handleDelete(p.id)} disabled={actionLoading === p.id}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- QUICK EDIT MODAL --- */}
      <AnimatePresence>
        {editingProfile && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Profile</h3>
                <button onClick={() => setEditingProfile(null)} className="text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-5 space-y-4 overflow-y-auto">
                {modalLoading ? (
                  <div className="flex justify-center py-8"><Loader /></div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
                      <Input 
                        value={editForm.name} 
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        placeholder="E.g. Jane Doe"
                        className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">Mobile Number</label>
                      <Input 
                        value={editForm.mobilenumber} 
                        onChange={e => setEditForm({...editForm, mobilenumber: e.target.value})}
                        placeholder="0300-0000000"
                        className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">Role</label>
                      <select 
                        value={editForm.role} 
                        onChange={e => setEditForm({...editForm, role: e.target.value})}
                        className="w-full h-10 px-3 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                      >
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    {/* Classes Selection */}
                    <AnimatePresence>
                      {editForm.role === 'teacher' && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }} 
                          animate={{ opacity: 1, height: 'auto' }} 
                          exit={{ opacity: 0, height: 0 }}
                          className="pt-2 border-t border-gray-100 dark:border-slate-800"
                        >
                          <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                            Special class assignments (in addition to published timetable)
                          </label>
                          <p className="mb-3 text-sm text-gray-500">From published timetable: {timetableClasses.map(id => availableClasses.find(c => String(c.id) === id)?.name || id).join(', ') || 'None'}. Change those assignments in Timetable; the checkboxes below grant extra access.</p>
                          <div className="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-lg border border-gray-200 dark:border-slate-700 max-h-48 overflow-y-auto">
                            {availableClasses.length === 0 ? (
                              <p className="text-sm text-gray-500 dark:text-slate-400 italic">No classes available.</p>
                            ) : (
                              <div className="grid grid-cols-2 gap-3">
                                {availableClasses.map(cls => (
                                  <label key={cls.id} className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                      type="checkbox"
                                      checked={editForm.selectedClasses.includes(cls.id)}
                                      onChange={() => handleClassToggle(cls.id)}
                                      className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 dark:bg-slate-700 dark:checked:bg-blue-600 cursor-pointer"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors truncate">
                                      {cls.name}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="pt-4 border-t border-gray-100 dark:border-slate-800 space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">New Password</label>
                        <div className="relative">
                          <Input
                            type={showNewPassword ? "text" : "password"}
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="At least 8 characters"
                            className="pr-10 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(prev => !prev)}
                            aria-label={showNewPassword ? "Hide password" : "Show password"}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
                          >
                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">Confirm Password</label>
                        <Input
                          type={showNewPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter the new password"
                          className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        This updates the account directly in Supabase Auth by profile ID. The email address does not need to be valid.
                      </p>
                      <Button
                        type="button"
                        onClick={handleChangePassword}
                        disabled={passwordLoading || modalLoading || !newPassword || !confirmPassword}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        {passwordLoading ? <Loader small /> : "Change Password"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
              
              <div className="p-5 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                <Button variant="outline" onClick={() => setEditingProfile(null)} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:hover:bg-slate-700">Cancel</Button>
                <Button onClick={handleSaveProfile} disabled={saveLoading || modalLoading} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[100px]">
                  {saveLoading ? <Loader small /> : "Save Changes"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
