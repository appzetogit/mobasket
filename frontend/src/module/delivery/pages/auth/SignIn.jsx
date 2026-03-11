import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"
import { deliveryAPI } from "@/lib/api"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"
import PolicyModal from "@/components/legal/PolicyModal"

// Common country codes
const countryCodes = [
  { code: "+91", country: "IN" },
  { code: "+1", country: "US/CA" },
  { code: "+44", country: "UK" },
  { code: "+86", country: "CN" },
  { code: "+81", country: "JP" },
  { code: "+49", country: "DE" },
  { code: "+33", country: "FR" },
  { code: "+39", country: "IT" },
  { code: "+34", country: "ES" },
  { code: "+61", country: "AU" },
  { code: "+7", country: "RU" },
  { code: "+55", country: "BR" },
  { code: "+52", country: "MX" },
  { code: "+82", country: "KR" },
  { code: "+65", country: "SG" },
  { code: "+971", country: "AE" },
  { code: "+966", country: "SA" },
  { code: "+27", country: "ZA" },
  { code: "+31", country: "NL" },
  { code: "+46", country: "SE" },
]

export default function DeliverySignIn() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ phone: "", countryCode: "+91" })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [termsUrl, setTermsUrl] = useState("")
  const [policyModal, setPolicyModal] = useState({
    open: false,
    title: "Terms and Conditions",
    loading: false,
    content: "",
    fallbackUrl: "",
  })

  // Get selected country details dynamically
  const selectedCountry = countryCodes.find(c => c.code === formData.countryCode) || countryCodes[0] // Default to India (+91)

  const validatePhone = (phone, countryCode) => {
    if (!phone || phone.trim() === "") {
      return "Phone number is required"
    }

    const digitsOnly = phone.replace(/\D/g, "")

    if (digitsOnly.length < 7) {
      return "Phone number must be at least 7 digits"
    }

    if (digitsOnly.length > 15) {
      return "Phone number must be at most 15 digits"
    }

    // India-specific validation
    if (countryCode === "+91") {
      if (digitsOnly.length !== 10) {
        return "Indian phone number must be 10 digits"
      }
      const firstDigit = digitsOnly[0]
      if (!["6", "7", "8", "9"].includes(firstDigit)) {
        return "Invalid Indian mobile number"
      }
    }

    return ""
  }

  const handleSendOTP = async () => {
    setError("")

    const phoneError = validatePhone(formData.phone, formData.countryCode)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode}${formData.phone}`

    try {
      setIsSending(true)

      // Call backend to send OTP for delivery login
      await deliveryAPI.sendOTP(fullPhone, "login")

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "delivery",
      }
      sessionStorage.setItem("deliveryAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/delivery/otp")
    } catch (err) {
      console.error("Send OTP Error:", err)
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to send OTP. Please try again."
      setError(message)
      setIsSending(false)
    }
  }

  const handlePhoneChange = (e) => {
    // Only allow digits
    const value = e.target.value.replace(/\D/g, "")
    setFormData({
      ...formData,
      phone: value.slice(0, 15),
    })
  }

  const handleCountryCodeChange = (value) => {
    setFormData({
      ...formData,
      countryCode: value,
    })
  }

  const isValid = !validatePhone(formData.phone, formData.countryCode)

  useEffect(() => {
    const loadPolicyLinks = async () => {
      try {
        const settings = await loadBusinessSettings()
        setTermsUrl(settings?.policyLinks?.termsOfServiceUrl || "")
      } catch {
        // Keep fallback behavior
      }
    }

    loadPolicyLinks()
  }, [])

  const displayCompanyName = useMemo(() => {
    const normalized = (companyName || "MoBasket").trim()
    if (!normalized) return "MoBasket"
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }, [companyName])

  const openTermsModal = async () => {
    setPolicyModal({
      open: true,
      title: "Terms and Conditions",
      loading: true,
      content: "",
      fallbackUrl: termsUrl || "/delivery/terms-and-conditions",
    })

    try {
      const response = await api.get(API_ENDPOINTS.ADMIN.TERMS_PUBLIC, {
        params: { audience: "delivery" },
      })
      const data = response?.data?.data || {}
      setPolicyModal((prev) => ({
        ...prev,
        loading: false,
        title: data.title || prev.title,
        content: data.content || "<p>Content is not available right now.</p>",
      }))
    } catch {
      setPolicyModal((prev) => ({
        ...prev,
        loading: false,
        content: "<p>Unable to load terms right now.</p>",
      }))
    }
  }

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      {/* Top Section - Logo and Badge */}
      <div className="flex flex-col items-center pt-8 pb-6 px-6">
        {/* MoBasket Logo */}
        <div>
          <h1 className="text-3xl text-black font-extrabold italic tracking-tight">
            {displayCompanyName}
          </h1>
        </div>
        
        {/* DELIVERY Badge */}
        <div className="bg-black px-6 py-2 rounded mt-2">
          <span className="text-white font-semibold text-sm uppercase tracking-wide">
            DELIVERY
          </span>
        </div>
      </div>

      {/* Main Content - Form Section */}
      <div className="flex-1 flex flex-col px-6">
        <div className="w-full max-w-md mx-auto space-y-6">
          {/* Sign In Heading */}
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold text-black">
              Sign in to your account
            </h2>
            <p className="text-base text-gray-600">
              Login or create an account
            </p>
          </div>

          {/* Mobile Number Input */}
          <div className="space-y-2 w-full">
            <div className="flex gap-2 items-stretch w-full">
              <Select
                value={formData.countryCode}
                onValueChange={handleCountryCodeChange}
                disabled
              >
                <SelectTrigger className="w-[100px] !h-12 border-gray-300 rounded-lg flex items-center shrink-0" size="default">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span>{selectedCountry.code}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {countryCodes.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      <span className="flex items-center gap-2">
                        <span>{country.code}</span>
                        <span className="text-gray-500">{country.country}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="Enter phone number"
                value={formData.phone}
                onChange={handlePhoneChange}
                autoComplete="off"
                autoFocus={false}
                className={`flex-1 h-12 px-4 text-gray-900 placeholder-gray-400 focus:outline-none text-base border rounded-lg min-w-0 ${
                  error ? "border-red-500" : "border-gray-300"
                }`}
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Continue Button and Terms */}
      <div className="px-6 pb-8 pt-4">
        <div className="w-full max-w-md mx-auto space-y-4">
          {/* Continue Button */}
          <button
            onClick={handleSendOTP}
            disabled={!isValid || isSending}
            className={`w-full py-4 rounded-lg font-bold text-base transition-colors ${
              isValid && !isSending
                ? "bg-[#00B761] hover:bg-[#00A055] active:bg-[#009049] text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {isSending ? "Sending OTP..." : "Continue"}
          </button>

          {/* Terms and Conditions */}
          <p className="text-xs text-center text-gray-600 px-4">
            By continuing, you agree to our{" "}
            <button
              type="button"
              onClick={openTermsModal}
              className="text-blue-600 hover:underline"
            >
              Terms and Conditions
            </button>
          </p>
        </div>
      </div>
      <PolicyModal
        open={policyModal.open}
        onOpenChange={(open) => setPolicyModal((prev) => ({ ...prev, open }))}
        title={policyModal.title}
        loading={policyModal.loading}
        content={policyModal.content}
        fallbackUrl={policyModal.fallbackUrl}
      />
    </div>
  )
}

