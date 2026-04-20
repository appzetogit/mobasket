import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Clock, MapPin } from "lucide-react"
import DeliveryCodCollectionNotice from "./DeliveryCodCollectionNotice"

export default function DeliveryHomeNewOrderPopup({
  isVisible,
  newOrder,
  selectedRestaurant,
  isOnline,
  isActiveOrderCancelled,
  isNewOrderPopupMinimized,
  isDraggingNewOrderPopup,
  newOrderDragY,
  newOrderPopupRef,
  countdownSeconds,
  pendingNewOrdersCount,
  normalizeDistanceLabel,
  normalizeAddressLabel,
  calculateTimeAway,
  handleNewOrderPopupTouchStart,
  handleNewOrderPopupTouchMove,
  handleNewOrderPopupTouchEnd,
  newOrderAcceptButtonRef,
  handleNewOrderAcceptTouchStart,
  handleNewOrderAcceptTouchMove,
  handleNewOrderAcceptTouchEnd,
  handleNewOrderAcceptTouchCancel,
  handleNewOrderAcceptMouseDown,
  newOrderAcceptButtonProgress,
  newOrderIsAnimatingToComplete,
  isAcceptingNewOrder,
  isRejectingOrder,
  handleQuickDenyNewOrder,
  deliveryAcceptSwipeConfirmThreshold,
}) {
  const [popupHeight, setPopupHeight] = useState(600)
  const [acceptTrackWidth, setAcceptTrackWidth] = useState(240)

  useEffect(() => {
    if (!newOrderPopupRef?.current) {
      return undefined
    }

    const updateHeight = () => {
      setPopupHeight(newOrderPopupRef.current?.offsetHeight || 600)
    }

    updateHeight()

    if (typeof window === "undefined" || typeof window.ResizeObserver !== "function") {
      window?.addEventListener?.("resize", updateHeight)
      return () => window?.removeEventListener?.("resize", updateHeight)
    }

    const observer = new window.ResizeObserver(updateHeight)
    observer.observe(newOrderPopupRef.current)

    return () => observer.disconnect()
  }, [newOrderPopupRef, isVisible, isNewOrderPopupMinimized])

  useEffect(() => {
    if (!newOrderAcceptButtonRef?.current) {
      return undefined
    }

    const updateWidth = () => {
      const nextWidth = newOrderAcceptButtonRef.current?.offsetWidth
      setAcceptTrackWidth(nextWidth ? Math.max(nextWidth - 56 - 32, 240) : 240)
    }

    updateWidth()

    if (typeof window === "undefined" || typeof window.ResizeObserver !== "function") {
      window?.addEventListener?.("resize", updateWidth)
      return () => window?.removeEventListener?.("resize", updateWidth)
    }

    const observer = new window.ResizeObserver(updateWidth)
    observer.observe(newOrderAcceptButtonRef.current)

    return () => observer.disconnect()
  }, [newOrderAcceptButtonRef, isVisible])

  if (!isVisible || !(newOrder || selectedRestaurant) || !isOnline || isActiveOrderCancelled) {
    return null
  }

  const earnings = newOrder?.estimatedEarnings || selectedRestaurant?.estimatedEarnings || 0
  const earningsFallback =
    newOrder?.deliveryFee ?? selectedRestaurant?.deliveryFee ?? selectedRestaurant?.amount ?? 0

  let earningsValue = 0
  if (earnings) {
    if (typeof earnings === "object") {
      if (earnings.totalEarning != null) {
        earningsValue = Number(earnings.totalEarning) || 0
      } else if (earnings.basePayout != null) {
        earningsValue = Number(earnings.basePayout) || 0
      }
    } else if (typeof earnings === "number") {
      earningsValue = earnings > 0 ? earnings : 0
    }
  }

  if (earningsValue <= 0 && earningsFallback > 0) {
    earningsValue = Number(earningsFallback)
  }

  const pickupDistanceLabel =
    normalizeDistanceLabel(newOrder?.pickupDistance) ||
    normalizeDistanceLabel(selectedRestaurant?.pickupDistance) ||
    normalizeDistanceLabel(selectedRestaurant?.distance) ||
    "Distance not available"
  const dropDistanceLabel =
    normalizeDistanceLabel(newOrder?.deliveryDistance) ||
    normalizeDistanceLabel(newOrder?.dropDistance) ||
    normalizeDistanceLabel(selectedRestaurant?.dropDistance) ||
    "Distance not available"
  const pickupTimeAway =
    normalizeDistanceLabel(newOrder?.pickupDistance)
      ? calculateTimeAway(newOrder.pickupDistance)
      : selectedRestaurant?.timeAway && selectedRestaurant.timeAway !== "Calculating..."
        ? selectedRestaurant.timeAway
        : null

  return (
    <AnimatePresence>
      <>
        {!isNewOrderPopupMinimized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/55 z-[180]"
          />
        )}

        {isNewOrderPopupMinimized && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-16 left-0 right-0 z-[195] flex justify-center pb-2"
            onTouchStart={handleNewOrderPopupTouchStart}
            onTouchMove={handleNewOrderPopupTouchMove}
            onTouchEnd={handleNewOrderPopupTouchEnd}
            style={{ touchAction: "none" }}
          >
            <div className="bg-green-500 rounded-t-2xl px-6 py-3 shadow-lg cursor-grab active:cursor-grabbing">
              <div className="flex items-center gap-2">
                <div className="w-8 h-1 bg-white/80 rounded-full" />
                <span className="text-white text-sm font-semibold">Swipe up to view order</span>
                <div className="w-8 h-1 bg-white/80 rounded-full" />
              </div>
            </div>
          </motion.div>
        )}

        <motion.div
          ref={newOrderPopupRef}
          initial={{ y: "100%" }}
          animate={{
            y: isDraggingNewOrderPopup
              ? newOrderDragY
              : isNewOrderPopupMinimized
                ? popupHeight
                : 0,
          }}
          transition={
            isDraggingNewOrderPopup
              ? { duration: 0 }
              : isNewOrderPopupMinimized
                ? { duration: 0.3, ease: "easeOut" }
                : {
                    type: "spring",
                    damping: 30,
                    stiffness: 300,
                  }
          }
          exit={{ y: "100%" }}
          onTouchStart={handleNewOrderPopupTouchStart}
          onTouchMove={handleNewOrderPopupTouchMove}
          onTouchEnd={handleNewOrderPopupTouchEnd}
          className="fixed bottom-0 left-0 right-0 bg-transparent rounded-t-3xl z-[190] overflow-visible"
          style={{ touchAction: "none" }}
        >
          <div className="flex justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1.5 bg-white/30 rounded-full" />
          </div>

          <div className="relative scale-110 mb-0 bg-green-500 rounded-t-3xl overflow-visible">
            <div className="absolute left-1/2 -translate-x-1/2 -top-5 z-20">
              <div className="relative inline-flex items-center justify-center">
                <svg
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    width: "calc(100% + 10px)",
                    height: "calc(100% + 10px)",
                    zIndex: 35,
                  }}
                  viewBox="0 0 200 60"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id="newOrderCountdownGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="1" />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity="1" />
                    </linearGradient>
                  </defs>

                  <path
                    d="M 30,5 L 170,5 A 25,25 0 0,1 195,30 L 195,30 A 25,25 0 0,1 170,55 L 30,55 A 25,25 0 0,1 5,30 L 5,30 A 25,25 0 0,1 30,5 Z"
                    fill="none"
                    stroke="white"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  <motion.path
                    d="M 100,5 L 170,5 A 25,25 0 0,1 195,30 L 195,30 A 25,25 0 0,1 170,55 L 30,55 A 25,25 0 0,1 5,30 L 5,30 A 25,25 0 0,1 30,5 L 100,5"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="450"
                    initial={{ strokeDashoffset: 0 }}
                    animate={{
                      strokeDashoffset: Math.max(0, Math.min(450, 450 * (1 - countdownSeconds / 300))),
                    }}
                    transition={{ duration: 1, ease: "linear" }}
                  />

                  <rect x="95" y="0" width="10" height="8" fill="white" rx="1" />
                </svg>

                <div className="relative bg-white rounded-full px-6 py-2 shadow-lg" style={{ zIndex: 30 }}>
                  <div className="text-sm font-bold text-gray-900">New order</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-t-3xl">
            <div className="p-6">
              <div className="mb-5">
                <p className="text-gray-500 text-sm mb-1">Estimated earnings</p>
                <p className="text-4xl font-bold text-gray-900 mb-2">&#8377;{earningsValue > 0 ? earningsValue.toFixed(2) : "0.00"}</p>

                {typeof earnings === "object" && earnings.breakdown && (
                  <div className="bg-green-50 rounded-lg p-3 mb-2">
                    <p className="text-green-800 text-xs font-medium mb-1">Earnings Breakdown:</p>
                    <p className="text-green-700 text-xs">
                      Base: &#8377;{earnings.basePayout?.toFixed(0) || "0"}
                      {earnings.distanceCommission > 0 && (
                        <>
                          {" "}
                          + Distance ({earnings.distance?.toFixed(1)} km - &#8377;{earnings.commissionPerKm?.toFixed(0)}/km) = &#8377;{earnings.distanceCommission?.toFixed(0)}
                        </>
                      )}
                    </p>
                    {earnings.distance <= earnings.minDistance && earnings.distanceCommission === 0 && (
                      <p className="text-green-600 text-xs mt-1">
                        Note: Distance {earnings.distance?.toFixed(1)} km = {earnings.minDistance} km, per km commission not applicable
                      </p>
                    )}
                  </div>
                )}

                <p className="text-gray-400 text-xs">Pickup: {pickupDistanceLabel} | Drop: {dropDistanceLabel}</p>
              </div>

              <div className="mb-4">
                <p className="text-gray-500 text-xs mb-1">Order ID</p>
                <p className="text-base font-semibold text-gray-900">
                  {newOrder?.orderId || selectedRestaurant?.orderId || "ORD1234567890"}
                </p>
                {pendingNewOrdersCount > 1 && (
                  <p className="mt-1 text-xs font-medium text-orange-600">
                    {pendingNewOrdersCount - 1} more assigned order{pendingNewOrdersCount - 1 > 1 ? "s" : ""} waiting next
                  </p>
                )}
              </div>

              <DeliveryCodCollectionNotice order={newOrder || selectedRestaurant} className="mb-4" />

              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <div className="mb-3">
                  <span className="bg-gray-200 text-gray-700 text-xs font-medium px-2 py-1 rounded-lg">
                    Pick up
                  </span>
                </div>

                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  {newOrder?.restaurantName || selectedRestaurant?.name || "Restaurant"}
                </h3>
                <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                  {normalizeAddressLabel(newOrder?.restaurantLocation?.address || selectedRestaurant?.address, "Address not available")}
                </p>

                <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-2">
                  <Clock className="w-4 h-4" />
                  <span>
                    {pickupTimeAway ? `${pickupTimeAway} away` : "N/A"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {pickupDistanceLabel !== "Distance not available"
                      ? `${pickupDistanceLabel} away`
                      : pickupDistanceLabel}
                  </span>
                </div>
              </div>

              <div className="relative w-full">
                <motion.div
                  ref={newOrderAcceptButtonRef}
                  className="relative w-full bg-green-600 rounded-full overflow-hidden shadow-xl"
                  style={{ touchAction: "none" }}
                  onTouchStart={handleNewOrderAcceptTouchStart}
                  onTouchMove={handleNewOrderAcceptTouchMove}
                  onTouchEnd={handleNewOrderAcceptTouchEnd}
                  onTouchCancel={handleNewOrderAcceptTouchCancel}
                  onMouseDown={handleNewOrderAcceptMouseDown}
                  whileTap={{ scale: 0.98 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-green-500 rounded-full"
                    animate={{ width: `${newOrderAcceptButtonProgress * 100}%` }}
                    transition={
                      newOrderIsAnimatingToComplete
                        ? {
                            type: "spring",
                            stiffness: 150,
                            damping: 22,
                            mass: 0.9,
                          }
                        : { duration: 0 }
                    }
                  />

                  <div className="relative flex items-center h-[64px] px-1">
                    <motion.div
                      className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                      animate={{
                        x:
                          newOrderAcceptButtonProgress *
                          acceptTrackWidth,
                      }}
                      transition={
                        newOrderIsAnimatingToComplete
                          ? {
                              type: "spring",
                              stiffness: 300,
                              damping: 30,
                            }
                          : { duration: 0 }
                      }
                    >
                      <ArrowRight className="w-5 h-5 text-white" />
                    </motion.div>

                    <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                      <motion.span
                        className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                        animate={{
                          opacity:
                            newOrderAcceptButtonProgress > 0.5
                              ? Math.max(0.2, 1 - newOrderAcceptButtonProgress * 0.8)
                              : 1,
                          x: newOrderAcceptButtonProgress > 0.5 ? newOrderAcceptButtonProgress * 15 : 0,
                        }}
                        transition={
                          newOrderIsAnimatingToComplete
                            ? {
                                type: "spring",
                                stiffness: 200,
                                damping: 25,
                              }
                            : { duration: 0 }
                        }
                      >
                        {isAcceptingNewOrder
                          ? "Accepting..."
                          : newOrderAcceptButtonProgress > deliveryAcceptSwipeConfirmThreshold
                            ? "Release to Accept"
                            : "Accept order"}
                      </motion.span>
                    </div>
                  </div>
                </motion.div>
              </div>

              <button
                type="button"
                onClick={handleQuickDenyNewOrder}
                disabled={isAcceptingNewOrder || isRejectingOrder}
                className="mt-3 w-full bg-red-600 text-white py-3 rounded-full font-semibold text-sm hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isRejectingOrder ? "Denying..." : "Deny order"}
              </button>
            </div>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  )
}
