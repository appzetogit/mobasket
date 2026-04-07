import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Mail, Phone } from "lucide-react"
import { setAuthData, isModuleAuthenticated } from "@/lib/utils/auth"
import { Button } from "@/components/ui/button"
import { restaurantAPI } from "@/lib/api"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"
import { firebaseAuth, googleProvider, ensureFirebaseAuthInitialized } from "@/lib/firebase"
import { isFlutterWebViewBridgeAvailable, signInWithFlutterNativeGoogle } from "@/lib/utils/flutterGoogleSignIn"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"
import PolicyModal from "@/components/legal/PolicyModal"
import { syncPushAfterAuth } from "@/lib/pushAuthSync"
import { redirectRestaurantAfterAuth } from "../../utils/onboardingUtils"

const INDIA_COUNTRY = { code: "+91", country: "IN", flag: "IN" }

export default function RestaurantLogin() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [loginMethod, setLoginMethod] = useState("phone") // "phone" or "email"
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

  const googleAuthHandledRef = useRef(false)

  // If already authenticated, skip the login page and go to correct step
  useEffect(() => {
    if (isModuleAuthenticated("restaurant")) {
      redirectRestaurantAfterAuth(navigate, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  const selectedCountry = INDIA_COUNTRY

  // Phone number validation
  const validatePhone = (phone, countryCode) => {
    if (!phone || phone.trim() === "") {
      return "Phone number is required"
    }
    
    // Remove any non-digit characters for validation
    const digitsOnly = phone.replace(/\D/g, "")
    
    // Minimum length check (at least 7 digits)
    if (digitsOnly.length < 7) {
      return "Phone number must be at least 7 digits"
    }
    
    // Maximum length check (typically 15 digits for international numbers)
    if (digitsOnly.length > 15) {
      return "Phone number is too long"
    }
    
    // Country-specific validation (India +91)
    if (countryCode === "+91") {
      if (digitsOnly.length !== 10) {
        return "Indian phone number must be 10 digits"
      }
      // Check if it starts with valid Indian mobile prefixes
      const firstDigit = digitsOnly[0]
      if (!["6", "7", "8", "9"].includes(firstDigit)) {
        return "Invalid Indian mobile number"
      }
    }
    
    return ""
  }

  const handleSendOTP = async () => {
    // Mark all fields as touched
    setTouched({ phone: true })
    setApiError("")
    
    // Validate
    const phoneError = validatePhone(formData.phone, formData.countryCode)
    
    if (phoneError) {
      setErrors({ phone: phoneError })
      return
    }
    
    // Clear errors if validation passes
    setErrors({ phone: "" })

    // Build full phone in E.164-ish format (e.g. +91xxxxxxxxxx)
    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)

      // Call backend to send OTP for login
      await restaurantAPI.sendOTP(fullPhone, "login")

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/restaurant/otp")
    } catch (error) {
      if (Number(error?.response?.status || 0) === 404) {
        try {
          await restaurantAPI.sendOTP(fullPhone, "register")

          const authData = {
            method: "phone",
            phone: fullPhone,
            name: `Restaurant ${formData.phone.slice(-4) || "Partner"}`,
            isSignUp: true,
            module: "restaurant",
          }
          sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))

          navigate("/restaurant/otp")
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

      // Extract backend error message if available
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setApiError(message)
    } finally {
      setIsSending(false)
    }
  }

  // Email validation
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
    
    // Validate if field has been touched
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
    // Mark email field as touched
    setTouched({ ...touched, email: true })
    setApiError("")
    
    // Validate
    const emailError = validateEmail(formData.email)
    
    if (emailError) {
      setErrors({ ...errors, email: emailError })
      return
    }
    
    // Clear errors if validation passes
    setErrors({ ...errors, email: "" })

    try {
      setIsSending(true)

      // Call backend API to send OTP via email
      await restaurantAPI.sendOTP(null, "login", formData.email.trim())

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "email",
        email: formData.email.trim(),
        isSignUp: false,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/restaurant/otp")
    } catch (error) {
      if (Number(error?.response?.status || 0) === 404) {
        try {
          await restaurantAPI.sendOTP(null, "register", formData.email.trim())

          const authData = {
            method: "email",
            email: formData.email.trim(),
            name: `Restaurant ${formData.email.trim().split("@")[0] || "Partner"}`,
            isSignUp: true,
            module: "restaurant",
          }
          sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))

          navigate("/restaurant/otp")
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

      const typedEmail = String(formData?.email || "").trim()
      const providerParams = {}
      if (typedEmail) {
        providerParams.login_hint = typedEmail
      } else if (!isFlutterWebViewBridgeAvailable()) {
        providerParams.prompt = "select_account"
      }
      googleProvider.setCustomParameters(providerParams)

      let result = null
      const isFlutterBridge = isFlutterWebViewBridgeAvailable()
      if (isFlutterBridge) {
        result = await signInWithFlutterNativeGoogle(firebaseAuth)
        if (!result) {
          const { signInWithRedirect } = await import("firebase/auth")
          await signInWithRedirect(firebaseAuth, googleProvider)
          return
        }
      }

      if (!result) {
        const { signInWithPopup, signInWithRedirect } = await import("firebase/auth")
        try {
          result = await signInWithPopup(firebaseAuth, googleProvider)
        } catch (popupError) {
          const popupCode = popupError?.code || ""
          const shouldFallbackToRedirect =
            popupCode === "auth/popup-blocked" ||
            popupCode === "auth/cancelled-popup-request" ||
            popupCode === "auth/operation-not-supported-in-this-environment"

          if (!shouldFallbackToRedirect) {
            throw popupError
          }

          await signInWithRedirect(firebaseAuth, googleProvider)
          return
        }
      }

      const user = result.user

      // Get Firebase ID token
      const idToken = await user.getIdToken()

      // Call backend to login/register via Firebase Google
      const response = await restaurantAPI.firebaseGoogleLogin(idToken)
      const data = response?.data?.data || {}

      const accessToken = data.accessToken
      const restaurant = data.restaurant
      const refreshToken = data.refreshToken

      if (!accessToken || !restaurant) {
        throw new Error("Invalid response from server")
      }

      // Store auth data for restaurant module using utility function
      setAuthData("restaurant", accessToken, restaurant, refreshToken)

      // Notify any listeners that auth state has changed
      window.dispatchEvent(new Event("restaurantAuthChanged"))
      await syncPushAfterAuth("restaurant")

      await redirectRestaurantAfterAuth(navigate, { replace: true })
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


  const processGoogleAuthenticatedUser = useCallback(async (user) => {
    if (!user || googleAuthHandledRef.current) return

    googleAuthHandledRef.current = true
    setApiError("")
    setIsSending(true)

    try {
      const idToken = await user.getIdToken()
      const response = await restaurantAPI.firebaseGoogleLogin(idToken)
      const data = response?.data?.data || {}

      const accessToken = data.accessToken
      const restaurant = data.restaurant
      const refreshToken = data.refreshToken

      if (!accessToken || !restaurant) {
        throw new Error("Invalid response from server")
      }

      setAuthData("restaurant", accessToken, restaurant, refreshToken)
      window.dispatchEvent(new Event("restaurantAuthChanged"))
      await syncPushAfterAuth("restaurant")
      await redirectRestaurantAfterAuth(navigate, { replace: true })
    } catch (error) {
      googleAuthHandledRef.current = false
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to login with Google. Please try again."
      setApiError(message)
      setIsSending(false)
    }
  }, [navigate])

  useEffect(() => {
    let cancelled = false

    const handleRedirectGoogleLogin = async () => {
      const authReady = ensureFirebaseAuthInitialized()
      if (!authReady || !firebaseAuth) return

      try {
        if (firebaseAuth.currentUser && !cancelled) {
          await processGoogleAuthenticatedUser(firebaseAuth.currentUser)
          return
        }

        const { getRedirectResult } = await import("firebase/auth")
        const redirectResult = await getRedirectResult(firebaseAuth)

        if (redirectResult?.user && !cancelled) {
          await processGoogleAuthenticatedUser(redirectResult.user)
        }
      } catch {
        // Ignore when there is no redirect flow pending
      } finally {
        if (!googleAuthHandledRef.current && !cancelled) {
          setIsSending(false)
        }
      }
    }

    handleRedirectGoogleLogin()

    return () => {
      cancelled = true
    }
  }, [processGoogleAuthenticatedUser])
  const handlePhoneChange = (e) => {
    // Only allow digits
    const value = e.target.value.replace(/\D/g, "")
    const newFormData = {
      ...formData,
      phone: value.slice(0, 15),
    }
    setFormData(newFormData)
    
    // Real-time validation
    const error = validatePhone(value, formData.countryCode)
    setErrors({ ...errors, phone: error })
    
    // Mark as touched when user starts typing
    if (!touched.phone && value.length > 0) {
      setTouched({ ...touched, phone: true })
    }
  }

  const handlePhoneBlur = () => {
    // Mark as touched on blur if not already touched
    if (!touched.phone) {
      setTouched({ ...touched, phone: true })
    }
    // Re-validate on blur
    const error = validatePhone(formData.phone, formData.countryCode)
    setErrors({ ...errors, phone: error })
  }

  const isValidPhone = !errors.phone && formData.phone.trim().length > 0
  const isValidEmail = !errors.email && formData.email.trim().length > 0
  const displayCompanyName = useMemo(() => {
    const normalized = (companyName || "MoBasket").trim()
    if (!normalized) return "MoBasket"
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }, [companyName])

  const openPolicyModal = async (type) => {
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
      fallbackUrl: type === "content" ? policyLinks.contentPolicyUrl : "",
    })

    if (type === "content") {
      setPolicyModal((prev) => ({ ...prev, loading: false }))
      return
    }

    try {
      const endpoint = type === "terms" ? API_ENDPOINTS.ADMIN.TERMS_PUBLIC : API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC
      const response = await api.get(endpoint, {
        params: type === "terms" ? { audience: "restaurant" } : undefined,
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
      {/* Top Section - Logo and Badge */}
      <div className="flex flex-col items-center pt-12 pb-8 px-6">
        {/* MoBasket Logo */}
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
        
        {/* Restaurant Partner Badge */}
        <div className="">
          <span className="text-gray-600 font-light text-sm tracking-wide block text-center">
          — restaurant partner —
          </span>
        </div>        
      </div>

      {/* Main Content - Form Section */}
      <div className="flex-1 flex flex-col px-6 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-6 py-4">
          {/* Instruction Text */}
          <div className="text-center">
            <p className="text-base text-gray-700 leading-relaxed">
              Login with mobile OTP. Enter your registered phone number to continue.
            </p>
          </div>

          {/* Phone Number Input */}
          <div className="space-y-4">
            <div className="flex gap-2 items-stretch w-full">
              {/* Country Code (India only) */}
              <div
                className="w-[100px] h-12 border border-gray-300 rounded-lg bg-gray-50 flex items-center justify-center shrink-0"
                style={{ height: "48px" }}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-700">{selectedCountry.flag}</span>
                  <span className="text-sm font-medium text-gray-900">{selectedCountry.code}</span>
                </span>
              </div>
              
              {/* Phone Number Input */}
              <div className="flex-1 flex flex-col">
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="Enter phone number"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  onBlur={handlePhoneBlur}
                className={`w-full px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 text-base border rounded-lg min-w-0 bg-white ${
                  errors.phone && formData.phone.length > 0
                    ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                }`}
                  style={{ height: "48px" }}
                />
                {errors.phone && formData.phone.length > 0 && (
                  <p className="text-red-500 text-xs mt-1 ml-1">{errors.phone}</p>
                )}
              </div>
            </div>

            {/* API error */}
            {apiError && (
              <p className="text-red-500 text-xs mt-1 ml-1">{apiError}</p>
            )}

            {/* Send OTP Button */}
            <Button
              onClick={handleSendOTP}
              disabled={!isValidPhone || isSending}
              className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${
                isValidPhone && !isSending
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {isSending ? "Sending OTP..." : "Send OTP"}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Section - Terms and Conditions */}
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












