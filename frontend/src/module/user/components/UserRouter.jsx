import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthRedirect from "@/components/AuthRedirect";
import UserLayout from "./UserLayout";

import SignIn from "../pages/auth/SignIn";
const Home = lazy(() => import("../pages/Home"));
const Under250 = lazy(() => import("../pages/Under250"));
const CategoryPage = lazy(() => import("../pages/CategoryPage"));
const Restaurants = lazy(() => import("../pages/restaurants/Restaurants"));
const SearchResults = lazy(() => import("../pages/SearchResults"));
const ProductDetail = lazy(() => import("../pages/ProductDetail"));
const CartPage = lazy(() => import("@/module/usermain/pages/CartPage"));
const CheckoutPage = lazy(() => import("@/module/usermain/pages/CheckoutPage"));
const PaymentPage = lazy(() => import("@/module/usermain/pages/PaymentPage"));
const OrdersPage = lazy(() => import("@/module/usermain/pages/OrdersPage"));
const OrderTracking = lazy(() => import("../pages/orders/OrderTracking"));
const OrderInvoice = lazy(() => import("../pages/orders/OrderInvoice"));
const UserOrderDetails = lazy(() => import("../pages/orders/UserOrderDetails"));
const Offers = lazy(() => import("../pages/Offers"));
const Gourmet = lazy(() => import("../pages/Gourmet"));
const Top10 = lazy(() => import("../pages/Top10"));
const Collections = lazy(() => import("../pages/Collections"));
const CollectionDetail = lazy(() => import("../pages/CollectionDetail"));
const GiftCards = lazy(() => import("../pages/GiftCards"));
const GiftCardCheckout = lazy(() => import("../pages/GiftCardCheckout"));
const Profile = lazy(() => import("../pages/profile/Profile"));
const EditProfile = lazy(() => import("../pages/profile/EditProfile"));
const Payments = lazy(() => import("../pages/profile/Payments"));
const AddPayment = lazy(() => import("../pages/profile/AddPayment"));
const EditPayment = lazy(() => import("../pages/profile/EditPayment"));
const Favorites = lazy(() => import("../pages/profile/Favorites"));
const Settings = lazy(() => import("../pages/profile/Settings"));
const Coupons = lazy(() => import("../pages/profile/Coupons"));
const RedeemGoldCoupon = lazy(() => import("../pages/profile/RedeemGoldCoupon"));
const About = lazy(() => import("../pages/profile/About"));
const Terms = lazy(() => import("../pages/profile/Terms"));
const Privacy = lazy(() => import("../pages/profile/Privacy"));
const Refund = lazy(() => import("../pages/profile/Refund"));
const Shipping = lazy(() => import("../pages/profile/Shipping"));
const Cancellation = lazy(() => import("../pages/profile/Cancellation"));
const SendFeedback = lazy(() => import("../pages/profile/SendFeedback"));
const ReportSafetyEmergency = lazy(() => import("../pages/profile/ReportSafetyEmergency"));
const Accessibility = lazy(() => import("../pages/profile/Accessibility"));
const Logout = lazy(() => import("../pages/profile/Logout"));
const OTP = lazy(() => import("../pages/auth/OTP"));
const AuthCallback = lazy(() => import("../pages/auth/AuthCallback"));
const Help = lazy(() => import("../pages/help/Help"));
const OrderHelp = lazy(() => import("../pages/help/OrderHelp"));
const Notifications = lazy(() => import("../pages/Notifications"));
const Wallet = lazy(() => import("../pages/Wallet"));
const SubmitComplaint = lazy(() => import("../pages/complaints/SubmitComplaint"));
const GroceryPage = lazy(() => import("@/module/usermain/pages/GroceryPage"));
const GroceryProfile = lazy(() => import("@/module/usermain/pages/GroceryProfile"));
const GroceryCartPage = lazy(() => import("@/module/usermain/pages/GroceryCartPage"));
const GroceryCheckoutPage = lazy(() => import("@/module/usermain/pages/GroceryCheckoutPage"));
const GrocerySubcategoryProductsPage = lazy(() => import("@/module/usermain/pages/GrocerySubcategoryProductsPage"));
const GroceryBestSellerProductsPage = lazy(() => import("@/module/usermain/pages/GroceryBestSellerProductsPage"));
const PlansPage = lazy(() => import("@/module/usermain/pages/PlansPage"));
const CategoryDirectoryPage = lazy(() => import("@/module/usermain/pages/CategoryDirectoryPage"));
const CategoryFoodsPage = lazy(() => import("@/module/usermain/pages/CategoryFoodsPage"));
const WishlistPage = lazy(() => import("@/module/usermain/pages/WishlistPage"));
const FoodDetailPage = lazy(() => import("@/module/usermain/pages/FoodDetailPage"));
const WelcomeSelectionPage = lazy(() => import("@/module/user/pages/WelcomeSelectionPage"));
const RestaurantDetails = lazy(() => import("../pages/restaurants/RestaurantDetails"));

function RouteLoader({ label = "Loading..." }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-8 rounded-full border-2 border-green-600 border-t-transparent animate-spin" />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
    </div>
  );
}

export default function UserRouter() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route element={<UserLayout />}>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
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
        <Route
          path="/restaurants/:slug"
          element={
            <Suspense fallback={<RouteLoader label="Loading restaurant page..." />}>
              <RestaurantDetails />
            </Suspense>
          }
        />
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
              <CategoryFoodsPage />
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
        <Route path="/grocery/category/:id" element={<Navigate to="/grocery/categories" replace />} />
        <Route path="/grocery/subcategory/:subcategoryId" element={<GrocerySubcategoryProductsPage />} />
        <Route path="/grocery/best-seller/:itemType/:itemId" element={<GroceryBestSellerProductsPage />} />
        <Route path="/food/:id" element={<FoodDetailPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
