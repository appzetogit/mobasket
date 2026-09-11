import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowDown, ArrowLeft, ArrowUp, Clock, Loader2, Plus, Search, Tag, UtensilsCrossed, X } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { restaurantAPI } from "@/lib/api"

/*
 * Today's Offer (requirement 7), vendor side.
 *
 * The restaurant puts its own dishes into the Today's Offer section on the
 * MoFood home page, optionally between a start and end time. Entries live in
 * the same records the admin panel manages, and are shown to customers in the
 * restaurant's delivery zone while the offer is live.
 */

const MAX_ITEMS = 10

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

const formatWhen = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

const windowState = (entry) => {
  const now = Date.now()
  const starts = entry?.startsAt ? new Date(entry.startsAt).getTime() : null
  const ends = entry?.endsAt ? new Date(entry.endsAt).getTime() : null
  if (ends && ends < now) return { label: "Ended", tone: "bg-gray-100 text-gray-600" }
  if (starts && starts > now) return { label: `Starts ${formatWhen(entry.startsAt)}`, tone: "bg-blue-50 text-blue-700" }
  if (ends) return { label: `Live · ends ${formatWhen(entry.endsAt)}`, tone: "bg-green-50 text-green-700" }
  return { label: "Live · no end time", tone: "bg-green-50 text-green-700" }
}

// <input type="datetime-local"> works in local time without a zone suffix.
const toLocalInput = (value) => {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const toIso = (localValue) => (localValue ? new Date(localValue).toISOString() : null)

const flattenMenu = (sections = []) => {
  const out = []
  for (const section of sections) {
    for (const item of section?.items || []) out.push({ ...item, sectionName: section?.name })
    for (const sub of section?.subsections || []) {
      for (const item of sub?.items || []) out.push({ ...item, sectionName: sub?.name || section?.name })
    }
  }
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

function WindowInputs({ startsAt, endsAt, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs font-semibold text-gray-600">
        Starts (optional)
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => onChange({ startsAt: e.target.value, endsAt })}
          className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-[#ff8100]"
        />
      </label>
      <label className="text-xs font-semibold text-gray-600">
        Ends (optional)
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => onChange({ startsAt, endsAt: e.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-[#ff8100]"
        />
      </label>
    </div>
  )
}

export default function TodaysOffer() {
  const navigate = useNavigate()
  const [menuItems, setMenuItems] = useState([])
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(null)
  const [query, setQuery] = useState("")

  const [picked, setPicked] = useState(null)
  const [newWindow, setNewWindow] = useState({ startsAt: "", endsAt: "" })
  const [editingId, setEditingId] = useState(null)
  const [editWindow, setEditWindow] = useState({ startsAt: "", endsAt: "" })

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const [menuRes, offerRes] = await Promise.all([restaurantAPI.getMenu(), restaurantAPI.getTodaysOffer()])
      setMenuItems(flattenMenu(menuRes?.data?.data?.menu?.sections))
      setOffers(Array.isArray(offerRes?.data?.data?.items) ? offerRes.data.data.items : [])
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load Today's Offer.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const offeredIds = useMemo(() => new Set(offers.map((o) => String(o.menuItemId))), [offers])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return menuItems
      .filter((item) => !offeredIds.has(String(item.id)))
      .filter((item) => !q || String(item.name || "").toLowerCase().includes(q))
  }, [menuItems, offeredIds, query])

  const full = offers.length >= MAX_ITEMS

  const add = async () => {
    if (!picked || busy) return
    if (newWindow.startsAt && newWindow.endsAt && new Date(newWindow.endsAt) <= new Date(newWindow.startsAt)) {
      toast.error("The end time must be after the start time")
      return
    }
    setBusy("add")
    try {
      const res = await restaurantAPI.addTodaysOffer({
        menuItemId: picked.id,
        startsAt: toIso(newWindow.startsAt),
        endsAt: toIso(newWindow.endsAt),
      })
      const created = res?.data?.data?.item
      if (created) setOffers((list) => [...list, created])
      toast.success(`${picked.name} added to Today's Offer`)
      setPicked(null)
      setNewWindow({ startsAt: "", endsAt: "" })
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not add that dish")
    } finally {
      setBusy(null)
    }
  }

  const saveWindow = async (entry) => {
    if (editWindow.startsAt && editWindow.endsAt && new Date(editWindow.endsAt) <= new Date(editWindow.startsAt)) {
      toast.error("The end time must be after the start time")
      return
    }
    setBusy(entry._id)
    try {
      const res = await restaurantAPI.updateTodaysOffer(entry._id, {
        startsAt: toIso(editWindow.startsAt),
        endsAt: toIso(editWindow.endsAt),
      })
      const saved = res?.data?.data?.item
      setOffers((list) => list.map((o) => (o._id === entry._id ? { ...o, ...(saved || {}) } : o)))
      setEditingId(null)
      toast.success("Offer times saved")
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save the times")
    } finally {
      setBusy(null)
    }
  }

  const remove = async (entry) => {
    if (busy) return
    setBusy(entry._id)
    try {
      await restaurantAPI.removeTodaysOffer(entry._id)
      setOffers((list) => list.filter((o) => o._id !== entry._id))
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not remove that dish")
    } finally {
      setBusy(null)
    }
  }

  const move = async (index, delta) => {
    const target = index + delta
    if (busy || target < 0 || target >= offers.length) return
    const previous = offers
    const next = [...offers]
    ;[next[index], next[target]] = [next[target], next[index]]
    // Optimistic, restored if the save fails.
    setOffers(next)
    setBusy(next[target]._id)
    try {
      await restaurantAPI.reorderTodaysOffer(next.map((o) => o._id))
    } catch (err) {
      setOffers(previous)
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
        <h1 className="text-base font-bold text-gray-900">Today&apos;s Offer</h1>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <p className="mb-4 text-xs leading-relaxed text-gray-500">
          Dishes you add appear in the Today&apos;s Offer section of the MoFood home page for customers in your
          delivery area, between the times you set. Up to {MAX_ITEMS} dishes.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <button onClick={load} className="mt-2 text-sm font-bold text-red-800 underline">
              Try again
            </button>
          </div>
        ) : (
          <>
            <h2 className="mb-2 text-sm font-bold text-gray-900">
              On offer ({offers.length}/{MAX_ITEMS})
            </h2>
            {offers.length === 0 ? (
              <div className="mb-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white py-8 text-center">
                <Tag className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">Nothing on offer yet. Pick dishes from your menu below.</p>
              </div>
            ) : (
              <div className="mb-6 space-y-2">
                {offers.map((entry, index) => {
                  const state = windowState(entry)
                  const editing = editingId === entry._id
                  return (
                    <Card key={entry._id} className="border-gray-100">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <Thumb src={entry.menuItemImage} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900">{entry.menuItemName}</p>
                            <p className="text-xs text-gray-500">{money(entry.menuItemPrice)}</p>
                            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${state.tone}`}>
                              {state.label}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingId(editing ? null : entry._id)
                                setEditWindow({ startsAt: toLocalInput(entry.startsAt), endsAt: toLocalInput(entry.endsAt) })
                              }}
                              aria-label={`Change times for ${entry.menuItemName}`}
                              className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100"
                            >
                              <Clock className="h-4 w-4" />
                            </button>
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
                              disabled={index === offers.length - 1 || Boolean(busy)}
                              aria-label={`Move ${entry.menuItemName} down`}
                              className="rounded-lg p-1.5 text-gray-600 transition hover:bg-gray-100 disabled:opacity-30"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => remove(entry)}
                              disabled={Boolean(busy)}
                              aria-label={`Remove ${entry.menuItemName}`}
                              className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50 disabled:opacity-30"
                            >
                              {busy === entry._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        {editing && (
                          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                            <WindowInputs startsAt={editWindow.startsAt} endsAt={editWindow.endsAt} onChange={setEditWindow} />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveWindow(entry)}
                                disabled={Boolean(busy)}
                                className="rounded-lg bg-[#ff8100] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#e67300] disabled:opacity-50"
                              >
                                Save times
                              </button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            <h2 className="mb-2 text-sm font-bold text-gray-900">Add a dish</h2>
            {full ? (
              <p className="rounded-xl border border-dashed border-gray-200 bg-white py-6 text-center text-sm text-gray-500">
                You have {MAX_ITEMS} dishes on offer. Remove one to add another.
              </p>
            ) : picked ? (
              <Card className="border-[#ff8100]/40">
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-center gap-3">
                    <Thumb src={picked.image || (Array.isArray(picked.images) ? picked.images[0] : "")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{picked.name}</p>
                      <p className="text-xs text-gray-500">{money(picked.price)}</p>
                    </div>
                    <button
                      onClick={() => setPicked(null)}
                      aria-label="Pick a different dish"
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <WindowInputs startsAt={newWindow.startsAt} endsAt={newWindow.endsAt} onChange={setNewWindow} />
                  <p className="text-[11px] text-gray-500">Leave both empty to show it until you remove it.</p>
                  <button
                    onClick={add}
                    disabled={busy === "add"}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#ff8100] py-2.5 text-sm font-bold text-white hover:bg-[#e67300] disabled:opacity-50"
                  >
                    {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add to Today&apos;s Offer
                  </button>
                </CardContent>
              </Card>
            ) : (
              <>
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
                    {menuItems.length === 0 ? "Your menu has no dishes yet." : "No matching dishes left to add."}
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
                              {money(item.price)}
                              {item.sectionName ? ` · ${item.sectionName}` : ""}
                            </p>
                          </div>
                          <button
                            onClick={() => setPicked(item)}
                            className="flex shrink-0 items-center gap-1 rounded-full bg-[#ff8100] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#e67300]"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add
                          </button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
