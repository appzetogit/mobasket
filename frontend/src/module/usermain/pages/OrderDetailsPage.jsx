import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Phone,
  CheckCircle,
  Package,
  Home,
  Heart,
  ShoppingBag,
  Menu,
  ChefHat,
  Navigation,
  Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrderDetailsPage() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    // Load order from localStorage
    const savedOrders = localStorage.getItem("usermain_orders");
    if (savedOrders) {
      try {
        const orders = JSON.parse(savedOrders);
        const foundOrder = orders.find((o) => o.id === orderId);
        if (foundOrder) {
          setOrder(foundOrder);
        }
      } catch (error) {
        console.error("Error loading order:", error);
      }
    }
  }, [orderId]);

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f6e9dc] flex items-center justify-center dark:bg-[#0b0b0b] dark:text-gray-100">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Order not found</p>
          <Button
            onClick={() => navigate("/orders")}
            className="mt-4 bg-[#ff8100] hover:bg-[#e67300] text-white"
          >
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }

  const orderDetails = order.orderDetails || {};
  const items = orderDetails.items || [];

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
            Order Details
          </h1>
        </div>
      </div>

      {/* Order Status Card */}
      <div className="px-4 py-3 md:py-4">
        <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm md:text-base font-bold text-gray-900 mb-1 dark:text-gray-100">
                Order #{order.id}
              </h3>
              <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
                {order.restaurant}
              </p>
            </div>
            <div
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full text-xs font-semibold ${
                order.status === "Delivered"
                  ? "bg-green-100 text-green-700"
                  : order.status === "Preparing"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-blue-100 text-blue-700"
              }`}
            >
              {order.status}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600 dark:text-gray-400">
            <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span>
              {new Date(order.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              at {order.time}
            </span>
          </div>
        </div>
      </div>

      {/* Map View Toggle */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4 md:w-5 md:h-5 text-[#ff8100]" />
              <span className="text-sm md:text-base font-semibold text-gray-900 dark:text-gray-100">
                Track Order
              </span>
            </div>
            <button
              onClick={() => setShowMap(!showMap)}
              className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-[#ff8100] hover:bg-[#e67300] text-white rounded-lg text-xs md:text-sm font-semibold transition-colors"
            >
              <Navigation className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {showMap ? "Hide Map" : "Show Map"}
            </button>
          </div>
        </div>
      </div>

      {/* Map View */}
      {showMap && (
        <div className="px-4 mb-3 md:mb-4">
          <div className="bg-white rounded-xl overflow-hidden shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
            <div className="relative w-full h-64 md:h-80 bg-gray-200 dark:bg-[#0f172a]">
              {/* Map placeholder - In real app, integrate Google Maps or Mapbox */}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/20 dark:to-blue-800/10">
                <div className="text-center">
                  <MapPin className="w-12 h-12 md:w-16 md:h-16 text-[#ff8100] mx-auto mb-2" />
                  <p className="text-sm md:text-base font-semibold text-gray-700 dark:text-gray-200">
                    Live Tracking
                  </p>
                  <p className="text-xs md:text-sm text-gray-600 mt-1 dark:text-gray-400">
                    Order is on the way
                  </p>
                </div>
              </div>
              {/* You can integrate Google Maps here */}
              {/* <iframe
                src="https://www.google.com/maps/embed?pb=..."
                className="w-full h-full"
                allowFullScreen
              /> */}
            </div>
            <div className="p-3 md:p-4">
              <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600 dark:text-gray-400">
                <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#ff8100]" />
                <span>
                  {orderDetails.deliveryAddress ||
                    "202, Princess Centre, 2nd Floor, 6/3, 452001, New Delhi"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Items */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
          <h3 className="text-sm md:text-base font-bold text-gray-900 mb-3 dark:text-gray-100">
            Order Items
          </h3>
          <div className="space-y-2 md:space-y-3">
            {items.length > 0 ? (
              items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between pb-2 md:pb-3 border-b border-gray-100 last:border-0 last:pb-0 dark:border-white/10"
                >
                  <div className="flex-1">
                    <p className="text-xs md:text-sm font-medium text-gray-900 dark:text-gray-100">
                      {item.name}
                    </p>
                    <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400">
                      Quantity: {item.quantity}
                    </p>
                  </div>
                  <p className="text-xs md:text-sm font-bold text-gray-900 dark:text-gray-100">
                    ${(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">No items found</p>
            )}
          </div>
        </div>
      </div>

      {/* Order Summary */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
          <h3 className="text-sm md:text-base font-bold text-gray-900 mb-3 dark:text-gray-100">
            Order Summary
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs md:text-sm">
              <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
              <span className="text-gray-900 font-medium dark:text-gray-100">
                ${(orderDetails.subtotal || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs md:text-sm">
              <span className="text-gray-600 dark:text-gray-400">Delivery Fee</span>
              <span className="text-gray-900 font-medium dark:text-gray-100">
                ${(orderDetails.deliveryFee || 0).toFixed(2)}
              </span>
            </div>
            {orderDetails.discount > 0 && (
              <div className="flex items-center justify-between text-xs md:text-sm">
                <span className="text-gray-600 dark:text-gray-400">Discount</span>
                <span className="text-[#ff8100] font-medium">
                  -${orderDetails.discount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 mt-2 dark:border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">
                  Total
                </span>
                <span className="text-lg md:text-xl font-bold text-[#ff8100]">
                  ${order.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Information */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
          <h3 className="text-sm md:text-base font-bold text-gray-900 mb-3 dark:text-gray-100">
            Delivery Information
          </h3>
          <div className="space-y-2 md:space-y-3">
            <div className="flex items-start gap-3">
              <div className="bg-[#ff8100] rounded-lg p-2 flex-shrink-0">
                <MapPin className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs md:text-sm font-semibold text-gray-900 mb-1 dark:text-gray-100">
                  Delivery Address
                </p>
                <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400">
                  {orderDetails.deliveryAddress ||
                    "202, Princess Centre, 2nd Floor, 6/3, 452001, New Delhi"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-[#ff8100] rounded-lg p-2 flex-shrink-0">
                <Clock className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs md:text-sm font-semibold text-gray-900 mb-1 dark:text-gray-100">
                  Estimated Delivery
                </p>
                <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400">
                  {orderDetails.estimatedTime || "30-40 min"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-[#ff8100] rounded-lg p-2 flex-shrink-0">
                <Package className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs md:text-sm font-semibold text-gray-900 mb-1 dark:text-gray-100">
                  Payment Method
                </p>
                <p className="text-[10px] md:text-xs text-gray-600 capitalize dark:text-gray-400">
                  {order.paymentMethod === "cash"
                    ? "Cash on Delivery"
                    : "Card Payment"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Support */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff8100] rounded-lg p-2">
              <Phone className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100">
                Need Help?
              </p>
              <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400">
                Contact our support team
              </p>
            </div>
            <Button
              className="bg-[#ff8100] hover:bg-[#e67300] text-white text-xs md:text-sm px-3 md:px-4 py-1.5 md:py-2"
              onClick={() => {
                // Handle contact support
                window.location.href = "tel:+1234567890";
              }}
            >
              Call
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar - Mobile Only */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 dark:bg-[#111827] dark:border-white/10">
        <div className="flex items-center justify-around py-2 px-4">
          <button
            onClick={() => navigate("/grocery")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100] transition-colors dark:text-gray-400"
          >
            <Home className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium dark:text-gray-400">Home</span>
          </button>
          <button
            onClick={() => navigate("/wishlist")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100] transition-colors dark:text-gray-400"
          >
            <Heart className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium dark:text-gray-400">Wishlist</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 -mt-8">
            <div className="bg-white rounded-full p-3 shadow-lg border-2 border-gray-200 dark:bg-[#0f172a] dark:border-white/10">
              <ChefHat className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            </div>
          </button>
          <button
            onClick={() => navigate("/orders")}
            className="flex flex-col items-center gap-1 p-2 text-[#ff8100]"
          >
            <ShoppingBag className="w-6 h-6" />
            <span className="text-xs text-[#ff8100] font-medium">Orders</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 text-gray-600 dark:text-gray-400">
            <Menu className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium dark:text-gray-400">Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
}
