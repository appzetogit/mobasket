import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, CheckCircle2, XCircle, Eye, Loader2, Package } from "lucide-react";
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

const parseDateValue = (value) => {
  if (!value) return 0;
  const dt = new Date(value);
  const tm = dt.getTime();
  return Number.isFinite(tm) ? tm : 0;
};

const isInlineBase64Image = (value = "") => /^data:image\//i.test(String(value).trim());

const getSanitizedImages = (images = []) =>
  (Array.isArray(images) ? images : []).filter(
    (img) => typeof img === "string" && img.trim() !== "" && !isInlineBase64Image(img),
  );

const normalizeProductRequest = (product = {}, { includeImages = false } = {}) => {
  const imageList = getSanitizedImages(product.images);

  return {
    approvalEntityType: "product",
    id: String(product._id || ""),
    _id: String(product._id || ""),
    name: product.name || "-",
    description: product.description || "",
    categoryName: product.category?.name || "-",
    storeName: product.storeId?.name || "-",
    storeEmail: product.storeId?.email || "-",
    price: Number(product.sellingPrice || 0),
    sellingPrice: Number(product.sellingPrice || 0),
    mrp: Number(product.mrp || 0),
    unit: product.unit || "",
    inStock: Boolean(product.inStock),
    stockQuantity: Number(product.stockQuantity || 0),
    requestedAt: product.createdAt || null,
    images: includeImages ? imageList : [],
    raw: product,
  };
};

const normalizeAddonRequest = (addon = {}) => {
  const imageList = Array.isArray(addon.images)
    ? addon.images.filter((img) => typeof img === "string" && img.trim() !== "")
    : [];
  const fallbackImage = typeof addon.image === "string" && addon.image.trim() !== "" ? [addon.image] : [];
  const mergedImages = imageList.length > 0 ? imageList : fallbackImage;

  return {
    approvalEntityType: "addon",
    id: String(addon.id || addon._id || ""),
    _id: String(addon.id || addon._id || ""),
    name: addon.itemName || addon.name || "-",
    description: addon.description || "",
    categoryName: addon.category || "Add-on",
    storeName: addon.restaurantName || "-",
    storeEmail: addon.restaurantId || "-",
    price: Number(addon.price || 0),
    sellingPrice: Number(addon.price || 0),
    mrp: 0,
    unit: "",
    inStock: true,
    stockQuantity: 0,
    requestedAt: addon.requestedAt || null,
    images: mergedImages,
    restaurantMongoId: addon.restaurantMongoId,
    raw: addon,
  };
};

export default function GroceryProductApproval() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
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

  const fetchPendingRequests = useCallback(async ({ showLoader = true } = {}) => {
    try {
      if (showLoader) setLoading(true);

      const [productResponse, addonResponse] = await Promise.all([
        adminAPI.getPendingGroceryProducts({
          page: pagination.page,
          limit: pagination.limit,
        }),
        adminAPI.getPendingGroceryApprovals({ platform: "mogrocery" }),
      ]);

      const products = productResponse?.data?.data?.products || [];
      const productPagination = productResponse?.data?.data?.pagination || {};

      const approvalRequests = addonResponse?.data?.data?.requests || addonResponse?.data?.requests || [];
      const addons = approvalRequests.filter(
        (item) => String(item?.type || "").toLowerCase() === "addon",
      );

      const normalized = [
        ...products.map(normalizeProductRequest),
        ...addons.map(normalizeAddonRequest),
      ].sort((a, b) => parseDateValue(b.requestedAt) - parseDateValue(a.requestedAt));

      const previousCount = previousPendingCountRef.current;
      if (
        (previousCount === null && normalized.length > 0) ||
        (previousCount !== null && normalized.length > previousCount)
      ) {
        startNotificationAlarm();
        toast.info("New grocery product/add-on approval request received");
      }
      if (normalized.length === 0) {
        stopNotificationAlarm();
      }

      previousPendingCountRef.current = normalized.length;
      setRequests(normalized);
      setPagination((prev) => ({
        page: Number(productPagination.page || prev.page || 1),
        limit: Number(productPagination.limit || prev.limit || 50),
        total: Number(productPagination.total || 0),
        pages: Number(productPagination.pages || 0),
      }));
    } catch (error) {
      console.error("Error fetching pending grocery approvals:", error);
      toast.error("Failed to load pending grocery approvals");
      setRequests([]);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [pagination.limit, pagination.page]);

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

    fetchPendingRequests({ showLoader: true });

    const pollTimer = setInterval(() => {
      fetchPendingRequests({ showLoader: false });
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
  }, [fetchPendingRequests]);

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return requests;
    return requests.filter((request) =>
      request.name?.toLowerCase().includes(query) ||
      request.storeName?.toLowerCase().includes(query) ||
      request.categoryName?.toLowerCase().includes(query) ||
      request.id?.toLowerCase().includes(query) ||
      request.approvalEntityType?.toLowerCase().includes(query),
    );
  }, [requests, searchQuery]);

  const handleApprove = async (request) => {
    if (!request) return;
    try {
      setProcessing(true);

      if (request.approvalEntityType === "addon") {
        await adminAPI.approveGroceryItem(request.id, {
          platform: "mogrocery",
          restaurantMongoId: request.restaurantMongoId,
        });
      } else {
        await adminAPI.approveGroceryProduct(request.id);
      }

      stopNotificationAlarm();
      toast.success(
        request.approvalEntityType === "addon"
          ? "Add-on approved successfully"
          : "Product approved successfully",
      );
      await fetchPendingRequests();
      setShowDetailModal(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error("Error approving request:", error);
      toast.error(error?.response?.data?.message || "Failed to approve request");
    } finally {
      setProcessing(false);
    }
  };

  const openRequestDetails = async (request) => {
    if (!request) return;

    if (request.approvalEntityType === "addon") {
      setSelectedRequest(request);
      setShowDetailModal(true);
      return;
    }

    try {
      setDetailLoading(true);
      setSelectedRequest(request);
      setShowDetailModal(true);

      const response = await adminAPI.getPendingGroceryProductById(request.id);
      const product = response?.data?.data?.product;

      if (product) {
        setSelectedRequest(normalizeProductRequest(product, { includeImages: true }));
      }
    } catch (error) {
      console.error("Error fetching grocery product details:", error);
      toast.error(error?.response?.data?.message || "Failed to load product details");
      setShowDetailModal(false);
      setSelectedRequest(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }

    try {
      setProcessing(true);

      if (selectedRequest.approvalEntityType === "addon") {
        await adminAPI.rejectGroceryItem(selectedRequest.id, rejectReason, {
          platform: "mogrocery",
          restaurantMongoId: selectedRequest.restaurantMongoId,
        });
      } else {
        await adminAPI.rejectGroceryProduct(selectedRequest.id, rejectReason);
      }

      stopNotificationAlarm();
      toast.success(
        selectedRequest.approvalEntityType === "addon"
          ? "Add-on rejected"
          : "Product rejected",
      );
      await fetchPendingRequests();
      setShowRejectModal(false);
      setShowDetailModal(false);
      setSelectedRequest(null);
      setRejectReason("");
    } catch (error) {
      console.error("Error rejecting request:", error);
      toast.error(error?.response?.data?.message || "Failed to reject request");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Package className="w-5 h-5 text-green-500" />
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Grocery Product/Add-on Approval</h1>
      </div>

      <Card className="border border-gray-200 shadow-sm">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-gray-900">Pending Approvals</h2>
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
                placeholder="Search by name, store, type, category"
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
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Name</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Store</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Category</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Price</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Requested</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-3 py-8 text-center text-sm text-gray-500">
                          No pending product/add-on approvals found.
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((request, index) => (
                        <tr key={`${request.approvalEntityType}-${request.id}-${index}`} className="hover:bg-gray-50">
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">{index + 1}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              {request.images && request.images.length > 0 && (
                                <img
                                  src={request.images[0]}
                                  alt={request.name}
                                  className="w-12 h-12 object-cover rounded"
                                />
                              )}
                              <div>
                                <div className="font-semibold text-gray-900">{request.name || "-"}</div>
                                <div className="text-gray-500 text-xs">{request.description || "-"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                request.approvalEntityType === "addon"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {request.approvalEntityType === "addon" ? "Add-on" : "Product"}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="font-semibold text-gray-900">{request.storeName || "-"}</div>
                              <div className="text-gray-500 text-xs">{request.storeEmail || "-"}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700">
                            {request.categoryName || "-"}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                            Rs {request.price || "0.00"}
                            {request.approvalEntityType === "product" &&
                              request.mrp &&
                              request.mrp > request.sellingPrice && (
                                <span className="text-gray-400 text-xs line-through ml-1">Rs {request.mrp}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                            {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => openRequestDetails(request)}
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
            <DialogTitle className="text-xl font-semibold text-gray-900">Approval Details</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              Review details before approval.
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#006fbd]" />
            </div>
          ) : selectedRequest ? (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {selectedRequest.images && selectedRequest.images.length > 0 && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Images</label>
                    <div className="flex gap-2 flex-wrap">
                      {selectedRequest.images.map((img, idx) => (
                        <img
                          key={`${selectedRequest.id}-img-${idx}`}
                          src={img}
                          alt={`${selectedRequest.name} ${idx + 1}`}
                          className="w-24 h-24 object-cover rounded"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <p className="text-sm text-gray-900">{selectedRequest.name || "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <p className="text-sm text-gray-900">
                    {selectedRequest.approvalEntityType === "addon" ? "Add-on" : "Product"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <p className="text-sm text-gray-900">{selectedRequest.categoryName || "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Store</label>
                  <p className="text-sm text-gray-900">{selectedRequest.storeName || "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <p className="text-sm text-gray-900 font-semibold">Rs {selectedRequest.price || "0.00"}</p>
                </div>
                {selectedRequest.approvalEntityType === "product" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
                    <p className="text-sm text-gray-900">
                      {selectedRequest.inStock ? "In Stock" : "Out of Stock"} ({selectedRequest.stockQuantity || 0})
                    </p>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <p className="text-sm text-gray-900">{selectedRequest.description || "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Store Ref</label>
                  <p className="text-sm text-gray-900">{selectedRequest.storeEmail || "-"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Requested At</label>
                  <p className="text-sm text-gray-900">
                    {selectedRequest.requestedAt
                      ? new Date(selectedRequest.requestedAt).toLocaleString()
                      : "-"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

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
            <DialogTitle className="text-xl font-semibold text-gray-900">Reject Request</DialogTitle>
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
