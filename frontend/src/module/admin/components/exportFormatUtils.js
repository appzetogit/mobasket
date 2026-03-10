const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const parseExportAmount = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN
  }

  if (typeof value === "string") {
    const cleanedValue = value.replace(/,/g, "").replace(/[^\d.-]/g, "")
    const parsed = Number.parseFloat(cleanedValue)
    return Number.isFinite(parsed) ? parsed : NaN
  }

  return NaN
}

export const formatExportAmount = (value, options = {}) => {
  const { fallback = "N/A", showZero = true } = options
  const amount = parseExportAmount(value)

  if (!Number.isFinite(amount)) {
    return fallback
  }

  if (!showZero && amount <= 0) {
    return fallback
  }

  return `INR ${inrFormatter.format(amount)}`
}

export const normalizeExportCurrencyText = (value) => {
  if (value === null || value === undefined || typeof value !== "string") {
    return value
  }

  return value
    .replace(/\u20B9|\$|Rs\.?/gi, "INR ")
    .replace(/\bINR\s+INR\b/gi, "INR")
    .replace(/\s{2,}/g, " ")
    .trim()
}

export const normalizeExportCell = (value) => {
  if (typeof value === "string") {
    return normalizeExportCurrencyText(value)
  }

  return value
}
