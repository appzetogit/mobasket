import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import AnimatedPage from "../../../user/components/AnimatedPage"
import { Input } from "@/components/ui/input"
import { deliveryAPI } from "@/lib/api"
import { setAuthData as storeAuthData } from "@/lib/utils/auth"
import { setupWebPushForCurrentSession, syncNativeMobilePushForCurrentSession } from "@/lib/webPush"

const ensureDeliveryWebPushRegistration = async () => {
  try {
    await setupWebPushForCurrentSession("/delivery", { forceSync: true })
    await syncNativeMobilePushForCurrentSession("/delivery", { forceSync: true })
  } catch (error) {
    console.warn("Delivery web push setup failed after auth:", error?.message || error)
  }
}

export default function DeliveryOTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const inputRefs = useRef([])

  useEffect(() => {
    // Check if user is already fully authenticated
    const token = localStorage.getItem("delivery_accessToken")
    const authenticated = localStorage.getItem("delivery_authenticated") === "true"

    if (token && authenticated) {
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
          const now = Math.floor(Date.now() / 1000)

          if (payload.exp && payload.exp > now) {
            const rawUser = localStorage.getItem("delivery_user")
            if (rawUser) {
              const user = JSON.parse(rawUser)
              if (user.status === "onboarding") {
                navigate("/delivery/signup/details", { replace: true })
                return
              }
            }
            navigate("/delivery", { replace: true })
            return
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    const stored = sessionStorage.getItem("deliveryAuthData") || localStorage.getItem("deliveryAuthData")
    if (!stored) {
      navigate("/delivery/sign-in", { replace: true })
      return
    }
    const data = JSON.parse(stored)
    setAuthData(data)

    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

  useEffect(() => {
    if (inputRefs.current[0] && otp.every(digit => digit === "")) {
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 100)
    }
  }, [otp])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    if (newOtp.every((digit) => digit !== "") && newOtp.length === 6) {
      handleVerify(newOtp.join(""))
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 6).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 6) newOtp[i] = digit
    })
    setOtp(newOtp)
    if (digits.length === 6) {
      handleVerify(newOtp.join(""))
    } else {
      inputRefs.current[digits.length]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")
    if (code.length !== 6) return

    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.phone
      const mobilePushMeta = authData?.mobilePushMeta || {}
      if (!phone) {
        setError("Phone number not found.")
        setIsLoading(false)
        return
      }

      const response = await deliveryAPI.verifyOTP(phone, code, "login", null, mobilePushMeta)
      const data = response?.data?.data || {}

      if (data.needsSignup) {
        const accessToken = data.accessToken
        const refreshToken = data.refreshToken
        const user = data.user

        if (!accessToken || !user) throw new Error("Invalid response")

        storeAuthData("delivery", accessToken, user, refreshToken)
        localStorage.setItem("delivery_needsSignup", "true")
        window.dispatchEvent(new Event("deliveryAuthChanged"))
        ensureDeliveryWebPushRegistration().catch(() => {})

        setTimeout(() => {
          navigate("/delivery/signup/details", { replace: true })
        }, 200)
        setIsLoading(false)
        return
      }

      const accessToken = data.accessToken
      const refreshToken = data.refreshToken
      const user = data.user

      if (!accessToken || !user) throw new Error("Invalid response")

      sessionStorage.removeItem("deliveryAuthData")
      localStorage.removeItem("deliveryAuthData")

      storeAuthData("delivery", accessToken, user, refreshToken)
      localStorage.removeItem("delivery_needsSignup")
      window.dispatchEvent(new Event("deliveryAuthChanged"))
      ensureDeliveryWebPushRegistration().catch(() => {})

      let retryCount = 0
      const verifyAndNavigate = () => {
        const storedToken = localStorage.getItem("delivery_accessToken")
        const storedAuth = localStorage.getItem("delivery_authenticated")

        if (storedToken && storedAuth === "true") {
          navigate("/delivery", { replace: true })
        } else if (retryCount < 10) {
          retryCount++
          setTimeout(verifyAndNavigate, 100)
        } else {
          setError("Failed to save authentication.")
          setIsLoading(false)
        }
      }
      setTimeout(verifyAndNavigate, 200)
    } catch (err) {
      setError(err?.response?.data?.message || "Verification failed.")
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return
    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.phone
      if (!phone) {
        setError("Phone number not found.")
        return
      }
      await deliveryAPI.sendOTP(phone, "login")
      setResendTimer(60)
      setOtp(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError("Failed to resend OTP.")
    } finally {
      setIsLoading(false)
    }
  }

  const getPhoneNumber = () => {
    if (!authData) return ""
    const phone = authData.phone || ""
    const cleaned = phone.replace(/\s/g, "")
    if (cleaned.startsWith("+91") && cleaned.length > 3) {
      return cleaned.slice(0, 3) + "-" + cleaned.slice(3)
    }
    return cleaned
  }

  if (!authData) return null

  return (
    <AnimatedPage className="min-h-screen bg-white flex flex-col">
      <div className="relative flex items-center justify-center py-4 px-4 border-b border-gray-200">
        <button
          onClick={() => navigate("/delivery/sign-in")}
          className="absolute left-4 top-1/2 -translate-y-1/2"
        >
          <ArrowLeft className="h-5 w-5 text-black" />
        </button>
        <h1 className="text-lg font-bold text-black">OTP Verification</h1>
      </div>

      <div className="flex flex-col justify-center px-6 pt-8 pb-12">
        <div className="max-w-md mx-auto w-full space-y-8">
          <div className="text-center space-y-2">
            <p className="text-base text-black">We have sent a verification code to</p>
            <p className="text-base text-black font-medium">{getPhoneNumber()}</p>
          </div>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <div className="space-y-6">
            <div className="flex justify-center gap-2">
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  disabled={isLoading}
                  autoComplete="off"
                  className="w-12 h-12 text-center text-lg font-semibold border border-black rounded-md focus-visible:ring-0 focus-visible:border-black bg-white"
                />
              ))}
            </div>

            <div className="text-center space-y-1">
              <p className="text-sm text-black">Didn't get the OTP?</p>
              {resendTimer > 0 ? (
                <p className="text-sm text-gray-500">Resend SMS in {resendTimer}s</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isLoading}
                  className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  Resend SMS
                </button>
              )}
            </div>
          </div>

          {isLoading && (
            <div className="flex justify-center pt-4">
              <Loader2 className="h-6 w-6 text-green-500 animate-spin" />
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 mt-auto px-6 text-center pb-8">
        <button
          type="button"
          onClick={() => navigate("/delivery/sign-in")}
          className="text-sm text-[#E23744] hover:underline"
        >
          Go back to login methods
        </button>
      </div>
    </AnimatedPage>
  )
}
