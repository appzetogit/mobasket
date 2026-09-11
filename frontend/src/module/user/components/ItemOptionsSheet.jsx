import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { usableVariations } from "../utils/variations"

/*
 * Options for a dish before it goes in the cart: its size, when it has more
 * than one (requirement 5), and the add-ons linked to its menu category, such
 * as Extra Cheese on a burger (requirement 10).
 *
 * A size must be picked when the dish has sizes; nothing is preselected.
 * Add-ons are optional. The chosen options travel with the cart line to
 * checkout, where the server prices them from the menu.
 */

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

const optionKey = (variant, index) => String(variant?.id || variant?.name || index)

const NO_PICK = { itemKey: "", sizeKey: null, addonIds: [] }

export default function ItemOptionsSheet({ item, addons = [], onClose, onConfirm }) {
  // A pick belongs to the item it was made for and is cleared on close, so the
  // sheet always opens with nothing selected.
  const itemKey = item ? String(item.id || item._id || item.name || "") : ""
  const [pick, setPick] = useState(NO_PICK)
  const current = pick.itemKey === itemKey ? pick : { ...NO_PICK, itemKey }

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

  const sizes = usableVariations(item)
  const offeredAddons = (Array.isArray(addons) ? addons : []).filter((a) => a?.id && String(a.name || "").trim())
  const size = sizes.find((v, i) => optionKey(v, i) === current.sizeKey) || null
  const chosenAddons = offeredAddons.filter((a) => current.addonIds.includes(String(a.id)))
  const needsSize = sizes.length > 0
  const basePrice = size ? Number(size.price || 0) : Number(item.price || 0)
  const total = basePrice + chosenAddons.reduce((sum, a) => sum + Number(a.price || 0), 0)
  const ready = !needsSize || Boolean(size)

  const setSize = (key) => setPick({ ...current, sizeKey: key })
  const toggleAddon = (id) =>
    setPick({
      ...current,
      addonIds: current.addonIds.includes(id) ? current.addonIds.filter((a) => a !== id) : [...current.addonIds, id],
    })

  const confirm = () => {
    if (!ready) return
    setPick(NO_PICK)
    onConfirm?.({
      variant: size,
      addons: chosenAddons.map((a) => ({ id: String(a.id), name: String(a.name).trim(), price: Number(a.price || 0) })),
    })
  }

  const rowClass = (on) =>
    `flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition ${
      on ? "border-[#EF4F5F] bg-[#EF4F5F]/5" : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
    }`

  // Portalled to <body>: the restaurant page sits inside an animated
  // (transformed) wrapper, which would otherwise pin a fixed overlay to the
  // wrapper instead of the screen. Stacked above the item detail sheet, since
  // Add can be tapped from there.
  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-options-title"
      onClick={close}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl dark:bg-[#1a1a1a]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <h2 id="item-options-title" className="truncate text-lg font-bold text-gray-900 dark:text-white">
              {item.name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {needsSize ? "Choose a size" : "Customise your order"}
            </p>
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

        <div className="space-y-5 overflow-y-auto px-5 pb-2">
          {needsSize && (
            <div role="radiogroup" aria-label="Size" className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Size · required</p>
              {sizes.map((variant, index) => {
                const key = optionKey(variant, index)
                const on = key === current.sizeKey
                return (
                  <button key={key} type="button" role="radio" aria-checked={on} onClick={() => setSize(key)} className={rowClass(on)}>
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                          on ? "border-[#EF4F5F]" : "border-gray-300 dark:border-gray-600"
                        }`}
                      >
                        {on && <span className="h-2.5 w-2.5 rounded-full bg-[#EF4F5F]" />}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{variant.name}</span>
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{money(variant.price)}</span>
                  </button>
                )
              })}
            </div>
          )}

          {offeredAddons.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Add-ons · optional</p>
              {offeredAddons.map((addon) => {
                const id = String(addon.id)
                const on = current.addonIds.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleAddon(id)}
                    className={rowClass(on)}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border-2 text-[11px] font-black text-white ${
                          on ? "border-[#EF4F5F] bg-[#EF4F5F]" : "border-gray-300 dark:border-gray-600"
                        }`}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{addon.name}</span>
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">+{money(addon.price)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-5 pt-3">
          <button
            type="button"
            disabled={!ready}
            onClick={confirm}
            className="w-full rounded-xl bg-[#EF4F5F] py-3 text-sm font-bold text-white transition hover:bg-[#e03f50] disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700"
          >
            {ready ? `Add item · ${money(total)}` : "Select a size to continue"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
