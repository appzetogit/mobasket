import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"
import { deliveryAPI } from "@/lib/api"
import { firebaseAuth, googleProvider, ensureFirebaseAuthInitialized } from "@/lib/firebase"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"
import { setAuthData } from "@/lib/utils/auth"
import PolicyModal from "@/components/legal/PolicyModal"
import {
  getNativeMobilePushMetaForCurrentSession,
  setupWebPushForCurrentSession,
  syncNativeMobilePushForCurrentSession,
} from "@/lib/webPush"

const PENDING_STATUSES = new Set([
  "pending",
  "rejected",
  "declined",
  "blocked",
  "submitted",
  "verification_pending",
  "in_review",
  "under_review",
])

const ensureDeliveryWebPushRegistration = async () => {
  try {
    await setupWebPushForCurrentSession("/delivery", { forceSync: true })
    await syncNativeMobilePushForCurrentSession("/delivery", { forceSync: true })
  } catch (error) {
    console.warn("Delivery web push setup failed after Google auth:", error?.message || error)
  }
}

export default function DeliverySignIn() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [termsUrl, setTermsUrl] = useState("")
  const [policyModal, setPolicyModal] = useState({
    open: false,
    title: "Terms and Conditions",
    loading: false,
    content: "",
    fallbackUrl: "",
  })
  const redirectHandledRef = useRef(false)

  const getFirebaseAuthInstance = () => {
    const isInitialized = ensureFirebaseAuthInitialized()
    if (!isInitialized || !firebaseAuth || !googleProvider) {
      return null
    }
    return firebaseAuth
  }

  const getDeliveryProfileFromResponse = (response) => {
    return (
      response?.data?.data?.user ||
      response?.data?.user ||
      response?.data?.data?.profile ||
      response?.data?.profile ||
      null
    )
  }

  const syncDeliveryProfile = async () => {
    const response = await deliveryAPI.getProfile()
    const profile = getDeliveryProfileFromResponse(response)
    if (profile) {
      localStorage.setItem("delivery_user", JSON.stringify(profile))
    }
    return profile
  }

  const finalizeGoogleSignIn = async (firebaseUser) => {
    if (redirectHandledRef.current) {
      return
    }

    redirectHandledRef.current = true
    setError("")
    setIsLoading(true)

    try {
      const idToken = await firebaseUser.getIdToken()

      let mobilePushMeta = {}
      try {
        mobilePushMeta = await getNativeMobilePushMetaForCurrentSession("/delivery")
      } catch {
        mobilePushMeta = {}
      }

      const response = await deliveryAPI.firebaseGoogleLogin(idToken, mobilePushMeta)
      const data = response?.data?.data || {}
      const accessToken = data.accessToken
      const refreshToken = data.refreshToken
      const deliveryUser = data.user

      if (!accessToken || !deliveryUser) {
        throw new Error("Invalid response from server")
      }

      setAuthData("delivery", accessToken, deliveryUser, refreshToken)

      const profile = (await syncDeliveryProfile().catch(() => null)) || deliveryUser
      const normalizedStatus = String(profile?.status || "").trim().toLowerCase()
      const isApproved =
        profile?.isActive === true ||
        normalizedStatus === "active" ||
        normalizedStatus === "approved"

      if (normalizedStatus === "onboarding") {
        localStorage.setItem("delivery_needsSignup", "true")
      } else {
        localStorage.removeItem("delivery_needsSignup")
      }

      window.dispatchEvent(new Event("deliveryAuthChanged"))
      ensureDeliveryWebPushRegistration().catch(() => {})

      if (normalizedStatus === "onboarding") {
        navigate("/delivery/signup/details", { replace: true })
        return
      }

      if (!isApproved && PENDING_STATUSES.has(normalizedStatus)) {
        navigate("/delivery/pending-approval", { replace: true })
        return
      }

      navigate("/delivery", { replace: true })
    } catch (err) {
      console.error("Delivery Google sign-in error:", err)
      redirectHandledRef.current = false
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to sign in with Google. Please try again."
      setError(message)
      setIsLoading(false)
    }
  }

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

  useEffect(() => {
    let unsubscribe = null
    let cancelled = false

    const handleRedirectResult = async () => {
      try {
        const auth = getFirebaseAuthInstance()
        if (!auth || redirectHandledRef.current) {
          if (!cancelled) {
            setIsLoading(false)
          }
          return
        }

        const { getRedirectResult, onAuthStateChanged } = await import("firebase/auth")

        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (user && !redirectHandledRef.current) {
            await finalizeGoogleSignIn(user)
          } else if (!user) {
            redirectHandledRef.current = false
          }
        })

        if (auth.currentUser && !redirectHandledRef.current) {
          await finalizeGoogleSignIn(auth.currentUser)
          return
        }

        const result = await Promise.race([
          getRedirectResult(auth),
          new Promise((resolve) => {
            setTimeout(() => resolve(null), 3000)
          }),
        ])

        if (result?.user && !redirectHandledRef.current) {
          await finalizeGoogleSignIn(result.user)
        } else if (!cancelled) {
          setIsLoading(false)
        }
      } catch (err) {
        if (cancelled) return

        redirectHandledRef.current = false
        const message =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Google sign-in failed. Please try again."
        setError(message)
        setIsLoading(false)
      }
    }

    handleRedirectResult()

    return () => {
      cancelled = true
      if (unsubscribe) {
        unsubscribe()
      }
    }
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

  const handleGoogleSignIn = async () => {
    setError("")
    setIsLoading(true)
    redirectHandledRef.current = false

    try {
      const auth = getFirebaseAuthInstance()
      if (!auth) {
        throw new Error("Firebase Auth is not configured. Please verify Firebase settings in Admin > Env Setup.")
      }

      const { signInWithPopup, signInWithRedirect } = await import("firebase/auth")
      googleProvider.setCustomParameters({ prompt: "select_account" })

      try {
        const popupResult = await signInWithPopup(auth, googleProvider)
        if (popupResult?.user) {
          await finalizeGoogleSignIn(popupResult.user)
          return
        }
      } catch (popupError) {
        const popupCode = popupError?.code || ""
        const shouldFallbackToRedirect =
          popupCode === "auth/popup-blocked" ||
          popupCode === "auth/cancelled-popup-request" ||
          popupCode === "auth/operation-not-supported-in-this-environment"

        if (popupCode === "auth/popup-closed-by-user") {
          setError("Sign-in was cancelled. Please try again.")
          setIsLoading(false)
          return
        }

        if (!shouldFallbackToRedirect) {
          throw popupError
        }

        await signInWithRedirect(auth, googleProvider)
        return
      }
    } catch (err) {
      console.error("Google sign-in start failed:", err)
      redirectHandledRef.current = false
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to sign in with Google. Please try again."
      setError(message)
      setIsLoading(false)
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
              Continue with Google to access your delivery account
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-center">
            <p className="text-sm text-gray-600">
              Email sign-in has been removed from this screen. Use your Google account to continue.
            </p>
          </div>

          {error && (
            <p className="text-sm text-center text-red-500">
              {error}
            </p>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-lg font-bold text-base border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
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
              <span>{isLoading ? "Signing in..." : "Continue with Google"}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/delivery/signup")}
              className="w-full py-4 rounded-lg font-semibold text-base border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              New delivery partner? Complete onboarding
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section - Terms */}
      <div className="px-6 pb-8 pt-4">
        <div className="w-full max-w-md mx-auto space-y-4">
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

