import { Navigate } from "react-router-dom"
import { isModuleAuthenticated } from "@/lib/utils/auth"

export default function ProtectedRoute({ children }) {
  const isAuthenticated = isModuleAuthenticated("admin")

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  return children
}

