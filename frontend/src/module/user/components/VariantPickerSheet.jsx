import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { usableVariations } from "../utils/variations"

/*
 * Size picker for food items with options such as Half / Full (requirement 5).
 *
 * Each option carries its own price, and nothing is preselected: the customer
 * picks one before the item goes in the cart. The chosen option travels with
 * the cart line to checkout, where the server prices it from the menu.
 */

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

const optionKey = (variant, index) => String(variant?.id || variant?.name || index)

const NO_PICK = { itemKey: "", optionKey: null }

export default function VariantPickerSheet({ item, onClose, onConfirm }) {
  // A pick belongs to the item it was made for and is cleared on close, so
  // the sheet always opens with nothing selected.
  const itemKey = item ? String(item.id || item._id || item.name || "") : ""
  const [pick, setPick] = useState(NO_PICK)
  const selectedKey = pick.itemKey === itemKey ? pick.optionKey : null

  const close = () => {
    setPick(NO_PICK)
    onClose?.()
  }

  useEffect(() => {
    if (!item) return undefined
    const onKey = (e) => {
      if (e.key === "Escape") {
        setPick(NO_PICK)
        onClose?.()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [item, onClose])

  if (!item) return null

  const options = usableVariations(item)
  const selected = options.find((v, i) => optionKey(v, i) === selectedKey) || null

  const confirm = () => {
    if (!selected) return
    setPick(NO_PICK)
    onConfirm?.(selected)
  }

  // Portalled to <body>: the restaurant page sits inside an animated
  // (transformed) wrapper, which would otherwise pin a fixed overlay to the
  // wrapper instead of the screen. Stacked above the item detail sheet, since
  // Add can be tapped from there.
  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="variant-picker-title"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-[#1a1a1a]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="variant-picker-title" className="truncate text-lg font-bold text-gray-900 dark:text-white">
              {item.name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Choose a size</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2" role="radiogroup" aria-label="Size">
          {options.map((variant, index) => {
            const key = optionKey(variant, index)
            const checked = key === selectedKey
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setPick({ itemKey, optionKey: key })}
                className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition ${
                  checked
                    ? "border-[#EF4F5F] bg-[#EF4F5F]/5"
                    : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      checked ? "border-[#EF4F5F]" : "border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {checked && <span className="h-2.5 w-2.5 rounded-full bg-[#EF4F5F]" />}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{variant.name}</span>
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{money(variant.price)}</span>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          disabled={!selected}
          onClick={confirm}
          className="mt-5 w-full rounded-xl bg-[#EF4F5F] py-3 text-sm font-bold text-white transition hover:bg-[#e03f50] disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700"
        >
          {selected ? `Add item · ${money(selected.price)}` : "Select a size to continue"}
        </button>
      </div>
    </div>,
    document.body,
  )
}
