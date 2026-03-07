import { useState, useMemo, useEffect } from "react"
import { 
  Search, Filter, Eye, Check, X, Store, ArrowUpDown, Loader2,
  FileText, Image as ImageIcon, ExternalLink, CreditCard, Calendar, Star, Building2, User, Phone, Mail, MapPin, Clock
} from "lucide-react"
import { adminAPI } from "../../../../lib/api"
import { buildImageFallback } from "@/lib/utils/imageFallback"

export default function GroceryStoreJoiningRequest() {
  const [activeTab, setActiveTab] = useState("pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [pendingRequests, setPendingRequests] = useState([])
  const [rejectedRequests, setRejectedRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [storeDetails, setStoreDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => {
    fetchRequests()
  }, [activeTab])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRequests()
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      setError(null)

      const status = activeTab === "pending" ? "pending" : "rejected"
      const response = await adminAPI.getGroceryStoreJoinRequests({
        status,
        search: searchQuery || undefined,
        page: 1,
        limit: 100
      })

      if (response.data && response.data.success && response.data.data) {
        const requests = response.data.data.requests || []
        if (activeTab === "pending") {
          setPendingRequests(requests)
        } else {
          setRejectedRequests(requests)
        }
      } else {
        if (activeTab === "pending") {
          setPendingRequests([])
        } else {
          setRejectedRequests([])
        }
      }
    } catch (err) {
      console.error("Error fetching grocery store requests:", err)
      setError(err.message || "Failed to fetch grocery store requests")
      if (activeTab === "pending") {
        setPendingRequests([])
      } else {
        setRejectedRequests([])
      }
    } finally {
      setLoading(false)
    }
  }

  const currentRequests = activeTab === "pending" ? pendingRequests : rejectedRequests

  const filteredRequests = useMemo(() => {
    let filtered = currentRequests

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(request =>
        request.storeName?.toLowerCase().includes(query) ||
        request.ownerName?.toLowerCase().includes(query) ||
        request.ownerPhone?.includes(query)
      )
    }

    return filtered
  }, [currentRequests, searchQuery])

  const handleApprove = async (request) => {
    if (window.confirm(`Are you sure you want to approve "${request.storeName}" grocery store request?`)) {
      try {
        setProcessing(true)
        await adminAPI.approveGroceryStore(request._id)
        await fetchRequests()
        alert(`Successfully approved ${request.storeName}'s join request!`)
      } catch (err) {
        console.error("Error approving request:", err)
        alert(err.response?.data?.message || "Failed to approve request. Please try again.")
      } finally {
        setProcessing(false)
      }
    }
  }

  const handleReject = (request) => {
    setSelectedRequest(request)
    setRejectionReason("")
    setShowRejectDialog(true)
  }

  const confirmReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      alert("Please provide a rejection reason")
      return
    }

    try {
      setProcessing(true)
      await adminAPI.rejectGroceryStore(selectedRequest._id, rejectionReason)
      await fetchRequests()
      setShowRejectDialog(false)
      setSelectedRequest(null)
      setRejectionReason("")
      alert(`Successfully rejected ${selectedRequest.storeName}'s join request!`)
    } catch (err) {
      console.error("Error rejecting request:", err)
      alert(err.response?.data?.message || "Failed to reject request. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  const handleViewDetails = async (request) => {
    setSelectedRequest(request)
    setShowDetailsModal(true)
    setLoadingDetails(true)
    setStoreDetails(null)
    
    try {
      if (request.fullData) {
        setStoreDetails(request.fullData)
        setLoadingDetails(false)
        return
      }
      
      const storeId = request._id || request.id
      if (storeId && adminAPI.getGroceryStoreById) {
        const response = await adminAPI.getGroceryStoreById(storeId)
        if (response?.data?.success) {
          setStoreDetails(response.data.data.store || response.data.data)
        } else {
          setStoreDetails(request)
        }
      } else {
        setStoreDetails(request)
      }
    } catch (err) {
      console.error("Error fetching store details:", err)
      setStoreDetails(request)
    } finally {
      setLoadingDetails(false)
    }
  }

  const closeDetailsModal = () => {
    setShowDetailsModal(false)
    setSelectedRequest(null)
    setStoreDetails(null)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">New Grocery Store Join Request</h1>
          </div>

          <div className="flex items-center gap-2 border-b border-slate-200 mb-6">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "pending"
                  ? "border-green-600 text-green-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Pending Requests
            </button>
            <button
              onClick={() => setActiveTab("rejected")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "rejected"
                  ? "border-green-600 text-green-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Rejected Request
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="relative flex-1 sm:flex-initial min-w-[250px]">
              <input
                type="text"
                placeholder="Search by store name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>SL</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    Store Info
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    Owner Info
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-3" />
                      <p className="text-lg font-semibold text-slate-700">Loading store requests...</p>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <p className="text-lg font-semibold text-red-600 mb-1">Error: {error}</p>
                      <p className="text-sm text-slate-500">Failed to load store requests. Please try again.</p>
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                        <p className="text-sm text-slate-500">No grocery store requests match your search</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => (
                    <tr key={request.sl} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{request.sl}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <img
                              src={request.storeImage || buildImageFallback(40, "STR")}
                              alt={request.storeName}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.src = buildImageFallback(40, "STR")
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium text-slate-900">{request.storeName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-900">{request.ownerName}</span>
                          <span className="text-xs text-slate-500">{request.ownerPhone || "N/A"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          request.status === "Pending"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleViewDetails(request)}
                            className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {activeTab === "pending" && (
                            <>
                              <button
                                onClick={() => handleApprove(request)}
                                disabled={processing}
                                className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Approve"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleReject(request)}
                                disabled={processing}
                                className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reject"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowRejectDialog(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <X className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Reject Store Request</h3>
                  <p className="text-sm text-slate-600">{selectedRequest.storeName}</p>
                </div>
              </div>
              
              <p className="text-sm text-slate-700 mb-4">
                Are you sure you want to reject this grocery store request? Please provide a reason for rejection.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                  rows={4}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowRejectDialog(false)
                    setSelectedRequest(null)
                    setRejectionReason("")
                  }}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={processing || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Rejecting...
                    </span>
                  ) : (
                    "Reject Request"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={closeDetailsModal}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-2xl font-bold text-slate-900">Store Details - {selectedRequest.storeName || "N/A"}</h2>
              <button
                onClick={closeDetailsModal}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6">
              {loadingDetails && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                  <span className="ml-3 text-slate-600">Loading details...</span>
                </div>
              )}
              {!loadingDetails && (storeDetails || selectedRequest) && (
                <div className="space-y-6">
                  <div className="flex items-start gap-6 pb-6 border-b border-slate-200">
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
                      <img
                        src={storeDetails?.profileImage?.url || storeDetails?.onboarding?.storeImage?.url || selectedRequest?.storeImage || buildImageFallback(96, "STR")}
                        alt={storeDetails?.name || selectedRequest?.storeName || "Store"}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = buildImageFallback(96, "STR")
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-slate-900 mb-2">
                        {storeDetails?.name || selectedRequest?.storeName || "N/A"}
                      </h3>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          storeDetails?.isActive !== false ? "bg-green-100 text-green-700" : "bg-green-100 text-green-700"
                        }`}>
                          {storeDetails?.isActive !== false ? "Active" : "Pending Approval"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {(storeDetails?.onboarding?.storeImage || storeDetails?.onboarding?.additionalImages) && (
                    <div className="pt-6 border-t border-slate-200">
                      <h4 className="text-lg font-semibold text-slate-900 mb-4">Store Images</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {storeDetails.onboarding.storeImage && (
                          <div className="rounded-lg overflow-hidden border border-slate-200">
                            <img
                              src={storeDetails.onboarding.storeImage.url || storeDetails.onboarding.storeImage}
                              alt="Store"
                              className="w-full h-32 object-cover"
                            />
                          </div>
                        )}
                        {storeDetails.onboarding.additionalImages && storeDetails.onboarding.additionalImages.map((img, idx) => (
                          <div key={idx} className="rounded-lg overflow-hidden border border-slate-200">
                            <img
                              src={img.url || img}
                              alt={`Additional ${idx + 1}`}
                              className="w-full h-32 object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
