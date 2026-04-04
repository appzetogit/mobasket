import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, FileCheck } from "lucide-react"
import { restaurantAPI } from "@/lib/api"

const formatCurrency = (value) => {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0
  return `INR ${safeValue.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const normalizeCommissionRule = (rule) => ({
  minOrderAmount: Number(rule?.minOrderAmount || 0),
  maxOrderAmount: rule?.maxOrderAmount === null || rule?.maxOrderAmount === undefined
    ? null
    : Number(rule.maxOrderAmount),
  type: rule?.type === "fixed" ? "fixed" : "percentage",
  value: Number(rule?.value || 0),
  priority: Number(rule?.priority || 0),
})

const calculateCommission = (price, commissionConfig, commissionConfigured) => {
  const amount = Math.max(0, Number(price) || 0)
  if (!commissionConfigured) {
    return { commission: 0, payout: amount, label: "No commission configured" }
  }

  const rules = Array.isArray(commissionConfig?.rules)
    ? commissionConfig.rules.map(normalizeCommissionRule)
    : []

  const sortedRules = [...rules].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return a.minOrderAmount - b.minOrderAmount
  })

  let matchedRule = null
  for (const rule of sortedRules) {
    if (amount < rule.minOrderAmount) continue
    if (rule.maxOrderAmount !== null && amount > rule.maxOrderAmount) continue
    matchedRule = rule
    break
  }

  const defaultCommission = commissionConfig?.defaultCommission
    ? {
        type: commissionConfig.defaultCommission.type === "fixed" ? "fixed" : "percentage",
        value: Number(commissionConfig.defaultCommission.value || 0),
      }
    : null

  const applied = matchedRule || defaultCommission || { type: "percentage", value: 10 }
  const rawCommission = applied.type === "fixed"
    ? applied.value
    : (amount * applied.value) / 100
  const commission = Math.min(amount, Math.max(0, Number(rawCommission || 0)))
  const payout = Math.max(0, amount - commission)
  const label = applied.type === "fixed"
    ? `${formatCurrency(applied.value)} fixed`
    : `${applied.value}%`

  return { commission, payout, label }
}

const flattenMenuItems = (sections = []) => {
  const items = []

  sections.forEach((section) => {
    const sectionName = section?.name || "Uncategorized"
    ;(section?.items || []).forEach((item) => {
      items.push({
        id: item?.id || item?._id || `${sectionName}-${item?.name || Math.random()}`,
        name: item?.name || "Unnamed dish",
        price: Number(item?.price || 0),
        sectionName,
        subsectionName: "",
        isAvailable: item?.isAvailable !== false,
      })
    })

    ;(section?.subsections || []).forEach((subsection) => {
      const subsectionName = subsection?.name || "Subsection"
      ;(subsection?.items || []).forEach((item) => {
        items.push({
          id: item?.id || item?._id || `${sectionName}-${subsectionName}-${item?.name || Math.random()}`,
          name: item?.name || "Unnamed dish",
          price: Number(item?.price || 0),
          sectionName,
          subsectionName,
          isAvailable: item?.isAvailable !== false,
        })
      })
    })
  })

  return items
}

export default function CommissionDetailsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [rawItems, setRawItems] = useState([])
  const [commissionConfigured, setCommissionConfigured] = useState(false)
  const [commissionConfig, setCommissionConfig] = useState(null)
  const [commissionMessage, setCommissionMessage] = useState("")

  useEffect(() => {
    let mounted = true
    const loadData = async () => {
      try {
        setLoading(true)
        setError("")
        const [menuResponse, financeResponse] = await Promise.all([
          restaurantAPI.getMenu(),
          restaurantAPI.getFinance(),
        ])

        const sections = menuResponse?.data?.data?.menu?.sections || []
        const menuItems = flattenMenuItems(sections)

        const financeData = financeResponse?.data?.data || {}
        if (!mounted) return

        setRawItems(menuItems)
        setCommissionConfigured(Boolean(financeData?.commissionConfigured))
        setCommissionConfig(financeData?.commissionConfig || null)
        setCommissionMessage(
          financeData?.commissionMessage ||
            "Commission is not configured yet. Please contact admin."
        )
      } catch (apiError) {
        if (!mounted) return
        setError(apiError?.response?.data?.message || "Failed to load commission details")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadData()
    return () => {
      mounted = false
    }
  }, [])

  const commissionRows = useMemo(() => {
    return rawItems.map((item) => {
      const result = calculateCommission(item.price, commissionConfig, commissionConfigured)
      return {
        ...item,
        adminCut: result.commission,
        payout: result.payout,
        commissionLabel: result.label,
      }
    })
  }, [rawItems, commissionConfig, commissionConfigured])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return commissionRows
    return commissionRows.filter((item) =>
      `${item.name} ${item.sectionName} ${item.subsectionName}`.toLowerCase().includes(query)
    )
  }, [commissionRows, searchQuery])

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, item) => {
        acc.menuPrice += item.price
        acc.adminCut += item.adminCut
        acc.payout += item.payout
        return acc
      },
      { menuPrice: 0, adminCut: 0, payout: 0 }
    )
  }, [filteredRows])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-slate-900" />
            <h1 className="text-lg font-semibold text-slate-900">Commission Details</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">
                Admin commission cut per dish
              </p>
              <p className="text-xs text-slate-500">
                Values are calculated from current commission setup.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search dish or category..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 md:w-72"
            />
          </div>
          {!commissionConfigured && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {commissionMessage}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading commission details...</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Total Menu Price</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(totals.menuPrice)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Total Admin Cut</p>
                <p className="mt-1 text-lg font-semibold text-rose-700">{formatCurrency(totals.adminCut)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Total Restaurant Earning</p>
                <p className="mt-1 text-lg font-semibold text-emerald-700">{formatCurrency(totals.payout)}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Dish</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Category</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700">Menu Price</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700">Admin Cut</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700">Your Earning</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                          No dishes found.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-slate-900">{item.name}</p>
                            {!item.isAvailable && (
                              <p className="text-xs text-amber-700">Currently unavailable</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {item.subsectionName
                              ? `${item.sectionName} / ${item.subsectionName}`
                              : item.sectionName}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-900">{formatCurrency(item.price)}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-rose-700">{formatCurrency(item.adminCut)}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-emerald-700">{formatCurrency(item.payout)}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.commissionLabel}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
