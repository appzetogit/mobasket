import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthRedirect from "@/components/AuthRedirect";

import UserRouter from "@/module/user/components/UserRouter";
import HomePage from "@/module/usermain/pages/HomePage";

import CategoryPage from "@/module/user/pages/CategoryPage";
import CategoryDirectoryPage from "@/module/usermain/pages/CategoryDirectoryPage";
import FoodDetailPage from "@/module/usermain/pages/FoodDetailPage";
import Wallet from "@/module/user/pages/Wallet";
import { ProfileProvider } from "@/module/user/context/ProfileContext";

import RestaurantOrdersPage from "@/module/restaurant/pages/OrdersPage";
import AllOrdersPage from "@/module/restaurant/pages/AllOrdersPage";
import RestaurantDetailsPage from "@/module/restaurant/pages/RestaurantDetailsPage";
import EditRestaurantPage from "@/module/restaurant/pages/EditRestaurantPage";
import WalletPage from "@/module/restaurant/pages/WalletPage";
import RestaurantNotifications from "@/module/restaurant/pages/Notifications";
import OrderDetails from "@/module/restaurant/pages/OrderDetails";
import OrdersMain from "@/module/restaurant/pages/OrdersMain";
import RestaurantOnboarding from "@/module/restaurant/pages/Onboarding";

import RestaurantSignIn from "@/module/restaurant/pages/auth/SignIn";
import RestaurantLogin from "@/module/restaurant/pages/auth/Login";
import RestaurantSignup from "@/module/restaurant/pages/auth/Signup";
import RestaurantSignupEmail from "@/module/restaurant/pages/auth/SignupEmail";
import RestaurantForgotPassword from "@/module/restaurant/pages/auth/ForgotPassword";
import RestaurantOTP from "@/module/restaurant/pages/auth/OTP";
import RestaurantGoogleCallback from "@/module/restaurant/pages/auth/GoogleCallback";
import RestaurantWelcome from "@/module/restaurant/pages/auth/Welcome";

// Grocery Store imports
import GroceryStoreOnboarding from "@/module/grocery-store/pages/Onboarding";
import GroceryStoreLogin from "@/module/grocery-store/pages/auth/Login";
import GroceryStoreSignup from "@/module/grocery-store/pages/auth/Signup";
import GroceryStoreOTP from "@/module/grocery-store/pages/auth/OTP";
import GroceryStoreProductDetailsPage from "@/module/grocery-store/pages/ProductDetailsPage";
import GroceryStoreProductsListPage from "@/module/grocery-store/pages/ProductsListPage";
import GroceryStoreCategoriesPage from "@/module/grocery-store/pages/CategoriesPage";

import AdvertisementsPage from "@/module/restaurant/pages/AdvertisementsPage";
import AdDetailsPage from "@/module/restaurant/pages/AdDetailsPage";
import NewAdvertisementPage from "@/module/restaurant/pages/NewAdvertisementPage";
import EditAdvertisementPage from "@/module/restaurant/pages/EditAdvertisementPage";
import CouponListPage from "@/module/restaurant/pages/CouponListPage";
import AddCouponPage from "@/module/restaurant/pages/AddCouponPage";
import EditCouponPage from "@/module/restaurant/pages/EditCouponPage";
import ReviewsPage from "@/module/restaurant/pages/ReviewsPage";
import UpdateReplyPage from "@/module/restaurant/pages/UpdateReplyPage";
import SettingsPage from "@/module/restaurant/pages/SettingsPage";
import PrivacyPolicyPage from "@/module/restaurant/pages/PrivacyPolicyPage";
import TermsAndConditionsPage from "@/module/restaurant/pages/TermsAndConditionsPage";
import RestaurantConfigPage from "@/module/restaurant/pages/RestaurantConfigPage";
import RestaurantCategoriesPage from "@/module/restaurant/pages/RestaurantCategoriesPage";
import MenuCategoriesPage from "@/module/restaurant/pages/MenuCategoriesPage";
import BusinessPlanPage from "@/module/restaurant/pages/BusinessPlanPage";
import ConversationListPage from "@/module/restaurant/pages/ConversationListPage";
import ChatDetailPage from "@/module/restaurant/pages/ChatDetailPage";
import RestaurantStatus from "@/module/restaurant/pages/RestaurantStatus";
import RestaurantOrderSoundListener from "@/module/restaurant/components/RestaurantOrderSoundListener";
import DeliveryOrderSoundListener from "@/module/delivery/components/DeliveryOrderSoundListener";
import ExploreMore from "@/module/restaurant/pages/ExploreMore";
import DeliverySettings from "@/module/restaurant/pages/DeliverySettings";
import RushHour from "@/module/restaurant/pages/RushHour";
import SwitchOutlet from "@/module/restaurant/pages/SwitchOutlet";
import OutletTimings from "@/module/restaurant/pages/OutletTimings";
import DaySlots from "@/module/restaurant/pages/DaySlots";
import OutletInfo from "@/module/restaurant/pages/OutletInfo";
import RatingsReviews from "@/module/restaurant/pages/RatingsReviews";
import ContactDetails from "@/module/restaurant/pages/ContactDetails";
import EditOwner from "@/module/restaurant/pages/EditOwner";
import InviteUser from "@/module/restaurant/pages/InviteUser";
import EditCuisines from "@/module/restaurant/pages/EditCuisines";
import EditRestaurantAddress from "@/module/restaurant/pages/EditRestaurantAddress";
import Inventory from "@/module/restaurant/pages/Inventory";
import Feedback from "@/module/restaurant/pages/Feedback";
import ShareFeedback from "@/module/restaurant/pages/ShareFeedback";
import DishRatings from "@/module/restaurant/pages/DishRatings";
import HelpCentre from "@/module/restaurant/pages/HelpCentre";
import FssaiDetails from "@/module/restaurant/pages/FssaiDetails";
import FssaiUpdate from "@/module/restaurant/pages/FssaiUpdate";
import Hyperpure from "@/module/restaurant/pages/Hyperpure";
import HubGrowth from "@/module/restaurant/pages/HubGrowth";
import CreateOffers from "@/module/restaurant/pages/CreateOffers";
import ChooseDiscountType from "@/module/restaurant/pages/ChooseDiscountType";
import ChooseMenuDiscountType from "@/module/restaurant/pages/ChooseMenuDiscountType";
import CreatePercentageDiscount from "@/module/restaurant/pages/CreatePercentageDiscount";
import CreateFreebies from "@/module/restaurant/pages/CreateFreebies";
import FreebiesTiming from "@/module/restaurant/pages/FreebiesTiming";
import CreatePercentageMenuDiscount from "@/module/restaurant/pages/CreatePercentageMenuDiscount";
import CreateFlatPriceMenuDiscount from "@/module/restaurant/pages/CreateFlatPriceMenuDiscount";
import CreateBOGOMenuDiscount from "@/module/restaurant/pages/CreateBOGOMenuDiscount";
import MenuDiscountTiming from "@/module/restaurant/pages/MenuDiscountTiming";
import HubMenu from "@/module/restaurant/pages/HubMenu";
import ItemDetailsPage from "@/module/restaurant/pages/ItemDetailsPage";
import HubFinance from "@/module/restaurant/pages/HubFinance";
import FinanceDetailsPage from "@/module/restaurant/pages/FinanceDetailsPage";
import WithdrawalHistoryPage from "@/module/restaurant/pages/WithdrawalHistoryPage";
import PhoneNumbersPage from "@/module/restaurant/pages/PhoneNumbersPage";
import DownloadReport from "@/module/restaurant/pages/DownloadReport";
import ToHub from "@/module/restaurant/pages/ToHub";
import ManageOutlets from "@/module/restaurant/pages/ManageOutlets";
import UpdateBankDetails from "@/module/restaurant/pages/UpdateBankDetails";
import ZoneSetup from "@/module/restaurant/pages/ZoneSetup";
import RestaurantPendingApproval from "@/module/restaurant/pages/PendingApproval";

import AdminRouter from "@/module/admin/components/AdminRouter";
import AdminLogin from "@/module/admin/pages/auth/AdminLogin";
import AdminForgotPassword from "@/module/admin/pages/auth/AdminForgotPassword";
import DeliveryRouter from "@/module/delivery/components/DeliveryRouter";
import DeliverySignIn from "@/module/delivery/pages/auth/SignIn";
import DeliverySignup from "@/module/delivery/pages/auth/Signup";
import DeliveryOTP from "@/module/delivery/pages/auth/OTP";
import DeliverySignupStep1 from "@/module/delivery/pages/auth/SignupStep1";
import DeliverySignupStep2 from "@/module/delivery/pages/auth/SignupStep2";
import DeliveryWelcome from "@/module/delivery/pages/auth/Welcome";
import DeliveryTermsAndConditions from "@/module/delivery/pages/TermsAndConditions";
import TermsPublic from "@/module/user/pages/legal/TermsPublic";
import PrivacyPublic from "@/module/user/pages/legal/PrivacyPublic";
import ContentPolicyPublic from "@/module/user/pages/legal/ContentPolicyPublic";
import { setupWebPushForCurrentSession, teardownWebPushListener } from "@/lib/webPush";

function UserPathRedirect() {
  const location = useLocation();
  const newPath = location.pathname.replace(/^\/user/, "") || "/";
  return <Navigate to={newPath} replace />;
}

export default function App() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    const requestLocationPermission = () => {
      navigator.geolocation.getCurrentPosition(
        () => { },
        () => { },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000,
        },
      );
    };

    const run = async () => {
      // Do not re-prompt repeatedly after the user has dismissed/blocked it.
      if (sessionStorage.getItem("geoPromptRequested") === "1") return;

      try {
        if (navigator.permissions?.query) {
          const status = await navigator.permissions.query({ name: "geolocation" });
          if (status.state === "denied") {
            sessionStorage.setItem("geoPromptRequested", "1");
            return;
          }
        }
      } catch {
        // Ignore permissions API failures and continue with a single prompt attempt.
      }

      requestLocationPermission();
      sessionStorage.setItem("geoPromptRequested", "1");
    };

    run();
  }, []);

  useEffect(() => {
    const runSetup = () => {
      setupWebPushForCurrentSession(location.pathname).catch((error) => {
        // Keep this visible in console so push setup issues are diagnosable.
        // eslint-disable-next-line no-console
        console.warn("Web push setup failed:", error?.message || error);
      });
    };

    runSetup();

    const tokenKeys = new Set([
      "user_accessToken",
      "user_refreshToken",
      "accessToken",
      "restaurant_accessToken",
      "restaurant_refreshToken",
      "grocery-store_accessToken",
      "grocery-store_refreshToken",
      "delivery_accessToken",
      "delivery_refreshToken",
    ]);

    const onStorage = (event) => {
      if (!event?.key || tokenKeys.has(event.key)) {
        runSetup();
      }
    };

    const intervalId = window.setInterval(runSetup, 15000);
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", onStorage);
      teardownWebPushListener();
    };
  }, [location.pathname]);

  return (
    <>
      <RestaurantOrderSoundListener />
      <DeliveryOrderSoundListener />
      <Routes>
        <Route path="/user" element={<Navigate to="/" replace />} />
        <Route path="/user/*" element={<UserPathRedirect />} />
        <Route path="/legal/terms" element={<TermsPublic />} />
        <Route path="/legal/privacy" element={<PrivacyPublic />} />
        <Route path="/legal/content-policy" element={<ContentPolicyPublic />} />
        {/* Removed /routes route - Home should be accessed through UserRouter */}

        {/* Restaurant Public Routes */}
        <Route
          path="/restaurant/welcome"
          element={
            <AuthRedirect module="restaurant">
              <RestaurantWelcome />
            </AuthRedirect>
          }
        />
        <Route
          path="/restaurant/auth/sign-in"
          element={
            <AuthRedirect module="restaurant">
              <RestaurantSignIn />
            </AuthRedirect>
          }
        />
        <Route
          path="/restaurant/login"
          element={
            <AuthRedirect module="restaurant">
              <RestaurantLogin />
            </AuthRedirect>
          }
        />
        <Route
          path="/restaurant/signup"
          element={
            <AuthRedirect module="restaurant">
              <RestaurantSignup />
            </AuthRedirect>
          }
        />
        <Route
          path="/restaurant/signup-email"
          element={
            <AuthRedirect module="restaurant">
              <RestaurantSignupEmail />
            </AuthRedirect>
          }
        />
        <Route
          path="/restaurant/forgot-password"
          element={
            <AuthRedirect module="restaurant">
              <RestaurantForgotPassword />
            </AuthRedirect>
          }
        />
        <Route
          path="/restaurant/otp"
          element={
            <AuthRedirect module="restaurant">
              <RestaurantOTP />
            </AuthRedirect>
          }
        />
        <Route
          path="/restaurant/auth/google-callback"
          element={
            <AuthRedirect module="restaurant">
              <RestaurantGoogleCallback />
            </AuthRedirect>
          }
        />

        {/* Grocery Store Public Routes */}
        <Route
          path="/store/login"
          element={
            <AuthRedirect module="grocery-store">
              <GroceryStoreLogin />
            </AuthRedirect>
          }
        />
        <Route
          path="/store/signup"
          element={
            <AuthRedirect module="grocery-store">
              <GroceryStoreSignup />
            </AuthRedirect>
          }
        />
        <Route
          path="/store/otp"
          element={
            <AuthRedirect module="grocery-store">
              <GroceryStoreOTP />
            </AuthRedirect>
          }
        />

        {/* Grocery Store Protected Routes */}
        <Route
          path="/store/onboarding"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <GroceryStoreOnboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <OrdersMain />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/product/:id"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <GroceryStoreProductDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/product/new"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <GroceryStoreProductDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/products/all"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <GroceryStoreProductsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/categories"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <GroceryStoreCategoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/inventory"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <Inventory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/orders/all"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <AllOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/orders/:orderId"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <OrderDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/feedback"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <Feedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/share-feedback"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <ShareFeedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/help-centre"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <HelpCentre />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/explore"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <ExploreMore />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/wallet"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <WalletPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/settings"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/switch-outlet"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <SwitchOutlet />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/outlet-info"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <OutletInfo />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/notifications"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <RestaurantNotifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/delivery-settings"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <DeliverySettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/status"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <RestaurantStatus />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/zone-setup"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <ZoneSetup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/outlet-timings"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <OutletTimings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/outlet-timings/:day"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <DaySlots />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/conversation"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <ConversationListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/conversation/:conversationId"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <ChatDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/privacy"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <PrivacyPolicyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/terms"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <TermsAndConditionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/content-policy"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <ContentPolicyPublic />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/coupon"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <CouponListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/coupon/new"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <AddCouponPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/coupon/:id/edit"
          element={
            <ProtectedRoute
              module="grocery-store"
              loginPath="/store/login"
            >
              <EditCouponPage />
            </ProtectedRoute>
          }
        />

        {/* Restaurant Protected Routes */}
        <Route
          path="/restaurant/onboarding"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <RestaurantOnboarding />
            </ProtectedRoute>
          }
        />

        {/* Restaurant Protected Routes - Old Routes */}
        <Route
          path="/restaurant"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <OrdersMain />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/notifications"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <RestaurantNotifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/orders"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <RestaurantOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/orders/all"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <AllOrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/orders/:orderId"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <OrderDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/details"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <RestaurantDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/edit"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <EditRestaurantPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/food/all"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <Navigate to="/restaurant/hub-menu" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/food/:id"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <Navigate to="/restaurant/hub-menu" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/food/:id/edit"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <Navigate to="/restaurant/hub-menu" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/food/new"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <Navigate to="/restaurant/hub-menu/item/new" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/wallet"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <WalletPage />
            </ProtectedRoute>
          }
        />

        {/* Restaurant Protected Routes - Continued */}
        <Route
          path="/restaurant/advertisements"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <AdvertisementsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/advertisements/new"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <NewAdvertisementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/advertisements/:id"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <AdDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/advertisements/:id/edit"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <EditAdvertisementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/coupon"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <CouponListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/coupon/new"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <AddCouponPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/coupon/:id/edit"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <EditCouponPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/reviews"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ReviewsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/reviews/:id/reply"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <UpdateReplyPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restaurant/settings"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/delivery-settings"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <DeliverySettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/rush-hour"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <RushHour />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/privacy"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <PrivacyPolicyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/terms"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <TermsAndConditionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/content-policy"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ContentPolicyPublic />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restaurant/config"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <RestaurantConfigPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/categories"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <RestaurantCategoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/menu-categories"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <MenuCategoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/business-plan"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <BusinessPlanPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/conversation"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ConversationListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/conversation/:conversationId"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ChatDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/status"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <RestaurantStatus />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/explore"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ExploreMore />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restaurant/switch-outlet"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <SwitchOutlet />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/outlet-timings"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <OutletTimings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/outlet-timings/:day"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <DaySlots />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/outlet-info"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <OutletInfo />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/ratings-reviews"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <RatingsReviews />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/contact-details"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ContactDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/edit-owner"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <EditOwner />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/invite-user"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <InviteUser />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/edit-cuisines"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <EditCuisines />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/edit-address"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <EditRestaurantAddress />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restaurant/inventory"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <Inventory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/feedback"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <Feedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/share-feedback"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ShareFeedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/dish-ratings"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <DishRatings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/help-centre"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <HelpCentre />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/fssai"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <FssaiDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/fssai/update"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <FssaiUpdate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hyperpure"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <Hyperpure />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <HubGrowth />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <CreateOffers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ChooseMenuDiscountType />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/freebies"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <CreateFreebies />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/freebies/timings"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <FreebiesTiming />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/percentage"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <CreatePercentageMenuDiscount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/percentage/timings"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <MenuDiscountTiming />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/flat-price"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <CreateFlatPriceMenuDiscount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/flat-price/timings"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <MenuDiscountTiming />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/bogo"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <CreateBOGOMenuDiscount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/delight-customers/bogo/timings"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <MenuDiscountTiming />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/:goalId/:discountType/create"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <CreatePercentageDiscount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-growth/create-offers/:goalId"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ChooseDiscountType />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-menu"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <HubMenu />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-menu/item/:id"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ItemDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/hub-finance"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <HubFinance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/withdrawal-history"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <WithdrawalHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/finance-details"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <FinanceDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/phone"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <PhoneNumbersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/download-report"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <DownloadReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/to-hub"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ToHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/manage-outlets"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ManageOutlets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/update-bank-details"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <UpdateBankDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurant/zone-setup"
          element={
            <ProtectedRoute
              requiredRole="restaurant"
              loginPath="/restaurant/login"
            >
              <ZoneSetup />
            </ProtectedRoute>
          }
        />
        {/* Delivery Public Routes */}
        <Route path="/delivery/sign-in" element={<DeliverySignIn />} />
        <Route path="/delivery/signup" element={<DeliverySignup />} />
        <Route path="/delivery/otp" element={<DeliveryOTP />} />
        <Route path="/delivery/terms-and-conditions" element={<DeliveryTermsAndConditions />} />
        <Route
          path="/delivery/welcome"
          element={
            <AuthRedirect module="delivery">
              <DeliveryWelcome />
            </AuthRedirect>
          }
        />

        {/* Delivery Signup Routes (Protected - require authentication) */}
        <Route
          path="/delivery/signup/details"
          element={
            <ProtectedRoute
              requiredRole="delivery"
              loginPath="/delivery/sign-in"
            >
              <DeliverySignupStep1 />
            </ProtectedRoute>
          }
        />
        <Route
          path="/delivery/signup/documents"
          element={
            <ProtectedRoute
              requiredRole="delivery"
              loginPath="/delivery/sign-in"
            >
              <DeliverySignupStep2 />
            </ProtectedRoute>
          }
        />

        {/* Delivery Protected Routes */}
        <Route
          path="/delivery/*"
          element={
            <ProtectedRoute
              requiredRole="delivery"
              loginPath="/delivery/sign-in"
            >
              <DeliveryRouter />
            </ProtectedRoute>
          }
        />

        <Route
          path="/restaurant/pending-approval"
          element={
            <ProtectedRoute module="restaurant">
              <RestaurantPendingApproval />
            </ProtectedRoute>
          }
        />
        <Route
          path="/store/pending-approval"
          element={
            <ProtectedRoute module="grocery-store">
              <RestaurantPendingApproval />
            </ProtectedRoute>
          }
        />

        {/* Admin Public Routes */}
        <Route
          path="/admin/login"
          element={
            <AuthRedirect module="admin">
              <AdminLogin />
            </AuthRedirect>
          }
        />
        <Route
          path="/admin/forgot-password"
          element={
            <AuthRedirect module="admin">
              <AdminForgotPassword />
            </AuthRedirect>
          }
        />

        {/* Admin Protected Routes */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute requiredRole="admin" loginPath="/admin/login">
              <AdminRouter />
            </ProtectedRoute>
          }
        />

        <Route path="/*" element={<UserRouter />} />
      </Routes>
    </>
  );
}
