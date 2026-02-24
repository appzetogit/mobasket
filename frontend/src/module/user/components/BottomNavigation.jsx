import { Link, useLocation } from "react-router-dom";
import { Bike, Tag, User, ArrowUpRight } from "lucide-react";

export default function BottomNavigation() {
  const location = useLocation();

  // Check active routes - support both /user/* and /* paths
  const isUnder250 =
    location.pathname === "/under-250" ||
    location.pathname === "/user/under-250";
  const isProfile =
    location.pathname.startsWith("/profile") ||
    location.pathname.startsWith("/user/profile");
  const isDelivery =
    !isUnder250 &&
    !isProfile &&
    (location.pathname === "/" ||
      location.pathname === "/home" ||
      location.pathname === "/user" ||
      (location.pathname.startsWith("/") &&
        !location.pathname.startsWith("/restaurant") &&
        !location.pathname.startsWith("/delivery") &&
        !location.pathname.startsWith("/admin")));

  const preference = localStorage.getItem("mobasket_preference");
  const deliveryPath = preference === "grocery" ? "/grocery" : "/home";

  return (
    <div className="fixed bottom-0 left-0 right-0 w-full bg-white p-4 border-t border-gray-200 z-50">
      <div className="flex items-center justify-between max-w-md mx-auto">
        {/* 1. Delivery Option (Active/Red) */}
        <Link
          to="/home"
          className="flex flex-col items-center gap-1 cursor-pointer"
        >
          <div className={isDelivery ? "text-[#EF4F5F]" : "text-gray-500"}>
            <Bike size={26} strokeWidth={2} />
          </div>
          <span
            className={`text-xs font-bold ${isDelivery ? "text-[#EF4F5F]" : "text-gray-500 font-medium"}`}
          >
            Delivery
          </span>
          {/* Active Line Indicator */}
          {isDelivery && (
            <div className="h-0.5 w-full bg-[#EF4F5F] mt-1 rounded-full"></div>
          )}
        </Link>

        {/* 2. Under ₹250 Option */}
        <Link
          to="/under-250"
          className={`flex flex-col items-center gap-1 cursor-pointer ${isUnder250 ? "text-[#EF4F5F]" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Tag size={24} strokeWidth={1.5} />
          <span
            className={`text-xs ${isUnder250 ? "font-bold text-[#EF4F5F]" : "font-medium text-gray-500"}`}
          >
            Under ₹250
          </span>
          {isUnder250 && (
            <div className="h-0.5 w-full bg-[#EF4F5F] mt-1 rounded-full"></div>
          )}
        </Link>

        {/* 3. Profile Option */}
        <Link
          to="/profile"
          className={`flex flex-col items-center gap-1 cursor-pointer ${isProfile ? "text-[#EF4F5F]" : "text-gray-500 hover:text-gray-700"}`}
        >
          <User size={24} strokeWidth={1.5} />
          <span
            className={`text-xs ${isProfile ? "font-bold text-[#EF4F5F]" : "font-medium text-gray-500"}`}
          >
            Profile
          </span>
          {isProfile && (
            <div className="h-0.5 w-full bg-[#EF4F5F] mt-1 rounded-full"></div>
          )}
        </Link>

        {/* 4. MoBasket Button */}
        <Link to="/grocery" className="cursor-pointer">
          <div className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
            <span className="font-black italic text-lg tracking-tighter">
              MoGrocery
            </span>
          </div>
        </Link>
        <style>{`
          @keyframes border-left {
            0% { top: -100%; }
            100% { top: 100%; }
          }
          @keyframes border-bottom {
            0% { left: -100%; }
            100% { left: 100%; }
          }
          @keyframes border-right {
            0% { bottom: -100%; }
            100% { bottom: 100%; }
          }
          @keyframes border-top {
            0% { right: -100%; }
            100% { right: 100%; }
          }
          .animate-border-left {
            animation: border-left 2s linear infinite;
            animation-delay: 0s;
          }
          .animate-border-bottom {
            animation: border-bottom 2s linear infinite;
            animation-delay: 0.5s;
          }
          .animate-border-right {
            animation: border-right 2s linear infinite;
            animation-delay: 1s;
          }
          .animate-border-top {
            animation: border-top 2s linear infinite;
            animation-delay: 1.5s;
          }
        `}</style>
      </div>
    </div>
  );
}
