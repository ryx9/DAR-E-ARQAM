import { supabase } from "./supabaseClient"

export type ClassAccess = {
  role: string | null
  classIds: (number | string)[] | null
}

export async function getClassAccess(): Promise<ClassAccess> {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return { role: null, classIds: [] }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profileError) throw profileError

  const role = profile?.role?.toLowerCase() || null
  if (role !== "teacher") return { role, classIds: null }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("teacher_class_access")
    .select("class")
    .eq("teacher_profile", user.id)
  if (assignmentsError) throw assignmentsError

  return { role, classIds: (assignments || []).map(assignment => assignment.class) }
}

export function canAccessClass(access: ClassAccess, classId: number | string | null | undefined): boolean {
  if (!access.role) return false
  if (access.role !== "teacher") return true
  return classId != null && (access.classIds || []).some(id => String(id) === String(classId))
}
