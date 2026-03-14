import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { CheckCircle, MapPin, CreditCard, ArrowLeft, User, Phone } from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import AnimatedPage from "../../components/AnimatedPage"
import ScrollReveal from "../../components/ScrollReveal"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import AddressLocationPicker from "@/components/AddressLocationPicker"
import { zoneAPI } from "@/lib/api"
import { useCart } from "../../context/CartContext"
import { useProfile } from "../../context/ProfileContext"
import { useOrders } from "../../context/OrdersContext"

const getEntityId = (entity) => entity?.id || entity?._id || ""

const formatAddress = (address = {}) =>
  [
    address?.street,
    address?.additionalDetails,
    address?.city && address?.state
      ? `${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ""}`
      : [address?.city, address?.state, address?.zipCode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ")

export default function Checkout() {
  const navigate = useNavigate()
  const { cart, clearCart } = useCart()
  const { getDefaultAddress, getDefaultPaymentMethod, addresses, paymentMethods } = useProfile()
  const { createOrder } = useOrders()
  const [selectedAddress, setSelectedAddress] = useState(getEntityId(getDefaultAddress()))
  const [selectedPayment, setSelectedPayment] = useState(getEntityId(getDefaultPaymentMethod()))
  const [orderingForSomeoneElse, setOrderingForSomeoneElse] = useState(false)
  const [someoneElseAddress, setSomeoneElseAddress] = useState({
    recipientName: "",
    recipientPhone: "",
    street: "",
    additionalDetails: "",
    city: "",
    state: "",
    zipCode: "",
    formattedAddress: "",
    latitude: "",
    longitude: "",
  })
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)

  const defaultAddress =
    addresses.find((addr) => getEntityId(addr) === selectedAddress) || getDefaultAddress()
  const defaultPayment =
    paymentMethods.find((pm) => getEntityId(pm) === selectedPayment) || getDefaultPaymentMethod()

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity * 83, 0)
  const deliveryFee = 2.99 * 83
  const tax = subtotal * 0.08
  const total = subtotal + deliveryFee + tax

  const canPlaceOrder = useMemo(() => {
    if (isPlacingOrder) return false
    if (!selectedPayment) return false
    if (!orderingForSomeoneElse) return Boolean(selectedAddress)

    const requiredGuestFields = [
      someoneElseAddress.recipientName,
      someoneElseAddress.recipientPhone,
      someoneElseAddress.street,
      someoneElseAddress.city,
      someoneElseAddress.state,
      someoneElseAddress.zipCode,
      someoneElseAddress.latitude,
      someoneElseAddress.longitude,
    ]

    return requiredGuestFields.every((field) => String(field || "").trim().length > 0)
  }, [isPlacingOrder, selectedPayment, selectedAddress, orderingForSomeoneElse, someoneElseAddress])

  const handlePlaceOrder = async () => {
    if (!selectedPayment) {
      toast.error("Please select a payment method")
      return
    }

    if (cart.length === 0) {
      toast.error("Your cart is empty")
      return
    }

    let deliveryAddress = defaultAddress
    let recipientMeta = null

    if (orderingForSomeoneElse) {
      const requiredGuestFields = [
        { key: "recipientName", label: "Recipient name" },
        { key: "recipientPhone", label: "Recipient phone" },
        { key: "street", label: "Street address" },
        { key: "city", label: "City" },
        { key: "state", label: "State" },
        { key: "zipCode", label: "Zip code" },
        { key: "latitude", label: "Latitude" },
        { key: "longitude", label: "Longitude" },
      ]

      for (const field of requiredGuestFields) {
        if (!String(someoneElseAddress[field.key] || "").trim()) {
          toast.error(`${field.label} is required`)
          return
        }
      }

      const lat = Number(someoneElseAddress.latitude)
      const lng = Number(someoneElseAddress.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        toast.error("Please enter valid latitude and longitude")
        return
      }

      const phoneDigits = String(someoneElseAddress.recipientPhone || "").replace(/\D/g, "")
      if (phoneDigits.length < 10) {
        toast.error("Please enter a valid recipient phone number")
        return
      }

      try {
        const zoneResponse = await zoneAPI.detectAllZones(lat, lng, "mofood")
        const zoneData = zoneResponse?.data?.data

        if (!zoneResponse?.data?.success || zoneData?.status !== "IN_SERVICE") {
          toast.error("Entered address is outside all active delivery zones")
          return
        }

        deliveryAddress = {
          label: "Guest Delivery",
          street: String(someoneElseAddress.street || "").trim(),
          additionalDetails: String(someoneElseAddress.additionalDetails || "").trim(),
          city: String(someoneElseAddress.city || "").trim(),
          state: String(someoneElseAddress.state || "").trim(),
          zipCode: String(someoneElseAddress.zipCode || "").trim(),
          formattedAddress:
            String(someoneElseAddress.formattedAddress || "").trim() ||
            formatAddress(someoneElseAddress),
          latitude: lat,
          longitude: lng,
          zoneIds: Array.isArray(zoneData?.zoneIds) ? zoneData.zoneIds : [],
        }

        recipientMeta = {
          forSomeoneElse: true,
          recipientName: String(someoneElseAddress.recipientName || "").trim(),
          recipientPhone: String(someoneElseAddress.recipientPhone || "").trim(),
        }
      } catch (error) {
        console.error("Zone validation failed:", error)
        toast.error(error?.response?.data?.message || "Failed to validate delivery zone")
        return
      }
    } else if (!selectedAddress || !deliveryAddress) {
      toast.error("Please select a delivery address")
      return
    }

    setIsPlacingOrder(true)

    // Simulate API call
    setTimeout(() => {
      const orderId = createOrder({
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image
        })),
        address: deliveryAddress,
        paymentMethod: defaultPayment,
        subtotal,
        deliveryFee,
        tax,
        total,
        recipient: recipientMeta,
        restaurant: cart[0]?.restaurant || cart[0]?.name || "Multiple Restaurants"
      })

      clearCart()
      setIsPlacingOrder(false)
      navigate(`/user/orders/${orderId}?confirmed=true`)
    }, 1500)
  }

  if (cart.length === 0) {
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card className="dark:bg-[#1a1a1a] dark:border-gray-800">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg md:text-xl">Checkout</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg mb-4">Your cart is empty</p>
                <Link to="/user/cart">
                  <Button>Go to Cart</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#1a1a1a] dark:to-[#0a0a0a] p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <ScrollReveal>
          <div className="flex items-center gap-4 mb-6 md:mb-8">
            <Link to="/user/cart">
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 md:h-10 md:w-10">
                <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
              </Button>
            </Link>
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold dark:text-white">Checkout</h1>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Left Column - Order Details */}
          <div className="lg:col-span-2 space-y-6">
            <ScrollReveal delay={0.05}>
              <Card className="border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50 dark:border-gray-800 dark:from-[#111827] dark:to-[#111827] dark:bg-[#111827]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <User className="h-5 w-5 text-orange-600" />
                    Who Is This Order For?
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      !orderingForSomeoneElse
                        ? "border-orange-500 bg-white shadow-sm dark:bg-[#1a1a1a] dark:border-orange-400"
                        : "border-yellow-200 bg-white/70 hover:border-orange-300 dark:bg-[#111827] dark:border-gray-700 dark:hover:border-orange-400/70"
                    }`}
                    onClick={() => setOrderingForSomeoneElse(false)}
                  >
                    <p className="font-semibold text-sm md:text-base">Myself</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Use my saved delivery address</p>
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      orderingForSomeoneElse
                        ? "border-orange-500 bg-white shadow-sm dark:bg-[#1a1a1a] dark:border-orange-400"
                        : "border-yellow-200 bg-white/70 hover:border-orange-300 dark:bg-[#111827] dark:border-gray-700 dark:hover:border-orange-400/70"
                    }`}
                    onClick={() => setOrderingForSomeoneElse(true)}
                  >
                    <p className="font-semibold text-sm md:text-base">Someone else</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Enter recipient and full delivery address</p>
                  </button>
                </CardContent>
              </Card>
            </ScrollReveal>

            {orderingForSomeoneElse ? (
              <ScrollReveal delay={0.1}>
                <Card className="dark:bg-[#1a1a1a] dark:border-gray-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-yellow-600" />
                      Recipient Delivery Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="recipientName">Recipient Name</Label>
                        <Input
                          id="recipientName"
                          placeholder="Full name"
                          value={someoneElseAddress.recipientName}
                          onChange={(e) =>
                            setSomeoneElseAddress((prev) => ({ ...prev, recipientName: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="recipientPhone" className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Recipient Phone
                        </Label>
                        <Input
                          id="recipientPhone"
                          placeholder="e.g. 9876543210"
                          value={someoneElseAddress.recipientPhone}
                          onChange={(e) =>
                            setSomeoneElseAddress((prev) => ({ ...prev, recipientPhone: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="guestStreet">Full Street Address</Label>
                      <Input
                        id="guestStreet"
                        placeholder="House/Flat, Street, Landmark"
                        value={someoneElseAddress.street}
                        onChange={(e) =>
                          setSomeoneElseAddress((prev) => ({ ...prev, street: e.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="guestAdditional">Additional Details</Label>
                      <Input
                        id="guestAdditional"
                        placeholder="Apartment, floor, delivery note"
                        value={someoneElseAddress.additionalDetails}
                        onChange={(e) =>
                          setSomeoneElseAddress((prev) => ({ ...prev, additionalDetails: e.target.value }))
                        }
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="guestCity">City</Label>
                        <Input
                          id="guestCity"
                          placeholder="City"
                          value={someoneElseAddress.city}
                          onChange={(e) =>
                            setSomeoneElseAddress((prev) => ({ ...prev, city: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="guestState">State</Label>
                        <Input
                          id="guestState"
                          placeholder="State"
                          value={someoneElseAddress.state}
                          onChange={(e) =>
                            setSomeoneElseAddress((prev) => ({ ...prev, state: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="guestZip">Zip Code</Label>
                        <Input
                          id="guestZip"
                          placeholder="Postal code"
                          value={someoneElseAddress.zipCode}
                          onChange={(e) =>
                            setSomeoneElseAddress((prev) => ({ ...prev, zipCode: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <AddressLocationPicker
                      value={someoneElseAddress}
                      onChange={setSomeoneElseAddress}
                      title="Recipient Delivery Pin"
                      description="Set the exact pin for this address. We validate this pin against active delivery zones."
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="guestLat">Latitude</Label>
                        <Input
                          id="guestLat"
                          value={someoneElseAddress.latitude}
                          onChange={(e) =>
                            setSomeoneElseAddress((prev) => ({ ...prev, latitude: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="guestLng">Longitude</Label>
                        <Input
                          id="guestLng"
                          value={someoneElseAddress.longitude}
                          onChange={(e) =>
                            setSomeoneElseAddress((prev) => ({ ...prev, longitude: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ) : (
            <ScrollReveal delay={0.1}>
              <Card className="dark:bg-[#1a1a1a] dark:border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-yellow-600" />
                    Delivery Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {addresses.length > 0 ? (
                    <div className="space-y-3">
                      {addresses.map((address) => {
                        const addressId = getEntityId(address)
                        const isSelected = selectedAddress === addressId
                        const addressString = formatAddress(address)

                        return (
                          <div
                            key={addressId}
                            className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${isSelected
                                ? "border-yellow-500 bg-yellow-50 dark:bg-[#1f2937] dark:border-yellow-400"
                                : "border-gray-200 hover:border-yellow-300 dark:border-gray-700 dark:bg-[#111827] dark:hover:border-yellow-400/70"
                              }`}
                            onClick={() => setSelectedAddress(addressId)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                {address.isDefault && (
                                  <Badge className="mb-2 bg-yellow-500 text-white">Default</Badge>
                                )}
                                <p className="text-sm font-medium">{addressString}</p>
                              </div>
                              {isSelected && (
                                <CheckCircle className="h-5 w-5 text-yellow-600" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No addresses saved</p>
                      <Link to="/user/profile/addresses/new">
                        <Button>Add Address</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </ScrollReveal>
            )}

            {/* Payment Method */}
            <ScrollReveal delay={0.2}>
              <Card className="dark:bg-[#1a1a1a] dark:border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-yellow-600" />
                    Payment Method
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {paymentMethods.length > 0 ? (
                    <div className="space-y-3">
                      {paymentMethods.map((payment) => {
                        const paymentId = getEntityId(payment)
                        const isSelected = selectedPayment === paymentId
                        const cardNumber = `**** **** **** ${payment.cardNumber}`

                        return (
                          <div
                            key={paymentId}
                            className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${isSelected
                                ? "border-yellow-500 bg-yellow-50 dark:bg-[#1f2937] dark:border-yellow-400"
                                : "border-gray-200 hover:border-yellow-300 dark:border-gray-700 dark:bg-[#111827] dark:hover:border-yellow-400/70"
                              }`}
                            onClick={() => setSelectedPayment(paymentId)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  {payment.isDefault && (
                                    <Badge className="bg-yellow-500 text-white">Default</Badge>
                                  )}
                                  <Badge variant="outline" className="capitalize">
                                    {payment.type}
                                  </Badge>
                                </div>
                                <p className="font-semibold">{cardNumber}</p>
                                <p className="text-sm text-muted-foreground">
                                  {payment.cardHolder} • Expires {payment.expiryMonth}/{payment.expiryYear.slice(-2)}
                                </p>
                              </div>
                              {isSelected && (
                                <CheckCircle className="h-5 w-5 text-yellow-600" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <Link to="/user/profile/payments">
                        <Button variant="outline" className="w-full">
                          Manage Payment Methods
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No payment methods saved</p>
                      <Link to="/user/profile/payments/new">
                        <Button>Add Payment Method</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </ScrollReveal>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <ScrollReveal delay={0.3}>
              <Card className="sticky top-4 md:top-6 dark:bg-[#1a1a1a] dark:border-gray-800">
                <CardHeader>
                  <CardTitle className="text-base md:text-lg lg:text-xl dark:text-white">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6">
                  <div className="space-y-3 md:space-y-4 max-h-64 md:max-h-80 overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 md:gap-4 pb-3 md:pb-4 border-b dark:border-gray-700">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-lg"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-sm md:text-base dark:text-gray-200">{item.name}</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            ₹{(item.price * 83).toFixed(0)} × {item.quantity}
                          </p>
                        </div>
                        <p className="font-semibold text-sm md:text-base dark:text-gray-200">
                          ₹{(item.price * 83 * item.quantity).toFixed(0)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 md:space-y-3 pt-4 md:pt-6 border-t dark:border-gray-700">
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="dark:text-gray-200">₹{subtotal.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-muted-foreground">Delivery Fee</span>
                      <span className="dark:text-gray-200">₹{deliveryFee.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="dark:text-gray-200">₹{tax.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg md:text-xl lg:text-2xl pt-2 md:pt-3 border-t dark:border-gray-700">
                      <span className="dark:text-white">Total</span>
                      <span className="text-yellow-600 dark:text-yellow-400">₹{total.toFixed(0)}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white mt-4 md:mt-6 h-11 md:h-12 text-sm md:text-base"
                    onClick={handlePlaceOrder}
                    disabled={!canPlaceOrder}
                  >
                    {isPlacingOrder ? "Placing Order..." : "Place Order"}
                  </Button>
                </CardContent>
              </Card>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}
