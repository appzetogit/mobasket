import { IndianRupee } from "lucide-react"

export const isCodOrder = (order) => {
  const method = String(
    order?.paymentMethod ??
    order?.payment?.method ??
    order?.payment ??
    order?.paymentType ??
    ""
  ).toLowerCase()

  return method === "cash" || method === "cod" || method.includes("cash on delivery")
}

export const getCodCollectionAmount = (order) => {
  const candidates = [
    order?.amountToCollect,
    order?.codAmount,
    order?.cashToCollect,
    order?.total,
    order?.totalAmount,
    order?.orderAmount,
    order?.pricing?.total,
    order?.bill?.total,
    order?.invoice?.total,
  ]

  for (const candidate of candidates) {
    const amount = Number(candidate)
    if (Number.isFinite(amount) && amount > 0) return amount
  }

  return 0
}

export default function DeliveryCodCollectionNotice({ order, className = "" }) {
  if (!isCodOrder(order)) return null

  const amount = getCodCollectionAmount(order)
  if (amount <= 0) return null

  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IndianRupee className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-900">
            Collect from customer (COD)
          </span>
        </div>
        <span className="shrink-0 text-lg font-bold text-amber-700">
          &#8377;
          {amount.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
    </div>
  )
}
