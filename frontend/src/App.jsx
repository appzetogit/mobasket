import { Suspense, lazy, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthRedirect from "@/components/AuthRedirect";
import ScrollToTop from "@/components/ScrollToTop";
import RestaurantOrderSoundListener from "@/module/restaurant/components/RestaurantOrderSoundListener";
import DeliveryOrderSoundListener from "@/module/delivery/components/DeliveryOrderSoundListener";
import WelcomeSelectionPage from "@/module/user/pages/WelcomeSelectionPage";
import {
  setupWebPushForCurrentSession,
  syncNativeMobilePushForCurrentSession,
  teardownWebPushListener,
} from "@/lib/webPush";

const UserRouter = lazy(() => import("@/module/user/components/UserRouter"));
const RestaurantAppRoutes = lazy(() => import("@/route-groups/RestaurantAppRoutes"));
const StoreAppRoutes = lazy(() => import("@/route-groups/StoreAppRoutes"));
const AdminRouter = lazy(() => import("@/module/admin/components/AdminRouter"));
const AdminLogin = lazy(() => import("@/module/admin/pages/auth/AdminLogin"));
const AdminForgotPassword = lazy(() => import("@/module/admin/pages/auth/AdminForgotPassword"));
const DeliveryRouter = lazy(() => import("@/module/delivery/components/DeliveryRouter"));
const DeliverySignIn = lazy(() => import("@/module/delivery/pages/auth/SignIn"));
const DeliverySignup = lazy(() => import("@/module/delivery/pages/auth/Signup"));
const DeliveryOTP = lazy(() => import("@/module/delivery/pages/auth/OTP"));
const DeliverySignupStep1 = lazy(() => import("@/module/delivery/pages/auth/SignupStep1"));
const DeliverySignupStep2 = lazy(() => import("@/module/delivery/pages/auth/SignupStep2"));
const DeliveryPendingApproval = lazy(() => import("@/module/delivery/pages/PendingApproval"));
const DeliveryWelcome = lazy(() => import("@/module/delivery/pages/auth/Welcome"));
const DeliveryTermsAndConditions = lazy(() => import("@/module/delivery/pages/TermsAndConditions"));
const TermsPublic = lazy(() => import("@/module/user/pages/legal/TermsPublic"));
const PrivacyPublic = lazy(() => import("@/module/user/pages/legal/PrivacyPublic"));
const ContentPolicyPublic = lazy(() => import("@/module/user/pages/legal/ContentPolicyPublic"));

function RouteLoader() {
  return <div className="min-h-screen bg-white" aria-hidden="true" />;
}

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
        () => {},
        () => {},
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000,
        },
      );
    };

    const run = async () => {
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

    const hasAnySessionToken = () => {
      for (const key of tokenKeys) {
        if (localStorage.getItem(key)) return true;
      }
      return false;
    };

    const runSetup = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!hasAnySessionToken()) return;

      setupWebPushForCurrentSession(location.pathname).catch((error) => {
        // eslint-disable-next-line no-console
        console.warn("Web push setup failed:", error?.message || error);
      });
      syncNativeMobilePushForCurrentSession(location.pathname).catch((error) => {
        // eslint-disable-next-line no-console
        console.warn("Native mobile push sync failed:", error?.message || error);
      });
    };

    runSetup();

    const onStorage = (event) => {
      if (!event?.key || tokenKeys.has(event.key)) {
        runSetup();
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden) runSetup();
    };

    const onPublicEnvReady = () => {
      runSetup();
    };

    const onAuthChanged = () => {
      runSetup();
    };

    const intervalId = window.setInterval(runSetup, 60000);
    window.addEventListener("storage", onStorage);
    window.addEventListener("publicEnvReady", onPublicEnvReady);
    window.addEventListener("userAuthChanged", onAuthChanged);
    window.addEventListener("restaurantAuthChanged", onAuthChanged);
    window.addEventListener("groceryStoreAuthChanged", onAuthChanged);
    window.addEventListener("deliveryAuthChanged", onAuthChanged);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("publicEnvReady", onPublicEnvReady);
      window.removeEventListener("userAuthChanged", onAuthChanged);
      window.removeEventListener("restaurantAuthChanged", onAuthChanged);
      window.removeEventListener("groceryStoreAuthChanged", onAuthChanged);
      window.removeEventListener("deliveryAuthChanged", onAuthChanged);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      teardownWebPushListener();
    };
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pathname = location.pathname || "";
    if (!pathname.startsWith("/store") || pathname === "/store") return;

    const isStoreAuthPage = /^\/store\/(login|signup|otp)$/.test(pathname);
    if (isStoreAuthPage) return;

    const hasStoreToken = Boolean(
      localStorage.getItem("grocery-store_accessToken") ||
      localStorage.getItem("grocery-store_refreshToken"),
    );
    if (!hasStoreToken) return;

    if (sessionStorage.getItem("storeBackStackInjected") === "1") return;

    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    const currentState = window.history.state || {};
    window.history.replaceState(
      { ...currentState, __storeBackStack: true },
      "",
      "/store",
    );
    window.history.pushState(
      { ...currentState, __storeBackStack: true },
      "",
      currentUrl,
    );
    sessionStorage.setItem("storeBackStackInjected", "1");
  }, [location.pathname]);

  return (
    <>
      <ScrollToTop />
      <RestaurantOrderSoundListener />
      <DeliveryOrderSoundListener />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/user" element={<Navigate to="/" replace />} />
          <Route path="/user/*" element={<UserPathRedirect />} />

          <Route path="/legal/terms" element={<TermsPublic />} />
          <Route path="/legal/privacy" element={<PrivacyPublic />} />
          <Route path="/legal/content-policy" element={<ContentPolicyPublic />} />
          <Route
            path="/"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <WelcomeSelectionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/welcome"
            element={
              <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
                <WelcomeSelectionPage />
              </ProtectedRoute>
            }
          />

          <Route path="/restaurant/*" element={<RestaurantAppRoutes />} />
          <Route path="/store/*" element={<StoreAppRoutes />} />

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
          <Route
            path="/delivery/signup/details"
            element={
              <ProtectedRoute requiredRole="delivery" loginPath="/delivery/sign-in">
                <DeliverySignupStep1 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delivery/signup/documents"
            element={
              <ProtectedRoute requiredRole="delivery" loginPath="/delivery/sign-in">
                <DeliverySignupStep2 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delivery/pending-approval"
            element={
              <ProtectedRoute requiredRole="delivery" loginPath="/delivery/sign-in">
                <DeliveryPendingApproval />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delivery/*"
            element={
              <ProtectedRoute requiredRole="delivery" loginPath="/delivery/sign-in">
                <DeliveryRouter />
              </ProtectedRoute>
            }
          />

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
      </Suspense>
    </>
  );
}
