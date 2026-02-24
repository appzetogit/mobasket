import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import axios from "axios"
import { API_BASE_URL } from "@/lib/api/config"
import { clearModuleAuth, getRoleFromToken, isModuleAuthenticated } from "@/lib/utils/auth"

export default function ProtectedRoute({ children }) {
  const [authState, setAuthState] = useState("checking")

  useEffect(() => {
    let isMounted = true

    const verifyAuth = async () => {
      const hasValidToken = isModuleAuthenticated("delivery")
      if (hasValidToken) {
        if (isMounted) setAuthState("authenticated")
        return
      }

      try {
        // Silent recovery: if access token expired, try refresh once before forcing sign-in.
        const response = await axios.post(
          `${API_BASE_URL}/delivery/auth/refresh-token`,
          {},
          { withCredentials: true }
        )

        const accessToken = response?.data?.data?.accessToken || response?.data?.accessToken
        const role = getRoleFromToken(accessToken)

        if (accessToken && role === "delivery") {
          localStorage.setItem("delivery_accessToken", accessToken)
          localStorage.setItem("delivery_authenticated", "true")
          if (isMounted) setAuthState("authenticated")
          return
        }
      } catch {
        // Fall through to unauthenticated state below.
      }

      clearModuleAuth("delivery")
      if (isMounted) setAuthState("unauthenticated")
    }

    verifyAuth()

    return () => {
      isMounted = false
    }
  }, [])

  if (authState === "checking") {
    return null
  }

  if (authState !== "authenticated") {
    return <Navigate to="/delivery/sign-in" replace />
  }

  return children
}

