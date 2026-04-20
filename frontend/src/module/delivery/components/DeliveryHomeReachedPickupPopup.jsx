import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, MapPin, Phone } from "lucide-react"

import BottomPopup from "./BottomPopup"
import DeliveryCodCollectionNotice from "./DeliveryCodCollectionNotice"

function resolvePickupAddress(selectedRestaurant) {
  const address = selectedRestaurant?.address

  if (!address || address === "Restaurant Address" || address === "Restaurant address") {
    const possibleAddress =
      selectedRestaurant?.restaurantId?.location?.formattedAddress ||
      selectedRestaurant?.restaurantId?.location?.address ||
      selectedRestaurant?.restaurant?.location?.formattedAddress ||
      selectedRestaurant?.restaurant?.location?.address ||
      selectedRestaurant?.restaurantAddress ||
      selectedRestaurant?.restaurant?.address ||
      selectedRestaurant?.restaurantId?.address ||
      selectedRestaurant?.location?.address ||
      selectedRestaurant?.location?.formattedAddress

    if (possibleAddress && possibleAddress !== "Restaurant Address" && possibleAddress !== "Restaurant address") {
      return possibleAddress
    }
  }

  return address && address !== "Restaurant Address" && address !== "Restaurant address"
    ? address
    : "Address will be updated..."
}

export default function DeliveryHomeReachedPickupPopup({
  isOpen,
  selectedRestaurant,
  isOrderCancelledState,
  onClose,
  onCallRestaurant,
  onOpenMap,
  isPreview = false,
  reachedPickupButtonRef,
  reachedPickupButtonProgress,
  reachedPickupIsAnimatingToComplete,
  handlereachedPickupTouchStart,
  handlereachedPickupTouchMove,
  handlereachedPickupTouchEnd,
  deliverySwipeConfirmThreshold,
}) {
  const isCancelled = isOrderCancelledState(selectedRestaurant)
  const [trackWidth, setTrackWidth] = useState(240)

  useEffect(() => {
    if (!reachedPickupButtonRef?.current) {
      return undefined
    }

    const updateWidth = () => {
      const nextWidth = reachedPickupButtonRef.current?.offsetWidth
      setTrackWidth(nextWidth ? Math.max(nextWidth - 56 - 32, 240) : 240)
    }

    updateWidth()

    if (typeof window === "undefined" || typeof window.ResizeObserver !== "function") {
      window?.addEventListener?.("resize", updateWidth)
      return () => window?.removeEventListener?.("resize", updateWidth)
    }

    const observer = new window.ResizeObserver(updateWidth)
    observer.observe(reachedPickupButtonRef.current)

    return () => observer.disconnect()
  }, [isOpen, reachedPickupButtonRef])

  return (
    <BottomPopup
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={isPreview}
      closeOnBackdropClick={isPreview}
      disableSwipeToClose={!isPreview}
      maxHeight="70vh"
      showHandle={true}
      showBackdrop={isPreview}
      backdropBlocksInteraction={isPreview}
    >
      <div>
        <div className="mb-4">
          <span className="bg-gray-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
            {isPreview ? "Accepted next" : "Pick up"}
          </span>
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedRestaurant?.name || "Restaurant Name"}</h2>
          <p className="text-gray-700 text-sm font-semibold mb-2">
            Customer: {selectedRestaurant?.customerName || "Customer"}
          </p>
          <p className="text-gray-600 mb-2 leading-relaxed">{resolvePickupAddress(selectedRestaurant)}</p>
          <p className="text-gray-500 text-sm font-medium">
            Order ID: {selectedRestaurant?.orderId || "ORD1234567890"}
          </p>

          {Array.isArray(selectedRestaurant?.items) && selectedRestaurant.items.length > 0 && (
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-900 mb-2">
                Ordered Items ({selectedRestaurant.items.length})
              </p>
              <div className="space-y-1.5">
                {selectedRestaurant.items.slice(0, 4).map((item, index) => {
                  const itemName = item?.name || item?.productName || item?.title || `Item ${index + 1}`
                  const itemQuantity = item?.quantity || item?.qty || 1

                  return (
                    <p key={item?._id || item?.id || item?.itemId || `${itemName}-${index}`} className="text-sm text-gray-700">
                      {itemQuantity} x {itemName}
                    </p>
                  )
                })}
                {selectedRestaurant.items.length > 4 && (
                  <p className="text-xs font-medium text-gray-500">
                    +{selectedRestaurant.items.length - 4} more item
                    {selectedRestaurant.items.length - 4 > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          )}

          {isCancelled && <p className="mt-2 text-sm font-semibold text-red-600">Order cancelled by user</p>}
        </div>

        <DeliveryCodCollectionNotice order={selectedRestaurant} className="mb-6" />

        <div className="flex gap-3 mb-6">
          <button
            onClick={onCallRestaurant}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Phone className="w-5 h-5 text-gray-700" />
            <span className="text-gray-700 font-medium">Call</span>
          </button>
          <button
            onClick={onOpenMap}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <MapPin className="w-5 h-5 text-white" />
            <span className="text-white font-medium">Map</span>
          </button>
        </div>

        <div className="relative w-full">
          {isPreview ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center shadow-sm">
              <p className="text-sm font-semibold text-emerald-700">
                This order is already accepted for your next slot.
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-600">
                We will resume this delivery automatically after the current order is completed.
              </p>
            </div>
          ) : (
            <motion.div
              ref={reachedPickupButtonRef}
              className={`relative w-full rounded-full overflow-hidden shadow-xl ${
                isCancelled ? "bg-gray-400 opacity-70" : "bg-green-600"
              }`}
              style={{ touchAction: isCancelled ? "none" : "pan-x" }}
              onTouchStart={isCancelled ? undefined : handlereachedPickupTouchStart}
              onTouchMove={isCancelled ? undefined : handlereachedPickupTouchMove}
              onTouchEnd={isCancelled ? undefined : handlereachedPickupTouchEnd}
              whileTap={isCancelled ? {} : { scale: 0.98 }}
            >
              <motion.div
                className="absolute inset-0 bg-green-500 rounded-full"
                animate={{ width: `${reachedPickupButtonProgress * 100}%` }}
                transition={
                  reachedPickupIsAnimatingToComplete
                    ? {
                        type: "spring",
                        stiffness: 200,
                        damping: 25,
                      }
                    : { duration: 0 }
                }
              />

              <div className="relative flex items-center h-[64px] px-1">
                <motion.div
                  className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                  animate={{
                    x:
                      reachedPickupButtonProgress *
                      trackWidth,
                  }}
                  transition={
                    reachedPickupIsAnimatingToComplete
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
                        reachedPickupButtonProgress > 0.5
                          ? Math.max(0.2, 1 - reachedPickupButtonProgress * 0.8)
                          : 1,
                      x: reachedPickupButtonProgress > 0.5 ? reachedPickupButtonProgress * 15 : 0,
                    }}
                    transition={
                      reachedPickupIsAnimatingToComplete
                        ? {
                            type: "spring",
                            stiffness: 200,
                            damping: 25,
                          }
                        : { duration: 0 }
                    }
                  >
                    {isCancelled
                      ? "Order Cancelled"
                      : reachedPickupButtonProgress > deliverySwipeConfirmThreshold
                        ? "Release to Confirm"
                        : "Reached Pickup"}
                  </motion.span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </BottomPopup>
  )
}
