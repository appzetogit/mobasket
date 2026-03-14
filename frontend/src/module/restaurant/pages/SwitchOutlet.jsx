import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Store, Power, Plus } from "lucide-react"

export default function SwitchOutlet() {
  const navigate = useNavigate()
  const location = useLocation()
  const isStore = location.pathname.startsWith("/store")
  const baseRoute = isStore ? "/store" : "/restaurant"
  const manageRoute = isStore ? "/store/manage-outlets" : "/restaurant/manage-outlets"
  const statusRoute = `${baseRoute}/status`
  const title = isStore ? "Store outlet" : "Restaurant outlet"
  const subtitle = isStore
    ? "Manage your store outlet details and online/offline status."
    : "Manage your restaurant outlet details and online/offline status."

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Switch outlet</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
        </div>

        <button
          onClick={() => navigate(manageRoute)}
          className="w-full bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Store className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Manage outlet</p>
              <p className="text-xs text-gray-600">Edit outlet information and details</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-blue-600">Open</span>
        </button>

        <button
          onClick={() => navigate(statusRoute)}
          className="w-full bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Power className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">Change outlet status</p>
              <p className="text-xs text-gray-600">Switch online/offline and view status details</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-green-600">Open</span>
        </button>

        <button
          onClick={() => navigate(`${baseRoute}/outlet-info?mode=new`)}
          className="w-full bg-black text-white rounded-xl p-4 flex items-center justify-between hover:bg-gray-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Add new outlet</p>
              <p className="text-xs text-white/80">Create a new outlet from here</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-white">Add</span>
        </button>
      </div>
    </div>
  )
}
