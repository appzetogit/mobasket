import { Bookmark, Loader2, LocateFixed, MapPinned } from "lucide-react"

/*
 * The three ways to set the delivery location at checkout (requirement 6):
 * detect it, add it by hand (search plus a draggable map pin), or pick a saved
 * address. Deliberately large, bold and coloured, since the location decides
 * whether an order can be delivered at all.
 */

const TONES = {
  food: {
    active: "border-[#EF4F5F] bg-[#EF4F5F] text-white shadow-[0_8px_20px_rgba(239,79,95,0.28)]",
    idle: "border-[#EF4F5F]/40 bg-white text-[#EF4F5F] hover:bg-[#fff1f2] dark:bg-[#0f172a] dark:hover:bg-white/5",
  },
  grocery: {
    active: "border-[#ff8100] bg-[#ff8100] text-white shadow-[0_8px_20px_rgba(255,129,0,0.28)]",
    idle: "border-[#ff8100]/40 bg-white text-[#ff8100] hover:bg-orange-50 dark:bg-[#1f1f1f] dark:hover:bg-white/5",
  },
}

const ICON_CLASS = "h-6 w-6"

const OPTIONS = [
  { key: "detect", label: "Detect current location", icon: <LocateFixed className={ICON_CLASS} /> },
  { key: "manual", label: "Add location manually", icon: <MapPinned className={ICON_CLASS} /> },
  { key: "saved", label: "Saved locations", icon: <Bookmark className={ICON_CLASS} /> },
]

export default function DeliveryLocationChoice({ mode, onChange, detecting = false, savedCount = 0, tone = "food" }) {
  const palette = TONES[tone] || TONES.food

  return (
    <div role="radiogroup" aria-label="Delivery location" className="grid grid-cols-3 gap-2">
      {OPTIONS.map((option) => {
        const active = mode === option.key
        const busy = option.key === "detect" && detecting
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={busy}
            onClick={() => onChange?.(option.key)}
            className={`flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-center transition ${
              active ? palette.active : palette.idle
            }`}
          >
            {busy ? <Loader2 className={`${ICON_CLASS} animate-spin`} /> : option.icon}
            <span className="text-[11px] font-black uppercase leading-tight tracking-wide sm:text-xs">
              {option.label}
            </span>
            {option.key === "saved" && savedCount > 0 ? (
              <span className="text-[10px] font-bold opacity-80">{savedCount} saved</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
