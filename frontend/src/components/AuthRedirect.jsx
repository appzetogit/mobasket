import { Navigate, useLocation } from "react-router-dom"
import { isModuleAuthenticated } from "@/lib/utils/auth"

/**
 * AuthRedirect Component
 * Redirects authenticated users away from auth pages to their module's home page
 * Only shows auth pages to unauthenticated users
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Auth page component to render if not authenticated
 * @param {string} props.module - Module name (user, restaurant, delivery, admin)
 * @param {string} props.redirectTo - Path to redirect to if authenticated (optional, defaults to module home)
 */
export default function AuthRedirect({ children, module, redirectTo = null }) {
  const location = useLocation()
  // Check if user is authenticated for this module
  const isAuthenticated = isModuleAuthenticated(module)

  // Define default home pages for each module
  const moduleHomePages = {
    user: "/home",
    restaurant: "/restaurant",
    delivery: "/delivery",
    admin: "/admin",
    "grocery-store": "/store",
  }

  const pendingOtpSessionByModule = {
    restaurant: "restaurantAuthData",
    "grocery-store": "groceryStoreAuthData",
    user: "authData",
    delivery: "deliveryAuthData",
    admin: "adminAuthData",
  }
  const isOtpRoute = /\/otp$/.test(location.pathname)
  const pendingOtpKey = pendingOtpSessionByModule[module]
  const hasPendingOtpSession = pendingOtpKey ? Boolean(sessionStorage.getItem(pendingOtpKey)) : false

  // If authenticated, redirect to module home page
  if (isAuthenticated && !(isOtpRoute && hasPendingOtpSession)) {
    const resolvedHomePath = moduleHomePages[module] || "/"
    const homePath = redirectTo || resolvedHomePath
    return <Navigate to={homePath} replace />
  }

  // If not authenticated, show the auth page
  return <>{children}</>
}

