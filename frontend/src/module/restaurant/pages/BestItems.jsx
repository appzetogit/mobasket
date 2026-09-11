import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowUp, ArrowDown, Pin, X, Search, Loader2, Star, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { restaurantAPI } from "@/lib/api"

/*
 * "Best of this restaurant" (requirements 3 and 9), vendor side.
 *
 * Pins are stored in the same records the admin panel manages, so a vendor pin
 * and an admin pin are one list and neither view hides the other's work.
 * Ordering is saved as the full list of ids, and the server rejects the whole
 * request if any id is not this restaurant's.
 */

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

/** Menu items live in sections[].items and sections[].subsections[].items. */
const flattenMenu = (sections = []) => {
  const out = []
  for (const section of sections) {
    for (const item of section?.items || []) out.push({ ...item, sectionName: section?.name })
    for (const sub of section?.subsections || []) {
      for (const item of sub?.items || []) out.push({ ...item, sectionName: sub?.name || section?.name })
    }
  }
  // Items carry a custom string `id` and no `_id`; skip anything without one.
  return out.filter((item) => String(item?.id || "").trim())
}

function Thumb({ src }) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <UtensilsCrossed className="h-5 w-5 text-gray-300" />
      )}
    </div>
  )
}

export default function BestItems() {
  const navigate = useNavigate()
  const [menuItems, setMenuItems] = useState([])
  const [pinned, setPinned] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(null) // id of the row with a request in flight
  const [query, setQuery] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const [menuRes, bestRes] = await Promise.all([restaurantAPI.getMenu(), restaurantAPI.getBestItems()])
      setMenuItems(flattenMenu(menuRes?.data?.data?.menu?.sections))
      setPinned(Array.isArray(bestRes?.data?.data?.items) ? bestRes.data.data.items : [])
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load your menu.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const pinnedIds = useMemo(() => new Set(pinned.map((p) => String(p.menuItemId))), [pinned])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return menuItems
      .filter((item) => !pinnedIds.has(String(item.id)))
      .filter((item) => !q || String(item.name || "").toLowerCase().includes(q))
  }, [menuItems, pinnedIds, query])

  const pin = async (item) => {
    if (busy) return
    setBusy(item.id)
    try {
      const res = await restaurantAPI.pinBestItem(item.id)
      const created = res?.data?.data?.item
      if (created) setPinned((list) => [...list, created])
      toast.success(`${item.name} pinned`)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not pin that item")
    } finally {
      setBusy(null)
    }
  }

  const unpin = async (entry) => {
    if (busy) return
    setBusy(entry._id)
    try {
      await restaurantAPI.unpinBestItem(entry._id)
      setPinned((list) => list.filter((p) => p._id !== entry._id))
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not unpin that item")
    } finally {
      setBusy(null)
    }
  }

  const move = async (index, delta) => {
    const target = index + delta
    if (busy || target < 0 || target >= pinned.length) return

    const previous = pinned
    const next = [...pinned]
    ;[next[index], next[target]] = [next[target], next[index]]

    // Optimistic, since reordering should feel instant; restored if the save fails.
    setPinned(next)
    setBusy(next[target]._id)
    try {
      await restaurantAPI.reorderBestItems(next.map((p) => p._id))
    } catch (err) {
      setPinned(previous)
      toast.error(err?.response?.data?.message || "Could not save the new order")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button
          onClick={() => navigate("/restaurant/explore")}
          aria-label="Back"
          className="rounded-full p-1.5 transition hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-gray-900">Best of this restaurant</h1>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <p className="mb-4 text-xs leading-relaxed text-gray-500">
          Pinned items appear first on your restaurant page, in this order. Customers see them before the rest of your menu.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <button onClick={load} className="mt-2 text-sm font-bold text-red-800 underline">Try again</button>
          </div>
        ) : (
          <>
            <h2 className="mb-2 text-sm font-bold text-gray-900">Pinned ({pinned.length})</h2>
            {pinned.length === 0 ? (
              <div className="mb-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white py-8 text-center">
                <Star className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">Nothing pinned yet. Pick items from your menu below.</p>
              </div>
            ) : (
              <div className="mb-6 space-y-2">
                {pinned.map((entry, index) => (
                  <Card key={entry._id} className="border-gray-100">
                    <CardContent className="flex items-center gap-3 p-3">
                      <span className="w-5 shrink-0 text-center text-sm font-black text-gray-300">{index + 1}</span>
                      <Thumb src={entry.menuItemImage} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{entry.menuItemName}</p>
                        <p className="text-xs text-gray-500">{money(entry.menuItemPrice)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => move(index, -1)}
                          disabled={index === 0 || Boolean(busy)}
                          aria-label={`Move ${entry.menuItemName} up`}
                          className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => move(index, 1)}
                          disabled={index === pinned.length - 1 || Boolean(busy)}
                          aria-label={`Move ${entry.menuItemName} down`}
                          className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => unpin(entry)}
                          disabled={Boolean(busy)}
                          aria-label={`Unpin ${entry.menuItemName}`}
                          className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50 disabled:opacity-30"
                        >
                          {busy === entry._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <h2 className="mb-2 text-sm font-bold text-gray-900">Your menu</h2>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your menu"
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#ff8100] focus:ring-2 focus:ring-[#ff8100]/20"
              />
            </div>

            {candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                {menuItems.length === 0 ? "Your menu has no items yet." : "No matching items left to pin."}
              </p>
            ) : (
              <div className="space-y-2">
                {candidates.map((item) => (
                  <Card key={item.id} className="border-gray-100">
                    <CardContent className="flex items-center gap-3 p-3">
                      <Thumb src={item.image || (Array.isArray(item.images) ? item.images[0] : "")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                        <p className="truncate text-xs text-gray-500">
                          {money(item.price)}{item.sectionName ? ` · ${item.sectionName}` : ""}
                          {item.isAvailable === false ? " · unavailable" : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => pin(item)}
                        disabled={Boolean(busy)}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-[#ff8100] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#e67300] disabled:opacity-50"
                      >
                        {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pin className="h-3.5 w-3.5" />}
                        Pin
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
