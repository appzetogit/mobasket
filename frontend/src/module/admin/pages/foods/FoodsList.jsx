import { useEffect, useMemo, useState } from "react";
import { Search, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { adminAPI } from "@/lib/api";
import { toast } from "sonner";

export default function FoodsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedFood, setSelectedFood] = useState(null);

  const fetchPendingFoods = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getPendingGroceryApprovals({ platform: "mofood" });
      const requests = response?.data?.data?.requests || response?.data?.requests || [];
      setFoods(requests);
    } catch (error) {
      console.error("Error fetching pending food requests:", error);
      toast.error("Failed to load pending food requests");
      setFoods([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingFoods();
  }, []);

  const filteredFoods = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return foods;

    return foods.filter((food) =>
      food.itemName?.toLowerCase().includes(query) ||
      food.restaurantName?.toLowerCase().includes(query) ||
      food.restaurantId?.toLowerCase().includes(query) ||
      food.sectionName?.toLowerCase().includes(query) ||
      food.category?.toLowerCase().includes(query)
    );
  }, [foods, searchQuery]);

  const handleApprove = async (food) => {
    try {
      setProcessingId(food.id || food._id);
      await adminAPI.approveGroceryItem(food.id || food._id, {
        platform: "mofood",
        restaurantMongoId: food.restaurantMongoId,
      });
      toast.success("Food approved successfully");
      await fetchPendingFoods();
    } catch (error) {
      console.error("Error approving food:", error);
      toast.error(error?.response?.data?.message || "Failed to approve food");
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (food) => {
    setSelectedFood(food);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!selectedFood) return;
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }

    try {
      setProcessingId(selectedFood.id || selectedFood._id);
      await adminAPI.rejectGroceryItem(selectedFood.id || selectedFood._id, rejectReason.trim(), {
        platform: "mofood",
        restaurantMongoId: selectedFood.restaurantMongoId,
      });
      toast.success("Food rejected successfully");
      setShowRejectModal(false);
      setSelectedFood(null);
      setRejectReason("");
      await fetchPendingFoods();
    } catch (error) {
      console.error("Error rejecting food:", error);
      toast.error(error?.response?.data?.message || "Failed to reject food");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Food Requests</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Incoming Food Approval Requests</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-orange-100 text-orange-700">
              {filteredFoods.length}
            </span>
          </div>
          <div className="relative flex-1 sm:flex-initial min-w-[220px]">
            <input
              type="text"
              placeholder="Search by food, restaurant, section"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SL</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Image</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Food</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Section</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Requested</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading pending food requests...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredFoods.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <p className="text-lg font-semibold text-slate-700 mb-1">No pending requests</p>
                    <p className="text-sm text-slate-500">Newly added foods from restaurant will appear here</p>
                  </td>
                </tr>
              ) : (
                filteredFoods.map((food, index) => {
                  const key = food.id || food._id || `${food.restaurantId}-${index}`;
                  const isProcessing = processingId === key;
                  return (
                    <tr key={key} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-700">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                          <img
                            src={food.image || "https://via.placeholder.com/40"}
                            alt={food.itemName || "food"}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.src = "https://via.placeholder.com/40";
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-900">{food.itemName || "-"}</span>
                          <span className="text-xs text-slate-500">{food.foodType || food.category || "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-900">{food.restaurantName || "-"}</span>
                          <span className="text-xs text-slate-500">{food.restaurantId || "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {food.subsectionName ? `${food.sectionName || "-"} / ${food.subsectionName}` : (food.sectionName || "-")}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-700">Rs {food.price || 0}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {food.requestedAt ? new Date(food.requestedAt).toLocaleString() : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleApprove(food)}
                            disabled={!!processingId}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Approve"
                          >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => openRejectModal(food)}
                            disabled={!!processingId}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showRejectModal && selectedFood ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Reject Food</h3>
              <p className="text-sm text-slate-500 mt-1">Provide a reason for rejecting this food request.</p>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-700 mb-2">
                <span className="font-medium">Food:</span> {selectedFood.itemName || "-"}
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Enter rejection reason..."
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedFood(null);
                  setRejectReason("");
                }}
                className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!!processingId || !rejectReason.trim()}
                className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingId ? "Processing..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
