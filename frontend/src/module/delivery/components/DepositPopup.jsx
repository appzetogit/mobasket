import { useEffect, useState } from "react"
import { IndianRupee, Loader2 } from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"

export default function DepositPopup({ onSuccess, cashInHand = 0 }) {
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  const cashInHandNum = Number(cashInHand) || 0
  const hasCashInHand = cashInHandNum > 0

  useEffect(() => {
    if (!hasCashInHand) {
      setAmount("")
      return
    }
    setAmount(cashInHandNum.toFixed(2))
  }, [cashInHandNum, hasCashInHand])

  const handleDeposit = async () => {
    const amt = parseFloat(amount)
    if (!hasCashInHand) {
      toast.error("No COD cash in hand available for deposit")
      return
    }
    if (!amount || Number.isNaN(amt) || amt < 1) {
      toast.error("Enter a valid amount (minimum Rs 1)")
      return
    }
    if (Math.abs(amt - cashInHandNum) > 0.01) {
      toast.error(`Deposit amount must match full cash collected (Rs ${cashInHandNum.toFixed(2)})`)
      return
    }

    try {
      setLoading(true)
      const orderRes = await deliveryAPI.createDepositOrder(amt)
      const data = orderRes?.data?.data
      const rp = data?.razorpay
      if (!rp?.orderId || !rp?.key) {
        toast.error("Payment gateway not ready. Please try again.")
        setLoading(false)
        return
      }
      setLoading(false)

      let profile = {}
      try {
        const pr = await deliveryAPI.getProfile()
        profile = pr?.data?.data?.profile || pr?.data?.profile || {}
      } catch (_) {}

      const phone = (profile?.phone || "").replace(/\D/g, "").slice(-10)
      const email = profile?.email || ""
      const name = profile?.name || ""

      const companyName = await getCompanyNameAsync()
      setProcessing(true)
      await initRazorpayPayment({
        key: rp.key,
        amount: rp.amount,
        currency: rp.currency || "INR",
        order_id: rp.orderId,
        name: companyName,
        description: `Cash limit deposit - Rs ${amt.toFixed(2)}`,
        prefill: { name, email, contact: phone },
        handler: async (res) => {
          try {
            const verifyRes = await deliveryAPI.verifyDepositPayment({
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
              amount: amt
            })
            if (verifyRes?.data?.success) {
              toast.success(`Deposit of Rs ${amt.toFixed(2)} successful. Available limit updated.`)
              setAmount("")
              window.dispatchEvent(new CustomEvent("deliveryWalletStateUpdated"))
              window.dispatchEvent(new Event("deliveryWalletStateUpdated"))
              if (onSuccess) onSuccess(verifyRes?.data?.data || null)
            } else {
              toast.error(verifyRes?.data?.message || "Verification failed")
            }
          } catch (err) {
            toast.error(err?.response?.data?.message || "Verification failed. Contact support.")
          } finally {
            setProcessing(false)
          }
        },
        onError: (e) => {
          toast.error(e?.description || "Payment failed")
          setProcessing(false)
        },
        onClose: () => setProcessing(false)
      })
    } catch (err) {
      setLoading(false)
      setProcessing(false)
      toast.error(err?.response?.data?.message || "Failed to create payment")
    }
  }

  return (
    <div className="flex flex-col p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Amount (Rs)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <IndianRupee className="w-4 h-4" />
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            readOnly
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-700 focus:outline-none"
          />
        </div>
        {cashInHandNum > 0 ? (
          <p className="text-xs text-slate-500 mt-1">
            Cash in hand: Rs {cashInHandNum.toFixed(2)}. Full amount will be deposited.
          </p>
        ) : (
          <p className="text-xs text-amber-700 mt-1">
            No COD cash in hand right now. Pocket balance/earnings cannot be deposited here.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleDeposit}
        disabled={loading || processing || !hasCashInHand || !amount || parseFloat(amount) < 1}
        className="w-full py-2.5 rounded-lg bg-black text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading || processing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : null}
        {loading ? "Creating..." : processing ? "Complete payment..." : "Deposit"}
      </button>
    </div>
  )
}
