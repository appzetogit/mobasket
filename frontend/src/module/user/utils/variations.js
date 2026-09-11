/**
 * The size options of a food item (e.g. Half / Full) that can actually be
 * offered: each needs a name and a numeric price of its own.
 */
export const usableVariations = (item) =>
  (Array.isArray(item?.variations) ? item.variations : []).filter(
    (v) => v && String(v.name || "").trim() && Number.isFinite(Number(v.price)),
  )
