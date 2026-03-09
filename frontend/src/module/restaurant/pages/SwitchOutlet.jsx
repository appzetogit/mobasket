import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"

export default function SwitchOutlet() {
  const navigate = useNavigate()
  const location = useLocation()
  const isStore = location.pathname.startsWith("/store")

  useEffect(() => {
    navigate(isStore ? "/store/explore" : "/restaurant/explore", { replace: true })
  }, [isStore, navigate])

  return null
}
