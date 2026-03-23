export function navigateBackWithinDelivery(navigate, fallbackPath = "/delivery") {
  if (typeof navigate !== "function") return

  if (typeof window !== "undefined" && window.history.length > 1) {
    navigate(-1)
    return
  }

  navigate(fallbackPath)
}
