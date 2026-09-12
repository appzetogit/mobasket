import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, IndianRupee, Loader2, RefreshCw, CalendarDays } from "lucide-react"
import { useNavigate, useLocation } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { restaurantAPI } from "@/lib/api"

/*
 * Weekly payment report (requirement 2).
 *
 * Shows what the vendor will receive for each week and the status admin has set
 * against it. Amounts are computed server side from delivered orders; nothing
 * here recalculates them, so this view cannot disagree with the finance screen.
 */

const STATUS_STYLES = {
  Paid: "bg-green-50 text-green-700 border-green-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Due: "bg-red-50 text-red-700 border-red-200",
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

export default function WeeklyPayments() {
  const navigate = useNavigate()
  const location = useLocation()
  const isStore = location.pathname.startsWith("/store")

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const res = isStore
        ? await restaurantAPI.getStoreWeeklyPayments(8)
        : await restaurantAPI.getWeeklyPayments(8)
      setData(res?.data?.data || null)
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load your payment report.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const totals = data?.totals || { paid: 0, pending: 0, due: 0 }
  const weeks = Array.isArray(data?.weeks) ? data.weeks : []

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button
          onClick={() => navigate(isStore ? "/store/explore" : "/restaurant/explore")}
          aria-label="Back"
          className="rounded-full p-1.5 transition hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="flex-1 text-base font-bold text-gray-900">Weekly Payments</h1>
        <button onClick={load} aria-label="Refresh" className="rounded-full p-1.5 transition hover:bg-gray-100">
          <RefreshCw className={`h-4 w-4 text-gray-600 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        {/* Only the three figures the brief asks for, plus what is payable. */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            { label: "Paid", value: totals.paid, tone: "text-green-700" },
            { label: "Pending", value: totals.pending, tone: "text-amber-700" },
            { label: "Due", value: totals.due, tone: "text-red-700" },
          ].map((tile) => (
            <Card key={tile.label} className="border-gray-100">
              <CardContent className="p-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{tile.label}</p>
                <p className={`mt-1 text-sm font-black ${tile.tone}`}>{money(tile.value)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {data && data.commissionConfigured === false && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            Commission has not been set up for your outlet yet, so payable amounts show as zero.
            Please ask admin to configure it.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <button onClick={load} className="mt-2 text-sm font-bold text-red-800 underline">Try again</button>
          </div>
        ) : weeks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarDays className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">No payment weeks to show yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {weeks.map((week, index) => (
              <motion.div
                key={week.weekStart}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.3) }}
              >
                <Card className="border-gray-100">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900">
                          {weekLabel(week.weekStart, week.weekEnd)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {week.orderCount} {week.orderCount === 1 ? "order" : "orders"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                          STATUS_STYLES[week.status] || STATUS_STYLES.Pending
                        }`}
                      >
                        {week.status}
                      </span>
                    </div>

                    <div className="mt-3 flex items-end justify-between border-t border-gray-100 pt-3">
                      <span className="text-xs font-semibold text-gray-500">You will receive</span>
                      <span className="flex items-center text-lg font-black text-gray-900">
                        <IndianRupee className="h-4 w-4" />
                        {Number(week.amount || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    {week.note && (
                      <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">{week.note}</p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-400">
          Amounts are your earnings after commission for orders delivered in each week.
          Payment status is set by MoBasket.
        </p>
      </div>
    </div>
  )
}
