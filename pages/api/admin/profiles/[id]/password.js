import { createClient } from "@supabase/supabase-js"

const isInvalidApiKeyError = error => error?.message?.toLowerCase().includes("invalid api key")

const invalidSecretKeyMessage = "Supabase rejected SUPABASE_SECRET_KEY. Verify that it is an active secret key for the project URL configured on this server."

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ error: "Method not allowed" })
  }

  const profileId = req.query.id
  const password = req.body?.password
  if (typeof profileId !== "string" || !profileId || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "A profile ID and password of at least 8 characters are required" })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !publishableKey || !secretKey) {
    console.error("Password update is missing Supabase server configuration")
    return res.status(500).json({ error: "Password updates are not configured on the server" })
  }

  const authorization = req.headers.authorization
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : ""
  if (!accessToken) {
    return res.status(401).json({ error: "Authentication is required" })
  }

  try {
    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)
    if (authError || !user) {
      return res.status(401).json({ error: "Your session is invalid or expired" })
    }

    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle()

    if (callerProfileError) {
      console.error("Failed to verify password update permissions:", callerProfileError)
      return res.status(500).json({
        error: isInvalidApiKeyError(callerProfileError)
          ? invalidSecretKeyMessage
          : "Could not verify administrator permissions"
      })
    }
    if (callerProfile?.role !== "superadmin" || callerProfile.is_active === false) {
      return res.status(403).json({ error: "Only active superadmins can change profile passwords" })
    }

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .maybeSingle()

    if (targetProfileError) {
      console.error("Failed to find profile for password update:", targetProfileError)
      return res.status(500).json({
        error: isInvalidApiKeyError(targetProfileError)
          ? invalidSecretKeyMessage
          : "Could not find the requested profile"
      })
    }
    if (!targetProfile) {
      return res.status(404).json({ error: "Profile not found" })
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(profileId, { password })
    if (updateError) {
      return res.status(isInvalidApiKeyError(updateError) ? 500 : 400).json({
        error: isInvalidApiKeyError(updateError) ? invalidSecretKeyMessage : updateError.message
      })
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error("Unexpected error changing profile password:", error)
    return res.status(500).json({ error: "An unexpected error occurred while changing the password" })
  }
}
