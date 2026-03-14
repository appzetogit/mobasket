import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  ShoppingBag,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { userAPI } from "@/lib/api";
import { toast } from "sonner";

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch orders from API
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);

        // Check authentication token
        const userToken =
          localStorage.getItem("user_accessToken") ||
          localStorage.getItem("accessToken");
        const userData =
          localStorage.getItem("user_user") ||
          localStorage.getItem("userProfile");
        let currentUserId = null;
        if (userData) {
          try {
            const parsed = JSON.parse(userData);
            currentUserId = parsed._id || parsed.id;
          } catch (e) {
            // Ignore malformed cached profile; API call below is the source of truth
          }
        }

        const response = await userAPI.getOrders({
          limit: 100, // Get all orders
          page: 1,
        });

        // Check multiple possible response structures
        let ordersData = [];

        if (response?.data?.success && response?.data?.data?.orders) {
          ordersData = response.data.data.orders || [];
        } else if (response?.data?.orders) {
          ordersData = response.data.orders || [];
        } else if (response?.data?.data && Array.isArray(response.data.data)) {
          ordersData = response.data.data || [];
        } else {
          setOrders([]);
          return;
        }

        if (ordersData.length > 0) {
          // Transform API orders to match UI structure
          const transformedOrders = ordersData.map((order) => {
            const createdAt = new Date(order.createdAt);
            const deliveredAt = order.tracking?.delivered?.timestamp
              ? new Date(order.tracking.delivered.timestamp)
              : null;

            return {
              id: order.orderId || order._id,
              mongoId: order._id,
              restaurant:
                order.restaurantName ||
                order.restaurantId?.name ||
                "Restaurant",
              restaurantId: order.restaurantId,
              status: getOrderStatus(order),
              date: createdAt,
              time: createdAt.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              }),
              items: order.items?.length || 0,
              itemsList: order.items || [],
              total: order.pricing?.total || 0,
              subtotal: order.pricing?.subtotal || 0,
              deliveryFee: order.pricing?.deliveryFee || 0,
              tax: order.pricing?.tax || 0,
              address: order.address,
              payment: order.payment,
              deliveredAt: deliveredAt,
              createdAt: createdAt,
            };
          });

          setOrders(transformedOrders);
        } else {
          setOrders([]);
        }
      } catch (error) {
        // More detailed error message
        let errorMessage = "Failed to load orders";
        if (error?.response?.status === 401) {
          errorMessage = "Please login to view your orders";
        } else if (error?.response?.status === 403) {
          errorMessage = "Access denied. Please login again";
        } else if (error?.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error?.message) {
          errorMessage = error.message;
        }

        toast.error(errorMessage);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  // Get order status text
  const getOrderStatus = (order) => {
    const status = order.status;
    if (status === "delivered" || status === "completed") return "Delivered";
    if (status === "out_for_delivery") return "Out for Delivery";
    if (status === "ready") return "Ready";
    if (status === "preparing") return "Preparing";
    if (status === "confirmed") return "Confirmed";
    return status || "Pending";
  };

  // Format date helper
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#f6e9dc] pb-20 md:pb-24 dark:bg-[#0b0b0b] dark:text-gray-100">
      {/* Header */}
      <div className="bg-white sticky top-0 z-50 rounded-b-3xl dark:bg-[#111827] dark:border-b dark:border-white/10">
        <div className="px-4 py-2.5 md:py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 md:p-2 hover:bg-gray-100 rounded-full transition-colors dark:hover:bg-white/10"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 text-gray-800 dark:text-gray-100" />
          </button>
          <h1 className="text-base md:text-lg font-bold text-gray-900 dark:text-gray-100">
            My Orders
          </h1>
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="px-4 py-8 text-center">
          <div className="bg-white rounded-xl p-6 md:p-8 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
            <Loader2 className="w-12 h-12 md:w-16 md:h-16 text-[#ff8100] mx-auto mb-3 animate-spin" />
            <h3 className="text-sm md:text-base font-semibold text-gray-900 mb-1 dark:text-gray-100">
              Loading orders...
            </h3>
          </div>
        </div>
      ) : orders.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="bg-white rounded-xl p-6 md:p-8 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
            <ShoppingBag className="w-12 h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-3 dark:text-white/30" />
            <h3 className="text-sm md:text-base font-semibold text-gray-900 mb-1 dark:text-gray-100">
              No orders yet
            </h3>
            <p className="text-xs md:text-sm text-gray-600 mb-4 dark:text-gray-400">
              Your orders will appear here
            </p>
            <button
              onClick={() => navigate("/grocery")}
              className="text-[#ff8100] text-xs md:text-sm font-semibold"
            >
              Start Shopping
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 md:py-4 space-y-2.5 md:space-y-4">
          {orders.map((order) => {
            const normalizedPaymentMethod = String(
              order.payment?.method || order.paymentMethod || ""
            )
              .trim()
              .toLowerCase();
            const rawPaymentStatus =
              order.payment?.status ||
              order.paymentStatus ||
              order.payment_status ||
              order.payment?.paymentStatus ||
              order.payment?.payment_status ||
              "";
            const normalizedPaymentStatus = String(rawPaymentStatus)
              .trim()
              .toLowerCase();

            const isCodPayment =
              normalizedPaymentMethod === "cash" ||
              normalizedPaymentMethod === "cod" ||
              normalizedPaymentMethod === "cash_on_delivery" ||
              normalizedPaymentMethod === "cash on delivery" ||
              normalizedPaymentMethod.includes("cash") ||
              normalizedPaymentMethod.includes("cod");

            const paidStatuses = new Set([
              "paid",
              "completed",
              "success",
              "succeeded",
              "captured",
              "settled",
              "charged",
            ]);
            const pendingStatuses = new Set([
              "pending",
              "processing",
              "created",
              "authorized",
              "authorised",
              "queued",
              "awaiting",
              "in_progress",
              "in-progress",
            ]);
            const failedStatuses = new Set([
              "failed",
              "failure",
              "payment_failed",
              "declined",
              "rejected",
              "cancelled",
              "canceled",
              "expired",
            ]);

            const isDelivered = order.status === "Delivered";

            const paymentStatusKey = isCodPayment
              ? paidStatuses.has(normalizedPaymentStatus) || isDelivered
                ? "paid"
                : "pending"
              : failedStatuses.has(normalizedPaymentStatus)
                ? "failed"
                : paidStatuses.has(normalizedPaymentStatus)
                  ? "paid"
                  : pendingStatuses.has(normalizedPaymentStatus) ||
                      normalizedPaymentStatus === ""
                    ? "pending"
                    : "pending";

            const paymentStatusLabel =
              paymentStatusKey.charAt(0).toUpperCase() +
              paymentStatusKey.slice(1);
            const paymentFailed = paymentStatusKey === "failed";

            return (
              <div
                key={order.id || order.mongoId}
                className="bg-white rounded-xl p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow dark:bg-[#151a23] dark:border dark:border-white/10"
              >
                <div className="flex items-start justify-between mb-2 md:mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs md:text-sm font-bold text-gray-900 mb-0.5 md:mb-1 truncate dark:text-gray-100">
                      Order #{order.id}
                    </h3>
                    <p className="text-[10px] md:text-xs text-gray-600 truncate dark:text-gray-400">
                      {order.restaurant || "Restaurant"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                    <div
                      className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold ${
                        order.status === "Delivered"
                          ? "bg-green-100 text-green-700"
                          : order.status === "Preparing" ||
                              order.status === "Ready"
                            ? "bg-orange-100 text-orange-700"
                            : order.status === "Out for Delivery"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {order.status}
                    </div>
                    <div
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
                        paymentStatusKey === "paid"
                          ? "bg-green-50 dark:bg-green-500/15"
                          : paymentStatusKey === "failed"
                            ? "bg-red-50 dark:bg-red-500/15"
                            : "bg-yellow-50 dark:bg-yellow-500/15"
                      }`}
                    >
                      <AlertCircle
                        className={`w-2.5 h-2.5 ${
                          paymentStatusKey === "paid"
                            ? "text-green-600"
                            : paymentStatusKey === "failed"
                              ? "text-red-600"
                              : "text-yellow-600"
                        }`}
                      />
                      <span
                        className={`text-[9px] font-semibold ${
                          paymentStatusKey === "paid"
                            ? "text-green-600"
                            : paymentStatusKey === "failed"
                              ? "text-red-600"
                              : "text-yellow-600"
                        }`}
                      >
                        Payment {paymentStatusLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs text-gray-600 mb-2 md:mb-3 dark:text-gray-400">
                  <Clock className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" />
                  <span className="truncate">
                    {formatDate(order.date)} at {order.time}
                  </span>
                </div>

                {/* Order Items Preview */}
                {order.itemsList && order.itemsList.length > 0 && (
                  <div className="mb-2 md:mb-3">
                    <div className="flex flex-wrap gap-1.5">
                      {order.itemsList.slice(0, 3).map((item, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] md:text-xs text-gray-600 bg-gray-50 px-2 py-0.5 rounded-full dark:text-gray-300 dark:bg-[#0f172a]"
                        >
                          {item.quantity}x {item.name}
                        </span>
                      ))}
                      {order.itemsList.length > 3 && (
                        <span className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400">
                          +{order.itemsList.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 md:pt-3 border-t border-gray-100 dark:border-white/10">
                  <div>
                    <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400">
                      {order.items} items
                    </p>
                    <p className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">
                      ₹{order.total.toFixed(2)}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      navigate(`/orders/${order.id || order.mongoId}`)
                    }
                    className="text-[#ff8100] text-[10px] md:text-xs font-semibold ml-2 flex-shrink-0 hover:underline"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
