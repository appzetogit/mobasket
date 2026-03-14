import { useState, useEffect } from "react"
import { useLocation, useParams, useNavigate } from "react-router-dom"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useProfile } from "../../context/ProfileContext"

export default function EditPayment() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.returnTo || "/user/profile/payments"
  const returnState = location.state?.giftCard ? { giftCard: location.state.giftCard } : undefined
  const { getPaymentMethodById, updatePaymentMethod } = useProfile()
  const payment = getPaymentMethodById(id)

  const [formData, setFormData] = useState({
    cardNumber: "",
    cardHolder: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
    type: "visa",
  })

  useEffect(() => {
    if (payment) {
      setFormData({
        cardNumber: payment.cardNumber || "",
        cardHolder: payment.cardHolder || "",
        expiryMonth: payment.expiryMonth || "",
        expiryYear: payment.expiryYear || "",
        cvv: payment.cvv || "",
        type: payment.type || "visa",
      })
    }
  }, [payment])

  const handleChange = (e) => {
    const { name, value } = e.target
    const numericValue = String(value || "").replace(/\D/g, "")
    if (name === "cardNumber") {
      setFormData((prev) => ({ ...prev, cardNumber: numericValue.slice(0, 4) }))
    } else if (name === "expiryMonth") {
      setFormData((prev) => ({ ...prev, expiryMonth: numericValue.slice(0, 2) }))
    } else if (name === "expiryYear") {
      setFormData((prev) => ({ ...prev, expiryYear: numericValue.slice(0, 4) }))
    } else if (name === "cvv") {
      setFormData((prev) => ({ ...prev, cvv: numericValue.slice(0, 4) }))
    } else {
      setFormData({
        ...formData,
        [name]: value,
      })
    }

    // Auto-detect card type based on first digit
    if (name === "cardNumber" && numericValue.length > 0) {
      const firstDigit = numericValue[0]
      if (firstDigit === "4") {
        setFormData((prev) => ({ ...prev, type: "visa" }))
      } else if (firstDigit === "5" || firstDigit === "2") {
        setFormData((prev) => ({ ...prev, type: "mastercard" }))
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (
      !formData.cardNumber ||
      !formData.cardHolder ||
      !formData.expiryMonth ||
      !formData.expiryYear ||
      !formData.cvv
    ) {
      alert("Please fill in all required fields")
      return
    }

    // Validate card number (should be 4 digits for last 4)
    if (formData.cardNumber.length !== 4 || !/^\d+$/.test(formData.cardNumber)) {
      alert("Please enter the last 4 digits of your card")
      return
    }

    // Validate CVV
    if (formData.cvv.length < 3 || !/^\d+$/.test(formData.cvv)) {
      alert("Please enter a valid CVV")
      return
    }

    const month = Number(formData.expiryMonth)
    const year = Number(formData.expiryYear)
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      alert("Please enter a valid expiry month (01-12)")
      return
    }
    if (!Number.isInteger(year) || String(formData.expiryYear).length !== 4) {
      alert("Please enter a valid 4-digit expiry year")
      return
    }
    if (year < currentYear || year > currentYear + 30) {
      alert("Please enter a valid expiry year")
      return
    }
    if (year === currentYear && month < currentMonth) {
      alert("This card is expired")
      return
    }

    updatePaymentMethod(id, formData)
    navigate(returnTo, returnState ? { state: returnState } : undefined)
  }

  if (!payment) {
    return (
      <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] p-4 sm:p-6 md:p-8 lg:p-10">
        <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Payment method not found</p>
              <Button onClick={() => navigate(returnTo, returnState ? { state: returnState } : undefined)} className="mt-4">
                Back to Payment Methods
              </Button>
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] p-4 sm:p-6 md:p-8 lg:p-10">
      <div className="max-w-[1100px] mx-auto space-y-6 md:pt-20 lg:pt-24 md:pb-6 lg:pb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl md:text-3xl">Edit Payment Method</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 md:p-6 lg:p-8">
            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5 lg:space-y-6">
              <div className="space-y-2">
                <Label htmlFor="cardNumber">Last 4 Digits of Card Number *</Label>
                <Input
                  id="cardNumber"
                  name="cardNumber"
                  placeholder="1234"
                  value={formData.cardNumber}
                  onChange={handleChange}
                  maxLength={4}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cardHolder">Cardholder Name *</Label>
                <Input
                  id="cardHolder"
                  name="cardHolder"
                  placeholder="John Doe"
                  value={formData.cardHolder}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
                <div className="space-y-2">
                  <Label htmlFor="expiryMonth">Expiry Month *</Label>
                  <Input
                    id="expiryMonth"
                    name="expiryMonth"
                    placeholder="MM"
                    value={formData.expiryMonth}
                    onChange={handleChange}
                    maxLength={2}
                    inputMode="numeric"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryYear">Expiry Year *</Label>
                  <Input
                    id="expiryYear"
                    name="expiryYear"
                    placeholder="YYYY"
                    value={formData.expiryYear}
                    onChange={handleChange}
                    maxLength={4}
                    inputMode="numeric"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cvv">CVV *</Label>
                  <Input
                    id="cvv"
                    name="cvv"
                    placeholder="123"
                    value={formData.cvv}
                    onChange={handleChange}
                    maxLength={4}
                    inputMode="numeric"
                    type="password"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  onClick={() => navigate(returnTo, returnState ? { state: returnState } : undefined)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">
                  Update Payment Method
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AnimatedPage>
  )
}

