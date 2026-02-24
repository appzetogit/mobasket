import { useState, useEffect, useMemo } from "react"
import { Search, Plus } from "lucide-react"
import { useLocation } from "react-router-dom"
import { adminAPI } from "@/lib/api"

const initialFormState = {
  couponCode: "",
  discountPercentage: "",
  minOrderValue: "",
  maxLimit: "",
  startDate: "",
  endDate: "",
  restaurantScope: "selected",
  restaurantIds: [],
  customerGroup: "all",
  showAtCheckout: true,
}

const initialEditFormState = {
  offerId: "",
  dishId: "",
  couponCode: "",
  discountPercentage: "",
  minOrderValue: "",
  maxLimit: "",
  startDate: "",
  endDate: "",
  customerGroup: "all",
  showAtCheckout: true,
  status: "active",
}

export default function Coupons({ platformOverride }) {
  const location = useLocation()
  const activePlatform =
    platformOverride || (location.pathname.includes("/admin/grocery-coupons") ? "mogrocery" : "mofood")
  const isGroceryPlatform = activePlatform === "mogrocery"
  const entitySingularLabel = isGroceryPlatform ? "store" : "restaurant"
  const entityPluralLabel = isGroceryPlatform ? "stores" : "restaurants"
  const entityTitleLabel = isGroceryPlatform ? "Store" : "Restaurant"
  const itemTitleLabel = isGroceryPlatform ? "Item" : "Dish"

  const [searchQuery, setSearchQuery] = useState("")
  const [offers, setOffers] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")
  const [formState, setFormState] = useState(initialFormState)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editFormError, setEditFormError] = useState("")
  const [editFormState, setEditFormState] = useState(initialEditFormState)

  const fetchOffers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await adminAPI.getAllOffers({ platform: activePlatform })
      if (response?.data?.success) {
        setOffers(response.data.data.offers || [])
      } else {
        setError("Failed to fetch offers")
      }
    } catch (err) {
      console.error("Error fetching offers:", err)
      setError(err?.response?.data?.message || "Failed to fetch offers")
    } finally {
      setLoading(false)
    }
  }

  const fetchRestaurants = async () => {
    try {
      const response = isGroceryPlatform
        ? await adminAPI.getGroceryStores({ page: 1, limit: 500, isActive: true })
        : await adminAPI.getRestaurants({ page: 1, limit: 500, platform: "mofood", isActive: true })

      if (response?.data?.success) {
        const restaurantList = isGroceryPlatform
          ? response?.data?.data?.stores || response?.data?.stores || []
          : response?.data?.data?.restaurants || []
        setRestaurants(restaurantList)
      } else {
        setRestaurants([])
      }
    } catch (err) {
      console.error("Error fetching restaurants:", err)
      setRestaurants([])
    }
  }

  useEffect(() => {
    fetchOffers()
    fetchRestaurants()
  }, [activePlatform, isGroceryPlatform])

  const filteredOffers = useMemo(() => {
    if (!searchQuery.trim()) return offers
    const query = searchQuery.toLowerCase().trim()
    return offers.filter((offer) =>
      offer.restaurantName?.toLowerCase().includes(query) ||
      offer.dishName?.toLowerCase().includes(query) ||
      offer.couponCode?.toLowerCase().includes(query)
    )
  }, [offers, searchQuery])

  const handleFieldChange = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }

  const handleEditFieldChange = (key, value) => {
    setEditFormState((prev) => ({ ...prev, [key]: value }))
  }

  const toInputDate = (value) => {
    if (!value) return ""
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ""
    return parsed.toISOString().slice(0, 10)
  }

  const handleRestaurantSelection = (restaurantId, checked) => {
    setFormState((prev) => {
      const selectedIds = new Set(prev.restaurantIds)
      if (checked) {
        selectedIds.add(restaurantId)
      } else {
        selectedIds.delete(restaurantId)
      }
      return { ...prev, restaurantIds: Array.from(selectedIds) }
    })
  }

  const handleCreateCoupon = async (e) => {
    e.preventDefault()
    setFormError("")

    const code = formState.couponCode.trim().toUpperCase()
    const percentage = Number(formState.discountPercentage)

    if (!code) {
      setFormError("Coupon code is required")
      return
    }
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      setFormError("Discount percentage must be between 1 and 100")
      return
    }
    if (
      formState.customerGroup !== "shared" &&
      formState.restaurantScope === "selected" &&
      formState.restaurantIds.length === 0
    ) {
      setFormError(`Select at least one ${entitySingularLabel}`)
      return
    }

    try {
      setSubmitting(true)
      await adminAPI.createOffer({
        platform: activePlatform,
        couponCode: code,
        discountPercentage: percentage,
        customerGroup: formState.customerGroup,
        showAtCheckout: formState.showAtCheckout,
        restaurantScope: formState.customerGroup === "shared" ? "all" : formState.restaurantScope,
        restaurantIds: formState.customerGroup === "shared" ? [] : formState.restaurantIds,
        minOrderValue: formState.minOrderValue === "" ? 0 : Number(formState.minOrderValue),
        maxLimit: formState.maxLimit === "" ? null : Number(formState.maxLimit),
        startDate: formState.startDate || null,
        endDate: formState.endDate || null,
      })

      setFormState(initialFormState)
      setShowCreateForm(false)
      await fetchOffers()
    } catch (err) {
      console.error("Error creating coupon:", err)
      setFormError(err?.response?.data?.message || "Failed to create coupon")
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditClick = (offer) => {
    setEditFormError("")
    setEditFormState({
      offerId: offer.offerId || "",
      dishId: offer.dishId || "",
      couponCode: offer.couponCode || "",
      discountPercentage: String(offer.discountPercentage ?? ""),
      minOrderValue: String(offer.minOrderValue ?? ""),
      maxLimit: offer.maxLimit == null ? "" : String(offer.maxLimit),
      startDate: toInputDate(offer.startDate),
      endDate: toInputDate(offer.endDate),
      customerGroup: offer.customerGroup || "all",
      showAtCheckout: offer.showAtCheckout !== false,
      status: offer.status || "active",
    })
    setShowEditForm(true)
    setShowCreateForm(false)
  }

  const handleEditCoupon = async (e) => {
    e.preventDefault()
    setEditFormError("")

    const code = editFormState.couponCode.trim().toUpperCase()
    const percentage = Number(editFormState.discountPercentage)

    if (!editFormState.offerId) {
      setEditFormError("Invalid offer selected")
      return
    }
    if (!code) {
      setEditFormError("Coupon code is required")
      return
    }
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      setEditFormError("Discount percentage must be between 1 and 100")
      return
    }

    try {
      setEditSubmitting(true)
      await adminAPI.updateOffer(editFormState.offerId, {
        platform: activePlatform,
        dishId: editFormState.dishId || undefined,
        couponCode: code,
        discountPercentage: percentage,
        minOrderValue: editFormState.minOrderValue === "" ? 0 : Number(editFormState.minOrderValue),
        maxLimit: editFormState.maxLimit === "" ? null : Number(editFormState.maxLimit),
        startDate: editFormState.startDate || null,
        endDate: editFormState.endDate || null,
        customerGroup: editFormState.customerGroup,
        showAtCheckout: editFormState.showAtCheckout,
        status: editFormState.status,
      })

      setShowEditForm(false)
      setEditFormState(initialEditFormState)
      await fetchOffers()
    } catch (err) {
      console.error("Error updating coupon:", err)
      setEditFormError(err?.response?.data?.message || "Failed to update coupon")
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleToggleCheckoutVisibility = async (offer) => {
    try {
      await adminAPI.updateOffer(offer.offerId, {
        platform: activePlatform,
        dishId: offer.dishId || undefined,
        showAtCheckout: !(offer.showAtCheckout !== false),
      })
      await fetchOffers()
    } catch (err) {
      console.error("Error toggling checkout visibility:", err)
      setError(err?.response?.data?.message || "Failed to update checkout visibility")
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h1 className="text-2xl font-bold text-slate-900">
              {isGroceryPlatform ? "Store Offers & Coupons" : "Restaurant Offers & Coupons"}
            </h1>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm((prev) => !prev)
                setShowEditForm(false)
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              {showCreateForm ? "Close" : "Add Coupon"}
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateCoupon} className="mb-6 p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={formState.couponCode}
                  onChange={(e) => handleFieldChange("couponCode", e.target.value)}
                  placeholder="Coupon code"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formState.discountPercentage}
                  onChange={(e) => handleFieldChange("discountPercentage", e.target.value)}
                  placeholder="Discount %"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="number"
                  min="0"
                  value={formState.minOrderValue}
                  onChange={(e) => handleFieldChange("minOrderValue", e.target.value)}
                  placeholder="Min order value"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="number"
                  min="0"
                  value={formState.maxLimit}
                  onChange={(e) => handleFieldChange("maxLimit", e.target.value)}
                  placeholder="Max discount limit (optional)"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="date"
                  value={formState.startDate}
                  onChange={(e) => handleFieldChange("startDate", e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="date"
                  value={formState.endDate}
                  onChange={(e) => handleFieldChange("endDate", e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs font-bold text-slate-700 uppercase mb-2">{entityTitleLabel} Scope</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="restaurantScope"
                        checked={formState.restaurantScope === "selected"}
                        onChange={() => handleFieldChange("restaurantScope", "selected")}
                      />
                      Some {entityPluralLabel}
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="restaurantScope"
                        checked={formState.restaurantScope === "all"}
                        onChange={() => handleFieldChange("restaurantScope", "all")}
                      />
                      All {entityPluralLabel}
                    </label>
                  </div>

                  {formState.restaurantScope === "selected" && (
                    <div className="mt-3 max-h-40 overflow-auto border border-slate-200 rounded p-2 space-y-1">
                      {restaurants.length === 0 ? (
                        <p className="text-xs text-slate-500">No {entityPluralLabel} found</p>
                      ) : (
                        restaurants.map((restaurant) => (
                          <label key={restaurant._id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={formState.restaurantIds.includes(restaurant._id)}
                              onChange={(e) => handleRestaurantSelection(restaurant._id, e.target.checked)}
                            />
                            <span>{restaurant.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {formState.customerGroup === "shared" && (
                    <p className="mt-3 text-xs text-amber-700">
                      Shared app coupons are automatically created for all active MoFood and MoGrocery stores.
                    </p>
                  )}
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs font-bold text-slate-700 uppercase mb-2">User Scope</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="customerGroup"
                        checked={formState.customerGroup === "all"}
                        onChange={() => handleFieldChange("customerGroup", "all")}
                      />
                      All users
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="customerGroup"
                        checked={formState.customerGroup === "new"}
                        onChange={() => handleFieldChange("customerGroup", "new")}
                      />
                      First-time users
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="customerGroup"
                        checked={formState.customerGroup === "shared"}
                        onChange={() => handleFieldChange("customerGroup", "shared")}
                      />
                      Shared app users
                    </label>
                  </div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs font-bold text-slate-700 uppercase mb-2">Checkout Visibility</p>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formState.showAtCheckout}
                      onChange={(e) => handleFieldChange("showAtCheckout", e.target.checked)}
                    />
                    Show this coupon on checkout
                  </label>
                </div>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? "Creating..." : "Create Coupon"}
              </button>
            </form>
          )}

          {showEditForm && (
            <form onSubmit={handleEditCoupon} className="mb-6 p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Edit Coupon</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditForm(false)
                    setEditFormState(initialEditFormState)
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={editFormState.couponCode}
                  onChange={(e) => handleEditFieldChange("couponCode", e.target.value)}
                  placeholder="Coupon code"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={editFormState.discountPercentage}
                  onChange={(e) => handleEditFieldChange("discountPercentage", e.target.value)}
                  placeholder="Discount %"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="number"
                  min="0"
                  value={editFormState.minOrderValue}
                  onChange={(e) => handleEditFieldChange("minOrderValue", e.target.value)}
                  placeholder="Min order value"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="number"
                  min="0"
                  value={editFormState.maxLimit}
                  onChange={(e) => handleEditFieldChange("maxLimit", e.target.value)}
                  placeholder="Max discount limit (optional)"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="date"
                  value={editFormState.startDate}
                  onChange={(e) => handleEditFieldChange("startDate", e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
                <input
                  type="date"
                  value={editFormState.endDate}
                  onChange={(e) => handleEditFieldChange("endDate", e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs font-bold text-slate-700 uppercase mb-2">User Scope</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="editCustomerGroup"
                        checked={editFormState.customerGroup === "all"}
                        onChange={() => handleEditFieldChange("customerGroup", "all")}
                      />
                      All users
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="editCustomerGroup"
                        checked={editFormState.customerGroup === "new"}
                        onChange={() => handleEditFieldChange("customerGroup", "new")}
                      />
                      First-time users
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="editCustomerGroup"
                        checked={editFormState.customerGroup === "shared"}
                        onChange={() => handleEditFieldChange("customerGroup", "shared")}
                      />
                      Shared app users
                    </label>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs font-bold text-slate-700 uppercase mb-2">Status</p>
                  <select
                    value={editFormState.status}
                    onChange={(e) => handleEditFieldChange("status", e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="draft">Draft</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs font-bold text-slate-700 uppercase mb-2">Checkout Visibility</p>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editFormState.showAtCheckout}
                      onChange={(e) => handleEditFieldChange("showAtCheckout", e.target.checked)}
                    />
                    Show this coupon on checkout
                  </label>
                </div>
              </div>

              {editFormError && <p className="text-sm text-red-600">{editFormError}</p>}

              <button
                type="submit"
                disabled={editSubmitting}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
              >
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </form>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder={`Search by ${entitySingularLabel} name, ${itemTitleLabel.toLowerCase()} name, or coupon code...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">Offers List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredOffers.length} {filteredOffers.length === 1 ? "offer" : "offers"}
            </span>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-sm text-slate-500 mt-4">Loading offers...</p>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-lg font-semibold text-red-600 mb-1">Error</p>
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-lg font-semibold text-slate-700 mb-1">No Offers Found</p>
              <p className="text-sm text-slate-500">
                {searchQuery ? "No offers match your search criteria" : "No offers have been created yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">SI</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">{entityTitleLabel}</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">{itemTitleLabel}</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Coupon Code</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Discount</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Users</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Checkout</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Valid Until</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredOffers.map((offer) => (
                    <tr key={`${offer.offerId}-${offer.dishId}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{offer.sl}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-900">{offer.restaurantName}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-700">{offer.dishName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          {offer.couponCode}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {offer.discountType === "flat-price"
                            ? `Rs ${offer.originalPrice - offer.discountedPrice} OFF`
                            : `${offer.discountPercentage}% OFF`}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {offer.customerGroup === "new"
                            ? "First-time"
                            : offer.customerGroup === "shared"
                              ? "Shared app users"
                              : "All users"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleCheckoutVisibility(offer)}
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            offer.showAtCheckout !== false
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {offer.showAtCheckout !== false ? "Visible" : "Hidden"}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          offer.status === "active"
                            ? "bg-green-100 text-green-700"
                            : offer.status === "paused"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-700"
                        }`}>
                          {offer.status || "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {offer.endDate ? new Date(offer.endDate).toLocaleDateString() : "No expiry"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleEditClick(offer)}
                          className="px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
