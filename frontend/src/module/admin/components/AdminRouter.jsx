import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import AdminLayout from "./AdminLayout";
import PlatformAwareRoute from "./PlatformAwareRoute";
import AdminHome from "../pages/AdminHome";
import PointOfSale from "../pages/PointOfSale";
import AdminProfile from "../pages/AdminProfile";
import AdminSettings from "../pages/AdminSettings";
import ManageAdmin from "../pages/ManageAdmin";
import NewRefundRequests from "../pages/refunds/NewRefundRequests";
import FoodApproval from "../pages/restaurant/FoodApproval";
import GroceryApproval from "../pages/grocery/GroceryApproval";
import GroceryProductApproval from "../pages/grocery/GroceryProductApproval";
import OrdersPage from "../pages/orders/OrdersPage";
import CombinedOrdersPage from "../pages/orders/CombinedOrdersPage";
import OrderDetectDelivery from "../pages/OrderDetectDelivery";
import Category from "../pages/categories/Category";
import FeeSettings from "../pages/fee-settings/FeeSettings";
// Restaurant Management
import ZoneSetup from "../pages/restaurant/ZoneSetup";
import AddZone from "../pages/restaurant/AddZone";
import ViewZone from "../pages/restaurant/ViewZone";
import AllZonesMap from "../pages/restaurant/AllZonesMap";
import DeliveryBoyViewMap from "../pages/restaurant/DeliveryBoyViewMap";
import RestaurantsList from "../pages/restaurant/RestaurantsList";
import AddRestaurant from "../pages/restaurant/AddRestaurant";
import JoiningRequest from "../pages/restaurant/JoiningRequest";
import GroceryStoreJoiningRequest from "../pages/grocery/GroceryStoreJoiningRequest";
import RestaurantCommission from "../pages/restaurant/RestaurantCommission";
import RestaurantComplaints from "../pages/restaurant/RestaurantComplaints";
import RestaurantsBulkImport from "../pages/restaurant/RestaurantsBulkImport";
import RestaurantsBulkExport from "../pages/restaurant/RestaurantsBulkExport";
// Food Management
import FoodsList from "../pages/foods/FoodsList";
import FoodMenuManager from "../pages/foods/FoodMenuManager";
import AddonsList from "../pages/addons/AddonsList";
// Grocery Management
import GroceryProductsList from "../pages/grocery/GroceryProductsList";
import GroceryAddonsList from "../pages/grocery/GroceryAddonsList";
import GroceryStoresList from "../pages/grocery/GroceryStoresList";
import AddGroceryStore from "../pages/grocery/AddGroceryStore";
import GroceryCategories from "../pages/grocery/GroceryCategories";
import GrocerySubcategories from "../pages/grocery/GrocerySubcategories";
import GroceryCatalogProducts from "../pages/grocery/GroceryCatalogProducts";
import GroceryPlans from "../pages/grocery/GroceryPlans";
import GroceryStockManagement from "../pages/grocery/GroceryStockManagement";
// Promotions Management
import BasicCampaign from "../pages/campaigns/BasicCampaign";
import FoodCampaign from "../pages/campaigns/FoodCampaign";
import Coupons from "../pages/Coupons";
import Cashback from "../pages/Cashback";
import Banners from "../pages/Banners";
import PromotionalBanner from "../pages/PromotionalBanner";
import NewAdvertisement from "../pages/advertisement/NewAdvertisement";
import AdRequests from "../pages/advertisement/AdRequests";
import AdsList from "../pages/advertisement/AdsList";
import PushNotification from "../pages/PushNotification";
// Help & Support
import ContactMessages from "../pages/ContactMessages";
import SafetyEmergencyReports from "../pages/SafetyEmergencyReports";
// Customer Management
import Customers from "../pages/Customers";
import AddFund from "../pages/wallet/AddFund";
import Bonus from "../pages/wallet/Bonus";
import LoyaltyPointReport from "../pages/loyalty-point/Report";
import SubscribedMailList from "../pages/SubscribedMailList";
// Deliveryman Management
import DeliveryBoyCommission from "../pages/DeliveryBoyCommission";
import DeliveryCashLimit from "../pages/DeliveryCashLimit";
import CashLimitSettlement from "../pages/CashLimitSettlement";
import DeliveryWithdrawal from "../pages/DeliveryWithdrawal";
import DeliveryBoyWallet from "../pages/DeliveryBoyWallet";
import DeliveryEmergencyHelp from "../pages/DeliveryEmergencyHelp";
import DeliverySupportTickets from "../pages/DeliverySupportTickets";
import JoinRequest from "../pages/delivery-partners/JoinRequest";
import AddDeliveryman from "../pages/delivery-partners/AddDeliveryman";
import DeliverymanList from "../pages/delivery-partners/DeliverymanList";
import DeliverymanReviews from "../pages/delivery-partners/DeliverymanReviews";
import DeliverymanBonus from "../pages/delivery-partners/DeliverymanBonus";
import EarningAddon from "../pages/delivery-partners/EarningAddon";
import EarningAddonHistory from "../pages/delivery-partners/EarningAddonHistory";
import DeliveryEarnings from "../pages/delivery-partners/DeliveryEarnings";
// Disbursement Management
import RestaurantDisbursement from "../pages/RestaurantDisbursement";
import DeliverymanDisbursement from "../pages/DeliverymanDisbursement";
// Report Management
import TransactionReport from "../pages/reports/TransactionReport";
import ExpenseReport from "../pages/reports/ExpenseReport";
import DisbursementReportRestaurants from "../pages/reports/DisbursementReportRestaurants";
import DisbursementReportDeliverymen from "../pages/reports/DisbursementReportDeliverymen";
import RegularOrderReport from "../pages/reports/RegularOrderReport";
import CampaignOrderReport from "../pages/reports/CampaignOrderReport";
import RestaurantReport from "../pages/reports/RestaurantReport";
import FeedbackExperienceReport from "../pages/reports/FeedbackExperienceReport";
import TaxReport from "../pages/reports/TaxReport";
import RestaurantVATReport from "../pages/reports/RestaurantVATReport";
// Transaction Management
import RestaurantWithdraws from "../pages/transactions/RestaurantWithdraws";
import WithdrawMethod from "../pages/transactions/WithdrawMethod";
// Employee Management
import EmployeeRole from "../pages/employees/EmployeeRole";
import AddEmployee from "../pages/employees/AddEmployee";
import EmployeeList from "../pages/employees/EmployeeList";
// Business Settings
import BusinessSetup from "../pages/settings/BusinessSetup";
import EmailTemplate from "../pages/settings/EmailTemplate";
import ThemeSettings from "../pages/settings/ThemeSettings";
import Gallery from "../pages/settings/Gallery";
import LoginSetup from "../pages/settings/LoginSetup";
import TermsAndCondition from "../pages/settings/TermsAndCondition";
import PrivacyPolicy from "../pages/settings/PrivacyPolicy";
import AboutUs from "../pages/settings/AboutUs";
import RefundPolicy from "../pages/settings/RefundPolicy";
import ShippingPolicy from "../pages/settings/ShippingPolicy";
import CancellationPolicy from "../pages/settings/CancellationPolicy";
import ReactRegistration from "../pages/settings/ReactRegistration";
// System Settings
import ThirdParty from "../pages/system/ThirdParty";
import FirebaseNotification from "../pages/system/FirebaseNotification";
import OfflinePaymentSetup from "../pages/system/OfflinePaymentSetup";
import JoinUsPageSetup from "../pages/system/JoinUsPageSetup";
import AnalyticsScript from "../pages/system/AnalyticsScript";
import AISetup from "../pages/system/AISetup";
import AppWebSettings from "../pages/system/AppWebSettings";
import NotificationChannels from "../pages/system/NotificationChannels";
import LandingPageSettings from "../pages/system/LandingPageSettings";
import PageMetaData from "../pages/system/PageMetaData";
import ReactSite from "../pages/system/ReactSite";
import CleanDatabase from "../pages/system/CleanDatabase";
import AddonActivation from "../pages/system/AddonActivation";
// ENV Setup (formerly System Addons)
import SystemAddons from "../pages/system/SystemAddons";
import LandingPageManagement from "../pages/system/LandingPageManagement";

export default function AdminRouter() {
  return (
    <Routes>
      {/* Protected Routes - With Layout */}
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        {/* Dashboard */}
        <Route path="/" element={<CombinedOrdersPage />} />
        <Route path="/dashboard" element={<AdminHome />} />


        <Route path="/point-of-sale" element={<PointOfSale />} />

        {/* Profile */}
        <Route path="/profile" element={<AdminProfile />} />
        <Route path="/manage-admin" element={<ManageAdmin />} />

        {/* Settings */}
        <Route path="/settings" element={<AdminSettings />} />

        {/* ORDER MANAGEMENT */}
        {/* Orders */}
        <Route path="all-orders" element={<CombinedOrdersPage />} />
        <Route path="orders/all" element={<OrdersPage statusKey="all" platformOverride="mofood" />} />
        <Route path="orders/scheduled" element={<OrdersPage statusKey="scheduled" platformOverride="mofood" />} />
        <Route path="orders/pending" element={<OrdersPage statusKey="pending" platformOverride="mofood" />} />
        <Route path="orders/accepted" element={<OrdersPage statusKey="accepted" platformOverride="mofood" />} />
        <Route path="orders/processing" element={<OrdersPage statusKey="processing" platformOverride="mofood" />} />
        <Route path="orders/food-on-the-way" element={<OrdersPage statusKey="food-on-the-way" platformOverride="mofood" />} />
        <Route path="orders/delivered" element={<OrdersPage statusKey="delivered" platformOverride="mofood" />} />
        <Route path="orders/canceled" element={<OrdersPage statusKey="canceled" platformOverride="mofood" />} />
        <Route path="orders/restaurant-cancelled" element={<OrdersPage statusKey="restaurant-cancelled" platformOverride="mofood" />} />
        <Route path="orders/payment-failed" element={<OrdersPage statusKey="payment-failed" platformOverride="mofood" />} />
        <Route path="orders/refunded" element={<OrdersPage statusKey="refunded" platformOverride="mofood" />} />
        <Route path="orders/offline-payments" element={<OrdersPage statusKey="offline-payments" platformOverride="mofood" />} />
        <Route path="order-detect-delivery" element={<OrderDetectDelivery platformOverride="mofood" />} />
        <Route path="grocery-orders/all" element={<OrdersPage statusKey="all" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/scheduled" element={<OrdersPage statusKey="scheduled" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/pending" element={<OrdersPage statusKey="pending" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/accepted" element={<OrdersPage statusKey="accepted" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/processing" element={<OrdersPage statusKey="processing" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/on-the-way" element={<OrdersPage statusKey="food-on-the-way" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/delivered" element={<OrdersPage statusKey="delivered" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/canceled" element={<OrdersPage statusKey="canceled" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/store-cancelled" element={<OrdersPage statusKey="restaurant-cancelled" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/payment-failed" element={<OrdersPage statusKey="payment-failed" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/refunded" element={<OrdersPage statusKey="refunded" platformOverride="mogrocery" />} />
        <Route path="grocery-orders/offline-payments" element={<OrdersPage statusKey="offline-payments" platformOverride="mogrocery" />} />
        <Route path="grocery-order-detect-delivery" element={<OrderDetectDelivery platformOverride="mogrocery" />} />
        {/* Order Refunds */}
        <Route path="order-refunds/new" element={<NewRefundRequests />} />

        {/* RESTAURANT MANAGEMENT */}
        <Route path="zone-setup" element={<ZoneSetup />} />
        <Route path="zone-setup/map" element={<AllZonesMap />} />
        <Route path="zone-setup/delivery-boy-view" element={<DeliveryBoyViewMap />} />
        <Route path="zone-setup/add" element={<AddZone />} />
        <Route path="zone-setup/edit/:id" element={<AddZone />} />
        <Route path="zone-setup/view/:id" element={<ViewZone />} />
        <Route path="food-approval" element={<FoodApproval />} />
        <Route path="grocery-approval" element={<GroceryApproval />} />
        <Route path="grocery-product-approval" element={<GroceryProductApproval />} />
        {/* Restaurants/Stores */}
        <Route path="restaurants" element={<PlatformAwareRoute mofoodComponent={RestaurantsList} mogroceryComponent={GroceryStoresList} />} />
        <Route path="grocery-stores" element={<GroceryStoresList />} />
        <Route path="grocery-stores/add" element={<AddGroceryStore />} />
        <Route path="restaurants/add" element={<AddRestaurant />} />
        <Route path="restaurants/joining-request" element={<JoiningRequest />} />
        <Route path="grocery-stores/joining-request" element={<GroceryStoreJoiningRequest />} />
        <Route path="restaurants/commission" element={<RestaurantCommission platformOverride="mofood" entityLabel="Restaurant" />} />
        <Route path="grocery-stores/commission" element={<RestaurantCommission platformOverride="mogrocery" entityLabel="Store" />} />
        <Route path="restaurants/complaints" element={<RestaurantComplaints />} />
        <Route path="restaurants/bulk-import" element={<RestaurantsBulkImport />} />
        <Route path="restaurants/bulk-export" element={<RestaurantsBulkExport />} />


        {/* FOOD MANAGEMENT */}
        {/* Categories */}
        <Route path="categories" element={<PlatformAwareRoute mofoodComponent={Category} mogroceryComponent={GroceryCategories} />} />
        {/* Fee Settings */}
        <Route path="fee-settings" element={<FeeSettings />} />
        {/* Foods */}
        <Route path="foods" element={<PlatformAwareRoute mofoodComponent={FoodsList} mogroceryComponent={GroceryProductsList} />} />
        <Route path="food/list" element={<PlatformAwareRoute mofoodComponent={FoodsList} mogroceryComponent={GroceryProductsList} />} />
        <Route path="food/menu" element={<FoodMenuManager />} />
        {/* Addons */}
        <Route path="addons" element={<PlatformAwareRoute mofoodComponent={AddonsList} mogroceryComponent={GroceryAddonsList} />} />
        
        {/* GROCERY MANAGEMENT - Separate routes */}
        <Route path="grocery-products" element={<GroceryProductsList />} />
        <Route path="grocery-addons" element={<GroceryAddonsList />} />
        <Route path="grocery-categories" element={<GroceryCategories />} />
        <Route path="grocery-subcategories" element={<GrocerySubcategories />} />
        <Route path="grocery-products-catalog" element={<GroceryCatalogProducts />} />
        <Route path="grocery-stock-management" element={<GroceryStockManagement />} />
        <Route path="grocery-plans" element={<GroceryPlans />} />

        {/* PROMOTIONS MANAGEMENT */}
        {/* Campaigns */}
        <Route path="campaigns/basic" element={<BasicCampaign />} />
        <Route path="campaigns/food" element={<FoodCampaign />} />
        <Route path="coupons" element={<Coupons />} />
        <Route path="grocery-coupons" element={<Coupons platformOverride="mogrocery" />} />
        <Route path="cashback" element={<Cashback />} />
        <Route path="banners" element={<Banners />} />
        <Route path="promotional-banner" element={<PromotionalBanner />} />
        {/* Advertisement */}
        <Route path="advertisement/new" element={<NewAdvertisement />} />
        <Route path="advertisement/requests" element={<AdRequests />} />
        <Route path="advertisement" element={<AdsList />} />
        <Route path="push-notification" element={<PushNotification />} />

        {/* HELP & SUPPORT */}
        <Route path="contact-messages" element={<ContactMessages />} />
        <Route path="safety-emergency-reports" element={<SafetyEmergencyReports />} />

        {/* CUSTOMER MANAGEMENT */}
        <Route path="customers" element={<Customers />} />
        {/* Wallet */}
        <Route path="wallet/add-fund" element={<AddFund />} />
        <Route path="wallet/bonus" element={<Bonus />} />
        {/* Loyalty Point */}
        <Route path="loyalty-point/report" element={<LoyaltyPointReport />} />
        <Route path="subscribed-mail-list" element={<SubscribedMailList />} />

        {/* DELIVERYMAN MANAGEMENT */}
        <Route path="delivery-boy-commission" element={<DeliveryBoyCommission />} />
        <Route path="delivery-cash-limit" element={<DeliveryCashLimit />} />
        <Route path="cash-limit-settlement" element={<CashLimitSettlement />} />
        <Route path="delivery-withdrawal" element={<DeliveryWithdrawal />} />
        <Route path="delivery-boy-wallet" element={<DeliveryBoyWallet />} />
        <Route path="delivery-emergency-help" element={<DeliveryEmergencyHelp />} />
        <Route path="delivery-support-tickets" element={<DeliverySupportTickets />} />
        {/* Delivery Partners */}
        <Route path="delivery-partners/join-request" element={<JoinRequest />} />
        <Route path="delivery-partners/add" element={<AddDeliveryman />} />
        <Route path="delivery-partners" element={<DeliverymanList />} />
        <Route path="delivery-partners/reviews" element={<DeliverymanReviews />} />
        <Route path="delivery-partners/bonus" element={<DeliverymanBonus />} />
        <Route path="delivery-partners/earning-addon" element={<EarningAddon />} />
        <Route path="delivery-partners/earning-addon-history" element={<EarningAddonHistory />} />
        <Route path="delivery-partners/earnings" element={<DeliveryEarnings />} />

        {/* DISBURSEMENT MANAGEMENT */}
        <Route path="restaurant-disbursement" element={<RestaurantDisbursement />} />
        <Route path="deliveryman-disbursement" element={<DeliverymanDisbursement />} />

        {/* REPORT MANAGEMENT */}
        <Route path="transaction-report" element={<TransactionReport />} />
        <Route path="expense-report" element={<ExpenseReport />} />
        {/* Disbursement Report */}
        <Route path="disbursement-report/restaurants" element={<DisbursementReportRestaurants />} />
        <Route path="disbursement-report/deliverymen" element={<DisbursementReportDeliverymen />} />
        {/* Order Report */}
        <Route path="order-report/regular" element={<RegularOrderReport />} />
        <Route path="order-report/campaign" element={<CampaignOrderReport />} />
        {/* Restaurant Report */}
        <Route path="restaurant-report" element={<RestaurantReport />} />
        <Route
          path="grocery-store-report"
          element={<RestaurantReport platformOverride="mogrocery" entityLabel="Store" />}
        />
        {/* Customer Report */}
        <Route path="customer-report/feedback-experience" element={<FeedbackExperienceReport />} />
        <Route path="tax-report" element={<TaxReport />} />
        <Route path="restaurant-vat-report" element={<RestaurantVATReport />} />

        {/* TRANSACTION MANAGEMENT */}
        <Route path="restaurant-withdraws" element={<RestaurantWithdraws />} />
        <Route
          path="grocery-store-withdraws"
          element={<RestaurantWithdraws platformOverride="mogrocery" entityLabelOverride="Store" />}
        />
        <Route path="withdraw-method" element={<WithdrawMethod />} />

        {/* EMPLOYEE MANAGEMENT */}
        <Route path="employee-role" element={<EmployeeRole />} />
        {/* Employees */}
        <Route path="employees/add" element={<AddEmployee />} />
        <Route path="employees" element={<EmployeeList />} />

        {/* BUSINESS SETTINGS */}
        <Route path="business-setup" element={<BusinessSetup />} />
        <Route path="email-template" element={<EmailTemplate />} />
        <Route path="theme-settings" element={<ThemeSettings />} />
        <Route path="gallery" element={<Gallery />} />
        <Route path="login-setup" element={<LoginSetup />} />
        {/* Business Settings - FCM */}
        <Route path="business-settings/fcm-index" element={<FirebaseNotification />} />
        {/* Pages & Social Media */}
        <Route path="pages-social-media/terms" element={<TermsAndCondition />} />
        <Route path="pages-social-media/privacy" element={<PrivacyPolicy />} />
        <Route path="pages-social-media/about" element={<AboutUs />} />
        <Route path="pages-social-media/refund" element={<RefundPolicy />} />
        <Route path="pages-social-media/shipping" element={<ShippingPolicy />} />
        <Route path="pages-social-media/cancellation" element={<CancellationPolicy />} />
        <Route path="pages-social-media/react-registration" element={<ReactRegistration />} />

        {/* SYSTEM SETTINGS */}
        {/* 3rd Party & Configurations */}
        <Route path="3rd-party-configurations/party" element={<ThirdParty />} />
        <Route path="3rd-party-configurations/firebase" element={<FirebaseNotification />} />
        <Route path="3rd-party-configurations/offline-payment" element={<OfflinePaymentSetup />} />
        <Route path="3rd-party-configurations/join-us" element={<JoinUsPageSetup />} />
        <Route path="3rd-party-configurations/analytics" element={<AnalyticsScript />} />
        <Route path="3rd-party-configurations/ai" element={<AISetup />} />
        <Route path="app-web-settings" element={<AppWebSettings />} />
        <Route path="notification-channels" element={<NotificationChannels />} />
        {/* Landing Page Settings */}
        <Route path="landing-page-settings/admin" element={<LandingPageSettings type="admin" />} />
        <Route path="landing-page-settings/react" element={<LandingPageSettings type="react" />} />
        <Route path="page-meta-data" element={<PageMetaData />} />
        <Route path="react-site" element={<ReactSite />} />
        <Route path="clean-database" element={<CleanDatabase />} />
        <Route path="addon-activation" element={<AddonActivation />} />

        {/* ENV SETUP */}
        <Route path="env-setup" element={<SystemAddons />} />
        <Route path="system-addons" element={<Navigate to="/admin/env-setup" replace />} />
        {/* HERO BANNER MANAGEMENT */}
        <Route path="hero-banner-management" element={<LandingPageManagement forcedPlatform="mofood" />} />
        <Route
          path="product-sections-management"
          element={<LandingPageManagement forcedPlatform="mogrocery" initialTab="best-sellers" />}
        />
        <Route path="grocery-hero-banner-management" element={<LandingPageManagement forcedPlatform="mogrocery" />} />
      </Route>

      {/* Redirect /admin to /admin/ */}
      <Route path="" element={<Navigate to="/admin/login" replace />} />
    </Routes >
  );
}
