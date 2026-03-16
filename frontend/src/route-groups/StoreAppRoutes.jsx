import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthRedirect from "@/components/AuthRedirect";
import GroceryStoreOnboarding from "@/module/grocery-store/pages/Onboarding";
import GroceryStoreLogin from "@/module/grocery-store/pages/auth/Login";
import GroceryStoreSignup from "@/module/grocery-store/pages/auth/Signup";
import GroceryStoreOTP from "@/module/grocery-store/pages/auth/OTP";
import GroceryStoreProductDetailsPage from "@/module/grocery-store/pages/ProductDetailsPage";
import GroceryStoreProductsListPage from "@/module/grocery-store/pages/ProductsListPage";
import GroceryStoreCategoriesPage from "@/module/grocery-store/pages/CategoriesPage";
import AllOrdersPage from "@/module/restaurant/pages/AllOrdersPage";
import WalletPage from "@/module/restaurant/pages/WalletPage";
import RestaurantNotifications from "@/module/restaurant/pages/Notifications";
import OrderDetails from "@/module/restaurant/pages/OrderDetails";
import OrdersMain from "@/module/restaurant/pages/OrdersMain";
import CouponListPage from "@/module/restaurant/pages/CouponListPage";
import AddCouponPage from "@/module/restaurant/pages/AddCouponPage";
import EditCouponPage from "@/module/restaurant/pages/EditCouponPage";
import SettingsPage from "@/module/restaurant/pages/SettingsPage";
import PrivacyPolicyPage from "@/module/restaurant/pages/PrivacyPolicyPage";
import TermsAndConditionsPage from "@/module/restaurant/pages/TermsAndConditionsPage";
import ConversationListPage from "@/module/restaurant/pages/ConversationListPage";
import ChatDetailPage from "@/module/restaurant/pages/ChatDetailPage";
import RestaurantStatus from "@/module/restaurant/pages/RestaurantStatus";
import ExploreMore from "@/module/restaurant/pages/ExploreMore";
import DeliverySettings from "@/module/restaurant/pages/DeliverySettings";
import SwitchOutlet from "@/module/restaurant/pages/SwitchOutlet";
import OutletTimings from "@/module/restaurant/pages/OutletTimings";
import DaySlots from "@/module/restaurant/pages/DaySlots";
import OutletInfo from "@/module/restaurant/pages/OutletInfo";
import ContactDetails from "@/module/restaurant/pages/ContactDetails";
import EditOwner from "@/module/restaurant/pages/EditOwner";
import InviteUser from "@/module/restaurant/pages/InviteUser";
import Inventory from "@/module/restaurant/pages/Inventory";
import Feedback from "@/module/restaurant/pages/Feedback";
import ShareFeedback from "@/module/restaurant/pages/ShareFeedback";
import HelpCentre from "@/module/restaurant/pages/HelpCentre";
import ZoneSetup from "@/module/restaurant/pages/ZoneSetup";
import RestaurantPendingApproval from "@/module/restaurant/pages/PendingApproval";
import ContentPolicyPublic from "@/module/user/pages/legal/ContentPolicyPublic";

export default function StoreAppRoutes() {
  return (
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
  );
}
