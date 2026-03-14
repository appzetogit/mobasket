import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { useProfile } from "../context/ProfileContext"
import { toast } from "sonner"

const socialIcons = [
  { id: "whatsapp", icon: "💬", bg: "bg-green-500" },
  { id: "facebook", icon: "📘", bg: "bg-blue-600" },
  { id: "gpay", icon: "💳", bg: "bg-blue-500" },
  { id: "instagram", icon: "📷", bg: "bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400" },
]

const defaultGiftCardState = {
  category: {
    id: "birthday",
    label: "Birthday",
    cardTitle: "HAPPY\nBIRTHDAY",
    bgColor: "#f87171",
    emojis: ["🎂", "🎁", "🥳", "🎉"],
    message: "Have an amazing birthday!",
  },
  amount: 2000,
  message: "Have an amazing birthday!",
}

export default function GiftCardCheckout() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const { paymentMethods, getDefaultPaymentMethod } = useProfile()
  const [selectedPaymentId, setSelectedPaymentId] = useState("")

  const giftCardState = location.state?.giftCard || location.state || defaultGiftCardState
  const { category, amount, message } = giftCardState
  const formattedAmount = `Rs ${Number(amount || 0).toLocaleString("en-IN")}`

  const selectedPayment = useMemo(
    () => paymentMethods.find((method) => method.id === selectedPaymentId) || null,
    [paymentMethods, selectedPaymentId]
  )

  useEffect(() => {
    if (!paymentMethods.length) {
      setSelectedPaymentId("")
      return
    }

    const defaultPayment = getDefaultPaymentMethod()
    setSelectedPaymentId((previous) => {
      if (previous && paymentMethods.some((method) => method.id === previous)) return previous
      if (defaultPayment?.id) return defaultPayment.id
      return paymentMethods[0]?.id || ""
    })
  }, [paymentMethods, getDefaultPaymentMethod])

  const handleProceedPurchase = () => {
    if (!selectedPayment) {
      toast.error("Please select a payment option")
      return
    }

    toast.success("E-gift card purchase completed successfully")
    navigate("/gift-card")
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-24">
      <div className="bg-white dark:bg-[#1a1a1a] sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Complete purchase</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5">
        <div className="max-w-2xl mx-auto space-y-5">
          <Card className="border-0 py-0 shadow-md overflow-hidden bg-white dark:bg-[#1a1a1a]">
            <CardContent className="p-0">
              <div
                className="relative w-full h-52 sm:h-60 overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${category?.bgColor}ee 0%, ${category?.bgColor} 50%, ${category?.bgColor}dd 100%)`,
                }}
              >
                <div className="absolute top-4 left-4 text-3xl sm:text-4xl">{category?.emojis?.[0]}</div>
                <div className="absolute top-4 right-4 text-3xl sm:text-4xl">{category?.emojis?.[1]}</div>
                <div className="absolute bottom-14 left-6 text-3xl sm:text-4xl">{category?.emojis?.[2]}</div>
                <div className="absolute bottom-14 right-6 text-3xl sm:text-4xl">{category?.emojis?.[3]}</div>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <h2 className="text-white text-3xl sm:text-4xl font-black text-center leading-tight tracking-wide whitespace-pre-line drop-shadow-lg">
                    {category?.cardTitle}
                  </h2>
                  <p className="text-white/80 text-sm mt-3 font-medium">{companyName.toLowerCase()}</p>
                </div>
              </div>

              <div className="bg-gray-100 dark:bg-gray-800 px-4 py-4">
                <p className="text-gray-700 dark:text-gray-300 text-base text-center font-medium">
                  {message || category?.message}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300 font-medium text-base">Gift Card amount</span>
                <span className="text-gray-900 dark:text-white font-bold text-xl">{formattedAmount}</span>
              </div>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
              SELECT PAYMENT OPTION
            </h3>
            <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]">
              <CardContent className="p-4 space-y-3">
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No saved payment options found. Add one to continue.
                  </p>
                ) : (
                  paymentMethods.map((payment) => {
                    const isSelected = payment.id === selectedPaymentId
                    return (
                      <button
                        key={payment.id}
                        type="button"
                        onClick={() => setSelectedPaymentId(payment.id)}
                        className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                          isSelected
                            ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                            : "border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          **** **** **** {payment.cardNumber}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {payment.cardHolder} • {String(payment.expiryMonth || "").padStart(2, "0")}/{String(payment.expiryYear || "").slice(-2)}
                        </p>
                      </button>
                    )
                  })
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    navigate("/user/profile/payments/new", {
                      state: {
                        returnTo: "/user/gift-card/checkout",
                        giftCard: { category, amount, message },
                      },
                    })
                  }
                >
                  Add Payment Method
                </Button>
              </CardContent>
            </Card>
          </section>

          <Card className="border border-gray-100 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  {socialIcons.map((social, index) => (
                    <div
                      key={social.id}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${social.bg}`}
                      style={{ marginLeft: index > 0 ? "-6px" : "0", zIndex: socialIcons.length - index }}
                    >
                      {social.icon}
                    </div>
                  ))}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm flex-1">
                  Complete payment and share this e-gift card with your loved ones using any app
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-100 dark:border-gray-800 p-4 shadow-lg">
        <Button
          className="w-full h-14 bg-green-700 hover:bg-green-800 text-white font-semibold text-base rounded-xl transition-all duration-200 flex items-center justify-between px-6"
          onClick={handleProceedPurchase}
        >
          <span>{selectedPayment ? "Proceed to Pay" : "Select Payment Option"}</span>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
