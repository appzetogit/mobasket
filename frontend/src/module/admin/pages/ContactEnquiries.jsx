import { useEffect, useState } from "react"
import { Search, Inbox, Loader2, Mail, Phone, Trash2, ChevronDown, ChevronUp, User } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

/*
 * Contact Us inbox (requirement 14).
 *
 * Enquiries and complaints sent from the app's Contact Us page. Admin reads
 * them, moves them through New -> In Progress -> Resolved and keeps a private
 * note. Separate from "User Feedback", which lists reviews.
 */

const STATUSES = ["New", "In Progress", "Resolved"]

const STATUS_STYLES = {
  New: "bg-blue-50 text-blue-700 border-blue-200",
  "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
  Resolved: "bg-green-50 text-green-700 border-green-200",
}

const formatDate = (d) => {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return String(d)
  }
}

export default function ContactEnquiries() {
  const [messages, setMessages] = useState([])
  const [counts, setCounts] = useState({ New: 0, "In Progress": 0, Resolved: 0 })
  const [status, setStatus] = useState("New") // "" means every status
  const [searchQuery, setSearchQuery] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [noteDrafts, setNoteDrafts] = useState({})
  const [busyId, setBusyId] = useState(null)
  const limit = 25

  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getContactEnquiries({
        status: status || undefined,
        search: appliedSearch || undefined,
        page,
        limit,
      })
      const data = res?.data?.data
      setMessages(Array.isArray(data?.messages) ? data.messages : [])
      setCounts(data?.counts || { New: 0, "In Progress": 0, Resolved: 0 })
      setTotal(data?.pagination?.total ?? 0)
      setPages(data?.pagination?.pages ?? 1)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load messages")
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page, status, appliedSearch])

  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch(searchQuery.trim())
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  const changeTab = (next) => {
    setStatus(next)
    setPage(1)
    setOpenId(null)
  }

  const setMessageStatus = async (msg, nextStatus) => {
    setBusyId(msg._id)
    try {
      await adminAPI.updateContactEnquiry(msg._id, { status: nextStatus })
      toast.success(`Marked ${nextStatus}`)
      // The message may leave the current tab, so reload the list and counts.
      await fetchData()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update the message")
    } finally {
      setBusyId(null)
    }
  }

  const saveNote = async (msg) => {
    const adminNote = noteDrafts[msg._id] ?? msg.adminNote ?? ""
    setBusyId(msg._id)
    try {
      const res = await adminAPI.updateContactEnquiry(msg._id, { adminNote })
      const saved = res?.data?.data?.message
      setMessages((list) =>
        list.map((m) => (m._id === msg._id ? { ...m, adminNote: saved?.adminNote ?? adminNote } : m)),
      )
      toast.success("Note saved")
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save the note")
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (msg) => {
    if (!window.confirm(`Delete the message from ${msg.name}? This can't be undone.`)) return
    setBusyId(msg._id)
    try {
      await adminAPI.deleteContactEnquiry(msg._id)
      toast.success("Message deleted")
      setOpenId(null)
      await fetchData()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not delete the message")
    } finally {
      setBusyId(null)
    }
  }

  const allCount = STATUSES.reduce((sum, s) => sum + (counts?.[s] || 0), 0)
  const tabs = [
    ...STATUSES.map((s) => ({ key: s, label: s, count: counts?.[s] || 0 })),
    { key: "", label: "All", count: allCount },
  ]

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <Inbox className="w-5 h-5 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Contact Us messages</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Queries and complaints customers send from the Contact Us page in the app.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
              {tabs.map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  role="tab"
                  aria-selected={status === tab.key}
                  onClick={() => changeTab(tab.key)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    status === tab.key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      status === tab.key ? "bg-white/20 text-white" : "bg-white text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 lg:flex-initial min-w-[200px] lg:max-w-xs">
              <input
                type="text"
                placeholder="Search name, email, phone, subject"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <Inbox className="w-16 h-16 text-slate-300 mb-4" />
              <p className="text-lg font-semibold text-slate-700">No messages</p>
              <p className="text-sm text-slate-500">
                {appliedSearch
                  ? "Nothing matches that search."
                  : status
                    ? `No ${status.toLowerCase()} messages.`
                    : "Nobody has written in yet."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {messages.map((msg) => {
                const isOpen = openId === msg._id
                const busy = busyId === msg._id
                const account = msg.userId && typeof msg.userId === "object" ? msg.userId : null
                return (
                  <li key={msg._id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : msg._id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-start gap-4 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{msg.name}</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                              STATUS_STYLES[msg.status] || STATUS_STYLES.New
                            }`}
                          >
                            {msg.status}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-600">
                          {msg.subject ? <span className="font-medium text-slate-800">{msg.subject} · </span> : null}
                          {msg.message}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">{formatDate(msg.createdAt)}</span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
                        <div className="rounded-lg bg-slate-50 p-4">
                          {msg.subject && <p className="mb-2 text-sm font-semibold text-slate-900">{msg.subject}</p>}
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{msg.message}</p>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-1.5 text-sm">
                            {msg.email && (
                              <a href={`mailto:${msg.email}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                                <Mail className="w-4 h-4" /> {msg.email}
                              </a>
                            )}
                            {msg.phone && (
                              <a href={`tel:${msg.phone}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                                <Phone className="w-4 h-4" /> {msg.phone}
                              </a>
                            )}
                            {account && (
                              <p className="flex items-center gap-2 text-slate-600">
                                <User className="w-4 h-4" />
                                Signed in as {account.name || account.phone || account.email}
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="mb-1.5 text-xs font-semibold text-slate-700">Status</p>
                            <div className="flex flex-wrap gap-2">
                              {STATUSES.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={busy || msg.status === s}
                                  onClick={() => setMessageStatus(msg, s)}
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                                    msg.status === s
                                      ? STATUS_STYLES[s]
                                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                  }`}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label htmlFor={`note-${msg._id}`} className="mb-1.5 block text-xs font-semibold text-slate-700">
                              Internal note (customers never see this)
                            </label>
                            <textarea
                              id={`note-${msg._id}`}
                              rows={3}
                              value={noteDrafts[msg._id] ?? msg.adminNote ?? ""}
                              onChange={(e) => setNoteDrafts((d) => ({ ...d, [msg._id]: e.target.value }))}
                              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                            />
                            <div className="mt-2 flex items-center justify-between">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => remove(msg)}
                                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => saveNote(msg)}
                                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                              >
                                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Save note
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Page {page} of {pages} · {total} total
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
