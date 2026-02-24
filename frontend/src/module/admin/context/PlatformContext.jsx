import { createContext, useContext, useState, useEffect } from "react"

const PlatformContext = createContext(null)

export function PlatformProvider({ children }) {
  // Get initial platform from localStorage, default to 'mofood'
  const [platform, setPlatform] = useState(() => {
    if (typeof window === "undefined") return "mofood"
    try {
      const saved = localStorage.getItem("adminPlatform")
      return saved === "mogrocery" ? "mogrocery" : "mofood"
    } catch {
      return "mofood"
    }
  })

  // Persist to localStorage whenever platform changes
  useEffect(() => {
    try {
      localStorage.setItem("adminPlatform", platform)
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [platform])

  const switchPlatform = (newPlatform) => {
    if (newPlatform === "mofood" || newPlatform === "mogrocery") {
      setPlatform(newPlatform)
    }
  }

  const value = {
    platform,
    switchPlatform,
    isMofood: platform === "mofood",
    isMogrocery: platform === "mogrocery",
  }

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

export function usePlatform() {
  const context = useContext(PlatformContext)
  if (!context) {
    throw new Error("usePlatform must be used within PlatformProvider")
  }
  return context
}
