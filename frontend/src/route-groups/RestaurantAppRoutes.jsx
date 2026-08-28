import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthRedirect from "@/components/AuthRedirect";
const RestaurantOrdersPage = lazy(() => import("@/module/restaurant/pages/OrdersPage"));
const AllOrdersPage = lazy(() => import("@/module/restaurant/pages/AllOrdersPage"));
const RestaurantDetailsPage = lazy(() => import("@/module/restaurant/pages/RestaurantDetailsPage"));
const EditRestaurantPage = lazy(() => import("@/module/restaurant/pages/EditRestaurantPage"));
const WalletPage = lazy(() => import("@/module/restaurant/pages/WalletPage"));
const RestaurantNotifications = lazy(() => import("@/module/restaurant/pages/Notifications"));
const OrderDetails = lazy(() => import("@/module/restaurant/pages/OrderDetails"));
const OrdersMain = lazy(() => import("@/module/restaurant/pages/OrdersMain"));
const RestaurantOnboarding = lazy(() => import("@/module/restaurant/pages/Onboarding"));
const RestaurantSignIn = lazy(() => import("@/module/restaurant/pages/auth/SignIn"));
const RestaurantLogin = lazy(() => import("@/module/restaurant/pages/auth/Login"));
const RestaurantSignup = lazy(() => import("@/module/restaurant/pages/auth/Signup"));
const RestaurantSignupEmail = lazy(() => import("@/module/restaurant/pages/auth/SignupEmail"));
const RestaurantForgotPassword = lazy(() => import("@/module/restaurant/pages/auth/ForgotPassword"));
const RestaurantOTP = lazy(() => import("@/module/restaurant/pages/auth/OTP"));
const RestaurantGoogleCallback = lazy(() => import("@/module/restaurant/pages/auth/GoogleCallback"));
const RestaurantWelcome = lazy(() => import("@/module/restaurant/pages/auth/Welcome"));
const AdvertisementsPage = lazy(() => import("@/module/restaurant/pages/AdvertisementsPage"));
const AdDetailsPage = lazy(() => import("@/module/restaurant/pages/AdDetailsPage"));
const NewAdvertisementPage = lazy(() => import("@/module/restaurant/pages/NewAdvertisementPage"));
const EditAdvertisementPage = lazy(() => import("@/module/restaurant/pages/EditAdvertisementPage"));
const CouponListPage = lazy(() => import("@/module/restaurant/pages/CouponListPage"));
const AddCouponPage = lazy(() => import("@/module/restaurant/pages/AddCouponPage"));
const EditCouponPage = lazy(() => import("@/module/restaurant/pages/EditCouponPage"));
const ReviewsPage = lazy(() => import("@/module/restaurant/pages/ReviewsPage"));
const UpdateReplyPage = lazy(() => import("@/module/restaurant/pages/UpdateReplyPage"));
const SettingsPage = lazy(() => import("@/module/restaurant/pages/SettingsPage"));
const PrivacyPolicyPage = lazy(() => import("@/module/restaurant/pages/PrivacyPolicyPage"));
const TermsAndConditionsPage = lazy(() => import("@/module/restaurant/pages/TermsAndConditionsPage"));
const RestaurantConfigPage = lazy(() => import("@/module/restaurant/pages/RestaurantConfigPage"));
const RestaurantCategoriesPage = lazy(() => import("@/module/restaurant/pages/RestaurantCategoriesPage"));
const MenuCategoriesPage = lazy(() => import("@/module/restaurant/pages/MenuCategoriesPage"));
const BusinessPlanPage = lazy(() => import("@/module/restaurant/pages/BusinessPlanPage"));
const ConversationListPage = lazy(() => import("@/module/restaurant/pages/ConversationListPage"));
const ChatDetailPage = lazy(() => import("@/module/restaurant/pages/ChatDetailPage"));
const RestaurantStatus = lazy(() => import("@/module/restaurant/pages/RestaurantStatus"));
const ExploreMore = lazy(() => import("@/module/restaurant/pages/ExploreMore"));
const DeliverySettings = lazy(() => import("@/module/restaurant/pages/DeliverySettings"));
const RushHour = lazy(() => import("@/module/restaurant/pages/RushHour"));
const SwitchOutlet = lazy(() => import("@/module/restaurant/pages/SwitchOutlet"));
const OutletTimings = lazy(() => import("@/module/restaurant/pages/OutletTimings"));
const DaySlots = lazy(() => import("@/module/restaurant/pages/DaySlots"));
const OutletInfo = lazy(() => import("@/module/restaurant/pages/OutletInfo"));
const RatingsReviews = lazy(() => import("@/module/restaurant/pages/RatingsReviews"));
const ContactDetails = lazy(() => import("@/module/restaurant/pages/ContactDetails"));
const EditOwner = lazy(() => import("@/module/restaurant/pages/EditOwner"));
const InviteUser = lazy(() => import("@/module/restaurant/pages/InviteUser"));
const EditCuisines = lazy(() => import("@/module/restaurant/pages/EditCuisines"));
const EditRestaurantAddress = lazy(() => import("@/module/restaurant/pages/EditRestaurantAddress"));
const Inventory = lazy(() => import("@/module/restaurant/pages/Inventory"));
const Feedback = lazy(() => import("@/module/restaurant/pages/Feedback"));
const ShareFeedback = lazy(() => import("@/module/restaurant/pages/ShareFeedback"));
const DishRatings = lazy(() => import("@/module/restaurant/pages/DishRatings"));
const HelpCentre = lazy(() => import("@/module/restaurant/pages/HelpCentre"));
const FssaiDetails = lazy(() => import("@/module/restaurant/pages/FssaiDetails"));
const FssaiUpdate = lazy(() => import("@/module/restaurant/pages/FssaiUpdate"));
const Hyperpure = lazy(() => import("@/module/restaurant/pages/Hyperpure"));
const HubGrowth = lazy(() => import("@/module/restaurant/pages/HubGrowth"));
const CreateOffers = lazy(() => import("@/module/restaurant/pages/CreateOffers"));
const ChooseDiscountType = lazy(() => import("@/module/restaurant/pages/ChooseDiscountType"));
const ChooseMenuDiscountType = lazy(() => import("@/module/restaurant/pages/ChooseMenuDiscountType"));
const CreatePercentageDiscount = lazy(() => import("@/module/restaurant/pages/CreatePercentageDiscount"));
const CreateFreebies = lazy(() => import("@/module/restaurant/pages/CreateFreebies"));
const FreebiesTiming = lazy(() => import("@/module/restaurant/pages/FreebiesTiming"));
const CreatePercentageMenuDiscount = lazy(() => import("@/module/restaurant/pages/CreatePercentageMenuDiscount"));
const CreateFlatPriceMenuDiscount = lazy(() => import("@/module/restaurant/pages/CreateFlatPriceMenuDiscount"));
const CreateBOGOMenuDiscount = lazy(() => import("@/module/restaurant/pages/CreateBOGOMenuDiscount"));
const MenuDiscountTiming = lazy(() => import("@/module/restaurant/pages/MenuDiscountTiming"));
const HubMenu = lazy(() => import("@/module/restaurant/pages/HubMenu"));
const ItemDetailsPage = lazy(() => import("@/module/restaurant/pages/ItemDetailsPage"));
const HubFinance = lazy(() => import("@/module/restaurant/pages/HubFinance"));
const CommissionDetailsPage = lazy(() => import("@/module/restaurant/pages/CommissionDetailsPage"));
const FinanceDetailsPage = lazy(() => import("@/module/restaurant/pages/FinanceDetailsPage"));
const WithdrawalHistoryPage = lazy(() => import("@/module/restaurant/pages/WithdrawalHistoryPage"));
const PhoneNumbersPage = lazy(() => import("@/module/restaurant/pages/PhoneNumbersPage"));
const DownloadReport = lazy(() => import("@/module/restaurant/pages/DownloadReport"));
const ToHub = lazy(() => import("@/module/restaurant/pages/ToHub"));
const ManageOutlets = lazy(() => import("@/module/restaurant/pages/ManageOutlets"));
const UpdateBankDetails = lazy(() => import("@/module/restaurant/pages/UpdateBankDetails"));
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

export default function RestaurantAppRoutes() {
  return (
    <Suspense fallback={<RouteChunkLoader />}>
    <Routes>
      <Route path="welcome" element={<AuthRedirect module="restaurant"><RestaurantWelcome /></AuthRedirect>} />
      <Route path="auth/sign-in" element={<AuthRedirect module="restaurant"><RestaurantSignIn /></AuthRedirect>} />
      <Route path="login" element={<AuthRedirect module="restaurant"><RestaurantLogin /></AuthRedirect>} />
      <Route path="signup" element={<AuthRedirect module="restaurant"><RestaurantSignup /></AuthRedirect>} />
      <Route path="signup-email" element={<AuthRedirect module="restaurant"><RestaurantSignupEmail /></AuthRedirect>} />
      <Route path="forgot-password" element={<AuthRedirect module="restaurant"><RestaurantForgotPassword /></AuthRedirect>} />
      <Route path="otp" element={<AuthRedirect module="restaurant"><RestaurantOTP /></AuthRedirect>} />
      <Route path="auth/google-callback" element={<AuthRedirect module="restaurant"><RestaurantGoogleCallback /></AuthRedirect>} />
      <Route path="pending-approval" element={<ProtectedRoute module="restaurant"><RestaurantPendingApproval /></ProtectedRoute>} />
      <Route path="onboarding" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><RestaurantOnboarding /></ProtectedRoute>} />
      <Route index element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><OrdersMain /></ProtectedRoute>} />
      <Route path="notifications" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><RestaurantNotifications /></ProtectedRoute>} />
      <Route path="orders" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><RestaurantOrdersPage /></ProtectedRoute>} />
      <Route path="orders/all" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><AllOrdersPage /></ProtectedRoute>} />
      <Route path="orders/:orderId" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><OrderDetails /></ProtectedRoute>} />
      <Route path="details" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><RestaurantDetailsPage /></ProtectedRoute>} />
      <Route path="edit" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><EditRestaurantPage /></ProtectedRoute>} />
      <Route path="food/all" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><Navigate to="/restaurant/hub-menu" replace /></ProtectedRoute>} />
      <Route path="food/:id" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><Navigate to="/restaurant/hub-menu" replace /></ProtectedRoute>} />
      <Route path="food/:id/edit" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><Navigate to="/restaurant/hub-menu" replace /></ProtectedRoute>} />
      <Route path="food/new" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><Navigate to="/restaurant/hub-menu/item/new" replace /></ProtectedRoute>} />
      <Route path="wallet" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><WalletPage /></ProtectedRoute>} />
      <Route path="advertisements" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><AdvertisementsPage /></ProtectedRoute>} />
      <Route path="advertisements/new" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><NewAdvertisementPage /></ProtectedRoute>} />
      <Route path="advertisements/:id" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><AdDetailsPage /></ProtectedRoute>} />
      <Route path="advertisements/:id/edit" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><EditAdvertisementPage /></ProtectedRoute>} />
      <Route path="coupon" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><CouponListPage /></ProtectedRoute>} />
      <Route path="coupon/new" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><AddCouponPage /></ProtectedRoute>} />
      <Route path="coupon/:id/edit" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><EditCouponPage /></ProtectedRoute>} />
      <Route path="reviews" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ReviewsPage /></ProtectedRoute>} />
      <Route path="reviews/:id/reply" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><UpdateReplyPage /></ProtectedRoute>} />
      <Route path="settings" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><SettingsPage /></ProtectedRoute>} />
      <Route path="delivery-settings" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><DeliverySettings /></ProtectedRoute>} />
      <Route path="rush-hour" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><RushHour /></ProtectedRoute>} />
      <Route path="privacy" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><PrivacyPolicyPage /></ProtectedRoute>} />
      <Route path="terms" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><TermsAndConditionsPage /></ProtectedRoute>} />
      <Route path="content-policy" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ContentPolicyPublic /></ProtectedRoute>} />
      <Route path="config" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><RestaurantConfigPage /></ProtectedRoute>} />
      <Route path="categories" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><RestaurantCategoriesPage /></ProtectedRoute>} />
      <Route path="menu-categories" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><MenuCategoriesPage /></ProtectedRoute>} />
      <Route path="business-plan" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><BusinessPlanPage /></ProtectedRoute>} />
      <Route path="conversation" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ConversationListPage /></ProtectedRoute>} />
      <Route path="conversation/:conversationId" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ChatDetailPage /></ProtectedRoute>} />
      <Route path="status" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><RestaurantStatus /></ProtectedRoute>} />
      <Route path="explore" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ExploreMore /></ProtectedRoute>} />
      <Route path="switch-outlet" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><SwitchOutlet /></ProtectedRoute>} />
      <Route path="outlet-timings" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><OutletTimings /></ProtectedRoute>} />
      <Route path="outlet-timings/:day" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><DaySlots /></ProtectedRoute>} />
      <Route path="outlet-info" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><OutletInfo /></ProtectedRoute>} />
      <Route path="ratings-reviews" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><RatingsReviews /></ProtectedRoute>} />
      <Route path="contact-details" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ContactDetails /></ProtectedRoute>} />
      <Route path="edit-owner" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><EditOwner /></ProtectedRoute>} />
      <Route path="invite-user" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><InviteUser /></ProtectedRoute>} />
      <Route path="edit-cuisines" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><EditCuisines /></ProtectedRoute>} />
      <Route path="edit-address" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><EditRestaurantAddress /></ProtectedRoute>} />
      <Route path="inventory" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><Inventory /></ProtectedRoute>} />
      <Route path="feedback" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><Feedback /></ProtectedRoute>} />
      <Route path="share-feedback" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ShareFeedback /></ProtectedRoute>} />
      <Route path="dish-ratings" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><DishRatings /></ProtectedRoute>} />
      <Route path="help-centre" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><HelpCentre /></ProtectedRoute>} />
      <Route path="fssai" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><FssaiDetails /></ProtectedRoute>} />
      <Route path="fssai/update" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><FssaiUpdate /></ProtectedRoute>} />
      <Route path="hyperpure" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><Hyperpure /></ProtectedRoute>} />
      <Route path="hub-growth" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><HubGrowth /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><CreateOffers /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/delight-customers" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ChooseMenuDiscountType /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/delight-customers/freebies" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><CreateFreebies /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/delight-customers/freebies/timings" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><FreebiesTiming /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/delight-customers/percentage" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><CreatePercentageMenuDiscount /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/delight-customers/percentage/timings" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><MenuDiscountTiming /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/delight-customers/flat-price" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><CreateFlatPriceMenuDiscount /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/delight-customers/flat-price/timings" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><MenuDiscountTiming /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/delight-customers/bogo" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><CreateBOGOMenuDiscount /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/delight-customers/bogo/timings" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><MenuDiscountTiming /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/:goalId/:discountType/create" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><CreatePercentageDiscount /></ProtectedRoute>} />
      <Route path="hub-growth/create-offers/:goalId" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ChooseDiscountType /></ProtectedRoute>} />
      <Route path="hub-menu" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><HubMenu /></ProtectedRoute>} />
      <Route path="hub-menu/item/:id" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ItemDetailsPage /></ProtectedRoute>} />
      <Route path="hub-finance" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><HubFinance /></ProtectedRoute>} />
      <Route path="commission-details" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><CommissionDetailsPage /></ProtectedRoute>} />
      <Route path="withdrawal-history" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><WithdrawalHistoryPage /></ProtectedRoute>} />
      <Route path="finance-details" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><FinanceDetailsPage /></ProtectedRoute>} />
      <Route path="phone" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><PhoneNumbersPage /></ProtectedRoute>} />
      <Route path="download-report" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><DownloadReport /></ProtectedRoute>} />
      <Route path="to-hub" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ToHub /></ProtectedRoute>} />
      <Route path="manage-outlets" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ManageOutlets /></ProtectedRoute>} />
      <Route path="update-bank-details" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><UpdateBankDetails /></ProtectedRoute>} />
      <Route path="zone-setup" element={<ProtectedRoute requiredRole="restaurant" loginPath="/restaurant/login"><ZoneSetup /></ProtectedRoute>} />
    </Routes>
    </Suspense>
  );
}
