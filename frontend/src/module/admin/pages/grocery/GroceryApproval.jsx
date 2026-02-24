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

export default function GroceryApproval() {
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
      // ignore browser autoplay/runtime audio errors
    }
  };

  const fetchPendingApprovals = async ({ showLoader = true } = {}) => {
    try {
      if (showLoader) setLoading(true);
      const response = await adminAPI.getPendingFoodApprovals({ platform: "mogrocery" });
      const data = response?.data?.data?.requests || response?.data?.requests || [];

      const previousCount = previousPendingCountRef.current;
      if ((previousCount === null && data.length > 0) || (previousCount !== null && data.length > previousCount)) {
        startNotificationAlarm();
        toast.info("New grocery approval request received");
      }
      if (data.length === 0) {
        stopNotificationAlarm();
      }

      previousPendingCountRef.current = data.length;
      setRequests(data);
    } catch (error) {
      console.error("Error fetching grocery order approvals:", error);
      toast.error("Failed to load pending grocery order approvals");
      setRequests([]);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
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
      request.orderId?.toLowerCase().includes(query) ||
      request.restaurantName?.toLowerCase().includes(query) ||
      request.restaurantId?.toLowerCase().includes(query) ||
      request.itemName?.toLowerCase().includes(query) ||
      request.customerName?.toLowerCase().includes(query)
    );
  }, [requests, searchQuery]);

  const handleApprove = async (request) => {
    try {
      setProcessing(true);
      await adminAPI.approveFoodItem(request._id || request.id);
      stopNotificationAlarm();
      toast.success("Grocery order approved successfully");
      await fetchPendingApprovals();
      setShowDetailModal(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error("Error approving grocery order:", error);
      toast.error(error?.response?.data?.message || "Failed to approve grocery order");
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
      await adminAPI.rejectFoodItem(selectedRequest._id || selectedRequest.id, rejectReason);
      stopNotificationAlarm();
      toast.success("Grocery order rejected");
      await fetchPendingApprovals();
      setShowRejectModal(false);
      setShowDetailModal(false);
      setSelectedRequest(null);
      setRejectReason("");
    } catch (error) {
      console.error("Error rejecting grocery order:", error);
      toast.error(error?.response?.data?.message || "Failed to reject grocery order");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Grocery Order Approval</h1>
      </div>

      <Card className="border border-gray-200 shadow-sm">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-gray-900">Pending Grocery Order Approvals</h2>
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
                placeholder="Search by order id, store, customer, item"
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
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Order</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Store</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Customer</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Items</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Ordered Date</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-3 py-8 text-center text-sm text-gray-500">
                          No pending grocery order approvals found.
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((request, index) => (
                        <tr key={request._id || request.id} className="hover:bg-gray-50">
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">{index + 1}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="font-semibold text-gray-900">{request.orderId || request.id || "-"}</div>
                              <div className="text-gray-500 text-xs">{request.paymentMethod || "-"}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="font-semibold text-gray-900">{request.restaurantName || "-"}</div>
                              <div className="text-gray-500 text-xs">{request.restaurantId || "-"}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="font-semibold text-gray-900">{request.customerName || "-"}</div>
                              <div className="text-gray-500 text-xs">{request.customerPhone || "-"}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                            {request.item?.quantity || 0} item(s)
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
            <DialogTitle className="text-xl font-semibold text-gray-900">Grocery Order Details</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              Review full order details before approval.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="p-6 space-y-4">
              <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                <h3 className="font-semibold text-sm text-gray-900 mb-2">Order Information</h3>
                <p className="text-sm text-gray-700"><span className="font-medium">Order ID:</span> {selectedRequest.orderId || selectedRequest.id || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">Payment:</span> {selectedRequest.paymentMethod || "-"} ({selectedRequest.paymentStatus || "-"})</p>
                <p className="text-sm text-gray-700"><span className="font-medium">Ordered At:</span> {selectedRequest.requestedAt ? new Date(selectedRequest.requestedAt).toLocaleString() : "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">Status:</span> {selectedRequest.orderStatus || "-"}</p>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <h3 className="font-semibold text-sm text-gray-900 mb-2">Store Information</h3>
                <p className="text-sm text-gray-700"><span className="font-medium">Name:</span> {selectedRequest.restaurantName || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium">ID:</span> {selectedRequest.restaurantId || "-"}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                  <p className="text-sm text-gray-900">{selectedRequest.customerName || "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <p className="text-sm text-gray-900">{selectedRequest.customerPhone || "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Items</label>
                  <p className="text-sm text-gray-900">{selectedRequest.item?.quantity || 0} item(s)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Total</label>
                  <p className="text-sm text-gray-900 font-semibold">Rs {selectedRequest.price || "0.00"}</p>
                </div>
              </div>

              {Array.isArray(selectedRequest.order?.items) && selectedRequest.order.items.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ordered Items</label>
                  <div className="rounded-md border border-gray-200 divide-y divide-gray-100">
                    {selectedRequest.order.items.map((item, index) => (
                      <div key={`${item.itemId || item.name}-${index}`} className="px-3 py-2 flex items-center justify-between text-sm">
                        <span className="text-gray-800">{item.quantity} x {item.name}</span>
                        <span className="font-medium text-gray-900">Rs {item.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
            <DialogTitle className="text-xl font-semibold text-gray-900">Reject Grocery Order</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              Please provide a reason for rejecting this order.
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
