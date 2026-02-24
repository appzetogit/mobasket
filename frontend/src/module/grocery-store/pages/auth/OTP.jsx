import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { groceryStoreAPI } from "@/lib/api"
import { setAuthData } from "@/lib/utils/auth"

export default function GroceryStoreOTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const [contactType, setContactType] = useState("phone")
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [showNameInput, setShowNameInput] = useState(false)
  const inputRefs = useRef([])

  useEffect(() => {
    const stored = sessionStorage.getItem("groceryStoreAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)
      
      if (data.method === "email" && data.email) {
        setContactType("email")
        setContactInfo(data.email)
      } else if (data.phone) {
        setContactType("phone")
        const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
        if (phoneMatch) {
          const formattedPhone = `${phoneMatch[1]}-${phoneMatch[2].replace(/\D/g, "")}`
          setContactInfo(formattedPhone)
        } else {
          setContactInfo(data.phone || "")
        }
      }
    } else {
      navigate("/store/login")
      return
    }

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
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) {
      return
    }

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

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")
    
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code")
      return
    }

    if (contactType === "email" && authData?.isSignUp && !showNameInput) {
      setShowNameInput(true)
      setError("")
      return
    }

    if (showNameInput) {
      if (!name.trim()) {
        setNameError("Please enter your store name to continue")
        return
      }
      setNameError("")
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please try logging in again.")
      }

      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      let nameToSend = null
      if (showNameInput) {
        nameToSend = name.trim()
      } else if (authData.isSignUp && authData.name) {
        nameToSend = authData.name
      }

      const response = await groceryStoreAPI.verifyOTP(phone, code, purpose, nameToSend, email)
      const data = response?.data?.data || {}

      const accessToken = data.accessToken
      const store = data.store || data.groceryStore
      const refreshToken = data.refreshToken

      if (!accessToken || !store) {
        throw new Error("Invalid response from server")
      }

      setAuthData("grocery-store", accessToken, store, refreshToken)
      window.dispatchEvent(new Event("groceryStoreAuthChanged"))

      // Check if onboarding is needed
      const onboardingStatus = store.onboarding?.completedSteps || 0
      if (onboardingStatus < 1) {
        navigate("/store/onboarding")
      } else {
        navigate("/store")
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please try logging in again.")
      }

      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      await groceryStoreAPI.sendOTP(phone, purpose, email)

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
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "Failed to resend OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col px-6 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/store/login")}
          className="self-start mb-6"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>

        <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Enter OTP</h1>
          <p className="text-gray-600 text-center mb-8">
            We sent a 6-digit code to {contactInfo}
          </p>

          {showNameInput && (
            <div className="w-full mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Store Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameError("")
                }}
                placeholder="Enter your grocery store name"
                className={`w-full px-4 py-2 border rounded-lg ${
                  nameError ? "border-red-500" : "border-gray-300"
                }`}
              />
              {nameError && (
                <p className="text-red-500 text-xs mt-1">{nameError}</p>
              )}
            </div>
          )}

          <div className="flex gap-2 mb-6">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-12 text-center text-xl font-semibold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            ))}
          </div>

          {error && (
            <p className="text-red-500 text-sm mb-4">{error}</p>
          )}

          <Button
            onClick={() => handleVerify()}
            disabled={isLoading || otp.some((d) => !d)}
            className="w-full mb-4"
          >
            {isLoading ? "Verifying..." : "Verify OTP"}
          </Button>

          <div className="text-center">
            <button
              onClick={handleResend}
              disabled={resendTimer > 0 || isLoading}
              className="text-blue-600 disabled:text-gray-400"
            >
              {resendTimer > 0
                ? `Resend OTP in ${resendTimer}s`
                : "Resend OTP"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
