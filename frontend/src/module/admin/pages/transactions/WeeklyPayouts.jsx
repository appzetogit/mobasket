import { useEffect, useMemo, useRef, useState } from "react"
import { Search, CalendarDays, Loader2, Store, AlertTriangle, RefreshCw } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

/*
 * Weekly payouts (requirement 2), admin side.
 *
 * For each restaurant: what it receives per week (food sales minus commission
 * on orders delivered that week) and whether MoBasket has paid it. Admin sets
 * Paid, Pending or Due; the restaurant sees the same amount and status in its
 * own Weekly Payments screen. Amounts come from the server, which is the same
 * calculation the vendor screen uses, so the two views cannot disagree.
 */

const STATUSES = ["Paid", "Pending", "Due"]

const STATUS_STYLES = {
  Paid: "bg-green-50 text-green-700 border-green-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Due: "bg-red-50 text-red-700 border-red-200",
}

const TOTAL_TONES = {
  Paid: "text-green-700",
  Pending: "text-amber-700",
  Due: "text-red-700",
}

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const weekLabel = (startIso, endIso) => {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const fmt = (d, withYear) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) })
  return `${fmt(start, false)} – ${fmt(end, true)}`
}

export default function WeeklyPayouts() {
  const [restaurants, setRestaurants] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")

  const [selected, setSelected] = useState(null)
  const [weeksCount, setWeeksCount] = useState(8)
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState("")
  const [noteDrafts, setNoteDrafts] = useState({})
  const [busyWeek, setBusyWeek] = useState(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(searchQuery.trim()), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    let cancelled = false
    setListLoading(true)
    adminAPI
      .getRestaurants({ page: 1, limit: 50, search: appliedSearch || undefined })
      .then((res) => {
        if (!cancelled) setRestaurants(res?.data?.data?.restaurants || [])
      })
      .catch((err) => {
        if (cancelled) return
        setRestaurants([])
        toast.error(err?.response?.data?.message || "Could not load restaurants")
      })
      .finally(() => {
        if (!cancelled) setListLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appliedSearch])

  const loadReport = async () => {
    if (!selected?._id) return
    // Switching restaurants quickly must not let an older response win.
    const requestId = ++requestRef.current
    setReportLoading(true)
    setReportError("")
    try {
      const res = await adminAPI.getRestaurantWeeklyPayouts(selected._id, weeksCount)
      if (requestId !== requestRef.current) return
      setReport(res?.data?.data || null)
      setNoteDrafts({})
    } catch (err) {
      if (requestId !== requestRef.current) return
      setReport(null)
      setReportError(err?.response?.data?.message || "Could not load this restaurant's payouts.")
    } finally {
      if (requestId === requestRef.current) setReportLoading(false)
    }
  }

  useEffect(() => {
    loadReport()
  }, [selected?._id, weeksCount])

  const weeks = Array.isArray(report?.weeks) ? report.weeks : []

  const totals = useMemo(
    () =>
      weeks.reduce(
        (acc, week) => {
          if (week.status in acc) acc[week.status] += Number(week.amount || 0)
          return acc
        },
        { Paid: 0, Pending: 0, Due: 0 },
      ),
    [weeks],
  )

  const commissionMissing = weeks.length > 0 && weeks[0].commissionConfigured === false

  const setStatus = async (week, status) => {
    const key = String(week.weekStart)
    const note = noteDrafts[key] ?? week.note ?? ""
    setBusyWeek(key)
    try {
      const res = await adminAPI.setRestaurantWeeklyPayoutStatus(selected._id, {
        weekStart: week.weekStart,
        status,
        note,
      })
      const saved = res?.data?.data
      setReport((prev) =>
        prev
          ? {
              ...prev,
              weeks: prev.weeks.map((w) =>
                String(w.weekStart) === key
                  ? {
                      ...w,
                      status: saved?.status || status,
                      note: saved?.note ?? note,
                      markedAt: saved?.markedAt || new Date().toISOString(),
                    }
                  : w,
              ),
            }
          : prev,
      )
      toast.success(`${weekLabel(week.weekStart, week.weekEnd)} marked ${status}`)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update the payout")
    } finally {
      setBusyWeek(null)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Weekly payouts</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            What each restaurant receives per week, and whether it has been paid. Restaurants see the same
            amount and status in their app.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Restaurant picker */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-fit">
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Search restaurants"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>

            {listLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
              </div>
            ) : restaurants.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">No restaurants match that search.</p>
            ) : (
              <>
                <ul className="max-h-[60vh] overflow-y-auto -mx-1">
                  {restaurants.map((r) => (
                    <li key={r._id}>
                      <button
                        type="button"
                        onClick={() => setSelected({ _id: r._id, name: r.name, restaurantId: r.restaurantId })}
                        className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                          selected?._id === r._id ? "bg-slate-900 text-white" : "hover:bg-slate-100 text-slate-800"
                        }`}
                      >
                        <span className="block truncate text-sm font-semibold">{r.name}</span>
                        <span
                          className={`block truncate text-xs ${
                            selected?._id === r._id ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          {r.restaurantId || r._id}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {restaurants.length >= 50 && (
                  <p className="mt-2 text-center text-[11px] text-slate-500">Showing the first 50. Search to narrow.</p>
                )}
              </>
            )}
          </div>

          {/* Selected restaurant */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-w-0">
            {!selected ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Store className="w-14 h-14 text-slate-300 mb-4" />
                <p className="text-lg font-semibold text-slate-700">Pick a restaurant</p>
                <p className="text-sm text-slate-500">Its weekly payouts will show here.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold text-slate-900">{selected.name}</h2>
                    <p className="text-xs text-slate-500">{selected.restaurantId || selected._id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="weeks-count" className="text-xs font-semibold text-slate-600">
                      Show
                    </label>
                    <select
                      id="weeks-count"
                      value={weeksCount}
                      onChange={(e) => setWeeksCount(Number(e.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      <option value={8}>Last 8 weeks</option>
                      <option value={12}>Last 12 weeks</option>
                      <option value={26}>Last 26 weeks</option>
                      <option value={52}>Last 52 weeks</option>
                    </select>
                    <button
                      type="button"
                      onClick={loadReport}
                      aria-label="Refresh"
                      className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"
                    >
                      <RefreshCw className={`w-4 h-4 ${reportLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-3 gap-3">
                  {STATUSES.map((s) => (
                    <div key={s} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{s}</p>
                      <p className={`mt-1 text-lg font-bold tabular-nums ${TOTAL_TONES[s]}`}>{money(totals[s])}</p>
                    </div>
                  ))}
                </div>

                {commissionMissing && (
                  <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
                    <p>
                      Commission isn&apos;t set up for this restaurant, so payable amounts show as zero. Set it under
                      Restaurant Commission first.
                    </p>
                  </div>
                )}

                {reportLoading && !report ? (
                  <div className="py-16 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
                  </div>
                ) : reportError ? (
                  <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-center">
                    <p className="text-sm font-semibold text-red-700">{reportError}</p>
                    <button type="button" onClick={loadReport} className="mt-2 text-sm font-bold text-red-800 underline">
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px]">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {["Week", "Orders", "Food sales", "Commission", "Payable", "Status", "Note", "Mark as"].map(
                            (h) => (
                              <th
                                key={h}
                                className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider"
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {weeks.map((week) => {
                          const key = String(week.weekStart)
                          const busy = busyWeek === key
                          const inProgress = new Date(week.weekEnd) > new Date()
                          return (
                            <tr key={key} className="align-middle">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-800">
                                {weekLabel(week.weekStart, week.weekEnd)}
                                {inProgress && (
                                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                    In progress
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm tabular-nums text-slate-700">{week.orderCount}</td>
                              <td className="px-4 py-3 text-sm tabular-nums text-slate-700">{money(week.grossFoodPrice)}</td>
                              <td className="px-4 py-3 text-sm tabular-nums text-slate-700">{money(week.commission)}</td>
                              <td className="px-4 py-3 text-sm font-bold tabular-nums text-slate-900">{money(week.amount)}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                                    STATUS_STYLES[week.status] || STATUS_STYLES.Pending
                                  }`}
                                >
                                  {week.status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  aria-label={`Note for ${weekLabel(week.weekStart, week.weekEnd)}`}
                                  placeholder="Optional, e.g. UTR number"
                                  value={noteDrafts[key] ?? week.note ?? ""}
                                  onChange={(e) => setNoteDrafts((d) => ({ ...d, [key]: e.target.value }))}
                                  className="w-44 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1.5">
                                  {STATUSES.map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      disabled={busy}
                                      onClick={() => setStatus(week, s)}
                                      title={week.status === s ? `Save the note, keep ${s}` : `Mark ${s}`}
                                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                                        week.status === s
                                          ? STATUS_STYLES[s]
                                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                      }`}
                                    >
                                      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : s}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="mt-4 text-xs text-slate-500">
                  Payable is food sales minus commission for orders delivered that week. Clicking the current status
                  again saves the note without changing it.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
