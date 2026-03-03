import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
  Wallet,
  Tag,
  User,
  Leaf,
  Palette,
  Bookmark,
  Building2,
  Moon,
  Sun,
  Check,
  Percent,
  Info,
  PenSquare,
  AlertTriangle,
  Settings as SettingsIcon,
  Power,
  ShoppingCart,
  MapPin,
  LocateFixed,
  Plus,
  Trash2,
} from "lucide-react";

import AnimatedPage from "../../components/AnimatedPage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProfile } from "../../context/ProfileContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCompanyName } from "@/lib/hooks/useCompanyName";
import OptimizedImage from "@/components/OptimizedImage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authAPI } from "@/lib/api";
import { locationAPI } from "@/lib/api";
import { firebaseAuth } from "@/lib/firebase";
import { clearModuleAuth } from "@/lib/utils/auth";
import { toast } from "sonner";

export default function Profile() {
  const { userProfile, vegMode, setVegMode, addresses, addAddress, updateAddress, deleteAddress } = useProfile();
  const navigate = useNavigate();
  const companyName = useCompanyName();

  // Popup states
  const [vegModeOpen, setVegModeOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    label: "Home",
    street: "",
    additionalDetails: "",
    city: "",
    state: "",
    zipCode: "",
    latitude: "",
    longitude: "",
    isDefault: false,
  });

  // Settings states
  const [appearance, setAppearance] = useState(() => {
    // Load theme from localStorage or default to 'light'
    return localStorage.getItem("appTheme") || "light";
  });

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (appearance === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    // Save to localStorage
    localStorage.setItem("appTheme", appearance);
  }, [appearance]);

  // Get first letter of name for avatar
  const avatarInitial =
    userProfile?.name?.charAt(0)?.toUpperCase() ||
    userProfile?.phone?.charAt(1)?.toUpperCase() ||
    "U";
  const displayName = userProfile?.name || userProfile?.phone || "User";
  // Only show email if it exists and is valid, otherwise show phone or "Not available"
  const hasValidEmail =
    userProfile?.email &&
    userProfile.email.trim() !== "" &&
    userProfile.email.includes("@");
  const displayEmail = hasValidEmail
    ? userProfile.email
    : userProfile?.phone || "Not available";

  // Calculate profile completion percentage
  const calculateProfileCompletion = () => {
    if (!userProfile) return 0;

    // Helper function to check if date field is filled (handles Date objects, date strings, ISO strings)
    const isDateFilled = (dateField) => {
      if (!dateField) return false;

      // Check if it's a Date object
      if (dateField instanceof Date) {
        return !isNaN(dateField.getTime());
      }

      // Check if it's a string
      if (typeof dateField === "string") {
        const trimmed = dateField.trim();
        if (trimmed === "" || trimmed === "null" || trimmed === "undefined")
          return false;

        // Try to parse as date (handles various formats: YYYY-MM-DD, ISO strings, etc.)
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          // Valid date
          return true;
        }
      }

      return false;
    };

    // Check name - must have value
    const hasName = !!(
      userProfile.name &&
      typeof userProfile.name === "string" &&
      userProfile.name.trim() !== ""
    );

    // Check contact - phone OR email (at least one)
    const hasPhone = !!(
      userProfile.phone &&
      typeof userProfile.phone === "string" &&
      userProfile.phone.trim() !== ""
    );
    const hasContact = hasPhone || hasValidEmail;

    // Check profile image - must have URL string
    const hasImage = !!(
      userProfile.profileImage &&
      typeof userProfile.profileImage === "string" &&
      userProfile.profileImage.trim() !== "" &&
      userProfile.profileImage !== "null" &&
      userProfile.profileImage !== "undefined"
    );

    // Check date of birth
    const hasDateOfBirth = isDateFilled(userProfile.dateOfBirth);

    // Check gender - must be valid value
    const validGenders = ["male", "female", "other", "prefer-not-to-say"];
    const hasGender = !!(
      userProfile.gender &&
      typeof userProfile.gender === "string" &&
      userProfile.gender.trim() !== "" &&
      validGenders.includes(userProfile.gender.trim().toLowerCase())
    );

    // Required fields only (anniversary is NOT counted - it's optional)
    // Only these 5 fields count towards 100%
    const requiredFields = {
      name: hasName,
      contact: hasContact,
      profileImage: hasImage,
      dateOfBirth: hasDateOfBirth,
      gender: hasGender,
    };

    const totalRequiredFields = 5; // Fixed: name, contact, profileImage, dateOfBirth, gender
    const completedRequiredFields =
      Object.values(requiredFields).filter(Boolean).length;

    // Calculate percentage based ONLY on required fields (anniversary NOT included)
    const percentage = Math.round(
      (completedRequiredFields / totalRequiredFields) * 100,
    );

    // Always log for debugging (remove in production if needed)
    console.log("?? Profile completion check:", {
      requiredFields,
      completedRequiredFields,
      totalRequiredFields,
      percentage,
      fieldStatus: {
        name: hasName ? "?" : "?",
        contact: hasContact ? "?" : "?",
        profileImage: hasImage ? "?" : "?",
        dateOfBirth: hasDateOfBirth ? "?" : "?",
        gender: hasGender ? "?" : "?",
      },
      rawData: {
        name: userProfile.name || "missing",
        phone: userProfile.phone || "missing",
        email: userProfile.email || "missing",
        profileImage: userProfile.profileImage ? "exists" : "missing",
        dateOfBirth: userProfile.dateOfBirth
          ? String(userProfile.dateOfBirth)
          : "missing",
        gender: userProfile.gender || "missing",
      },
    });

    return percentage;
  };

  const profileCompletion = calculateProfileCompletion();
  const isComplete = profileCompletion === 100;

  const getAddressId = (address) => address?.id || address?._id;
  const normalizeAddressLabel = (label) => {
    const normalized = String(label || "").trim().toLowerCase();
    if (normalized === "home") return "Home";
    if (normalized === "office" || normalized === "work") return "Office";
    return "Other";
  };
  const formatAddressLine = (address) =>
    [
      address?.street,
      address?.additionalDetails,
      address?.city,
      address?.state,
      address?.zipCode,
    ]
      .filter(Boolean)
      .join(", ");

  const extractAddressFromReverseGeocode = (response, latitude, longitude) => {
    const results = response?.data?.data?.results || [];
    const firstResult = results[0] || {};
    const components = firstResult?.address_components || {};

    const fromArray = Array.isArray(components)
      ? {
        city:
          components.find((c) => c.types?.includes("locality"))?.long_name ||
          components.find((c) => c.types?.includes("administrative_area_level_2"))?.long_name ||
          "",
        state:
          components.find((c) => c.types?.includes("administrative_area_level_1"))?.long_name ||
          "",
        zipCode:
          components.find((c) => c.types?.includes("postal_code"))?.long_name || "",
      }
      : {
        city: components.city || "",
        state: components.state || "",
        zipCode: components.zipCode || components.postal_code || "",
      };

    const formattedAddress = firstResult?.formatted_address || "";
    const parts = formattedAddress.split(",").map((item) => item.trim()).filter(Boolean);
    const fallbackStreet = parts[0] || "";
    const fallbackAdditional = parts.length > 1 ? parts.slice(1, Math.min(parts.length - 2, 3)).join(", ") : "";
    const pincodeFromText =
      formattedAddress.match(/\b\d{6}\b/)?.[0] ||
      response?.data?.data?.formattedAddress?.match(/\b\d{6}\b/)?.[0] ||
      "";

    const pincodeFromObject =
      firstResult?.postal_code ||
      firstResult?.postcode ||
      firstResult?.address?.postal_code ||
      firstResult?.address?.postcode ||
      response?.data?.data?.postalCode ||
      response?.data?.data?.zipCode ||
      "";

    return {
      street: firstResult?.street || fallbackStreet,
      additionalDetails:
        firstResult?.area ||
        firstResult?.sublocality ||
        firstResult?.neighborhood ||
        fallbackAdditional,
      city: fromArray.city,
      state: fromArray.state,
      zipCode: fromArray.zipCode || pincodeFromObject || pincodeFromText,
      latitude: String(latitude),
      longitude: String(longitude),
    };
  };

  const resetAddressForm = () => {
    setAddressForm({
      label: "Home",
      street: "",
      additionalDetails: "",
      city: "",
      state: "",
      zipCode: "",
      latitude: "",
      longitude: "",
      isDefault: false,
    });
  };

  const handleDetectCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported on this device.");
      return;
    }

    setIsDetectingLocation(true);
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Unable to detect valid coordinates.");
      }

      const response = await locationAPI.reverseGeocode(latitude, longitude);
      const parsed = extractAddressFromReverseGeocode(response, latitude, longitude);
      setAddressForm((prev) => ({
        ...prev,
        ...parsed,
      }));
      toast.success("Current location detected.");
    } catch (error) {
      console.error("Detect location failed:", error);
      toast.error("Unable to detect location. Please fill manually.");
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleSaveAddress = async () => {
    const payload = {
      label: normalizeAddressLabel(addressForm.label),
      street: String(addressForm.street || "").trim(),
      additionalDetails: String(addressForm.additionalDetails || "").trim(),
      city: String(addressForm.city || "").trim(),
      state: String(addressForm.state || "").trim(),
      zipCode: String(addressForm.zipCode || "").trim(),
      latitude: addressForm.latitude || undefined,
      longitude: addressForm.longitude || undefined,
      isDefault: Boolean(addressForm.isDefault),
    };

    if (!payload.street || !payload.city || !payload.state) {
      toast.error("Street, city and state are required.");
      return;
    }

    setIsSavingAddress(true);
    try {
      const existingByLabel = (addresses || []).find(
        (addr) => normalizeAddressLabel(addr?.label) === payload.label,
      );
      if (existingByLabel) {
        await updateAddress(getAddressId(existingByLabel), payload);
        toast.success(`${payload.label} address updated.`);
      } else {
        await addAddress(payload);
        toast.success("Address saved.");
      }
      setAddressDialogOpen(false);
      resetAddressForm();
    } catch (error) {
      console.error("Save address failed:", error);
      toast.error(error?.response?.data?.message || "Failed to save address.");
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleSetDefaultAddress = async (address) => {
    const id = getAddressId(address);
    if (!id || address?.isDefault) return;
    try {
      await updateAddress(id, { isDefault: true });
      toast.success("Default address updated.");
    } catch (error) {
      console.error("Set default address failed:", error);
      toast.error("Failed to set default address.");
    }
  };

  const handleDeleteAddress = async (address) => {
    const id = getAddressId(address);
    if (!id) return;
    try {
      await deleteAddress(id);
      toast.success("Address deleted.");
    } catch (error) {
      console.error("Delete address failed:", error);
      toast.error("Failed to delete address.");
    }
  };

  // Handle logout
  const handleLogout = async () => {
    if (isLoggingOut) return; // Prevent multiple clicks

    setIsLoggingOut(true);

    const clearUserStorage = () => {
      clearModuleAuth("user");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      localStorage.removeItem("userProfile");
      localStorage.removeItem("userAddresses");
      localStorage.removeItem("userPaymentMethods");
      localStorage.removeItem("userFavorites");
      localStorage.removeItem("userDishFavorites");
      localStorage.removeItem("MoBasket_user_profile");
    };

    try {
      // Call backend logout API to invalidate refresh token
      try {
        await authAPI.logout();
      } catch (apiError) {
        // Continue with logout even if API call fails (network issues, etc.)
        console.warn(
          "Logout API call failed, continuing with local cleanup:",
          apiError,
        );
      }

      // Sign out from Firebase if user logged in via Google
      try {
        const { signOut } = await import("firebase/auth");
        const currentUser = firebaseAuth.currentUser;
        if (currentUser) {
          await signOut(firebaseAuth);
        }
      } catch (firebaseError) {
        // Continue even if Firebase logout fails
        console.warn(
          "Firebase logout failed, continuing with local cleanup:",
          firebaseError,
        );
      }

      clearUserStorage();

      // Dispatch auth change event to notify other components
      window.dispatchEvent(new Event("userAuthChanged"));

      // Navigate to sign in page
      navigate("/user/auth/sign-in", { replace: true });
    } catch (err) {
      // Even if there's an error, we should still clear local data and logout
      console.error("Error during logout:", err);

      clearUserStorage();
      window.dispatchEvent(new Event("userAuthChanged"));

      // Still navigate to login page
      navigate("/user/auth/sign-in", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 pt-4 pb-36 sm:pt-6 sm:pb-36 md:pt-20 lg:pt-24 md:pb-6 lg:pb-8">
        {/* Back Arrow */}
        <div className="mb-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 p-0"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
          </Button>
        </div>

        {/* Profile Info Card */}
        <Card className="bg-white dark:bg-[#1a1a1a] rounded-2xl py-0 pt-1 shadow-sm mb-0 border-0 dark:border-gray-800 overflow-hidden">
          <CardContent className="p-4 py-0 pt-2">
            <div className="flex items-start gap-4 mb-4">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
              >
                <Avatar className="h-16 w-16 bg-blue-300 border-0">
                  {userProfile?.profileImage && (
                    <AvatarImage
                      src={
                        userProfile.profileImage &&
                          userProfile.profileImage.trim()
                          ? userProfile.profileImage
                          : undefined
                      }
                      alt={displayName}
                    />
                  )}
                  <AvatarFallback className="bg-blue-300 text-white text-2xl font-semibold">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
              <div className="flex-1 pt-1">
                <h2 className="text-xl font-bold text-black dark:text-white mb-1">
                  {displayName}
                </h2>
                {hasValidEmail && (
                  <p className="text-sm text-black dark:text-gray-300 mb-1">
                    {userProfile.email}
                  </p>
                )}
                {userProfile?.phone && (
                  <p
                    className={`text-sm ${hasValidEmail ? "text-gray-600 dark:text-gray-400" : "text-black dark:text-white"} mb-3`}
                  >
                    {userProfile.phone}
                  </p>
                )}
                {!hasValidEmail && !userProfile?.phone && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    Not available
                  </p>
                )}
                {/* <Link to="/user/profile/activity" className="flex items-center gap-1 text-green-600 text-sm font-medium">
                  View activity
                  <ChevronRight className="h-4 w-4" />
                </Link> */}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MoBasket Money and Coupons - Side by Side */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5 mt-3 mb-3">
          <Link to="/wallet" className="h-full">
            <motion.div
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer h-full">
                <CardContent className="p-4 h-full flex items-center gap-3">
                  <motion.div
                    className="bg-gray-100 dark:bg-gray-800 rounded-full p-2 flex-shrink-0"
                    whileHover={{ rotate: 360, scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Wallet className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </motion.div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {companyName} Money
                    </span>
                    <span className="text-base font-semibold text-[#EF4F5F] dark:text-[#EF4F5F]">
                      ₹{userProfile?.wallet?.balance?.toFixed(0) || "0"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>

          <Link to="/profile/coupons" className="h-full">
            <motion.div
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer h-full">
                <CardContent className="p-4 h-full flex items-center gap-3">
                  <motion.div
                    className="bg-gray-100 dark:bg-gray-800 rounded-full p-2 flex-shrink-0"
                    whileHover={{ rotate: 360, scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Tag className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Your coupons
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>
        </div>

        {/* Account Options */}
        <div className="space-y-2 mb-3">
          <Link to="/cart" className="block">
            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ShoppingCart className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">
                      Your cart
                    </span>
                  </div>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>

          <Link to="/profile/edit" className="block">
            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <User className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">
                      Your profile
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.span
                      className={`text-xs font-medium px-2 py-1 rounded ${isComplete
                        ? "bg-[#EF4F5F]/10 text-[#EF4F5F] border border-[#EF4F5F]/30"
                        : "bg-yellow-200 text-yellow-800"
                        }`}
                      whileHover={{ scale: 1.1 }}
                      transition={{ duration: 0.2 }}
                    >
                      {profileCompletion}% completed
                    </motion.span>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>

          <motion.div
            whileHover={{ x: 4, scale: 1.01 }}
            transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
          >
            <Card
              className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer"
              onClick={() => setVegModeOpen(true)}
            >
              <CardContent className="p-4  flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                    whileHover={{ rotate: 15, scale: 1.1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Leaf className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </motion.div>
                  <span className="text-base font-medium text-gray-900 dark:text-white">
                    Veg Mode
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <motion.span
                    className="text-base font-medium text-gray-900 dark:text-white"
                    whileHover={{ scale: 1.1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {vegMode ? "ON" : "OFF"}
                  </motion.span>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            whileHover={{ x: 4, scale: 1.01 }}
            transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
          >
            <Card
              className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer"
              onClick={() => setAppearanceOpen(true)}
            >
              <CardContent className="p-4  flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                    whileHover={{ rotate: 15, scale: 1.1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Palette className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  </motion.div>
                  <span className="text-base font-medium text-gray-900 dark:text-white">
                    Appearance
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <motion.span
                    className="text-base font-medium text-gray-900 dark:text-white capitalize"
                    whileHover={{ scale: 1.1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {appearance}
                  </motion.span>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Saved Addresses */}
        <div className="mb-3">
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-[#EF4F5F] rounded"></div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Saved Addresses
              </h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-3 rounded-lg border-[#EF4F5F] text-[#EF4F5F] hover:bg-[#EF4F5F]/10"
              onClick={() => {
                resetAddressForm();
                setAddressDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {(addresses || []).length === 0 ? (
              <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl border-0 dark:border-gray-800 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No saved addresses yet. Add Home, Office or Other address.
                  </p>
                </CardContent>
              </Card>
            ) : (
              (addresses || []).map((address) => (
                <Card
                  key={getAddressId(address)}
                  className="bg-white dark:bg-[#1a1a1a] rounded-xl border-0 dark:border-gray-800 shadow-sm"
                >
                  <CardContent className="p-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="h-4 w-4 text-[#EF4F5F]" />
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {normalizeAddressLabel(address?.label)}
                          {address?.isDefault ? (
                            <span className="ml-2 text-xs text-green-600">Default</span>
                          ) : null}
                        </p>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {formatAddressLine(address) || "Address details not available"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {!address?.isDefault ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-[#EF4F5F]"
                          onClick={() => handleSetDefaultAddress(address)}
                        >
                          Set default
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs font-medium text-red-500 flex items-center gap-1"
                        onClick={() => handleDeleteAddress(address)}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Collections Section */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-1 h-4 bg-[#EF4F5F] rounded"></div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Collections
            </h3>
          </div>
          <Link to="/user/profile/favorites">
            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                <CardContent className="p-4  flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Bookmark className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">
                      Your collections
                    </span>
                  </div>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>
        </div>

        {/* Food Orders Section */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-1 h-4 bg-[#EF4F5F] rounded"></div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Food Orders
            </h3>
          </div>
          <div className="space-y-2">
            <Link to="/orders" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Building2 className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">
                        Your orders
                      </span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          </div>
        </div>

        {/* Coupons Section */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-1 h-4 bg-[#EF4F5F] rounded"></div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Coupons
            </h3>
          </div>
          <Link to="/user/profile/redeem-gold-coupon">
            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Percent className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">
                      Redeem Gold coupon
                    </span>
                  </div>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </Link>
        </div>

        {/* More Section */}
        <div className="mb-6 pb-4">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-1 h-4 bg-[#EF4F5F] rounded"></div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              More
            </h3>
          </div>
          <div className="space-y-2">
            <Link to="/user/profile/about" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Info className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">
                        About
                      </span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>

            <Link to="/user/profile/send-feedback" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <PenSquare className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">
                        Send feedback
                      </span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>

            <Link to="/user/profile/report-safety-emergency" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <AlertTriangle className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">
                        Report a safety emergency
                      </span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>

            <Link to="/user/profile/settings" className="block">
              <motion.div
                whileHover={{ x: 4, scale: 1.01 }}
                transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
              >
                <Card className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                        whileHover={{ rotate: 15, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <SettingsIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      </motion.div>
                      <span className="text-base font-medium text-gray-900 dark:text-white">
                        Settings
                      </span>
                    </div>
                    <motion.div
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>

            <motion.div
              whileHover={{ x: 4, scale: 1.01 }}
              transition={{ duration: 0.2, type: "spring", stiffness: 300 }}
            >
              <Card
                className="bg-white dark:bg-[#1a1a1a] py-0 rounded-xl shadow-sm border-0 dark:border-gray-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleLogout}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="bg-gray-100 dark:bg-gray-800 rounded-full p-2"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Power
                        className={`h-5 w-5 text-gray-700 dark:text-gray-300 ${isLoggingOut ? "animate-pulse" : ""}`}
                      />
                    </motion.div>
                    <span className="text-base font-medium text-gray-900 dark:text-white">
                      {isLoggingOut ? "Logging out..." : "Log out"}
                    </span>
                  </div>
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Address Popup */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="max-w-sm md:max-w-md lg:max-w-lg w-[calc(100%-2rem)] rounded-2xl p-0 overflow-hidden bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-800">
          <DialogHeader className="p-5 pb-2">
            <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white">
              Add Address
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
              Detect current location or enter address manually.
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {["Home", "Office", "Other"].map((label) => (
                <button
                  key={label}
                  type="button"
                  className={`h-9 rounded-lg text-sm font-medium border ${addressForm.label === label
                    ? "border-[#EF4F5F] bg-[#EF4F5F]/10 text-[#EF4F5F]"
                    : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  onClick={() => setAddressForm((prev) => ({ ...prev, label }))}
                >
                  {label}
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              onClick={handleDetectCurrentLocation}
              disabled={isDetectingLocation}
            >
              <LocateFixed className={`h-4 w-4 mr-2 ${isDetectingLocation ? "animate-spin" : ""}`} />
              {isDetectingLocation ? "Detecting..." : "Detect Current Location"}
            </Button>

            <input
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 text-sm text-gray-900 dark:text-white"
              placeholder="Street / House No."
              value={addressForm.street}
              onChange={(e) =>
                setAddressForm((prev) => ({ ...prev, street: e.target.value }))
              }
            />
            <input
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 text-sm text-gray-900 dark:text-white"
              placeholder="Area / Landmark"
              value={addressForm.additionalDetails}
              onChange={(e) =>
                setAddressForm((prev) => ({
                  ...prev,
                  additionalDetails: e.target.value,
                }))
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 text-sm text-gray-900 dark:text-white"
                placeholder="City"
                value={addressForm.city}
                onChange={(e) =>
                  setAddressForm((prev) => ({ ...prev, city: e.target.value }))
                }
              />
              <input
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 text-sm text-gray-900 dark:text-white"
                placeholder="State"
                value={addressForm.state}
                onChange={(e) =>
                  setAddressForm((prev) => ({ ...prev, state: e.target.value }))
                }
              />
            </div>
            <input
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 text-sm text-gray-900 dark:text-white"
              placeholder="Pincode"
              value={addressForm.zipCode}
              onChange={(e) =>
                setAddressForm((prev) => ({ ...prev, zipCode: e.target.value }))
              }
            />

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={addressForm.isDefault}
                onChange={(e) =>
                  setAddressForm((prev) => ({ ...prev, isDefault: e.target.checked }))
                }
              />
              Set as default address
            </label>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setAddressDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 bg-[#EF4F5F] hover:bg-[#d93f50] text-white"
                onClick={handleSaveAddress}
                disabled={isSavingAddress}
              >
                {isSavingAddress ? "Saving..." : "Save Address"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Veg Mode Popup */}
      <Dialog open={vegModeOpen} onOpenChange={setVegModeOpen}>
        <DialogContent className="max-w-sm md:max-w-md lg:max-w-lg w-[calc(100%-2rem)] rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3">
            <DialogTitle className="text-lg font-bold text-gray-900">
              Veg Mode
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Filter restaurants and dishes based on your dietary preferences
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-5 pb-5">
            <button
              onClick={() => {
                setVegMode(true);
                setVegModeOpen(false);
              }}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center justify-between ${vegMode
                ? "border-[#EF4F5F] bg-[#EF4F5F]/10"
                : "border-gray-200 bg-white hover:border-gray-300"
                }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${vegMode
                    ? "border-[#EF4F5F] bg-[#EF4F5F]"
                    : "border-gray-300"
                    }`}
                >
                  {vegMode && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900 text-sm">
                    Veg Mode ON
                  </p>
                  <p className="text-xs text-gray-500">
                    Show only vegetarian options
                  </p>
                </div>
              </div>
              <Leaf
                className={`h-5 w-5 ${vegMode ? "text-[#EF4F5F]" : "text-gray-400"}`}
              />
            </button>
            <button
              onClick={() => {
                setVegMode(false);
                setVegModeOpen(false);
              }}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center justify-between ${!vegMode
                ? "border-[#EF4F5F] bg-[#EF4F5F]/10"
                : "border-gray-200 bg-white hover:border-gray-300"
                }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${!vegMode ? "border-[#EF4F5F] bg-[#EF4F5F]" : "border-gray-300"
                    }`}
                >
                  {!vegMode && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900 text-sm">
                    Veg Mode OFF
                  </p>
                  <p className="text-xs text-gray-500">Show all options</p>
                </div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Appearance Popup */}
      <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen}>
        <DialogContent className="max-w-sm md:max-w-md lg:max-w-lg w-[calc(100%-2rem)] rounded-2xl p-0 overflow-hidden bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-800">
          <DialogHeader className="p-5 pb-3">
            <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white">
              Appearance
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
              Choose your preferred theme
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-5 pb-5">
            <button
              onClick={() => {
                setAppearance("light");
                setAppearanceOpen(false);
              }}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${appearance === "light"
                ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
            >
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${appearance === "light"
                  ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-500"
                  : "border-gray-300 dark:border-gray-600"
                  }`}
              >
                {appearance === "light" && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
              <Sun className="h-5 w-5 text-yellow-500 dark:text-yellow-400 flex-shrink-0" />
              <div className="text-left">
                <p className="font-medium text-gray-900 dark:text-white text-sm">
                  Light
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Default light theme
                </p>
              </div>
            </button>
            <button
              onClick={() => {
                setAppearance("dark");
                setAppearanceOpen(false);
              }}
              className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${appearance === "dark"
                ? "border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
            >
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${appearance === "dark"
                  ? "border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-500"
                  : "border-gray-300 dark:border-gray-600"
                  }`}
              >
                {appearance === "dark" && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
              <Moon className="h-5 w-5 text-gray-600 dark:text-gray-300 flex-shrink-0" />
              <div className="text-left">
                <p className="font-medium text-gray-900 dark:text-white text-sm">
                  Dark
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Dark theme
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  );
}

