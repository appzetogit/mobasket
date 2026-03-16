import { useEffect, useMemo, useRef, useState } from "react";
import { Search, CheckCircle2, XCircle, Eye, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminAPI } from "@/lib/api";
import { toast } from "sonner";
import alertSound from "@/assets/audio/alert.mp3";

export default function FoodApproval() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const previousPendingCountRef = useRef(null);
  const userInteractedRef = useRef(false);
  const audioRef = useRef(null);
  const isAlarmActiveRef = useRef(false);
  const isMountedRef = useRef(true);
  const activeRequestIdRef = useRef(0);

  const resolveRequestsFromResponse = (response) => {
    const candidates = [
      response?.data?.data?.requests,
      response?.data?.requests,
      response?.data?.data,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  };

  const withFetchTimeout = (promise, timeoutMs = 12000) =>
    new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("Food approvals request timed out"));
      }, timeoutMs);

      promise
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timer);
          reject(error);
        });
    });

  const stopNotificationAlarm = () => {
    if (!audioRef.current) return;
    isAlarmActiveRef.current = false;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  };

  const startNotificationAlarm = () => {
    try {
      if (!audioRef.current || !userInteractedRef.current) return;
      if (isAlarmActiveRef.current) return;
      isAlarmActiveRef.current = true;
      audioRef.current.loop = true;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        isAlarmActiveRef.current = false;
      });
    } catch {
      // Ignore runtime audio errors.
    }
  };

  const fetchPendingApprovals = async ({ showLoader = true } = {}) => {
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;

    try {
      if (showLoader && isMountedRef.current) setLoading(true);
      const response = await withFetchTimeout(
        adminAPI.getPendingFoodApprovals({ platform: "mofood" })
      );
      const data = resolveRequestsFromResponse(response);

      if (!isMountedRef.current || requestId !== activeRequestIdRef.current) {
        return;
      }

      const previousCount = previousPendingCountRef.current;
      if ((previousCount === null && data.length > 0) || (previousCount !== null && data.length > previousCount)) {
        startNotificationAlarm();
        toast.info("New food item approval request received");
      }
      if (data.length === 0) {
        stopNotificationAlarm();
      }

      previousPendingCountRef.current = data.length;
      setRequests(data);
    } catch (error) {
      console.error("Error fetching food item approvals:", error);
      if (!isMountedRef.current || requestId !== activeRequestIdRef.current) {
        return;
      }
      toast.error(error?.message || "Failed to load pending food item approvals");
      setRequests([]);
    } finally {
      if (showLoader && isMountedRef.current && requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    audioRef.current = new Audio(alertSound);
    audioRef.current.volume = 0.7;

    const markUserInteraction = () => {
      userInteractedRef.current = true;
      if ((previousPendingCountRef.current || 0) > 0) {
        startNotificationAlarm();
      }
    };

    window.addEventListener("click", markUserInteraction, { passive: true });
    window.addEventListener("keydown", markUserInteraction, { passive: true });
    window.addEventListener("touchstart", markUserInteraction, { passive: true });

    fetchPendingApprovals({ showLoader: true });
    const pollTimer = setInterval(() => {
      fetchPendingApprovals({ showLoader: false });
    }, 10000);

    return () => {
      isMountedRef.current = false;
      clearInterval(pollTimer);
      window.removeEventListener("click", markUserInteraction);
      window.removeEventListener("keydown", markUserInteraction);
      window.removeEventListener("touchstart", markUserInteraction);
      if (audioRef.current) {
        stopNotificationAlarm();
        audioRef.current = null;
      }
    };
  }, []);

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return requests;

    return requests.filter((request) =>
      request.itemName?.toLowerCase().includes(query) ||
      request.restaurantName?.toLowerCase().includes(query) ||
      request.restaurantId?.toLowerCase().includes(query) ||
      request.category?.toLowerCase().includes(query) ||
      request.sectionName?.toLowerCase().includes(query) ||
      request.type?.toLowerCase().includes(query)
    );
  }, [requests, searchQuery]);

  const handleApprove = async (request) => {
    try {
      setProcessing(true);
      await adminAPI.approveFoodItem(request._id || request.id);
      stopNotificationAlarm();
      toast.success("Food item approved");
      await fetchPendingApprovals();
      setShowDetailModal(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error("Error approving food item:", error);
      toast.error(error?.response?.data?.message || "Failed to approve food item");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }

    try {
      setProcessing(true);
      await adminAPI.rejectFoodItem(selectedRequest._id || selectedRequest.id, rejectReason.trim());
      stopNotificationAlarm();
      toast.success("Food item rejected");
      await fetchPendingApprovals();
      setShowRejectModal(false);
      setShowDetailModal(false);
      setSelectedRequest(null);
      setRejectReason("");
    } catch (error) {
      console.error("Error rejecting food item:", error);
      toast.error(error?.response?.data?.message || "Failed to reject food item");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Food Item Approval</h1>
      </div>

      <Card className="border border-gray-200 shadow-sm">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-gray-900">Pending Food Item Approvals</h2>
            <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-600">
              {filteredRequests.length}
            </span>
          </div>

          <div className="mb-4">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-2.5 flex items-center text-gray-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search by item, restaurant, category, section"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:border-[#006fbd] focus:ring-1 focus:ring-[#006fbd]"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#006fbd]" />
            </div>
          ) : (
            <div className="border-t border-gray-200">
              <div className="w-full overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead style={{ backgroundColor: "rgba(0, 111, 189, 0.1)" }}>
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">S.No</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Item</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Restaurant</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Section</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Price</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Requested Date</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-3 py-8 text-center text-sm text-gray-500">
                          No pending food item approval requests found.
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((request, index) => (
                        <tr key={request._id || request.id} className="hover:bg-gray-50">
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">{index + 1}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="font-semibold text-gray-900">{request.itemName || "-"}</div>
                              <div className="text-gray-500 text-xs">{request.category || "-"}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="font-semibold text-gray-900">{request.restaurantName || "-"}</div>
                              <div className="text-gray-500 text-xs">{request.restaurantId || "-"}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700">
                            {[request.sectionName, request.subsectionName].filter(Boolean).join(" / ") || "-"}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                            {request.type === "addon" ? "Add-on" : "Food Item"}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                            Rs {request.price || "0.00"}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                            {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowDetailModal(true);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white transition-colors"
                                style={{ backgroundColor: "#006fbd" }}
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleApprove(request)}
                                disabled={processing}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Approve"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowRejectModal(true);
                                }}
                                disabled={processing}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0 bg-white">
          <DialogHeader className="p-6 pb-4 border-b border-gray-200">
            <DialogTitle className="text-xl font-semibold text-gray-900">Food Item Details</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              Review item details before approval.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="p-6 space-y-4">
              <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                <h3 className="font-semibold text-sm text-gray-900 mb-2">Item Information</h3>
                <p className="text-sm text-gray-700"><span className="font-medium">Name:</span> {selectedRequest.itemName || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">Type:</span> {selectedRequest.type === "addon" ? "Add-on" : "Food Item"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">Category:</span> {selectedRequest.category || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">Food Type:</span> {selectedRequest.foodType || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">Price:</span> Rs {selectedRequest.price || "0.00"}</p>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <h3 className="font-semibold text-sm text-gray-900 mb-2">Restaurant Information</h3>
                <p className="text-sm text-gray-700"><span className="font-medium">Name:</span> {selectedRequest.restaurantName || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">ID:</span> {selectedRequest.restaurantId || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">Section:</span> {[selectedRequest.sectionName, selectedRequest.subsectionName].filter(Boolean).join(" / ") || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">Requested At:</span> {selectedRequest.requestedAt ? new Date(selectedRequest.requestedAt).toLocaleString() : "-"}</p>
              </div>

              {selectedRequest.description ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <p className="text-sm text-gray-900">{selectedRequest.description}</p>
                </div>
              ) : null}

              {selectedRequest.image ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Primary Image</label>
                  <img
                    src={selectedRequest.image}
                    alt={selectedRequest.itemName || "Food item"}
                    className="w-full max-h-60 object-cover rounded-lg border border-gray-200"
                  />
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="p-6 pt-4 border-t border-gray-200 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowDetailModal(false);
                setSelectedRequest(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setShowRejectModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => handleApprove(selectedRequest)}
              disabled={processing}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? "Processing..." : "Approve"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="max-w-md p-0 bg-white">
          <DialogHeader className="p-6 pb-4 border-b border-gray-200">
            <DialogTitle className="text-xl font-semibold text-gray-900">Reject Food Item</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              Please provide a reason for rejection.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <label htmlFor="rejectReason" className="block text-sm font-medium text-gray-700 mb-2">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              required
              rows={4}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#006fbd] focus:border-[#006fbd]"
            />
            <DialogFooter className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={processing || !rejectReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? "Processing..." : "Reject"}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
