import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight, UtensilsCrossed } from "lucide-react"
import api from "@/lib/api"

/*
 * A few dishes under each food category (requirement 12), so customers can see
 * what a category holds without opening it. "View all" goes to the full
 * category page.
 *
 * Self-contained on purpose: it fetches its own data and renders nothing if
 * that fails, so the home page never breaks because of this block.
 */

const PER_CATEGORY = 6

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

function ProductCard({ product }) {
  const href = product.restaurantSlug || product.restaurantId
    ? `/restaurants/${product.restaurantSlug || product.restaurantId}`
    : null

  const body = (
    <div className="w-32 shrink-0 sm:w-36">
      <div className="mb-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
        {product.image ? (
          <img src={product.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <UtensilsCrossed className="h-8 w-8 text-gray-300 dark:text-gray-600" />
        )}
      </div>
      <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
        {product.name}
      </p>
      {product.restaurantName && (
        <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{product.restaurantName}</p>
      )}
      <p className="mt-1 text-[13px] font-bold text-gray-900 dark:text-white">{money(product.price)}</p>
    </div>
  )

  return href ? <Link to={href} className="block">{body}</Link> : body
}

export default function FoodCategorySections({ zoneId } = {}) {
  const [categories, setCategories] = useState(null)

  // Scoped to the customer's delivery zone, like the rest of the home page, so
  // it never shows dishes from restaurants that cannot deliver to them. "auto"
  // and other placeholders are not ids and are left off.
  const zoneParam = /^[a-f0-9]{24}$/i.test(String(zoneId || "")) ? String(zoneId) : undefined

  useEffect(() => {
    let cancelled = false
    api.get("/categories/public/with-products", {
      params: { limit: PER_CATEGORY, ...(zoneParam ? { zoneId: zoneParam } : {}) },
    })
      .then((res) => {
        const list = Array.isArray(res?.data?.data?.categories) ? res.data.data.categories : []
        if (!cancelled) setCategories(list.filter((c) => Array.isArray(c.products) && c.products.length > 0))
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
    return () => { cancelled = true }
  }, [zoneParam])

  if (categories === null) {
    return (
      <div className="space-y-5 py-4" aria-hidden="true">
        {[0, 1].map((row) => (
          <div key={row}>
            <div className="mb-3 h-5 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="flex gap-3 overflow-hidden">
              {[0, 1, 2, 3].map((card) => (
                <div key={card} className="h-40 w-32 shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (categories.length === 0) return null

  return (
    <div className="space-y-6 py-4">
      {categories.map((category) => {
        const slug = category.slug || String(category.name || "").toLowerCase().replace(/\s+/g, "-")
        return (
          <section key={category.id || slug} aria-label={category.name}>
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white sm:text-lg">{category.name}</h3>
              <Link
                to={`/category/${slug}`}
                className="flex items-center gap-0.5 text-sm font-semibold text-[#EF4F5F]"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="scrollbar-hide flex gap-3 overflow-x-auto px-1 pb-1">
              {category.products.map((product, index) => (
                <ProductCard
                  key={product.id || `${product.restaurantId}-${product.name}-${index}`}
                  product={product}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
