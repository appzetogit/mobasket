import { useEffect, useMemo, useState } from "react"
import { Edit, Loader2, MapPin, Plus, Search, Store, Trash2, X } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

const DEFAULT_PLAN_FORM = {
  name: "",
  itemsLabel: "",
  description: "",
  price: 0,
  durationDays: 30,
  productCount: 0,
  deliveries: 0,
  frequency: "",
  iconKey: "zap",
  color: "bg-emerald-500",
  headerColor: "bg-emerald-500",
  order: 0,
  isActive: true,
  popular: false,
  offerIds: [],
  zoneIds: [],
  zoneStoreRules: [],
  benefitsText: "",
  vegProducts: [],
  nonVegProducts: [],
}

const DEFAULT_OFFER_FORM = {
  name: "",
  description: "",
  discountType: "none",
  discountValue: 0,
  categoryDiscountPercentage: 0,
  subcategoryDiscountPercentage: 0,
  productDiscountPercentage: 0,
  freeDelivery: false,
  order: 0,
  isActive: true,
  planIds: [],
  productIds: [],
  categoryIds: [],
  subcategoryIds: [],
}

const toIds = (arr) => (Array.isArray(arr) ? arr.map((x) => (typeof x === "string" ? x : x?._id)).filter(Boolean) : [])
const parseBenefits = (value) => value.split("\n").map((x) => x.trim()).filter(Boolean)
const normalizePlanProducts = (products) =>
  (Array.isArray(products) ? products : [])
    .map((item) => ({ name: String(item?.name || "").trim(), qty: String(item?.qty || "").trim() }))
    .filter((item) => item.name && item.qty)
const normalizeEntityId = (value) =>
  String(
    value?._id ||
    value?.id ||
    value?.storeId ||
    value?.restaurantId ||
    value ||
    ""
  ).trim()

const getImageFromProduct = (product) => {
  if (!product || typeof product !== "object") return ""
  if (Array.isArray(product.images) && product.images.length > 0) return String(product.images[0] || "").trim()
  if (typeof product.image === "string") return product.image.trim()
  if (typeof product.thumbnail === "string") return product.thumbnail.trim()
  return ""
}

const PLAN_COLOR_OPTIONS = [
  { label: "Emerald", value: "bg-emerald-500" },
  { label: "Blue", value: "bg-blue-500" },
  { label: "Rose", value: "bg-rose-500" },
  { label: "Amber", value: "bg-amber-500" },
  { label: "Indigo", value: "bg-indigo-500" },
  { label: "Slate", value: "bg-slate-700" },
]

const PLAN_HEADER_COLOR_OPTIONS = [
  { label: "Emerald", value: "bg-emerald-600" },
  { label: "Blue", value: "bg-blue-600" },
  { label: "Rose", value: "bg-rose-600" },
  { label: "Amber", value: "bg-amber-500" },
  { label: "Indigo", value: "bg-indigo-600" },
  { label: "Slate", value: "bg-slate-800" },
]

function MultiSelectPicker({ label, options, selectedIds, onChange }) {
  const [query, setQuery] = useState("")

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((item) => item.name.toLowerCase().includes(q))
  }, [options, query])

  const selectedItems = useMemo(
    () => options.filter((item) => selectedIds.includes(item.id)),
    [options, selectedIds]
  )

  const toggleOne = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const selectAllFiltered = () => {
    const filteredIds = filteredOptions.map((item) => item.id)
    const merged = Array.from(new Set([...selectedIds, ...filteredIds]))
    onChange(merged)
  }

  const clearAll = () => onChange([])

  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={selectAllFiltered} className="text-xs text-blue-600 hover:underline">
            Select all shown
          </button>
          <button type="button" onClick={clearAll} className="text-xs text-slate-500 hover:underline">
            Clear
          </button>
        </div>
      </div>

      <div className="relative mb-2">
        <Search className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
          className="w-full pl-8 pr-3 py-1.5 border rounded-md text-sm"
        />
      </div>

      <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
        {filteredOptions.length === 0 ? (
          <p className="text-xs text-slate-500 px-3 py-2">No matching items</p>
        ) : (
          filteredOptions.map((item) => (
            <label key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => toggleOne(item.id)}
              />
              <span>{item.name}</span>
            </label>
          ))
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {selectedItems.length === 0 ? (
          <span className="text-xs text-slate-500">No selection</span>
        ) : (
          selectedItems.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {item.name}
              <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => toggleOne(item.id)}>
                x
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  )
}

export default function GroceryPlans() {
  const [tab, setTab] = useState("plans")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingOffer, setSavingOffer] = useState(false)

  const [plans, setPlans] = useState([])
  const [offers, setOffers] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [zones, setZones] = useState([])
  const [stores, setStores] = useState([])

  const [planForm, setPlanForm] = useState(DEFAULT_PLAN_FORM)
  const [offerForm, setOfferForm] = useState(DEFAULT_OFFER_FORM)
  const [editingPlanId, setEditingPlanId] = useState("")
  const [editingOfferId, setEditingOfferId] = useState("")
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [vegSelection, setVegSelection] = useState({ productId: "", qty: "" })
  const [nonVegSelection, setNonVegSelection] = useState({ productId: "", qty: "" })

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)), [plans])
  const sortedOffers = useMemo(() => [...offers].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)), [offers])

  const loadBaseData = async () => {
    setLoading(true)
    try {
      const [planRes, offerRes, prodRes, catRes, subRes, zoneRes, storeRes] = await Promise.all([
        adminAPI.getGroceryPlans(),
        adminAPI.getGroceryPlanOffers(),
        adminAPI.getGroceryProducts(),
        adminAPI.getGroceryCategories(),
        adminAPI.getGrocerySubcategories(),
        adminAPI.getZones({ limit: 1000, platform: "mogrocery", isActive: true }),
        adminAPI.getGroceryStores({ page: 1, limit: 1000 }),
      ])
      setPlans(Array.isArray(planRes?.data?.data) ? planRes.data.data : [])
      setOffers(Array.isArray(offerRes?.data?.data) ? offerRes.data.data : [])
      setProducts(Array.isArray(prodRes?.data?.data) ? prodRes.data.data : [])
      setCategories(Array.isArray(catRes?.data?.data) ? catRes.data.data : [])
      setSubcategories(Array.isArray(subRes?.data?.data) ? subRes.data.data : [])
      const zoneList = Array.isArray(zoneRes?.data?.data?.zones) ? zoneRes.data.data.zones : []
      setZones(zoneList)
      const storeList = Array.isArray(storeRes?.data?.data?.stores) ? storeRes.data.data.stores : []
      setStores(storeList)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load plan data")
    } finally {
      setLoading(false)
    }
  }

  const loadSubscriptions = async () => {
    try {
      const response = await adminAPI.getGroceryPlanSubscriptions({ page: 1, limit: 200 })
      setSubscriptions(Array.isArray(response?.data?.data) ? response.data.data : [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load subscriptions")
      setSubscriptions([])
    }
  }

  useEffect(() => {
    loadBaseData()
  }, [])

  useEffect(() => {
    if (tab === "subscriptions") loadSubscriptions()
  }, [tab])

  const openPlanCreate = () => {
    setEditingPlanId("")
    setPlanForm(DEFAULT_PLAN_FORM)
    setVegSelection({ productId: "", qty: "" })
    setNonVegSelection({ productId: "", qty: "" })
    setShowPlanModal(true)
  }

  const openPlanEdit = (plan) => {
    setEditingPlanId(plan._id)
    setPlanForm({
      name: plan.name || "",
      itemsLabel: plan.itemsLabel || "",
      description: plan.description || "",
      price: Number(plan.price || 0),
      durationDays: Number(plan.durationDays || 30),
      productCount: Number(plan.productCount || 0),
      deliveries: Number(plan.deliveries || 0),
      frequency: plan.frequency || "",
      iconKey: plan.iconKey || "zap",
      color: plan.color || "bg-emerald-500",
      headerColor: plan.headerColor || plan.color || "bg-emerald-500",
      order: Number(plan.order || 0),
      isActive: plan.isActive !== false,
      popular: Boolean(plan.popular),
      offerIds: toIds(plan.offerIds),
      zoneIds: toIds(plan.zoneIds),
      zoneStoreRules: Array.isArray(plan.zoneStoreRules)
        ? plan.zoneStoreRules
            .map((rule) => ({
              zoneId: normalizeEntityId(rule?.zoneId),
              storeId: normalizeEntityId(rule?.storeId),
              subcategoryIds: toIds(rule?.subcategoryIds),
            }))
            .filter((rule) => rule.zoneId && rule.storeId)
        : [],
      benefitsText: Array.isArray(plan.benefits) ? plan.benefits.join("\n") : "",
      vegProducts: normalizePlanProducts(plan.vegProducts),
      nonVegProducts: normalizePlanProducts(plan.nonVegProducts),
    })
    setVegSelection({ productId: "", qty: "" })
    setNonVegSelection({ productId: "", qty: "" })
    setShowPlanModal(true)
  }

  const addPlanProduct = (type) => {
    const picker = type === "veg" ? vegSelection : nonVegSelection
    if (!picker.productId || !picker.qty.trim()) {
      toast.error("Select product and enter quantity")
      return
    }
    const selectedProduct = products.find((item) => item._id === picker.productId)
    if (!selectedProduct) {
      toast.error("Selected product not found")
      return
    }
    const toAdd = {
      productId: selectedProduct._id,
      name: selectedProduct.name.trim(),
      qty: picker.qty.trim(),
      image: getImageFromProduct(selectedProduct),
    }
    if (type === "veg") {
      setPlanForm((prev) => ({ ...prev, vegProducts: [...prev.vegProducts, toAdd] }))
      setVegSelection({ productId: "", qty: "" })
    } else {
      setPlanForm((prev) => ({ ...prev, nonVegProducts: [...prev.nonVegProducts, toAdd] }))
      setNonVegSelection({ productId: "", qty: "" })
    }
  }

  const removePlanProduct = (type, idx) => {
    if (type === "veg") {
      setPlanForm((prev) => ({ ...prev, vegProducts: prev.vegProducts.filter((_, i) => i !== idx) }))
    } else {
      setPlanForm((prev) => ({ ...prev, nonVegProducts: prev.nonVegProducts.filter((_, i) => i !== idx) }))
    }
  }

  const openOfferCreate = () => {
    setEditingOfferId("")
    setOfferForm(DEFAULT_OFFER_FORM)
    setShowOfferModal(true)
  }

  const openOfferEdit = (offer) => {
    setEditingOfferId(offer._id)
    setOfferForm({
      name: offer.name || "",
      description: offer.description || "",
      discountType: offer.discountType || "none",
      discountValue: Number(offer.discountValue || 0),
      categoryDiscountPercentage: Number(offer.categoryDiscountPercentage || 0),
      subcategoryDiscountPercentage: Number(offer.subcategoryDiscountPercentage || 0),
      productDiscountPercentage: Number(offer.productDiscountPercentage || 0),
      freeDelivery: Boolean(offer.freeDelivery),
      order: Number(offer.order || 0),
      isActive: offer.isActive !== false,
      planIds: toIds(offer.planIds),
      productIds: toIds(offer.productIds),
      categoryIds: toIds(offer.categoryIds),
      subcategoryIds: toIds(offer.subcategoryIds),
    })
    setShowOfferModal(true)
  }

  const savePlan = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      const normalizedVegProducts = normalizePlanProducts(planForm.vegProducts)
      const normalizedNonVegProducts = normalizePlanProducts(planForm.nonVegProducts)
      const mergedProducts = [...normalizedVegProducts, ...normalizedNonVegProducts]
      const manualProductCount = Number(planForm.productCount || 0)
      const payload = {
        ...planForm,
        name: planForm.name.trim(),
        itemsLabel: String(planForm.itemsLabel || "").trim(),
        description: planForm.description.trim(),
        price: Number(planForm.price || 0),
        durationDays: Number(planForm.durationDays || 30),
        productCount: manualProductCount > 0 ? manualProductCount : mergedProducts.length,
        deliveries: Number(planForm.deliveries || 0),
        frequency: String(planForm.frequency || "").trim(),
        iconKey: planForm.iconKey || "zap",
        color: String(planForm.color || "bg-emerald-500").trim() || "bg-emerald-500",
        headerColor: String(planForm.headerColor || planForm.color || "bg-emerald-500").trim() || "bg-emerald-500",
        order: Number(planForm.order || 0),
        isActive: Boolean(planForm.isActive),
        popular: Boolean(planForm.popular),
        zoneIds: toIds(planForm.zoneIds),
        zoneStoreRules: (Array.isArray(planForm.zoneStoreRules) ? planForm.zoneStoreRules : [])
          .map((rule) => ({
            zoneId: String(rule?.zoneId || "").trim(),
            storeId: String(rule?.storeId || "").trim(),
            subcategoryIds: toIds(rule?.subcategoryIds),
          }))
          .filter((rule) => rule.zoneId && rule.storeId),
        benefits: parseBenefits(planForm.benefitsText || ""),
        vegProducts: normalizedVegProducts,
        nonVegProducts: normalizedNonVegProducts,
        products: mergedProducts,
      }
      if (editingPlanId) {
        await adminAPI.updateGroceryPlan(editingPlanId, payload)
        toast.success("Plan updated")
      } else {
        await adminAPI.createGroceryPlan(payload)
        toast.success("Plan created")
      }
      setShowPlanModal(false)
      await loadBaseData()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save plan")
    } finally {
      setSaving(false)
    }
  }

  const saveOffer = async (e) => {
    e.preventDefault()
    try {
      setSavingOffer(true)
      const payload = {
        ...offerForm,
        name: offerForm.name.trim(),
        description: offerForm.description.trim(),
        discountValue: Number(offerForm.discountValue || 0),
        categoryDiscountPercentage: Number(offerForm.categoryDiscountPercentage || 0),
        subcategoryDiscountPercentage: Number(offerForm.subcategoryDiscountPercentage || 0),
        productDiscountPercentage: Number(offerForm.productDiscountPercentage || 0),
        order: Number(offerForm.order || 0),
      }
      if (editingOfferId) {
        await adminAPI.updateGroceryPlanOffer(editingOfferId, payload)
        toast.success("Offer updated")
      } else {
        await adminAPI.createGroceryPlanOffer(payload)
        toast.success("Offer created")
      }
      setShowOfferModal(false)
      await loadBaseData()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save offer")
    } finally {
      setSavingOffer(false)
    }
  }

  const deletePlan = async (plan) => {
    if (!window.confirm(`Delete plan "${plan.name}"?`)) return
    try {
      await adminAPI.deleteGroceryPlan(plan._id)
      setPlans((prev) => prev.filter((p) => p._id !== plan._id))
      toast.success("Plan deleted")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete plan")
    }
  }

  const deleteOffer = async (offer) => {
    if (!window.confirm(`Delete offer "${offer.name}"?`)) return
    try {
      await adminAPI.deleteGroceryPlanOffer(offer._id)
      setOffers((prev) => prev.filter((o) => o._id !== offer._id))
      toast.success("Offer deleted")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete offer")
    }
  }

  const planOptions = useMemo(() => plans.map((item) => ({ id: item._id, name: item.name || "Untitled Plan" })), [plans])
  const offerOptions = useMemo(() => offers.map((item) => ({ id: item._id, name: item.name || "Untitled Offer" })), [offers])
  const productOptions = useMemo(() => products.map((item) => ({ id: item._id, name: item.name || "Untitled Product" })), [products])
  const categoryOptions = useMemo(() => categories.map((item) => ({ id: item._id, name: item.name || "Untitled Category" })), [categories])
  const subcategoryOptions = useMemo(() => subcategories.map((item) => ({ id: item._id, name: item.name || "Untitled Subcategory" })), [subcategories])
  const zoneOptions = useMemo(
    () =>
      zones.map((zone) => ({
        id: normalizeEntityId(zone),
        name: zone.name || zone.zoneName || zone.serviceLocation || "Unnamed Zone",
      })),
    [zones]
  )
  const storesByZoneId = useMemo(() => {
    const map = new Map()
    stores.forEach((store) => {
      const zoneId = normalizeEntityId(store?.zoneId)
      if (!zoneId) return
      if (!map.has(zoneId)) map.set(zoneId, [])
      map.get(zoneId).push(store)
    })
    return map
  }, [stores])
  const subcategoriesByStoreId = useMemo(() => {
    const map = new Map()
    const ensureStoreMap = (storeId) => {
      if (!map.has(storeId)) map.set(storeId, new Map())
      return map.get(storeId)
    }

    products.forEach((product) => {
      const storeId = String(product?.storeId?._id || product?.storeId || "").trim()
      if (!storeId) return
      const subMap = ensureStoreMap(storeId)
      const linked = [
        ...(Array.isArray(product?.subcategories) ? product.subcategories : []),
        ...(product?.subcategory ? [product.subcategory] : []),
      ]
      linked.forEach((subcategory) => {
        const subcategoryId = String(subcategory?._id || subcategory || "").trim()
        if (!subcategoryId) return
        if (!subMap.has(subcategoryId)) {
          const fallback = subcategories.find((entry) => String(entry?._id || "") === subcategoryId)
          subMap.set(subcategoryId, {
            id: subcategoryId,
            name: subcategory?.name || fallback?.name || "Subcategory",
          })
        }
      })
    })

    return map
  }, [products, subcategories])

  const addShopToZone = (zoneId) => {
    setPlanForm((prev) => ({
      ...prev,
      zoneStoreRules: [...(Array.isArray(prev.zoneStoreRules) ? prev.zoneStoreRules : []), { zoneId, storeId: "", subcategoryIds: [] }],
    }))
  }

  const updateZoneStoreRule = (index, nextRule) => {
    setPlanForm((prev) => {
      const current = Array.isArray(prev.zoneStoreRules) ? prev.zoneStoreRules : []
      return {
        ...prev,
        zoneStoreRules: current.map((rule, idx) => (idx === index ? { ...rule, ...nextRule } : rule)),
      }
    })
  }

  const removeZoneStoreRule = (index) => {
    setPlanForm((prev) => ({
      ...prev,
      zoneStoreRules: (Array.isArray(prev.zoneStoreRules) ? prev.zoneStoreRules : []).filter((_, idx) => idx !== index),
    }))
  }
  const productsById = useMemo(() => {
    const map = new Map()
    products.forEach((item) => {
      map.set(String(item._id), item)
    })
    return map
  }, [products])
  const getPlanItemImage = (item) => {
    const direct = String(item?.image || "").trim()
    if (direct) return direct
    const byId = item?.productId ? productsById.get(String(item.productId)) : null
    if (byId) return getImageFromProduct(byId)
    if (item?.name) {
      const byName = products.find((product) => String(product?.name || "").trim().toLowerCase() === String(item.name).trim().toLowerCase())
      return getImageFromProduct(byName)
    }
    return ""
  }
  const selectedVegProduct = vegSelection.productId ? productsById.get(String(vegSelection.productId)) : null
  const selectedNonVegProduct = nonVegSelection.productId ? productsById.get(String(nonVegSelection.productId)) : null

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Grocery Plans</h1>
            <p className="text-sm text-slate-500 mt-1">Manage plans, offers and plan subscriptions.</p>
          </div>
          {tab === "plans" && (
            <button onClick={openPlanCreate} className="px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Plan
            </button>
          )}
          {tab === "offers" && (
            <button onClick={openOfferCreate} className="px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Offer
            </button>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          {[
            { id: "plans", label: "Plans" },
            { id: "offers", label: "Offers" },
            { id: "subscriptions", label: "Subscriptions" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === item.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : tab === "plans" ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Zones</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Offers</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedPlans.map((plan) => (
                <tr key={plan._id}>
                  <td className="px-4 py-3">{plan.name}</td>
                  <td className="px-4 py-3">Rs {Number(plan.price || 0).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">{plan.durationDays} days</td>
                  <td className="px-4 py-3">
                    {Array.isArray(plan.zoneIds) && plan.zoneIds.length > 0 ? (() => {
                      const labels = plan.zoneIds
                        .map((zone) => (typeof zone === "string" ? "" : (zone?.name || zone?.zoneName || zone?.serviceLocation || "")))
                        .filter(Boolean)
                      if (labels.length === 0) return `${plan.zoneIds.length} selected`
                      const shown = labels.slice(0, 2).join(", ")
                      return `${shown}${labels.length > 2 ? ` +${labels.length - 2}` : ""}`
                    })() : "All zones"}
                  </td>
                  <td className="px-4 py-3">{Array.isArray(plan.offerIds) ? plan.offerIds.length : 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openPlanEdit(plan)} className="p-2 rounded hover:bg-blue-50 text-blue-600"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => deletePlan(plan)} className="p-2 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "offers" ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Offer</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Benefit</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Linked Plans</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedOffers.map((offer) => (
                <tr key={offer._id}>
                  <td className="px-4 py-3">{offer.name}</td>
                  <td className="px-4 py-3">
                    {offer.discountType === "percentage" ? `${offer.discountValue}% off` : offer.discountType === "flat" ? `Rs ${offer.discountValue} off` : "No discount"}
                    {offer.freeDelivery ? " + Free delivery" : ""}
                  </td>
                  <td className="px-4 py-3">{Array.isArray(offer.planIds) ? offer.planIds.length : 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openOfferEdit(offer)} className="p-2 rounded hover:bg-blue-50 text-blue-600"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => deleteOffer(offer)} className="p-2 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Order</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-3">{sub.orderId}</td>
                  <td className="px-4 py-3">{sub.user?.name || "-"}</td>
                  <td className="px-4 py-3">{sub.planName || "MoGold Plan"}</td>
                  <td className="px-4 py-3">Rs {Number(sub.amount || 0).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">{sub.status || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPlanModal && (
        <div className="fixed inset-0 z-[200] bg-black/50 overflow-y-auto p-4">
          <form onSubmit={savePlan} className="bg-white w-full max-w-5xl rounded-2xl p-4 sm:p-6 space-y-4 mx-auto my-4 sm:my-6 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{editingPlanId ? "Edit Plan" : "Create Plan"}</h2>
                <p className="text-sm text-slate-500">Configure pricing, benefits and included products</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="p-2 rounded-md border text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                aria-label="Close plan modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Plan Name</label>
                <input className="w-full px-3 py-2 border rounded" placeholder="Enter plan name" required value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Items Label</label>
                <input className="w-full px-3 py-2 border rounded" placeholder="e.g. 30 items" value={planForm.itemsLabel} onChange={(e) => setPlanForm({ ...planForm, itemsLabel: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Price (Rs)</label>
                <input className="w-full px-3 py-2 border rounded" type="number" min="0" placeholder="0" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Duration (Days)</label>
                <input className="w-full px-3 py-2 border rounded" type="number" min="1" placeholder="30" value={planForm.durationDays} onChange={(e) => setPlanForm({ ...planForm, durationDays: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Product Count (Optional)</label>
                <input className="w-full px-3 py-2 border rounded" type="number" min="0" placeholder="Auto if empty" value={planForm.productCount} onChange={(e) => setPlanForm({ ...planForm, productCount: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Deliveries</label>
                <input className="w-full px-3 py-2 border rounded" type="number" min="0" placeholder="0" value={planForm.deliveries} onChange={(e) => setPlanForm({ ...planForm, deliveries: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Frequency</label>
                <input className="w-full px-3 py-2 border rounded" placeholder="e.g. weekly" value={planForm.frequency} onChange={(e) => setPlanForm({ ...planForm, frequency: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Display Order</label>
                <input className="w-full px-3 py-2 border rounded" type="number" min="0" placeholder="0" value={planForm.order} onChange={(e) => setPlanForm({ ...planForm, order: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Plan Icon</label>
                <select className="w-full px-3 py-2 border rounded" value={planForm.iconKey} onChange={(e) => setPlanForm({ ...planForm, iconKey: e.target.value })}>
                  <option value="zap">Zap</option>
                  <option value="check">Check</option>
                  <option value="star">Star</option>
                  <option value="crown">Crown</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Card Color</label>
                <select className="w-full px-3 py-2 border rounded" value={planForm.color} onChange={(e) => setPlanForm({ ...planForm, color: e.target.value })}>
                  {PLAN_COLOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-semibold text-slate-700">Header Color</label>
                <select className="w-full px-3 py-2 border rounded" value={planForm.headerColor} onChange={(e) => setPlanForm({ ...planForm, headerColor: e.target.value })}>
                  {PLAN_HEADER_COLOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1 bg-white border border-slate-200 rounded-xl p-4">
              <label className="text-xs font-semibold text-slate-700">Description</label>
              <textarea className="w-full px-3 py-2 border rounded" placeholder="Enter plan description" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
            </div>
            <div className="space-y-1 bg-white border border-slate-200 rounded-xl p-4">
              <label className="text-xs font-semibold text-slate-700">Benefits</label>
            <textarea
              className="w-full px-3 py-2 border rounded min-h-[90px]"
              placeholder={"Benefits (one per line)"}
              value={planForm.benefitsText}
              onChange={(e) => setPlanForm({ ...planForm, benefitsText: e.target.value })}
            />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={planForm.isActive} onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={planForm.popular} onChange={(e) => setPlanForm({ ...planForm, popular: e.target.checked })} />
                Mark as popular
              </label>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <MultiSelectPicker
                label="Applicable Zones"
                options={zoneOptions}
                selectedIds={planForm.zoneIds}
                onChange={(next) => setPlanForm((prev) => ({ ...prev, zoneIds: next }))}
              />
              <p className="text-xs text-slate-500 mt-1">No zone selected means this plan is available in all grocery zones.</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Zone-Specific Shop Configuration</p>
                <p className="text-xs text-slate-500">For each zone, add shops and pick their subcategories. Rules without a shop selected will be automatically removed on save.</p>
              </div>

              {planForm.zoneIds.length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-xl bg-slate-50">
                  <p className="text-xs text-slate-500 font-medium">Select one or more applicable zones above to configure shops.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {planForm.zoneIds.map((zoneId) => {
                    const zone = zoneOptions.find((z) => z.id === zoneId)
                    if (!zone) return null

                    const storesInZone = storesByZoneId.get(zoneId) || []
                    const storeOptions = storesInZone.map((s) => ({
                      id: normalizeEntityId(s),
                      name: s?.name || s?.ownerName || "Store",
                    }))

                    const zoneRules = (Array.isArray(planForm.zoneStoreRules) ? planForm.zoneStoreRules : [])
                      .map((r, i) => ({ ...r, originalIndex: i }))
                      .filter((r) => String(r.zoneId) === String(zoneId))
                    
                    return (
                      <div key={`zone-section-${zoneId}`} className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-indigo-600" />
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{zone.name}</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => addShopToZone(zoneId)}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-white px-2 py-1 rounded border shadow-sm"
                          >
                            <Plus className="w-3 h-3" /> Add Shop to Zone
                          </button>
                        </div>
                        
                        {zoneRules.length === 0 ? (
                          <div className="py-4 text-center">
                            <p className="text-[11px] text-slate-400 italic">No shops configured for this zone yet.</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {zoneRules.map((rule) => {
                              const storeSubcategories = rule.storeId
                                ? Array.from((subcategoriesByStoreId.get(rule.storeId) || new Map()).values())
                                : []
                              const subcategoryOptionsForStore = storeSubcategories.map((sub) => ({
                                id: String(sub.id),
                                name: sub.name || "Subcategory",
                              }))

                              return (
                                <div key={`rule-${rule.originalIndex}`} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm relative group">
                                  <button
                                    type="button"
                                    onClick={() => removeZoneStoreRule(rule.originalIndex)}
                                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-50 text-red-500 rounded-full flex items-center justify-center border border-red-100 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>

                                  <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                                        <Store className="w-3 h-3" /> Available Shops
                                      </label>
                                      <select
                                        className="w-full px-3 py-1.5 text-sm border rounded-md bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
                                        value={rule.storeId || ""}
                                        onChange={(e) => updateZoneStoreRule(rule.originalIndex, { storeId: e.target.value, subcategoryIds: [] })}
                                      >
                                        <option value="">Select a shop...</option>
                                        {storeOptions.map((opt) => (
                                          <option key={opt.id} value={opt.id}>{opt.name}</option>
                                        ))}
                                      </select>
                                    </div>

                                    {rule.storeId && (
                                      <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <MultiSelectPicker
                                          label="Select Subcategories (Products)"
                                          options={subcategoryOptionsForStore}
                                          selectedIds={Array.isArray(rule.subcategoryIds) ? rule.subcategoryIds : []}
                                          onChange={(next) => updateZoneStoreRule(rule.originalIndex, { subcategoryIds: next })}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <MultiSelectPicker
                label="Link Offers"
                options={offerOptions}
                selectedIds={planForm.offerIds}
                onChange={(next) => setPlanForm((prev) => ({ ...prev, offerIds: next }))}
              />
            </div>

            <div className="space-y-2 bg-emerald-50/60 border border-emerald-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-800">Veg Products Included</p>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2">
                <select className="px-3 py-2 border rounded" value={vegSelection.productId} onChange={(e) => setVegSelection((prev) => ({ ...prev, productId: e.target.value }))}>
                  <option value="">Select product</option>
                  {products.map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
                </select>
                <input className="px-3 py-2 border rounded" placeholder="Qty (e.g. 5 kg - monthly)" value={vegSelection.qty} onChange={(e) => setVegSelection((prev) => ({ ...prev, qty: e.target.value }))} />
                <button type="button" onClick={() => addPlanProduct("veg")} className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">Add</button>
              </div>
              {selectedVegProduct && (
                <div className="flex items-center gap-3 border border-emerald-200 bg-white rounded-lg px-3 py-2">
                  <img
                    src={getImageFromProduct(selectedVegProduct) || "/vite.svg"}
                    alt={selectedVegProduct.name || "Product"}
                    className="w-12 h-12 rounded-md object-cover border border-slate-200"
                    loading="lazy"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selectedVegProduct.name}</p>
                    <p className="text-xs text-slate-500">Selected product preview</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {planForm.vegProducts.map((item, idx) => (
                  <div key={`${item.name}-${idx}`} className="flex items-center justify-between border rounded px-3 py-2 bg-white">
                    <div className="flex items-center gap-3">
                      <img
                        src={getPlanItemImage(item) || "/vite.svg"}
                        alt={item.name || "Product"}
                        className="w-10 h-10 rounded-md object-cover border border-slate-200"
                        loading="lazy"
                      />
                      <p className="text-sm text-slate-700"><span className="font-semibold">{item.name}</span> - {item.qty}</p>
                    </div>
                    <button type="button" className="text-red-600 hover:text-red-700" onClick={() => removePlanProduct("veg", idx)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {planForm.vegProducts.length === 0 && <p className="text-xs text-slate-500">No veg products selected</p>}
              </div>
            </div>

            <div className="space-y-2 bg-rose-50/60 border border-rose-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-800">Non-veg Products Included</p>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2">
                <select className="px-3 py-2 border rounded" value={nonVegSelection.productId} onChange={(e) => setNonVegSelection((prev) => ({ ...prev, productId: e.target.value }))}>
                  <option value="">Select product</option>
                  {products.map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
                </select>
                <input className="px-3 py-2 border rounded" placeholder="Qty (e.g. 500 g - monthly)" value={nonVegSelection.qty} onChange={(e) => setNonVegSelection((prev) => ({ ...prev, qty: e.target.value }))} />
                <button type="button" onClick={() => addPlanProduct("nonVeg")} className="px-3 py-2 rounded bg-rose-600 text-white hover:bg-rose-700">Add</button>
              </div>
              {selectedNonVegProduct && (
                <div className="flex items-center gap-3 border border-rose-200 bg-white rounded-lg px-3 py-2">
                  <img
                    src={getImageFromProduct(selectedNonVegProduct) || "/vite.svg"}
                    alt={selectedNonVegProduct.name || "Product"}
                    className="w-12 h-12 rounded-md object-cover border border-slate-200"
                    loading="lazy"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selectedNonVegProduct.name}</p>
                    <p className="text-xs text-slate-500">Selected product preview</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {planForm.nonVegProducts.map((item, idx) => (
                  <div key={`${item.name}-${idx}`} className="flex items-center justify-between border rounded px-3 py-2 bg-white">
                    <div className="flex items-center gap-3">
                      <img
                        src={getPlanItemImage(item) || "/vite.svg"}
                        alt={item.name || "Product"}
                        className="w-10 h-10 rounded-md object-cover border border-slate-200"
                        loading="lazy"
                      />
                      <p className="text-sm text-slate-700"><span className="font-semibold">{item.name}</span> - {item.qty}</p>
                    </div>
                    <button type="button" className="text-red-600 hover:text-red-700" onClick={() => removePlanProduct("nonVeg", idx)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {planForm.nonVegProducts.length === 0 && <p className="text-xs text-slate-500">No non-veg products selected</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowPlanModal(false)} className="px-3 py-2 border rounded">Cancel</button>
              <button type="submit" disabled={saving} className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </div>
      )}

      {showOfferModal && (
        <div className="fixed inset-0 z-[200] bg-black/50 overflow-y-auto p-4">
          <form onSubmit={saveOffer} className="bg-white w-full max-w-3xl rounded-xl mx-auto my-4 sm:my-6 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 border-b">
              <h2 className="text-xl font-bold">{editingOfferId ? "Edit Offer" : "Create Offer"}</h2>
            </div>
            <div className="p-4 sm:p-6 space-y-3 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="px-3 py-2 border rounded" placeholder="Offer name" required value={offerForm.name} onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })} />
              <select className="px-3 py-2 border rounded" value={offerForm.discountType} onChange={(e) => setOfferForm({ ...offerForm, discountType: e.target.value })}>
                <option value="none">No discount</option>
                <option value="flat">Flat</option>
                <option value="percentage">Percentage</option>
              </select>
              <input className="px-3 py-2 border rounded" type="number" min="0" placeholder="Discount value" value={offerForm.discountValue} onChange={(e) => setOfferForm({ ...offerForm, discountValue: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={offerForm.freeDelivery} onChange={(e) => setOfferForm({ ...offerForm, freeDelivery: e.target.checked })} /> Free delivery</label>
            </div>
            {offerForm.discountType === "percentage" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Category Discount %</label>
                  <input
                    className="w-full px-3 py-2 border rounded"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={offerForm.categoryDiscountPercentage}
                    onChange={(e) => setOfferForm({ ...offerForm, categoryDiscountPercentage: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Subcategory Discount %</label>
                  <input
                    className="w-full px-3 py-2 border rounded"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={offerForm.subcategoryDiscountPercentage}
                    onChange={(e) => setOfferForm({ ...offerForm, subcategoryDiscountPercentage: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Product Discount %</label>
                  <input
                    className="w-full px-3 py-2 border rounded"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={offerForm.productDiscountPercentage}
                    onChange={(e) => setOfferForm({ ...offerForm, productDiscountPercentage: e.target.value })}
                  />
                </div>
              </div>
            )}
            <textarea className="w-full px-3 py-2 border rounded" placeholder="Description" value={offerForm.description} onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MultiSelectPicker
                label="Plans"
                options={planOptions}
                selectedIds={offerForm.planIds}
                onChange={(next) => setOfferForm((prev) => ({ ...prev, planIds: next }))}
              />
              <MultiSelectPicker
                label="Products"
                options={productOptions}
                selectedIds={offerForm.productIds}
                onChange={(next) => setOfferForm((prev) => ({ ...prev, productIds: next }))}
              />
              <MultiSelectPicker
                label="Categories"
                options={categoryOptions}
                selectedIds={offerForm.categoryIds}
                onChange={(next) => setOfferForm((prev) => ({ ...prev, categoryIds: next }))}
              />
              <MultiSelectPicker
                label="Subcategories"
                options={subcategoryOptions}
                selectedIds={offerForm.subcategoryIds}
                onChange={(next) => setOfferForm((prev) => ({ ...prev, subcategoryIds: next }))}
              />
            </div>
            </div>
            <div className="p-4 sm:p-6 border-t flex justify-end gap-2 bg-white">
              <button type="button" onClick={() => setShowOfferModal(false)} className="px-3 py-2 border rounded">Cancel</button>
              <button type="submit" disabled={savingOffer} className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-60">{savingOffer ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
