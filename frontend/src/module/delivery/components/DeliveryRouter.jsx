import { Routes, Route } from "react-router-dom"
import DeliveryLayout from "./DeliveryLayout"
import ProtectedRoute from "./ProtectedRoute"

// Main pages (with layout)
import DeliveryHome from "../pages/DeliveryHome"
import Notifications from "../pages/Notifications"
import MyOrders from "../pages/MyOrders"
import PocketPage from "../pages/PocketPage"
import GigBooking from "../pages/GigBooking"
import PickupDirectionsPage from "../pages/PickupDirectionsPage"
import ProfilePage from "../pages/ProfilePage"
import ProfileDetails from "../pages/ProfileDetails"
import AcceptedOrderDetails from "../pages/AcceptedOrderDetails"
import MyAccount from "../pages/MyAccount"
import TransactionHistory from "../pages/TransactionHistory"
import EditProfile from "../pages/EditProfile"
import Settings from "../pages/Settings"
import Conversation from "../pages/Conversation"
import TermsAndConditions from "../pages/TermsAndConditions"
import PrivacyPolicy from "../pages/PrivacyPolicy"
import Payout from "../pages/Payout"
import DeductionStatement from "../pages/DeductionStatement"
import TipsStatement from "../pages/TipsStatement"
import PocketStatement from "../pages/PocketStatement"
import FuelPayment from "../pages/FuelPayment"
import LimitSettlement from "../pages/LimitSettlement"
import OffersPage from "../pages/OffersPage"
import UpdatesPage from "../pages/UpdatesPage"
import SupportTickets from "../pages/SupportTickets"
import CreateSupportTicket from "../pages/CreateSupportTicket"
import ViewSupportTicket from "../pages/ViewSupportTicket"
import ShowIdCard from "../pages/ShowIdCard"
import ChangeLanguage from "../pages/ChangeLanguage"
import SelectDropLocation from "../pages/SelectDropLocation"
import ReferAndEarn from "../pages/ReferAndEarn"
import YourReferrals from "../pages/YourReferrals"
import Earnings from "../pages/Earnings"
import TripHistory from "../pages/TripHistory"
import TimeOnOrders from "../pages/TimeOnOrders"
import PocketBalancePage from "../pages/PocketBalance"
import CustomerTipsBalancePage from "../pages/CustomerTips"
import PocketDetails from "../pages/PocketDetails"

export default function DeliveryRouter() {
  return (
    <Routes>
      {/* Protected routes - require authentication */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DeliveryLayout showGig={true}>
              <DeliveryHome />
            </DeliveryLayout>
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <Notifications />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/notifications"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout showGig={true}>
              <MyOrders />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/orders"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout showGig={true} showPocket={true}>
              <PocketPage />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/requests"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout showGig={true}>
              <GigBooking />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/gig"
      />
      <Route
        element={
          <ProtectedRoute>
            <SelectDropLocation />
          </ProtectedRoute>
        }
        path="/select-drop-location"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <ReferAndEarn />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/refer-and-earn"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <YourReferrals />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/your-referrals"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout showGig={true}>
              <OffersPage />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/offers"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <PickupDirectionsPage />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/pickup-directions"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout showGig={true}>
              <ProfilePage />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/profile"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <ProfileDetails />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/profile/details"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <AcceptedOrderDetails />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/order/:orderId"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <MyAccount />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/account"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <Earnings />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/earnings"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <TripHistory />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/trip-history"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <TimeOnOrders />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/time-on-orders"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <TransactionHistory />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/transactions"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <Payout />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/payout"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <DeductionStatement />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/deduction-statement"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <CustomerTipsBalancePage />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/customer-tips-balance"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <PocketBalancePage />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/pocket-balance"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <TipsStatement />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/tips-statement"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <PocketStatement />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/pocket-statement"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <FuelPayment />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/fuel-payment"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <LimitSettlement />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/limit-settlement"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <PocketDetails />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/pocket-details"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <EditProfile />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/profile/edit"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <Settings />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/profile/settings"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <Conversation />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/profile/conversation"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <TermsAndConditions />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/profile/terms"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <PrivacyPolicy />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/profile/privacy"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout showGig={true}>
              <UpdatesPage />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/updates"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <SupportTickets />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/help/tickets"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <CreateSupportTicket />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/help/create-ticket"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <ViewSupportTicket />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/help/tickets/:id"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <ShowIdCard />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/help/id-card"
      />
      <Route
        element={
          <ProtectedRoute>
            <DeliveryLayout>
              <ChangeLanguage />
            </DeliveryLayout>
          </ProtectedRoute>
        }
        path="/help/language"
      />
    </Routes>
  )
}

