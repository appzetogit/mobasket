import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthRedirect from "@/components/AuthRedirect";
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
import CommissionDetailsPage from "@/module/restaurant/pages/CommissionDetailsPage";
import FinanceDetailsPage from "@/module/restaurant/pages/FinanceDetailsPage";
import WithdrawalHistoryPage from "@/module/restaurant/pages/WithdrawalHistoryPage";
import PhoneNumbersPage from "@/module/restaurant/pages/PhoneNumbersPage";
import DownloadReport from "@/module/restaurant/pages/DownloadReport";
import ToHub from "@/module/restaurant/pages/ToHub";
import ManageOutlets from "@/module/restaurant/pages/ManageOutlets";
import UpdateBankDetails from "@/module/restaurant/pages/UpdateBankDetails";
import ZoneSetup from "@/module/restaurant/pages/ZoneSetup";
import RestaurantPendingApproval from "@/module/restaurant/pages/PendingApproval";
import ContentPolicyPublic from "@/module/user/pages/legal/ContentPolicyPublic";

export default function RestaurantAppRoutes() {
  return (
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
  );
}
