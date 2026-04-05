import { useEffect, useMemo, useState } from "react"
import { Search, Download, ChevronDown, Bell, Edit, Trash2, Upload, Settings, Image as ImageIcon } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { usePlatform } from "../context/PlatformContext"
import { toast } from "sonner"

export default function PushNotification() {
  const { platform } = usePlatform()
  const sendToOptions = ["Customer", "All", "Restaurant", "Store", "Delivery"]
  const [formData, setFormData] = useState({
    title: "",
    zone: "All",
    sendTo: "Customer",
    description: "",
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [notifications, setNotifications] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [editingNotificationId, setEditingNotificationId] = useState("")
  const [zones, setZones] = useState([])
  const [bannerImage, setBannerImage] = useState(null)
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState("")

  const filteredNotifications = useMemo(() => {
    if (!searchQuery.trim()) {
      return notifications
    }
    
    const query = searchQuery.toLowerCase().trim()
    return notifications.filter(notification =>
      notification.title.toLowerCase().includes(query) ||
      notification.description.toLowerCase().includes(query)
    )
  }, [notifications, searchQuery])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleImageChange = (file) => {
    if (!file) return

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid image type. Allowed: JPEG, PNG, WEBP, GIF")
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image size should be 2MB or less")
      return
    }

    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl)
    }

    setBannerImage(file)
    setBannerPreviewUrl(URL.createObjectURL(file))
  }

  const loadPushNotifications = async () => {
    try {
      setLoadingList(true)
      const response = await adminAPI.getPushNotifications()
      const list = response?.data?.data?.notifications || []
      setNotifications(Array.isArray(list) ? list : [])
    } catch (error) {
      console.error("Failed to load push notifications:", error)
      toast.error(error?.response?.data?.message || "Failed to load push notifications")
      setNotifications([])
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    loadPushNotifications()
  }, [])

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      sendTo: sendToOptions.includes(prev.sendTo) ? prev.sendTo : "Customer"
    }))
  }, [])

  useEffect(() => {
    const loadZones = async () => {
      try {
        const response = await adminAPI.getZones({ limit: 1000, platform })
        const list = response?.data?.data?.zones || []
        setZones(Array.isArray(list) ? list : [])
      } catch (error) {
        setZones([])
        console.error("Failed to load zones:", error)
      }
    }
    loadZones()
  }, [platform])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const title = formData.title.trim()
    const description = formData.description.trim()

    if (!title || !description) {
      toast.error("Title and description are required")
      return
    }

    try {
      if (editingNotificationId) {
        setNotifications((prev) =>
          prev.map((item) =>
            (item._id || item.sl) === editingNotificationId
              ? {
                  ...item,
                  title,
                  description,
                  zone: formData.zone,
                  sendTo: formData.sendTo,
                }
              : item
          )
        )
        toast.success("Notification updated")
        setEditingNotificationId("")
        handleReset()
        return
      }

      setIsSubmitting(true)
      const response = await adminAPI.createPushNotification({
        title,
        description,
        zone: formData.zone,
        sendTo: formData.sendTo,
        platform,
        image: bannerImage || undefined,
      })

      const created = response?.data?.data?.notification
      const recipientCount = response?.data?.data?.recipientCount || 0
      const pushDelivery = response?.data?.data?.pushDelivery || null
      if (created) {
        setNotifications((prev) => [created, ...prev])
      }

      if (pushDelivery) {
        const suppressedWebText = Number(pushDelivery.suppressedWebTokenCount || 0) > 0
          ? `, suppressed duplicate web endpoints: ${pushDelivery.suppressedWebTokenCount}`
          : ""
        if (!pushDelivery.initialized && pushDelivery.reason === "no_tokens") {
          toast.warning("No device tokens found. Popup notification cannot be shown until users log in and allow notifications.")
        } else if (!pushDelivery.initialized) {
          toast.error(`Push dispatch failed: ${pushDelivery.reason || "Firebase is not configured"}`)
        } else if (pushDelivery.failureCount > 0) {
          const failureByCode = pushDelivery.failureByCode || {}
          const failureSamples = Array.isArray(pushDelivery.failureSamples) ? pushDelivery.failureSamples : []
          const transportWarnings = Array.isArray(pushDelivery.transportWarnings) ? pushDelivery.transportWarnings : []
          const engine = pushDelivery.engine ? `, engine: ${pushDelivery.engine}` : ""
          const deliveredWeb = Number(pushDelivery.successWebCount || 0)
          const deliveredMobile = Number(pushDelivery.successMobileCount || 0)
          const topFailureCodes = Object.entries(failureByCode)
            .sort((a, b) => (b[1] || 0) - (a[1] || 0))
            .slice(0, 2)
            .map(([code, count]) => `${code} (${count})`)
            .join(", ")
          const sampleMessage = failureSamples[0]?.message ? `, sample: ${failureSamples[0].message}` : ""
          const transportMessage = transportWarnings[0]?.message ? `, transport: ${transportWarnings[0].message}` : ""
          const cleanedText = pushDelivery.invalidTokenCount > 0
            ? `, cleaned invalid tokens: ${pushDelivery.invalidTokenCount}`
            : ""
          const reasonText = topFailureCodes ? `, reasons: ${topFailureCodes}` : ""
          toast.warning(`Sent to ${recipientCount} recipients. Push delivered: ${pushDelivery.successCount} (web: ${deliveredWeb}, mobile: ${deliveredMobile}), failed: ${pushDelivery.failureCount}${cleanedText}${reasonText}${sampleMessage}${transportMessage}${suppressedWebText}${engine}`)
        } else if (pushDelivery.successCount > 0) {
          const deliveredWeb = Number(pushDelivery.successWebCount || 0)
          const deliveredMobile = Number(pushDelivery.successMobileCount || 0)
          const engine = pushDelivery.engine ? `, engine: ${pushDelivery.engine}` : ""
          toast.success(`Sent to ${recipientCount} recipients. Push delivered: ${pushDelivery.successCount} (web: ${deliveredWeb}, mobile: ${deliveredMobile})${suppressedWebText}${engine}`)
        } else {
          toast.success(`Notification sent to ${recipientCount} ${formData.sendTo.toLowerCase()} recipient(s)`)
        }
      } else {
        toast.success(`Notification sent to ${recipientCount} ${formData.sendTo.toLowerCase()} recipient(s)`)
      }
      handleReset()
    } catch (error) {
      console.error("Failed to send notification:", error)
      toast.error(error?.response?.data?.message || "Failed to send notification")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl)
    }
    setFormData({
      title: "",
      zone: "All",
      sendTo: "Customer",
      description: "",
    })
    setBannerImage(null)
    setBannerPreviewUrl("")
    setEditingNotificationId("")
  }

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl) {
        URL.revokeObjectURL(bannerPreviewUrl)
      }
    }
  }, [bannerPreviewUrl])

  const handleToggleStatus = (id) => {
    setNotifications(notifications.map(notification =>
      (notification._id || notification.sl) === id ? { ...notification, status: !notification.status } : notification
    ))
  }

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this notification?")) {
      setNotifications(notifications.filter(notification => (notification._id || notification.sl) !== id))
    }
  }

  const handleEdit = (notification) => {
    setFormData({
      title: notification?.title || "",
      zone: notification?.zone || "All",
      sendTo: notification?.sendTo || notification?.target || "Customer",
      description: notification?.description || "",
    })
    setEditingNotificationId(notification?._id || notification?.sl || "")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleExport = () => {
    const rows = filteredNotifications.map((item) => ({
      title: item.title || "",
      description: item.description || "",
      zone: item.zone || "All",
      target: item.sendTo || item.target || "All",
      status: item.status ? "Active" : "Inactive",
      createdAt: item.createdAt || "",
    }))
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `notifications_${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(link.href)
    toast.success("Notifications exported")
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Create New Notification Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Bell className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Notification</h1>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  placeholder="Ex: Notification Title"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Zone
                </label>
                <select
                  value={formData.zone}
                  onChange={(e) => handleInputChange("zone", e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="All">All</option>
                  {zones.map((zone) => (
                    <option key={zone._id} value={zone.name}>{zone.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Send To
                </label>
                <select
                  value={formData.sendTo}
                  onChange={(e) => handleInputChange("sendTo", e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  {sendToOptions.map((target) => (
                    <option key={target} value={target}>{target}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notification Banner Upload */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Notification banner
              </label>
              <label
                htmlFor="push-banner-image"
                className="block border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
              >
                {bannerPreviewUrl ? (
                  <div className="space-y-3">
                    <img
                      src={bannerPreviewUrl}
                      alt="Notification banner preview"
                      className="mx-auto h-28 w-full max-w-md rounded-lg object-cover border border-slate-200"
                    />
                    <p className="text-sm font-medium text-slate-700">{bannerImage?.name}</p>
                    <p className="text-xs text-blue-600">Click to replace image</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-blue-600 mb-1">Upload Image</p>
                    <p className="text-xs text-slate-500">Image format - jpg png jpeg gif webp Image Size -maximum size 2 MB Image Ratio - 3:1</p>
                  </>
                )}
              </label>
              <input
                id="push-banner-image"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  if (file) {
                    handleImageChange(file)
                  }
                  e.target.value = ""
                }}
              />
              {bannerImage && (
                <button
                  type="button"
                  className="mt-2 text-xs text-red-600 hover:text-red-700"
                  onClick={() => {
                    if (bannerPreviewUrl) {
                      URL.revokeObjectURL(bannerPreviewUrl)
                    }
                    setBannerImage(null)
                    setBannerPreviewUrl("")
                  }}
                >
                  Remove image
                </button>
              )}
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                placeholder="Ex: Notification Descriptions"
                rows={4}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={handleReset}
                className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset
              </button>
              <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md"
              >
                  {isSubmitting ? "Saving..." : editingNotificationId ? "Update Notification" : "Send Notification"}
              </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
                  title="Reset form"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Notification List Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Notification List</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {filteredNotifications.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[200px]">
                <input
                  type="text"
                  placeholder="Search by title"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              <button
                type="button"
                onClick={handleExport}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SI</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Image</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Zone</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Target</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredNotifications.map((notification, index) => (
                  <tr
                    key={notification._id || notification.sl || index}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{index + 1}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-900">{notification.title}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">{notification.description}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {notification.image ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100">
                          <img
                            src={notification.image}
                            alt={notification.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = "none"
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{notification.zone || "All"}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-700">{notification.sendTo || notification.target || "All"}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(notification._id || notification.sl)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          notification.status ? "bg-blue-600" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            notification.status ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(notification)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(notification._id || notification.sl)}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loadingList && (
              <div className="py-6 text-center text-sm text-slate-500">Loading notifications...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
