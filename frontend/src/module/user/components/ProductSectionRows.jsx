import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Clock, ShoppingBag, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"
import api from "@/lib/api"
import { useCart } from "../context/CartContext"

/*
 * Admin-curated product sections on the home pages: Top 10 Best Food
 * (requirement 8), Today's Offer (7) and grocery sections such as Hot Deals
 * and Trending Products (4).
 *
 * Reads the zone- and time-aware public endpoint, so a customer only sees
 * entries pinned to their delivery zone (or to every zone) whose offer window
 * is open. "Best of this Restaurant" lives in the same collection but belongs
 * on the restaurant page, so it is never shown here.
 */

const CACHE_TTL_MS = 60 * 1000
const cache = new Map()

// Home renders two slots (Top 10 under the banner, the rest further down), so
// one request per platform and zone is shared between them.
const loadSections = (platform, zoneId) => {
  const key = `${platform}:${zoneId}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise

  const promise = api
    .get("/hero-banners/mofood-product-sections/public", {
      params: { platform, ...(zoneId ? { zoneId } : {}) },
    })
    .then((res) => (Array.isArray(res?.data?.data?.sections) ? res.data.data.sections : []))
  // A failed request is not cached, so the next render tries again.
  promise.catch(() => cache.delete(key))
  cache.set(key, { at: Date.now(), promise })
  return promise
}

const isTop10 = (name) => /^\s*top\s*10\b/i.test(String(name || ""))
const isRestaurantOnly = (name) => /^\s*best of this restaurant\s*$/i.test(String(name || ""))

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

const endsLabel = (endsAt) => {
  if (!endsAt) return ""
  const ms = new Date(endsAt).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return ""
  const hours = Math.floor(ms / 3600000)
  if (hours >= 24) {
    return `Ends ${new Date(endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
  }
  if (hours >= 1) return `Ends in ${hours}h`
  return `Ends in ${Math.max(1, Math.round(ms / 60000))}m`
}

const FALLBACK_ICON_CLASS = "h-8 w-8 text-gray-300 dark:text-gray-600"

function CardImage({ src, alt, fallback }) {
  return (
    <div className="mb-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
      {src ? <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" /> : fallback}
    </div>
  )
}

function FoodCard({ entry, rank }) {
  const { addToCart, cart } = useCart()
  const restaurant = entry?.restaurant || {}
  const product = entry?.product || {}
  const restaurantId = String(restaurant?._id || "")
  const menuItemId = String(product?.menuItemId || "")
  const slugOrId = restaurant?.slug || restaurantId
  const price = Number(product?.price || 0)
  const originalPrice = Number(product?.originalPrice || price)
  const ends = endsLabel(entry?.endsAt)

  // Keyed by the menu item's own id, like the restaurant page, so checkout
  // can find the item and both pages agree on what is in the cart.
  const inCart = (Array.isArray(cart) ? cart : []).some(
    (line) => String(line?.itemId || line?.id || "") === menuItemId,
  )

  const add = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!menuItemId || !restaurantId || inCart) return
    try {
      addToCart({
        id: menuItemId,
        itemId: menuItemId,
        name: product?.name || "Item",
        price,
        originalPrice,
        image: product?.image || "",
        restaurantId,
        restaurant: restaurant?.name || "Restaurant",
        platform: "mofood",
        restaurantPlatform: "mofood",
      })
    } catch (error) {
      toast.error(error?.message || "Could not add this item")
    }
  }

  const body = (
    <>
      <div className="relative">
        <CardImage
          src={product?.image}
          alt={product?.name || ""}
          fallback={<UtensilsCrossed className={FALLBACK_ICON_CLASS} />}
        />
        {rank && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-black text-white">
            #{rank}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
        {product?.name || "Item"}
      </p>
      {restaurant?.name && (
        <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{restaurant.name}</p>
      )}
      {ends && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#EF4F5F]">
          <Clock className="h-3 w-3" /> {ends}
        </p>
      )}
    </>
  )

  return (
    <div className="w-36 shrink-0">
      {slugOrId ? <Link to={`/restaurants/${slugOrId}`} className="block">{body}</Link> : body}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-gray-900 dark:text-white">{money(price)}</p>
          {originalPrice > price && (
            <p className="text-[11px] text-gray-400 line-through">{money(originalPrice)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={add}
          disabled={inCart}
          className={`h-8 shrink-0 rounded-lg border px-3 text-xs font-black transition ${
            inCart
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-[#79b879] bg-white text-[#2f8d2f] hover:bg-emerald-50 dark:bg-transparent"
          }`}
        >
          {inCart ? "ADDED" : "ADD"}
        </button>
      </div>
    </div>
  )
}

// Grocery products can have sizes, which are chosen on the product page, so
// the card opens it rather than adding a size the customer did not pick.
function GroceryCard({ entry }) {
  const product = entry?.product || {}
  const productId = String(product?.productId || "")
  const price = Number(product?.price || 0)
  const originalPrice = Number(product?.originalPrice || price)
  const ends = endsLabel(entry?.endsAt)
  if (!productId) return null

  return (
    <Link to={`/food/${productId}`} className="block w-36 shrink-0">
      <CardImage
        src={product?.image}
        alt={product?.name || ""}
        fallback={<ShoppingBag className={FALLBACK_ICON_CLASS} />}
      />
      <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
        {product?.name || "Product"}
      </p>
      {ends && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#EF4F5F]">
          <Clock className="h-3 w-3" /> {ends}
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-gray-900 dark:text-white">{money(price)}</p>
          {originalPrice > price && (
            <p className="text-[11px] text-gray-400 line-through">{money(originalPrice)}</p>
          )}
        </div>
        <span className="h-8 shrink-0 rounded-lg border border-[#79b879] px-3 text-xs font-black leading-8 text-[#2f8d2f]">
          VIEW
        </span>
      </div>
    </Link>
  )
}

/**
 * @param platform "mofood" or "mogrocery"
 * @param zoneId   the customer's delivery zone; anything that is not an id is ignored
 * @param pick     "top10" for Top 10 Best Food only, "others" for everything else, or "all"
 */
export default function ProductSectionRows({ platform = "mofood", zoneId, pick = "all" }) {
  const zoneParam = /^[a-f0-9]{24}$/i.test(String(zoneId || "")) ? String(zoneId) : ""
  const [sections, setSections] = useState([])

  useEffect(() => {
    let cancelled = false
    loadSections(platform, zoneParam)
      .then((list) => {
        if (!cancelled) setSections(list)
      })
      .catch(() => {
        if (!cancelled) setSections([])
      })
    return () => {
      cancelled = true
    }
  }, [platform, zoneParam])

  const visible = sections
    .filter((s) => !isRestaurantOnly(s?.name))
    .filter((s) => (pick === "top10" ? isTop10(s?.name) : pick === "others" ? !isTop10(s?.name) : true))
    .filter((s) => Array.isArray(s?.products) && s.products.length > 0)

  if (visible.length === 0) return null

  return (
    <div className="space-y-6 py-4">
      {visible.map((section) => {
        const top10 = isTop10(section.name)
        const products = top10 ? section.products.slice(0, 10) : section.products
        return (
          <section key={`${section.order}-${section.name}`} aria-label={section.name}>
            <div className="mb-3 px-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white sm:text-lg">{section.name}</h3>
              {top10 && platform === "mofood" && (
                <p className="text-xs text-gray-500 dark:text-gray-400">The most loved dishes in your area</p>
              )}
            </div>
            <div className="scrollbar-hide flex gap-3 overflow-x-auto px-1 pb-1">
              {products.map((entry, index) =>
                platform === "mogrocery" ? (
                  <GroceryCard key={entry?._id || index} entry={entry} />
                ) : (
                  <FoodCard key={entry?._id || index} entry={entry} rank={top10 ? index + 1 : null} />
                ),
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
