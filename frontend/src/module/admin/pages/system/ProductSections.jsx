import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Loader2, Megaphone, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@/lib/api"
import { usePlatform } from "../../context/PlatformContext"

/*
 * Curated product sections shown to customers (requirements 3, 4, 7, 8, 9).
 *
 * One manager for every section kept in the product-sections collection:
 *   MoFood    - Top 10 Best Food (per zone, max 10), Today's Offer (with a
 *               start and end time), Best of this Restaurant (per restaurant)
 *   MoGrocery - Hot Deals, Special Offers, Best Deals, Trending Products,
 *               Today's Offer
 * plus any custom section. Customers see each section's items for their own
 * delivery zone (or items set for every zone) while the offer window is open.
 */

const PRESETS = {
  mofood: [
    { name: "Top 10 Best Food", order: 0, maxItems: 10, hint: "Up to 10 dishes per zone, shown right under the home banner." },
    { name: "Today's Offer", order: 1, timed: true, hint: "Shown on the home page between the start and end time you set." },
    { name: "Best of this Restaurant", order: 2, perRestaurant: true, hint: "Pinned at the top of a restaurant's page. Restaurants can manage these too." },
  ],
  mogrocery: [
    { name: "Hot Deals", order: 0, hint: "Shown on the MoGrocery home page." },
    { name: "Special Offers", order: 1, hint: "Shown on the MoGrocery home page." },
    { name: "Best Deals", order: 2, hint: "Shown on the MoGrocery home page." },
    { name: "Trending Products", order: 3, hint: "Shown on the MoGrocery home page." },
    { name: "Today's Offer", order: 4, timed: true, hint: "Shown between the start and end time you set." },
  ],
}

const CUSTOM = "__custom__"
const ALL_ZONES = ""

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

const formatWhen = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

const windowState = (item) => {
  const now = Date.now()
  const starts = item?.startsAt ? new Date(item.startsAt).getTime() : null
  const ends = item?.endsAt ? new Date(item.endsAt).getTime() : null
  if (ends && ends < now) return { label: "Ended", tone: "bg-slate-100 text-slate-600" }
  if (starts && starts > now) return { label: `Starts ${formatWhen(item.startsAt)}`, tone: "bg-blue-50 text-blue-700" }
  if (ends) return { label: `Live · ends ${formatWhen(item.endsAt)}`, tone: "bg-green-50 text-green-700" }
  return { label: "Always on", tone: "bg-green-50 text-green-700" }
}

const flattenMenu = (sections = []) => {
  const out = []
  for (const section of sections) {
    for (const item of section?.items || []) if (item?.id) out.push(item)
    for (const sub of section?.subsections || []) {
      for (const item of sub?.items || []) if (item?.id) out.push(item)
    }
  }
  return out
}

const toIso = (localValue) => (localValue ? new Date(localValue).toISOString() : null)

export default function ProductSections() {
  const { platform: contextPlatform } = usePlatform()
  const platform = contextPlatform === "mogrocery" ? "mogrocery" : "mofood"
  const presets = PRESETS[platform]

  const [sectionChoice, setSectionChoice] = useState(presets[0].name)
  const [customName, setCustomName] = useState("")
  const [customOrder, setCustomOrder] = useState(10)
  const [zones, setZones] = useState([])
  const [zoneId, setZoneId] = useState(ALL_ZONES)

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  // Add form
  const [restaurantQuery, setRestaurantQuery] = useState("")
  const [restaurants, setRestaurants] = useState([])
  const [restaurant, setRestaurant] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [itemQuery, setItemQuery] = useState("")
  const [groceryProducts, setGroceryProducts] = useState([])
  const [pickedId, setPickedId] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [adding, setAdding] = useState(false)

  const preset = presets.find((p) => p.name === sectionChoice) || null
  const sectionName = sectionChoice === CUSTOM ? customName.trim() : sectionChoice
  const sectionOrder = preset ? preset.order : Number(customOrder) || 0
  const perRestaurant = Boolean(preset?.perRestaurant)
  const timed = preset ? Boolean(preset.timed) : true
  const maxItems = preset?.maxItems || null

  // Switching platform resets the picked section to that platform's first one.
  const [platformSeen, setPlatformSeen] = useState(platform)
  if (platformSeen !== platform) {
    setPlatformSeen(platform)
    setSectionChoice(PRESETS[platform][0].name)
    setRestaurant(null)
    setPickedId("")
  }

  useEffect(() => {
    let cancelled = false
    adminAPI
      .getZones({ platform, isActive: true, limit: 500 })
      .then((res) => {
        if (!cancelled) setZones(res?.data?.data?.zones || res?.data?.zones || [])
      })
      .catch(() => {
        if (!cancelled) setZones([])
      })
    return () => {
      cancelled = true
    }
  }, [platform])

  const loadItems = async () => {
    if (!sectionName || (perRestaurant && !restaurant)) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await adminAPI.getProductSectionItems({
        platform,
        sectionName,
        // "null" asks for the items set for every zone.
        zoneId: perRestaurant ? "null" : zoneId || "null",
        ...(perRestaurant ? { restaurantId: restaurant._id } : {}),
      })
      const list = Array.isArray(res?.data?.data?.items) ? res.data.data.items : []
      setItems([...list].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)))
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load this section")
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadItems()
  }, [platform, sectionName, zoneId, perRestaurant, restaurant?._id])

  // Restaurant search (MoFood)
  useEffect(() => {
    if (platform !== "mofood") return undefined
    const t = setTimeout(() => {
      adminAPI
        .getRestaurants({ page: 1, limit: 20, search: restaurantQuery.trim() || undefined })
        .then((res) => setRestaurants(res?.data?.data?.restaurants || []))
        .catch(() => setRestaurants([]))
    }, 350)
    return () => clearTimeout(t)
  }, [platform, restaurantQuery])

  // Menu of the chosen restaurant (MoFood)
  useEffect(() => {
    if (platform !== "mofood" || !restaurant?._id) return undefined
    let cancelled = false
    setMenuLoading(true)
    adminAPI
      .getRestaurantMenu(restaurant._id)
      .then((res) => {
        if (!cancelled) setMenuItems(flattenMenu(res?.data?.data?.menu?.sections))
      })
      .catch(() => {
        if (!cancelled) setMenuItems([])
      })
      .finally(() => {
        if (!cancelled) setMenuLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [platform, restaurant?._id])

  // Grocery catalogue (MoGrocery), loaded once and searched locally.
  useEffect(() => {
    if (platform !== "mogrocery") return undefined
    let cancelled = false
    adminAPI
      .getGroceryProducts()
      .then((res) => {
        if (!cancelled) setGroceryProducts(Array.isArray(res?.data?.data) ? res.data.data : [])
      })
      .catch(() => {
        if (!cancelled) setGroceryProducts([])
      })
    return () => {
      cancelled = true
    }
  }, [platform])

  const pinnedKeys = useMemo(
    () => new Set(items.map((i) => (platform === "mogrocery" ? String(i.productId || "") : `${i.restaurantId?._id || i.restaurantId}:${i.menuItemId}`))),
    [items, platform],
  )

  const candidates = useMemo(() => {
    const q = itemQuery.trim().toLowerCase()
    if (platform === "mogrocery") {
      return groceryProducts
        .filter((p) => !pinnedKeys.has(String(p._id)))
        .filter((p) => !q || String(p.name || "").toLowerCase().includes(q))
        .slice(0, 50)
        .map((p) => ({
          id: String(p._id),
          name: p.name,
          price: p.sellingPrice ?? p.price,
          image: Array.isArray(p.images) ? p.images[0] : p.image,
        }))
    }
    return menuItems
      .filter((m) => !pinnedKeys.has(`${restaurant?._id}:${m.id}`))
      .filter((m) => !q || String(m.name || "").toLowerCase().includes(q))
      .map((m) => ({ id: m.id, name: m.name, price: m.price, image: m.image || m.images?.[0] }))
  }, [platform, groceryProducts, menuItems, itemQuery, pinnedKeys, restaurant?._id])

  const full = Boolean(maxItems) && items.length >= maxItems

  const addItem = async () => {
    if (!sectionName) return toast.error("Give the section a name")
    if (!pickedId) return toast.error(platform === "mogrocery" ? "Pick a product" : "Pick a dish")
    if (platform === "mofood" && !restaurant?._id) return toast.error("Pick a restaurant")
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      return toast.error("The end time must be after the start time")
    }
    setAdding(true)
    try {
      await adminAPI.addProductSectionItem({
        platform,
        sectionName,
        sectionOrder,
        zoneId: perRestaurant ? null : zoneId || null,
        ...(platform === "mogrocery"
          ? { productId: pickedId }
          : { restaurantId: restaurant._id, menuItemId: pickedId }),
        ...(timed ? { startsAt: toIso(startsAt), endsAt: toIso(endsAt) } : {}),
        ...(maxItems ? { maxItems } : {}),
      })
      toast.success(`Added to ${sectionName}`)
      setPickedId("")
      await loadItems()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not add the item")
    } finally {
      setAdding(false)
    }
  }

  const remove = async (item) => {
    if (!window.confirm(`Remove ${item.menuItemName || "this item"} from ${sectionName}?`)) return
    setBusyId(item._id)
    try {
      await adminAPI.removeProductSectionItem(item._id)
      setItems((list) => list.filter((i) => i._id !== item._id))
      toast.success("Removed")
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not remove the item")
    } finally {
      setBusyId(null)
    }
  }

  const toggle = async (item) => {
    setBusyId(item._id)
    try {
      await adminAPI.toggleProductSectionItem(item._id)
      setItems((list) => list.map((i) => (i._id === item._id ? { ...i, isActive: !i.isActive } : i)))
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update the item")
    } finally {
      setBusyId(null)
    }
  }

  // Positions are rewritten as 0..n-1 in the new order, so gaps or ties left
  // by earlier edits cannot make an up/down click appear to do nothing.
  const move = async (index, delta) => {
    const target = index + delta
    if (target < 0 || target >= items.length || busyId) return
    const previous = items
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next.map((item, i) => ({ ...item, order: i })))
    setBusyId(next[target]._id)
    try {
      await Promise.all(
        next
          .map((item, i) => (Number(item.order) !== i ? adminAPI.setProductSectionItemOrder(item._id, i) : null))
          .filter(Boolean),
      )
    } catch (err) {
      setItems(previous)
      toast.error(err?.response?.data?.message || "Could not save the new order")
    } finally {
      setBusyId(null)
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <Megaphone className="w-5 h-5 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">
              Product sections · {platform === "mogrocery" ? "MoGrocery" : "MoFood"}
            </h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Choose what appears in each section and in what order. Switch platform from the top bar to manage the
            other app.
          </p>
        </div>

        {/* Section and zone */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="section-choice" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Section
              </label>
              <select
                id="section-choice"
                value={sectionChoice}
                onChange={(e) => {
                  setSectionChoice(e.target.value)
                  setPickedId("")
                }}
                className={inputClass}
              >
                {presets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
                <option value={CUSTOM}>Custom section…</option>
              </select>
            </div>

            {sectionChoice === CUSTOM && (
              <>
                <div>
                  <label htmlFor="custom-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Section name
                  </label>
                  <input
                    id="custom-name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Weekend Specials"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="custom-order" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Position on the page (0 is first)
                  </label>
                  <input
                    id="custom-order"
                    type="number"
                    min={0}
                    value={customOrder}
                    onChange={(e) => setCustomOrder(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {!perRestaurant && (
              <div>
                <label htmlFor="zone-choice" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Zone
                </label>
                <select id="zone-choice" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputClass}>
                  <option value={ALL_ZONES}>All zones</option>
                  {zones.map((z) => (
                    <option key={z._id} value={z._id}>
                      {z.name || z.zoneName || z._id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {preset?.hint && <p className="mt-3 text-xs text-slate-500">{preset.hint}</p>}
          {!perRestaurant && (
            <p className="mt-1 text-xs text-slate-500">
              Customers in a zone see that zone&apos;s items plus the items set for all zones.
            </p>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Current items */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">
                {sectionName || "Section"}
                {perRestaurant && restaurant ? ` · ${restaurant.name}` : ""}
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                {items.length}
                {maxItems ? ` / ${maxItems}` : ""}
              </span>
            </div>

            {perRestaurant && !restaurant ? (
              <p className="py-16 text-center text-sm text-slate-500">Pick a restaurant on the right to see its pinned dishes.</p>
            ) : loading ? (
              <div className="py-16 text-center">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-600 mx-auto" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">Nothing here yet. Add items on the right.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {items.map((item, index) => {
                  const state = windowState(item)
                  const owner = item.restaurantId?.name || item.storeId?.name || ""
                  const busy = busyId === item._id
                  return (
                    <li key={item._id} className={`flex items-center gap-3 px-3 py-2.5 ${item.isActive ? "" : "opacity-60"}`}>
                      <span className="w-6 shrink-0 text-center text-sm font-bold text-slate-400">{index + 1}</span>
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {item.menuItemImage && <img src={item.menuItemImage} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.menuItemName}</p>
                        <p className="truncate text-xs text-slate-500">
                          {money(item.menuItemPrice)}
                          {owner ? ` · ${owner}` : ""}
                        </p>
                        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${state.tone}`}>
                          {state.label}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggle(item)}
                          disabled={busy}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {item.isActive ? "Hide" : "Show"}
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          disabled={index === 0 || Boolean(busyId)}
                          aria-label={`Move ${item.menuItemName} up`}
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          disabled={index === items.length - 1 || Boolean(busyId)}
                          aria-label={`Move ${item.menuItemName} down`}
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(item)}
                          disabled={busy}
                          aria-label={`Remove ${item.menuItemName}`}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {maxItems && (
              <p className="mt-3 text-xs text-slate-500">
                To replace a dish when the list is full, remove one and add the new one.
              </p>
            )}
          </div>

          {/* Add */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Add to {sectionName || "section"}</h2>

            {platform === "mofood" && (
              <div>
                <label htmlFor="restaurant-search" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Restaurant
                </label>
                {restaurant ? (
                  <div className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{restaurant.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRestaurant(null)
                        setMenuItems([])
                        setPickedId("")
                      }}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <input
                        id="restaurant-search"
                        value={restaurantQuery}
                        onChange={(e) => setRestaurantQuery(e.target.value)}
                        placeholder="Search restaurants"
                        className={`${inputClass} pl-9`}
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                    <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                      {restaurants.map((r) => (
                        <li key={r._id}>
                          <button
                            type="button"
                            onClick={() => {
                              setRestaurant({ _id: r._id, name: r.name })
                              setPickedId("")
                              setItemQuery("")
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                          >
                            {r.name}
                          </button>
                        </li>
                      ))}
                      {restaurants.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No restaurants found.</li>}
                    </ul>
                  </>
                )}
              </div>
            )}

            {(platform === "mogrocery" || restaurant) && (
              <div>
                <label htmlFor="item-search" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  {platform === "mogrocery" ? "Product" : "Dish"}
                </label>
                <div className="relative">
                  <input
                    id="item-search"
                    value={itemQuery}
                    onChange={(e) => setItemQuery(e.target.value)}
                    placeholder={platform === "mogrocery" ? "Search products" : "Search the menu"}
                    className={`${inputClass} pl-9`}
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
                <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200" role="listbox">
                  {menuLoading ? (
                    <li className="px-3 py-3 text-center">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
                    </li>
                  ) : candidates.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-500">Nothing left to add.</li>
                  ) : (
                    candidates.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={pickedId === c.id}
                          onClick={() => setPickedId(c.id)}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                            pickedId === c.id ? "bg-slate-900 text-white" : "hover:bg-slate-100"
                          }`}
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="shrink-0 text-xs">{money(c.price)}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}

            {timed && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="starts-at" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Starts (optional)
                  </label>
                  <input
                    id="starts-at"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="ends-at" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Ends (optional)
                  </label>
                  <input
                    id="ends-at"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={addItem}
              disabled={adding || full || !pickedId}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {full ? `Full (${maxItems} max)` : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
