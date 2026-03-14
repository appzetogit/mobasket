import { useEffect, useMemo, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Mail, ChevronDown, Phone } from "lucide-react"
import { setAuthData } from "@/lib/utils/auth"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { groceryStoreAPI } from "@/lib/api"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"
import { firebaseAuth, googleProvider, ensureFirebaseAuthInitialized } from "@/lib/firebase"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import PolicyModal from "@/components/legal/PolicyModal"
import { redirectGroceryStoreAfterAuth } from "../../utils/onboardingUtils"

// Common country codes
const countryCodes = [
  { code: "+1", country: "US/CA", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+61", country: "AU", flag: "🇦🇺" },
  { code: "+7", country: "RU", flag: "🇷🇺" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+82", country: "KR", flag: "🇰🇷" },
  { code: "+65", country: "SG", flag: "🇸🇬" },
  { code: "+971", country: "AE", flag: "🇦🇪" },
  { code: "+966", country: "SA", flag: "🇸🇦" },
  { code: "+27", country: "ZA", flag: "🇿🇦" },
  { code: "+31", country: "NL", flag: "🇳🇱" },
  { code: "+46", country: "SE", flag: "🇸🇪" },
]

export default function GroceryStoreLogin() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const [loginMethod, setLoginMethod] = useState("phone")
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    email: "",
  })
  const [errors, setErrors] = useState({
    phone: "",
    email: "",
  })
  const [touched, setTouched] = useState({
    phone: false,
    email: false,
  })
  const [isSending, setIsSending] = useState(false)
  const [apiError, setApiError] = useState("")
  const [policyLinks, setPolicyLinks] = useState({
    termsOfServiceUrl: "",
    privacyPolicyUrl: "",
    contentPolicyUrl: "",
  })
  const [policyModal, setPolicyModal] = useState({
    open: false,
    title: "",
    loading: false,
    content: "",
    fallbackUrl: "",
  })

  useEffect(() => {
    if (isModuleAuthenticated("grocery-store")) {
      const from = location.state?.from?.pathname || location.state?.from || null
      redirectGroceryStoreAfterAuth(navigate, { replace: true, redirectTo: from })
    }
  }, [navigate, location.state])

  useEffect(() => {
    const loadPolicyUrls = async () => {
      try {
        const settings = await loadBusinessSettings()
        if (settings?.policyLinks) {
          setPolicyLinks({
            termsOfServiceUrl: settings.policyLinks.termsOfServiceUrl || "",
            privacyPolicyUrl: settings.policyLinks.privacyPolicyUrl || "",
            contentPolicyUrl: settings.policyLinks.contentPolicyUrl || "",
          })
        }
      } catch {
        // Keep default empty links when settings are unavailable
      }
    }

    loadPolicyUrls()
  }, [])

  // Get selected country details dynamically
  const selectedCountry = countryCodes.find(c => c.code === formData.countryCode) || countryCodes[2]

  // Phone number validation
  const validatePhone = (phone, countryCode) => {
    if (!phone || phone.trim() === "") {
      return "Phone number is required"
    }

    const digitsOnly = phone.replace(/\D/g, "")

    if (countryCode === "+91") {
      if (digitsOnly.length !== 10) {
        return "Indian phone number must be 10 digits"
      }
      const firstDigit = digitsOnly[0]
      if (!["6", "7", "8", "9"].includes(firstDigit)) {
        return "Invalid Indian mobile number"
      }
      return ""
    }

    if (digitsOnly.length < 7) {
      return "Phone number must be at least 7 digits"
    }

    if (digitsOnly.length > 15) {
      return "Phone number is too long"
    }

    return ""
  }

  const handleSendOTP = async () => {
    setTouched({ phone: true })
    setApiError("")

    const phoneError = validatePhone(formData.phone, formData.countryCode)

    if (phoneError) {
      setErrors({ phone: phoneError })
      return
    }

    setErrors({ phone: "" })

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      await groceryStoreAPI.sendOTP(fullPhone, "login")

      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "grocery-store",
      }
      sessionStorage.setItem("groceryStoreAuthData", JSON.stringify(authData))

      navigate("/store/otp")
    } catch (error) {
      if (Number(error?.response?.status || 0) === 404) {
        try {
          await groceryStoreAPI.sendOTP(fullPhone, "register")

          const authData = {
            method: "phone",
            phone: fullPhone,
            name: `Grocery Store ${formData.phone.slice(-4) || "Partner"}`,
            isSignUp: true,
            module: "grocery-store",
          }
          sessionStorage.setItem("groceryStoreAuthData", JSON.stringify(authData))

          navigate("/store/otp")
          return
        } catch (registerError) {
          const registerMessage =
            registerError?.response?.data?.message ||
            registerError?.response?.data?.error ||
            "Failed to start onboarding. Please try again."
          setApiError(registerMessage)
          return
        }
      }

      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setApiError(message)
    } finally {
      setIsSending(false)
    }
  }

  const validateEmail = (email) => {
    if (!email || email.trim() === "") {
      return "Email is required"
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return "Please enter a valid email address"
    }

    return ""
  }

  const handleEmailChange = (e) => {
    const value = e.target.value
    const newFormData = {
      ...formData,
      email: value,
    }
    setFormData(newFormData)

    if (touched.email) {
      const error = validateEmail(value)
      setErrors({ ...errors, email: error })
    }
  }

  const handleEmailBlur = () => {
    setTouched({ ...touched, email: true })
    const error = validateEmail(formData.email)
    setErrors({ ...errors, email: error })
  }

  const handleEmailLogin = () => {
    setLoginMethod("email")
  }

  const handleSendEmailOTP = async () => {
    setTouched({ ...touched, email: true })
    setApiError("")

    const emailError = validateEmail(formData.email)

    if (emailError) {
      setErrors({ ...errors, email: emailError })
      return
    }

    setErrors({ ...errors, email: "" })

    try {
      setIsSending(true)
      await groceryStoreAPI.sendOTP(null, "login", formData.email.trim())

      const authData = {
        method: "email",
        email: formData.email.trim(),
        isSignUp: false,
        module: "grocery-store",
      }
      sessionStorage.setItem("groceryStoreAuthData", JSON.stringify(authData))

      navigate("/store/otp")
    } catch (error) {
      if (Number(error?.response?.status || 0) === 404) {
        try {
          await groceryStoreAPI.sendOTP(null, "register", formData.email.trim())

          const authData = {
            method: "email",
            email: formData.email.trim(),
            name: `Grocery Store ${formData.email.trim().split("@")[0] || "Partner"}`,
            isSignUp: true,
            module: "grocery-store",
          }
          sessionStorage.setItem("groceryStoreAuthData", JSON.stringify(authData))

          navigate("/store/otp")
          return
        } catch (registerError) {
          const registerMessage =
            registerError?.response?.data?.message ||
            registerError?.response?.data?.error ||
            "Failed to start onboarding. Please try again."
          setApiError(registerMessage)
          return
        }
      }

      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setApiError(message)
    } finally {
      setIsSending(false)
    }
  }

  const handleGoogleLogin = async () => {
    setApiError("")
    setIsSending(true)

    try {
      const authReady = ensureFirebaseAuthInitialized()
      if (!authReady || !firebaseAuth || !googleProvider) {
        throw new Error("Firebase Auth is not configured. Please verify Firebase settings in Admin > Env Setup.")
      }

      const { signInWithPopup } = await import("firebase/auth")
      const result = await signInWithPopup(firebaseAuth, googleProvider)
      const user = result.user
      const idToken = await user.getIdToken()

      const response = await groceryStoreAPI.firebaseGoogleLogin(idToken)
      const data = response?.data?.data || {}

      const accessToken = data.accessToken
      const store = data.store || data.groceryStore
      const refreshToken = data.refreshToken

      if (!accessToken || !store) {
        throw new Error("Invalid response from server")
      }

      setAuthData("grocery-store", accessToken, store, refreshToken)
      window.dispatchEvent(new Event("groceryStoreAuthChanged"))

      const from = location.state?.from?.pathname || location.state?.from || null
      await redirectGroceryStoreAfterAuth(navigate, { replace: true, redirectTo: from })
    } catch (error) {
      console.error("Firebase Google login error:", error)
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to login with Google. Please try again."
      setApiError(message)
    } finally {
      setIsSending(false)
    }
  }

  const handlePhoneChange = (e) => {
    const rawDigits = e.target.value.replace(/\D/g, "")
    const maxLength = formData.countryCode === "+91" ? 10 : 15
    const value = rawDigits.slice(0, maxLength)
    const newFormData = {
      ...formData,
      phone: value,
    }
    setFormData(newFormData)

    const error = validatePhone(value, formData.countryCode)
    setErrors({ ...errors, phone: error })

    if (!touched.phone && value.length > 0) {
      setTouched({ ...touched, phone: true })
    }
  }

  const handlePhoneBlur = () => {
    if (!touched.phone) {
      setTouched({ ...touched, phone: true })
    }
    const error = validatePhone(formData.phone, formData.countryCode)
    setErrors({ ...errors, phone: error })
  }

  const handleCountryCodeChange = (value) => {
    const newFormData = {
      ...formData,
      countryCode: value,
    }
    setFormData(newFormData)

    if (touched.phone) {
      const error = validatePhone(formData.phone, value)
      setErrors({ ...errors, phone: error })
    }
  }

  const isValidPhone = !errors.phone && formData.phone.trim().length > 0
  const isValidEmail = !errors.email && formData.email.trim().length > 0
  const displayCompanyName = useMemo(() => {
    const normalized = (companyName || "MoBasket").trim()
    if (!normalized) return "MoBasket"
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }, [companyName])

  const openPolicyModal = async (type) => {
    if (type === "content") {
      navigate("/store/content-policy")
      return
    }

    const modalTitleByType = {
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      content: "Code of Conduct",
    }

    setPolicyModal({
      open: true,
      title: modalTitleByType[type] || "Policy",
      loading: true,
      content: "",
      fallbackUrl: "",
    })

    try {
      const endpoint = type === "terms" ? API_ENDPOINTS.ADMIN.TERMS_PUBLIC : API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC
      const response = await api.get(endpoint, {
        params: type === "terms" ? { audience: "grocery-store" } : undefined,
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
        content: "<p>Unable to load content right now.</p>",
      }))
    }
  }

  const renderPolicyLink = (label, type) => {
    return (
      <button
        type="button"
        onClick={() => openPolicyModal(type)}
        className="underline hover:text-gray-800 transition-colors"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      <div className="flex flex-col items-center pt-12 pb-8 px-6">
        <div>
          <h1
            className="text-3xl italic md:text-4xl tracking-wide font-extrabold text-black"
            style={{
              WebkitTextStroke: "0.5px black",
              textStroke: "0.5px black"
            }}
          >
            {displayCompanyName}
          </h1>
        </div>

        <div className="">
          <span className="text-gray-600 font-light text-sm tracking-wide block text-center">
            — grocery store partner —
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-6 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-6 py-4">
          <div className="text-center">
            <p className="text-base text-gray-700 leading-relaxed">
              {loginMethod === "email"
                ? "Enter your email to continue. We'll send you a one-time code."
                : "Enter your phone number to continue. New stores will continue into onboarding automatically."
              }
            </p>
          </div>

          {loginMethod === "phone" && (
            <div className="space-y-4">
              <div className="flex gap-2 items-stretch w-full">
                <Select
                  value={formData.countryCode}
                  onValueChange={handleCountryCodeChange}
                >
                  <SelectTrigger className="w-[100px] h-12 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center shrink-0" style={{ height: '48px' }}>
                    <SelectValue>
                      <span className="flex items-center gap-1.5">
                        <span className="text-base">{selectedCountry.flag}</span>
                        <span className="text-sm font-medium text-gray-900">{selectedCountry.code}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    {countryCodes.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        <span className="flex items-center gap-2">
                          <span>{country.flag}</span>
                          <span>{country.code}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex-1 flex flex-col">
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="Enter phone number"
                    value={formData.phone}
                    onChange={handlePhoneChange}
                    onBlur={handlePhoneBlur}
                    className={`w-full px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 text-base border rounded-lg min-w-0 bg-white ${errors.phone && formData.phone.length > 0
                        ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                        : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                      }`}
                    style={{ height: '48px' }}
                  />
                  {errors.phone && formData.phone.length > 0 && (
                    <p className="text-red-500 text-xs mt-1 ml-1">{errors.phone}</p>
                  )}
                </div>
              </div>

              {apiError && (
                <p className="text-red-500 text-xs mt-1 ml-1">{apiError}</p>
              )}

              <Button
                onClick={handleSendOTP}
                disabled={!isValidPhone || isSending}
                className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${isValidPhone && !isSending
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
              >
                {isSending ? "Sending OTP..." : "Send OTP"}
              </Button>
            </div>
          )}

          {loginMethod === "email" && (
            <div className="space-y-4">
              <div className="flex flex-col">
                <input
                  type="email"
                  inputMode="email"
                  placeholder="Enter email address"
                  value={formData.email}
                  onChange={handleEmailChange}
                  onBlur={handleEmailBlur}
                  className={`w-full px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 text-base border rounded-lg bg-white ${errors.email && formData.email.length > 0
                      ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                    }`}
                  style={{ height: '48px' }}
                />
                {errors.email && formData.email.length > 0 && (
                  <p className="text-red-500 text-xs mt-1 ml-1">{errors.email}</p>
                )}
              </div>

              {apiError && (
                <p className="text-red-500 text-xs mt-1 ml-1">{apiError}</p>
              )}

              <Button
                onClick={handleSendEmailOTP}
                disabled={!isValidEmail || isSending}
                className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${isValidEmail && !isSending
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
              >
                {isSending ? "Sending OTP..." : "Send OTP"}
              </Button>
            </div>
          )}

          <div className="relative flex items-center py-4">
            <div className="flex-1 border-t border-gray-500"></div>
            <span className="px-4 text-sm font-medium text-gray-600">OR</span>
            <div className="flex-1 border-t border-gray-500"></div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => {
                if (loginMethod === "phone") {
                  handleEmailLogin()
                } else {
                  setLoginMethod("phone")
                }
              }}
              variant="outline"
              className="w-full h-12 rounded-lg border border-gray- hover:border-gray-400 hover:bg-gray-50 text-gray-900 font-semibold text-base flex items-center justify-center gap-3"
            >
              {loginMethod === "email" ? <Phone className="w-5 h-5 mr-auto text-blue-600" /> : <Mail className="w-5 h-5 mr-auto text-blue-600" />}
              <span className="mr-auto text-gray-900">
                {loginMethod === "phone" ? "Login with Email" : "Back to Phone"}
              </span>
            </Button>

            <Button
              onClick={handleGoogleLogin}
              variant="outline"
              className="w-full h-12 rounded-lg border border-gray- hover:border-gray-400 hover:bg-gray-50 text-gray-900 font-semibold text-base flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5 mr-auto" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="mr-auto text-gray-900">Login with Google</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8 pt-4">
        <div className="w-full max-w-md mx-auto">
          <p className="text-xs text-center text-gray-600 leading-relaxed">
            By continuing, you agree to our
          </p>
          <div className="text-xs text-center text-gray-600 mt-1 flex justify-center gap-2 flex-wrap">
            {renderPolicyLink("Terms of Service", "terms")}
            <span>•</span>
            {renderPolicyLink("Privacy Policy", "privacy")}
            <span>•</span>
            {renderPolicyLink("Code of Conduct", "content")}
          </div>
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
