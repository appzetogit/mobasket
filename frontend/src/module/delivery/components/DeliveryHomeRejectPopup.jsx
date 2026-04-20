import { AnimatePresence, motion } from "framer-motion"
import DeliveryCodCollectionNotice from "./DeliveryCodCollectionNotice"

export default function DeliveryHomeRejectPopup({
  isOpen,
  order,
  rejectReasons,
  rejectReason,
  setRejectReason,
  isRejectingOrder,
  handleRejectCancel,
  handleRejectConfirm,
}) {
  if (!isOpen) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleRejectCancel}
      >
        <motion.div
          className="w-[90%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">Can&apos;t Accept Order</h3>
            <p className="text-sm text-gray-500 mt-1">Please select a reason for not accepting this order</p>
          </div>

          <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
            <DeliveryCodCollectionNotice order={order} className="mb-4" />

            <div className="space-y-2">
              {rejectReasons.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setRejectReason(reason)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    rejectReason === reason
                      ? "border-black bg-red-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${rejectReason === reason ? "text-black" : "text-gray-900"}`}>
                      {reason}
                    </span>
                    {rejectReason === reason && (
                      <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
            <button
              onClick={handleRejectCancel}
              disabled={isRejectingOrder}
              className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRejectConfirm}
              disabled={!rejectReason || isRejectingOrder}
              className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
                rejectReason ? "!bg-black !text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isRejectingOrder ? "Denying..." : "Confirm"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
