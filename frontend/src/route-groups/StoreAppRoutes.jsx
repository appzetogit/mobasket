import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthRedirect from "@/components/AuthRedirect";
const GroceryStoreOnboarding = lazy(() => import("@/module/grocery-store/pages/Onboarding"));
const GroceryStoreLogin = lazy(() => import("@/module/grocery-store/pages/auth/Login"));
const GroceryStoreSignup = lazy(() => import("@/module/grocery-store/pages/auth/Signup"));
const GroceryStoreOTP = lazy(() => import("@/module/grocery-store/pages/auth/OTP"));
const GroceryStoreProductDetailsPage = lazy(() => import("@/module/grocery-store/pages/ProductDetailsPage"));
const GroceryStoreProductsListPage = lazy(() => import("@/module/grocery-store/pages/ProductsListPage"));
const GroceryStoreCategoriesPage = lazy(() => import("@/module/grocery-store/pages/CategoriesPage"));
const AllOrdersPage = lazy(() => import("@/module/restaurant/pages/AllOrdersPage"));
const WalletPage = lazy(() => import("@/module/restaurant/pages/WalletPage"));
const RestaurantNotifications = lazy(() => import("@/module/restaurant/pages/Notifications"));
const OrderDetails = lazy(() => import("@/module/restaurant/pages/OrderDetails"));
const OrdersMain = lazy(() => import("@/module/restaurant/pages/OrdersMain"));
const CouponListPage = lazy(() => import("@/module/restaurant/pages/CouponListPage"));
const AddCouponPage = lazy(() => import("@/module/restaurant/pages/AddCouponPage"));
const EditCouponPage = lazy(() => import("@/module/restaurant/pages/EditCouponPage"));
const SettingsPage = lazy(() => import("@/module/restaurant/pages/SettingsPage"));
const PrivacyPolicyPage = lazy(() => import("@/module/restaurant/pages/PrivacyPolicyPage"));
const TermsAndConditionsPage = lazy(() => import("@/module/restaurant/pages/TermsAndConditionsPage"));
const ConversationListPage = lazy(() => import("@/module/restaurant/pages/ConversationListPage"));
const ChatDetailPage = lazy(() => import("@/module/restaurant/pages/ChatDetailPage"));
const RestaurantStatus = lazy(() => import("@/module/restaurant/pages/RestaurantStatus"));
const ExploreMore = lazy(() => import("@/module/restaurant/pages/ExploreMore"));
const DeliverySettings = lazy(() => import("@/module/restaurant/pages/DeliverySettings"));
const SwitchOutlet = lazy(() => import("@/module/restaurant/pages/SwitchOutlet"));
const OutletTimings = lazy(() => import("@/module/restaurant/pages/OutletTimings"));
const DaySlots = lazy(() => import("@/module/restaurant/pages/DaySlots"));
const OutletInfo = lazy(() => import("@/module/restaurant/pages/OutletInfo"));
const ContactDetails = lazy(() => import("@/module/restaurant/pages/ContactDetails"));
const EditOwner = lazy(() => import("@/module/restaurant/pages/EditOwner"));
const InviteUser = lazy(() => import("@/module/restaurant/pages/InviteUser"));
const Inventory = lazy(() => import("@/module/restaurant/pages/Inventory"));
const Feedback = lazy(() => import("@/module/restaurant/pages/Feedback"));
const ShareFeedback = lazy(() => import("@/module/restaurant/pages/ShareFeedback"));
const HelpCentre = lazy(() => import("@/module/restaurant/pages/HelpCentre"));
const ZoneSetup = lazy(() => import("@/module/restaurant/pages/ZoneSetup"));
const RestaurantPendingApproval = lazy(() => import("@/module/restaurant/pages/PendingApproval"));
const ContentPolicyPublic = lazy(() => import("@/module/user/pages/legal/ContentPolicyPublic"));

function RouteChunkLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
    </div>
  );
}

export default function StoreAppRoutes() {
  return (
    <Suspense fallback={<RouteChunkLoader />}>
    <Routes>
      <Route path="login" element={<AuthRedirect module="grocery-store"><GroceryStoreLogin /></AuthRedirect>} />
      <Route path="signup" element={<AuthRedirect module="grocery-store"><GroceryStoreSignup /></AuthRedirect>} />
      <Route path="otp" element={<AuthRedirect module="grocery-store"><GroceryStoreOTP /></AuthRedirect>} />
      <Route path="pending-approval" element={<ProtectedRoute module="grocery-store"><RestaurantPendingApproval /></ProtectedRoute>} />
      <Route path="onboarding" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><GroceryStoreOnboarding /></ProtectedRoute>} />
      <Route index element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><OrdersMain /></ProtectedRoute>} />
      <Route path="details" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><OutletInfo /></ProtectedRoute>} />
      <Route path="product/:id" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><GroceryStoreProductDetailsPage /></ProtectedRoute>} />
      <Route path="product/new" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><GroceryStoreProductDetailsPage /></ProtectedRoute>} />
      <Route path="products/all" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><GroceryStoreProductsListPage /></ProtectedRoute>} />
      <Route path="categories" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><GroceryStoreCategoriesPage /></ProtectedRoute>} />
      <Route path="inventory" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><Inventory /></ProtectedRoute>} />
      <Route path="orders/all" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><AllOrdersPage /></ProtectedRoute>} />
      <Route path="orders/:orderId" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><OrderDetails /></ProtectedRoute>} />
      <Route path="feedback" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><Feedback /></ProtectedRoute>} />
      <Route path="share-feedback" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><ShareFeedback /></ProtectedRoute>} />
      <Route path="help-centre" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><HelpCentre /></ProtectedRoute>} />
      <Route path="explore" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><ExploreMore /></ProtectedRoute>} />
      <Route path="wallet" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><WalletPage /></ProtectedRoute>} />
      <Route path="settings" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><SettingsPage /></ProtectedRoute>} />
      <Route path="switch-outlet" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><SwitchOutlet /></ProtectedRoute>} />
      <Route path="manage-outlets" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><SwitchOutlet /></ProtectedRoute>} />
      <Route path="contact-details" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><ContactDetails /></ProtectedRoute>} />
      <Route path="edit-owner" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><EditOwner /></ProtectedRoute>} />
      <Route path="invite-user" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><InviteUser /></ProtectedRoute>} />
      <Route path="outlet-info" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><OutletInfo /></ProtectedRoute>} />
      <Route path="notifications" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><RestaurantNotifications /></ProtectedRoute>} />
      <Route path="delivery-settings" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><DeliverySettings /></ProtectedRoute>} />
      <Route path="status" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><RestaurantStatus /></ProtectedRoute>} />
      <Route path="zone-setup" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><ZoneSetup /></ProtectedRoute>} />
      <Route path="outlet-timings" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><OutletTimings /></ProtectedRoute>} />
      <Route path="outlet-timings/:day" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><DaySlots /></ProtectedRoute>} />
      <Route path="conversation" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><ConversationListPage /></ProtectedRoute>} />
      <Route path="online-offline" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><RestaurantStatus /></ProtectedRoute>} />
      <Route path="payments" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><WalletPage /></ProtectedRoute>} />
      <Route path="conversation/:conversationId" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><ChatDetailPage /></ProtectedRoute>} />
      <Route path="privacy" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><PrivacyPolicyPage /></ProtectedRoute>} />
      <Route path="terms" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><TermsAndConditionsPage /></ProtectedRoute>} />
      <Route path="content-policy" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><ContentPolicyPublic /></ProtectedRoute>} />
      <Route path="coupon" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><CouponListPage /></ProtectedRoute>} />
      <Route path="coupon/new" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><AddCouponPage /></ProtectedRoute>} />
      <Route path="coupon/:id/edit" element={<ProtectedRoute module="grocery-store" loginPath="/store/login"><EditCouponPage /></ProtectedRoute>} />
    </Routes>
    </Suspense>
  );
}
