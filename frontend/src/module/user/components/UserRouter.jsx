import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthRedirect from "@/components/AuthRedirect";
import { isModuleAuthenticated } from "@/lib/utils/auth";
import UserLayout from "./UserLayout";

// Home & Discovery
import Home from "../pages/Home";
import Coffee from "../pages/Coffee";
import Under250 from "../pages/Under250";
import CategoryPage from "../pages/CategoryPage";
import Restaurants from "../pages/restaurants/Restaurants";
import RestaurantDetails from "../pages/restaurants/RestaurantDetails";
import SearchResults from "../pages/SearchResults";
import ProductDetail from "../pages/ProductDetail";

// Cart
import CartPage from "@/module/usermain/pages/CartPage";
import CheckoutPage from "@/module/usermain/pages/CheckoutPage";
import PaymentPage from "@/module/usermain/pages/PaymentPage";

// Orders
import OrdersPage from "@/module/usermain/pages/OrdersPage";
import OrderTracking from "../pages/orders/OrderTracking";
import OrderInvoice from "../pages/orders/OrderInvoice";
import UserOrderDetails from "../pages/orders/UserOrderDetails";

// Offers
import Offers from "../pages/Offers";

// Gourmet
import Gourmet from "../pages/Gourmet";

// Top 10
import Top10 from "../pages/Top10";

// Collections
import Collections from "../pages/Collections";
import CollectionDetail from "../pages/CollectionDetail";

// Gift Cards
import GiftCards from "../pages/GiftCards";
import GiftCardCheckout from "../pages/GiftCardCheckout";

// Profile
import Profile from "../pages/profile/Profile";
import EditProfile from "../pages/profile/EditProfile";
import Payments from "../pages/profile/Payments";
import AddPayment from "../pages/profile/AddPayment";
import EditPayment from "../pages/profile/EditPayment";
import Favorites from "../pages/profile/Favorites";
import Settings from "../pages/profile/Settings";
import Coupons from "../pages/profile/Coupons";
import RedeemGoldCoupon from "../pages/profile/RedeemGoldCoupon";
import About from "../pages/profile/About";
import Terms from "../pages/profile/Terms";
import Privacy from "../pages/profile/Privacy";
import Refund from "../pages/profile/Refund";
import Shipping from "../pages/profile/Shipping";
import Cancellation from "../pages/profile/Cancellation";
import SendFeedback from "../pages/profile/SendFeedback";
import ReportSafetyEmergency from "../pages/profile/ReportSafetyEmergency";
import Accessibility from "../pages/profile/Accessibility";
import Logout from "../pages/profile/Logout";

// Auth
import SignIn from "../pages/auth/SignIn";
import OTP from "../pages/auth/OTP";
import AuthCallback from "../pages/auth/AuthCallback";

// Help
import Help from "../pages/help/Help";
import OrderHelp from "../pages/help/OrderHelp";

// Notifications
import Notifications from "../pages/Notifications";

// Wallet
import Wallet from "../pages/Wallet";

// Complaints
import SubmitComplaint from "../pages/complaints/SubmitComplaint";

// Grocery (MoBasket)
import GroceryPage from "@/module/usermain/pages/GroceryPage";
import GroceryProfile from "@/module/usermain/pages/GroceryProfile";
import GroceryCartPage from "@/module/usermain/pages/GroceryCartPage";
import GroceryCheckoutPage from "@/module/usermain/pages/GroceryCheckoutPage";
import GrocerySubcategoryProductsPage from "@/module/usermain/pages/GrocerySubcategoryProductsPage";
import GroceryBestSellerProductsPage from "@/module/usermain/pages/GroceryBestSellerProductsPage";
import PlansPage from "@/module/usermain/pages/PlansPage";
import CategoryDirectoryPage from "@/module/usermain/pages/CategoryDirectoryPage";
import WishlistPage from "@/module/usermain/pages/WishlistPage";
import FoodDetailPage from "@/module/usermain/pages/FoodDetailPage";
import CategoryFoodsPage from "@/module/usermain/pages/CategoryFoodsPage";
import WelcomeSelectionPage from "@/module/user/pages/WelcomeSelectionPage";

export default function UserRouter() {
  return (
    <Routes>
      <Route element={<UserLayout />}>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/" element={<RootLanding />} />
        <Route
          path="/welcome"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <WelcomeSelectionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Home />
            </ProtectedRoute>
          }
        />
        <Route path="/under-250" element={<Under250 />} />
        <Route path="/category/:category" element={<CategoryPage />} />
        <Route path="/restaurants" element={<Restaurants />} />
        <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/product/:id" element={<ProductDetail />} />

        {/* Cart - Protected */}
        <Route
          path="/cart"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <CartPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cart/checkout"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <CheckoutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <PaymentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cart/payment"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <PaymentPage />
            </ProtectedRoute>
          }
        />
        {/* Supporting legacy checkout path */}
        <Route
          path="/checkout"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <CheckoutPage />
            </ProtectedRoute>
          }
        />

        {/* Orders - Protected */}
        <Route
          path="/orders"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <OrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:orderId"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <OrderTracking />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:orderId/invoice"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <OrderInvoice />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:orderId/details"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <UserOrderDetails />
            </ProtectedRoute>
          }
        />

        {/* Offers */}
        <Route path="/offers" element={<Offers />} />

        {/* Gourmet */}
        <Route path="/gourmet" element={<Gourmet />} />

        {/* Top 10 */}
        <Route path="/top-10" element={<Top10 />} />

        {/* Collections */}
        <Route path="/collections" element={<Collections />} />
        <Route
          path="/collections/:id"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <CollectionDetail />
            </ProtectedRoute>
          }
        />

        {/* Gift Cards */}
        <Route path="/gift-card" element={<GiftCards />} />
        <Route
          path="/gift-card/checkout"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <GiftCardCheckout />
            </ProtectedRoute>
          }
        />

        {/* Profile - Protected */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/addresses"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/edit"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <EditProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/payments"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Payments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/payments/new"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <AddPayment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/payments/:id/edit"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <EditPayment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/favorites"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Favorites />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/settings"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/coupons"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Coupons />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/redeem-gold-coupon"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <RedeemGoldCoupon />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/about"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <About />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/terms"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Terms />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/privacy"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Privacy />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/refund"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Refund />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/shipping"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Shipping />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/cancellation"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Cancellation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/send-feedback"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <SendFeedback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/report-safety-emergency"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <ReportSafetyEmergency />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/accessibility"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Accessibility />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/logout"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Logout />
            </ProtectedRoute>
          }
        />

        {/* Auth */}
        <Route
          path="/auth/sign-in"
          element={
            <AuthRedirect module="user">
              <SignIn />
            </AuthRedirect>
          }
        />
        <Route
          path="/auth/otp"
          element={
            <AuthRedirect module="user">
              <OTP />
            </AuthRedirect>
          }
        />
        <Route
          path="/auth/callback"
          element={
            <AuthRedirect module="user">
              <AuthCallback />
            </AuthRedirect>
          }
        />

        {/* Help */}
        <Route path="/help" element={<Help />} />
        <Route path="/help/orders/:orderId" element={<OrderHelp />} />

        {/* Notifications - Protected */}
        <Route
          path="/notifications"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Notifications />
            </ProtectedRoute>
          }
        />

        {/* Wallet - Protected */}
        <Route
          path="/wallet"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <Wallet />
            </ProtectedRoute>
          }
        />

        {/* Complaints - Protected */}
        <Route
          path="/complaints/submit/:orderId"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <SubmitComplaint />
            </ProtectedRoute>
          }
        />

        {/* Grocery (MoBasket) - Protected */}
        <Route
          path="/grocery"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <GroceryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grocery/categories"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <GroceryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grocery/profile"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <GroceryProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grocery/cart"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <GroceryCartPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grocery/checkout"
          element={
            <ProtectedRoute requiredRole="user" loginPath="/user/auth/sign-in">
              <GroceryCheckoutPage />
            </ProtectedRoute>
          }
        />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/categories" element={<CategoryDirectoryPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/grocery/category/:id" element={<CategoryFoodsPage />} />
        <Route path="/grocery/subcategory/:subcategoryId" element={<GrocerySubcategoryProductsPage />} />
        <Route path="/grocery/best-seller/:itemType/:itemId" element={<GroceryBestSellerProductsPage />} />
        <Route path="/food/:id" element={<FoodDetailPage />} />
      </Route>
    </Routes>
  );
}

// Helper component for redirection
// Helper component for redirection
function RootLanding() {
  const preference = localStorage.getItem("mobasket_preference");

  if (isModuleAuthenticated("user")) {
    if (preference === "food") {
      return <Navigate to="/home" replace />;
    } else if (preference === "grocery") {
      return <Navigate to="/grocery" replace />;
    }
    return <Navigate to="/welcome" replace />;
  }
  return <SignIn />;
}
