import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Bell, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { groceryStoreAPI, restaurantAPI } from "@/lib/api"

export default function Notifications() {
  const navigate = useNavigate()
  const location = useLocation()
  const isStore = location.pathname.startsWith("/store")
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const notificationAPI = useMemo(
    () => (isStore ? groceryStoreAPI : restaurantAPI),
    [isStore]
  )

  const formatNotificationTime = (value) => {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""

    const now = Date.now()
    const diffMs = now - date.getTime()
    const minutes = Math.floor(diffMs / 60000)

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`

    return date.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
    }

    try {
      const response = await notificationAPI.getNotifications()
      const list = response?.data?.data?.notifications
      setNotifications(Array.isArray(list) ? list : [])
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || "Failed to load notifications")
      }
      setNotifications([])
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [notificationAPI])

  const handleDeleteOne = async (id) => {
    if (!id || actionLoading) return
    setActionLoading(true)
    try {
      await notificationAPI.deleteNotification(id)
      setNotifications((prev) => prev.filter((item) => item?._id !== id))
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete notification")
    } finally {
      setActionLoading(false)
    }
  }

  const handleClearAll = async () => {
    if (actionLoading || notifications.length === 0) return
    setActionLoading(true)
    try {
      await notificationAPI.clearNotifications()
      setNotifications([])
      toast.success("All notifications cleared")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to clear notifications")
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()

    // Keep list fresh even if realtime event was missed on this screen.
    const interval = setInterval(() => {
      loadNotifications({ silent: true })
    }, 15000)

    return () => clearInterval(interval)
  }, [loadNotifications])

  const handleNotificationClick = (notification) => {
    const orderMongoId = notification?.orderMongoId
    if (!orderMongoId) return
    navigate(isStore ? `/store/orders/${orderMongoId}` : `/restaurant/orders/${orderMongoId}`)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(isStore ? "/store" : "/restaurant")}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">Notifications</h1>
        </div>

        {notifications.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={actionLoading}
            className="text-xs font-semibold text-red-600 disabled:opacity-50"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex-1 px-4 pt-4 pb-28">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center text-sm text-gray-600 py-12">
            No notifications
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification._id}
                role="button"
                tabIndex={0}
                onClick={() => handleNotificationClick(notification)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleNotificationClick(notification)
                  }
                }}
                className="w-full text-left rounded-xl border border-gray-200 bg-white p-3 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <Bell className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {notification.title || "Notification"}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteOne(notification._id)
                        }}
                        className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                        aria-label="Delete notification"
                        disabled={actionLoading}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 break-words">
                      {notification.message || ""}
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                      {formatNotificationTime(notification.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
