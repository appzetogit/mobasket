import React from "react";
import {
  ArrowLeft,
  ChevronRight,
  ShoppingBag,
  Wallet,
  Smartphone,
  Moon,
  EyeOff,
  MapPin,
  Heart,
  Pill,
  CreditCard,
  HeartHandshake,
  Share2,
  Info,
  Lock,
  Bell,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useProfile } from "@/module/user/context/ProfileContext";
import { clearModuleAuth } from "@/lib/utils/auth";
import { authAPI, userAPI } from "@/lib/api";
import { toast } from "sonner";

const GroceryProfile = () => {
  const navigate = useNavigate();
  const { userProfile, vegMode, setVegMode, updateUserProfile } = useProfile();

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.warn("Logout API failed, cleaning up locally");
    }
    clearModuleAuth("user");
    localStorage.removeItem("accessToken");
    window.dispatchEvent(new Event("userAuthChanged"));
    navigate("/user/auth/sign-in", { replace: true });
  };

  const handleShareApp = async () => {
    const shareUrl = window.location.origin;
    const payload = {
      title: "MoBasket",
      text: "Check out MoBasket",
      url: shareUrl,
    };
    const shareText = `${payload.text} ${payload.url}`.trim();

    try {
      if (navigator.share) {
        await navigator.share(payload);
        try {
          await userAPI.markAppShared();
          updateUserProfile({ hasSharedApp: true, appSharedAt: new Date().toISOString() });
          toast.success("Thanks for sharing! Shared-user coupons are now unlocked.");
        } catch (rewardError) {
          console.error("Share reward recording failed:", rewardError);
          toast.success("Thanks for sharing the app.");
        }
        return;
      }

      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      try {
        await userAPI.markAppShared();
        updateUserProfile({ hasSharedApp: true, appSharedAt: new Date().toISOString() });
        toast.success("Opening share options...");
      } catch (rewardError) {
        console.error("Share reward recording failed:", rewardError);
        toast.success("Opening share options...");
      }
      return;
    } catch (error) {
      console.error("Share app failed:", error);
    }

    toast.error("Unable to share right now");
  };

  const [appearance, setAppearance] = React.useState(() => {
    return localStorage.getItem("appTheme") || "light";
  });

  React.useEffect(() => {
    const root = document.documentElement;
    if (appearance === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("appTheme", appearance);
  }, [appearance]);

  const displayName = userProfile?.name || "Your account";
  const displayPhone = userProfile?.phone || "Add phone number";
  const avatarInitial = userProfile?.name?.charAt(0)?.toUpperCase() || "U";
  const walletBalance = userProfile?.wallet?.balance?.toFixed(0) || "0";
  const hasBirthday = !!userProfile?.dateOfBirth;

  const MenuItem = ({
    icon: Icon,
    title,
    subtitle,
    rightElement,
    onClick,
    color = "text-slate-600",
  }) => (
    <div
      className="flex items-center justify-between py-4 px-4 bg-white dark:bg-[#1a1a1a] active:bg-slate-50 dark:active:bg-[#232323] transition-colors cursor-pointer border-b border-slate-50 dark:border-slate-800 last:border-0"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full bg-slate-50 dark:bg-[#2a2a2a] ${color}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
        <div>
          <h4 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
          {subtitle && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {rightElement}
        <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" />
      </div>
    </div>
  );

  const SectionTitle = ({ title }) => (
    <h3 className="text-[16px] font-bold text-slate-800 dark:text-slate-100 px-4 pt-6 pb-2 bg-slate-50/50 dark:bg-[#151515]">
      {title}
    </h3>
  );

  return (
    <div className="min-h-screen bg-[#F7F9FB] dark:bg-[#0a0a0a] text-slate-900 dark:text-slate-100 font-sans pb-10">
      {/* --- HEADER --- */}
      <div className="bg-gradient-to-b from-[#FFF9C4] to-[#F7F9FB] dark:from-[#1b1b1b] dark:to-[#0a0a0a] relative">
        <div className="pt-4 pb-8 px-4 md:max-w-6xl md:mx-auto w-full">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 bg-white dark:bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
            >
              <ArrowLeft size={20} className="text-slate-800 dark:text-slate-100" />
            </button>
            <h1 className="text-[18px] font-bold text-slate-800 dark:text-slate-100">Profile</h1>
          </div>

          {/* User Card */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-24 h-24 bg-white dark:bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-md mb-3 border-4 border-white dark:border-[#1a1a1a] overflow-hidden">
              <div className="w-full h-full bg-slate-100 dark:bg-[#2a2a2a] flex items-center justify-center">
                {userProfile?.profileImage ? (
                  <img
                    src={userProfile.profileImage}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-black text-slate-300 dark:text-slate-600">
                    {avatarInitial}
                  </span>
                )}
              </div>
            </div>
            <h2 className="text-[24px] font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {displayName}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold tracking-wide">
              {displayPhone}
            </p>
          </div>

          {/* Birthday Banner */}
          {!hasBirthday && (
            <motion.div
              whileHover={{ scale: 1.01 }}
              onClick={() => navigate("/profile/edit")}
              className="bg-gradient-to-r from-[#FFFDE7] to-[#FFF9C4] rounded-2xl p-4 flex items-center justify-between shadow-sm border border-yellow-100 mx-1 cursor-pointer"
            >
              <div className="flex-1">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                  Add your birthday
                </h4>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-green-600 font-bold text-xs uppercase tracking-wider">
                    Enter details
                  </span>
                  <ChevronRight size={12} className="text-green-600 stroke-[3]" />
                </div>
              </div>
              <div className="w-16 h-16 flex items-center justify-center bg-white/50 dark:bg-white/10 rounded-xl overflow-hidden">
                <span className="text-2xl font-black text-yellow-600 animate-bounce">BD</span>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div className="md:max-w-6xl md:mx-auto w-full">
        {/* --- QUICK ACTIONS --- */}
        <div className="px-4 -mt-4 grid grid-cols-3 gap-3 mb-6">
          {[
            {
              icon: ShoppingBag,
              label: "Your orders",
              bg: "bg-white dark:bg-[#1a1a1a]",
              color: "text-blue-500",
              onClick: () => navigate("/orders"),
            },
            {
              icon: Wallet,
              label: "MoBasket Money",
              bg: "bg-white dark:bg-[#1a1a1a]",
              color: "text-orange-500",
              onClick: () => navigate("/wallet"),
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              whileTap={{ scale: 0.95 }}
              onClick={item.onClick}
              className={`${item.bg} rounded-2xl p-4 flex flex-col items-center justify-center shadow-sm border border-slate-100 cursor-pointer`}
            >
              <div className={`${item.color} mb-2`}>
                <item.icon size={24} />
              </div>
              <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100 text-center leading-tight">
                {item.label}
              </span>
            </motion.div>
          ))}
        </div>

        {/* --- MENU SECTIONS --- */}

        <div className="bg-white dark:bg-[#1a1a1a] mx-4 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 mb-6 font-sans">
          <MenuItem
            icon={Moon}
            title="Appearance"
            onClick={() =>
              setAppearance(appearance === "light" ? "dark" : "light")
            }
            rightElement={
              <span className="text-blue-600 text-[10px] font-black uppercase tracking-wider">
                {appearance}
              </span>
            }
          />
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] mx-4 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 mb-6">
          <SectionTitle title="Your information" />
          <MenuItem
            icon={MapPin}
            title="Address book"
            onClick={() => navigate("/profile/addresses")}
          />
          <MenuItem
            icon={Heart}
            title="Your wishlist"
            onClick={() => navigate("/wishlist")}
          />
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] mx-4 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 mb-6">
          <SectionTitle title="Payment and coupons" />

          <MenuItem
            icon={Wallet}
            title="MoBasket Money"
            subtitle={`Balance: Rs ${walletBalance}`}
            onClick={() => navigate("/wallet")}
          />
          <MenuItem
            icon={CreditCard}
            title="Payment settings"
            onClick={() => navigate("/profile/payments")}
          />
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] mx-4 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 mb-8">
          <SectionTitle title="Other Information" />
          <MenuItem icon={Share2} title="Share the app" onClick={handleShareApp} />
          <MenuItem icon={Info} title="About us" onClick={() => navigate("/profile/about")} />
          <MenuItem icon={Lock} title="Account privacy" onClick={() => navigate("/profile/privacy")} />

          <MenuItem
            icon={LogOut}
            title="Log out"
            color="text-red-500"
            onClick={handleLogout}
          />
        </div>
      </div>
    </div>
  );
};

export default GroceryProfile;
