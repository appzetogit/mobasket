import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Loader2, Pencil, Plus, Search, Store, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@/lib/api"

/*
 * Add-ons, admin side (requirement 10).
 *
 * Pick a restaurant, then create, edit, approve or remove its add-ons and say
 * which dishes they go with. An add-on linked to menu categories (e.g. Extra
 * Cheese -> Burgers) is offered when a customer adds a dish from one of them;
 * one that applies to every dish appears in the cart's "Complete your meal"
 * strip. Vendors can add their own add-ons too; theirs wait here for approval.
 */

const STATUS_STYLES = {
  approved: "bg-green-50 text-green-700 border-green-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
}

const STATUS_LABELS = { approved: "Approved", pending: "Pending approval", rejected: "Rejected" }

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const EMPTY_FORM = { name: "", price: "", description: "", scope: "all", categoryIds: [] }

export default function AddonsList() {
  const [restaurants, setRestaurants] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [selected, setSelected] = useState(null)

  const [addons, setAddons] = useState([])
  const [categories, setCategories] = useState([])
  const [hasMenu, setHasMenu] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const [editingId, setEditingId] = useState(null) // "new" or an add-on id
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
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
      .catch(() => {
        if (!cancelled) setRestaurants([])
      })
      .finally(() => {
        if (!cancelled) setListLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appliedSearch])

  const loadAddons = async () => {
    if (!selected?._id) return
    const requestId = ++requestRef.current
    setLoading(true)
    try {
      const res = await adminAPI.getRestaurantAddonsForAdmin(selected._id)
      if (requestId !== requestRef.current) return
      const data = res?.data?.data || {}
      setAddons(Array.isArray(data.addons) ? data.addons : [])
      setCategories(Array.isArray(data.categories) ? data.categories : [])
      setHasMenu(data.hasMenu !== false)
    } catch (err) {
      if (requestId !== requestRef.current) return
      setAddons([])
      setCategories([])
      toast.error(err?.response?.data?.message || "Could not load this restaurant's add-ons")
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    loadAddons()
  }, [selected?._id])

  const categoryName = useMemo(() => new Map(categories.map((c) => [String(c.id), c.name])), [categories])

  const scopeLabel = (addon) => {
    const ids = Array.isArray(addon?.applicableCategoryIds) ? addon.applicableCategoryIds : []
    if (ids.length === 0) return "All dishes (shown in the cart)"
    return ids.map((id) => categoryName.get(String(id)) || "Removed category").join(", ")
  }

  const pickRestaurant = (restaurant) => {
    setSelected({ _id: restaurant._id, name: restaurant.name })
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const startNew = () => {
    setEditingId("new")
    setForm(EMPTY_FORM)
  }

  const startEdit = (addon) => {
    const ids = Array.isArray(addon.applicableCategoryIds) ? addon.applicableCategoryIds.map(String) : []
    setEditingId(addon.id)
    setForm({
      name: addon.name || "",
      price: String(addon.price ?? ""),
      description: addon.description || "",
      scope: ids.length > 0 ? "some" : "all",
      categoryIds: ids,
    })
  }

  const toggleCategory = (id) =>
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((c) => c !== id) : [...f.categoryIds, id],
    }))

  const save = async () => {
    const name = form.name.trim()
    const price = Number(form.price)
    if (!name) return toast.error("Give the add-on a name")
    if (form.price === "" || !Number.isFinite(price) || price < 0) return toast.error("Enter a price of 0 or more")
    if (form.scope === "some" && form.categoryIds.length === 0) {
      return toast.error("Pick at least one category, or choose All dishes")
    }
    const payload = {
      name,
      price,
      description: form.description.trim(),
      applicableCategoryIds: form.scope === "some" ? form.categoryIds : [],
    }
    setSaving(true)
    try {
      if (editingId === "new") {
        await adminAPI.createRestaurantAddon(selected._id, payload)
        toast.success(`${name} added`)
      } else {
        await adminAPI.updateRestaurantAddon(selected._id, editingId, payload)
        toast.success(`${name} updated`)
      }
      setEditingId(null)
      setForm(EMPTY_FORM)
      await loadAddons()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save the add-on")
    } finally {
      setSaving(false)
    }
  }

  const patch = async (addon, data, successText) => {
    setBusyId(addon.id)
    try {
      const res = await adminAPI.updateRestaurantAddon(selected._id, addon.id, data)
      const saved = res?.data?.data?.addon
      setAddons((list) => list.map((a) => (a.id === addon.id ? { ...a, ...(saved || data) } : a)))
      toast.success(successText)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update the add-on")
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (addon) => {
    if (!window.confirm(`Delete ${addon.name}? Customers will no longer be able to order it.`)) return
    setBusyId(addon.id)
    try {
      await adminAPI.deleteRestaurantAddon(selected._id, addon.id)
      setAddons((list) => list.filter((a) => a.id !== addon.id))
      toast.success(`${addon.name} deleted`)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not delete the add-on")
    } finally {
      setBusyId(null)
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"

  const pendingCount = addons.filter((a) => a.approvalStatus === "pending").length

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Add-ons</h1>
          <p className="text-sm text-slate-600 mt-1">
            Extras customers can add to a dish, like Extra Cheese on a burger. Link an add-on to menu categories to
            offer it when those dishes are added; add-ons for all dishes appear in the cart.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-fit">
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Search restaurants"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputClass} pl-9`}
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
              <ul className="max-h-[60vh] overflow-y-auto -mx-1">
                {restaurants.map((r) => (
                  <li key={r._id}>
                    <button
                      type="button"
                      onClick={() => pickRestaurant(r)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                        selected?._id === r._id ? "bg-slate-900 text-white" : "hover:bg-slate-100 text-slate-800"
                      }`}
                    >
                      <span className="block truncate">{r.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-w-0">
            {!selected ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Store className="w-14 h-14 text-slate-300 mb-4" />
                <p className="text-lg font-semibold text-slate-700">Pick a restaurant</p>
                <p className="text-sm text-slate-500">Its add-ons will show here.</p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold text-slate-900">{selected.name}</h2>
                    <p className="text-xs text-slate-500">
                      {addons.length} add-on{addons.length === 1 ? "" : "s"}
                      {pendingCount > 0 ? ` · ${pendingCount} waiting for approval` : ""}
                    </p>
                  </div>
                  {hasMenu && editingId !== "new" && (
                    <button
                      type="button"
                      onClick={startNew}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      <Plus className="w-4 h-4" /> New add-on
                    </button>
                  )}
                </div>

                {!hasMenu && (
                  <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    This restaurant has no menu yet, so it can&apos;t have add-ons.
                  </p>
                )}

                {editingId && (
                  <div className="mb-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-900">{editingId === "new" ? "New add-on" : "Edit add-on"}</p>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                      <input
                        aria-label="Name"
                        placeholder="Name, e.g. Extra Cheese"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className={inputClass}
                      />
                      <input
                        aria-label="Price in rupees"
                        type="number"
                        min={0}
                        step="0.5"
                        placeholder="Price (₹)"
                        value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <input
                      aria-label="Description"
                      placeholder="Description (optional)"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className={inputClass}
                    />

                    <fieldset>
                      <legend className="mb-1.5 text-xs font-semibold text-slate-700">Goes with</legend>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="addon-scope"
                            checked={form.scope === "all"}
                            onChange={() => setForm((f) => ({ ...f, scope: "all" }))}
                          />
                          All dishes (offered in the cart)
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="addon-scope"
                            checked={form.scope === "some"}
                            onChange={() => setForm((f) => ({ ...f, scope: "some" }))}
                          />
                          Dishes in chosen categories (offered when the dish is added)
                        </label>
                      </div>
                      {form.scope === "some" && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {categories.length === 0 ? (
                            <p className="text-xs text-slate-500">This menu has no categories yet.</p>
                          ) : (
                            categories.map((c) => {
                              const on = form.categoryIds.includes(String(c.id))
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => toggleCategory(String(c.id))}
                                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                    on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
                                  }`}
                                >
                                  {c.name}
                                </button>
                              )
                            })
                          )}
                        </div>
                      )}
                    </fieldset>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null)
                          setForm(EMPTY_FORM)
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {editingId === "new" ? "Add" : "Save"}
                      </button>
                    </div>
                  </div>
                )}

                {loading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="w-7 h-7 animate-spin text-emerald-600 mx-auto" />
                  </div>
                ) : addons.length === 0 ? (
                  <p className="py-16 text-center text-sm text-slate-500">No add-ons yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {addons.map((addon) => {
                      const status = addon.approvalStatus || "pending"
                      const busy = busyId === addon.id
                      const available = addon.isAvailable !== false
                      return (
                        <li key={addon.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{addon.name}</span>
                              <span className="text-sm text-slate-700">{money(addon.price)}</span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                                  STATUS_STYLES[status] || STATUS_STYLES.pending
                                }`}
                              >
                                {STATUS_LABELS[status] || status}
                              </span>
                              {!available && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                  Unavailable
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">Goes with: {scopeLabel(addon)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => patch(addon, { approvalStatus: "approved" }, `${addon.name} approved`)}
                                  className="flex items-center gap-1 rounded-lg border border-green-300 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" /> Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => patch(addon, { approvalStatus: "rejected" }, `${addon.name} rejected`)}
                                  className="flex items-center gap-1 rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <X className="w-3.5 h-3.5" /> Reject
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                patch(addon, { isAvailable: !available }, available ? `${addon.name} hidden` : `${addon.name} available`)
                              }
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                              {available ? "Mark unavailable" : "Mark available"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startEdit(addon)}
                              aria-label={`Edit ${addon.name}`}
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => remove(addon)}
                              aria-label={`Delete ${addon.name}`}
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
