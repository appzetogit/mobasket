const FALLBACK_BACKGROUND = "#e2e8f0"
const FALLBACK_FOREGROUND = "#64748b"

const encodeSvg = (value) =>
  encodeURIComponent(value)
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/")

export const buildImageFallback = (size = 40, label = "IMG") => {
  const normalizedSize = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 40
  const safeLabel = String(label || "IMG").trim().slice(0, 3).toUpperCase()
  const fontSize = Math.max(10, Math.round(normalizedSize * 0.32))

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${normalizedSize}" height="${normalizedSize}" viewBox="0 0 ${normalizedSize} ${normalizedSize}"><rect width="${normalizedSize}" height="${normalizedSize}" rx="${Math.round(normalizedSize * 0.2)}" fill="${FALLBACK_BACKGROUND}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${FALLBACK_FOREGROUND}">${safeLabel}</text></svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeSvg(svg)}`
}

export const DEFAULT_IMAGE_FALLBACK_40 = buildImageFallback(40)
