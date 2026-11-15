"use client"

import { useEffect, useState } from "react"
import { supabase } from "../utils/supabaseClient"
import { canAccessClass, getClassAccess } from "../utils/classAccess"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { format } from "date-fns"
import { Badge } from "../components/ui/badge"
import { Loader2, CheckCircle2, Trash2 } from "lucide-react"

export default function MessagesAdmin() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState("false") // default: unsent
  const [classFilter, setClassFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("")

  useEffect(() => {
    fetchMessages()
  }, [statusFilter, classFilter, dateFilter])

  async function fetchMessages() {
    setLoading(true)
    const access = await getClassAccess()
    if (access.role === "teacher" && !access.classIds?.length) {
      setMessages([])
      setLoading(false)
      return
    }
    let query = supabase
      .from("messages")
      .select("*, classes:class_id(name)")
      .order("created_at", { ascending: false })
    if (access.role === "teacher") query = query.in("class_id", access.classIds || [])

    if (statusFilter === "false") {
      query = query.eq("sent", false)
    } else if (statusFilter === "true") {
      query = query.eq("sent", true)
    }

    if (classFilter !== "all") {
      query = query.eq("class_id", classFilter)
    }

    if (dateFilter) {
      query = query.gte("created_at", dateFilter)
    }

    const { data, error } = await query
    if (!error && data) {
      const grouped = {}
      data.forEach((msg) => {
        const key = msg.text + "_" + msg.class_id
        if (!grouped[key]) {
          grouped[key] = { ...msg, duplicateCount: 1 }
        } else {
          grouped[key].duplicateCount = (grouped[key].duplicateCount || 1) + 1
        }
      })
      setMessages(Object.values(grouped))
    }
    setLoading(false)
  }

  async function markAsSent(id) {
    const message = messages.find(item => item.id === id)
    if (!message || !canAccessClass(await getClassAccess(), message.class_id)) return
    await supabase.from("messages").update({ sent: true }).eq("id", id).eq("class_id", message.class_id)
    fetchMessages()
  }

  async function deleteMessage(id) {
    const message = messages.find(item => item.id === id)
    if (!message || !canAccessClass(await getClassAccess(), message.class_id)) return
    await supabase.from("messages").delete().eq("id", id).eq("class_id", message.class_id)
    fetchMessages()
  }

  return (
    <div className="p-6 space-y-6">
      <Card className="shadow-2xl border border-purple-300">
        <CardHeader className="flex justify-between items-center">
          <CardTitle className="text-2xl font-bold text-purple-700 flex items-center gap-2">
            🚀 Messages Admin
          </CardTitle>
          <div className="flex gap-3 items-center">
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Unsent</SelectItem>
                <SelectItem value="true">Sent</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>

            {/* Class Filter */}
            <Input
              placeholder="Class ID"
              className="w-[100px]"
              value={classFilter === "all" ? "" : classFilter}
              onChange={(e) => setClassFilter(e.target.value || "all")}
            />

            {/* Date Filter */}
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="animate-spin w-6 h-6 text-purple-500" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-gray-500">No messages found 🚫</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {messages.map((msg) => (
                <Card
                  key={msg.id}
                  className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border shadow-lg hover:shadow-2xl transition"
                >
                  <div className="flex justify-between items-start">
                    <h2 className="font-semibold text-lg">{msg.text}</h2>
                    <Badge variant={msg.sent ? "default" : "secondary"}>
                      {msg.sent ? "Sent ✅" : "Pending ⏳"}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Class: <span className="font-medium">{msg.classes?.name || msg.class_id}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Created: {format(new Date(msg.created_at), "PPP p")}
                  </p>
                  {msg.duplicateCount > 1 && (
                    <p className="text-xs mt-1 text-red-600">
                      ⚠️ Duplicate notices: {msg.duplicateCount}
                    </p>
                  )}

                  <div className="flex gap-3 mt-4">
                    {!msg.sent && (
                      <Button
                        size="sm"
                        onClick={() => markAsSent(msg.id)}
                        className="bg-green-500 hover:bg-green-600"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Sent
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMessage(msg.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
