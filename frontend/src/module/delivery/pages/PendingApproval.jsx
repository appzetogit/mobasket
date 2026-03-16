import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertCircle, CheckCircle2, Clock, Loader2, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { deliveryAPI } from "@/lib/api"
import { clearDeliverySignupSession } from "@/lib/utils/auth"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

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

export default function DeliveryPendingApproval() {
  const navigate = useNavigate()
  const companyName = useCompanyName()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState("Delivery Partner")
  const [status, setStatus] = useState("pending")
  const [rejectionReason, setRejectionReason] = useState("")
  const [isReverifying, setIsReverifying] = useState(false)

  const syncApprovalState = async () => {
    const response = await deliveryAPI.getProfile()
    const profile =
      response?.data?.data?.user ||
      response?.data?.user ||
      response?.data?.data?.profile ||
      response?.data?.profile ||
      null

    if (!profile) return null

    localStorage.setItem("delivery_user", JSON.stringify(profile))

    const normalizedStatus = String(profile.status || "").trim().toLowerCase()
    setUserName(profile.name || "Delivery Partner")
    setStatus(normalizedStatus || "pending")
    setRejectionReason(String(profile.rejectionReason || "").trim())

    if (profile.isActive === true || normalizedStatus === "active" || normalizedStatus === "approved") {
      navigate("/delivery", { replace: true })
      return profile
    }

    if (normalizedStatus === "onboarding") {
      navigate("/delivery/signup/details", { replace: true })
      return profile
    }

    if (normalizedStatus && !PENDING_STATUSES.has(normalizedStatus)) {
      navigate("/delivery", { replace: true })
    }

    return profile
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        await syncApprovalState()
      } catch (error) {
        if (!cancelled) {
          console.error("Error syncing delivery approval status:", error)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = () => {
    clearDeliverySignupSession()
    navigate("/delivery/sign-in", { replace: true })
  }

  const handleReverify = async () => {
    try {
      setIsReverifying(true)
      await deliveryAPI.reverify()
      await syncApprovalState()
      alert("Re-verification request submitted successfully.")
    } catch (error) {
      alert(error?.response?.data?.message || "Failed to submit re-verification request.")
    } finally {
      setIsReverifying(false)
    }
  }

  const isRejected = status === "rejected" || status === "declined" || status === "blocked" || Boolean(rejectionReason)

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-7">
        {loading ? (
          <div className="py-14 flex flex-col items-center gap-3 text-slate-600">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Checking verification status...</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-5">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isRejected ? "bg-red-100" : "bg-blue-100"}`}>
                {isRejected ? (
                  <AlertCircle className="w-7 h-7 text-red-600" />
                ) : (
                  <Clock className="w-7 h-7 text-blue-600" />
                )}
              </div>
            </div>

            <div className="text-center mb-6">
              <h1 className="text-xl font-bold text-slate-900">
                {isRejected ? "Verification Rejected" : "Verification In Progress"}
              </h1>
              <p className="text-sm text-slate-600 mt-2">
                Hi <span className="font-semibold text-slate-900">{userName}</span>, your {companyName} delivery profile is{" "}
                {isRejected ? "not approved yet." : "under review."}
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600">Your onboarding details were submitted successfully.</p>
              </div>
              {isRejected ? (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-xs font-semibold text-red-800">Reason</p>
                  <p className="text-xs text-red-700 mt-1">{rejectionReason || "Please update your details and request re-verification."}</p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-800">Verification usually completes within 24-48 hours.</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {isRejected && (
                <>
                  <Button
                    onClick={() => navigate("/delivery/signup/details")}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Update Details
                  </Button>
                  <Button
                    onClick={handleReverify}
                    disabled={isReverifying}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isReverifying ? "Sending..." : "Send for Re-verification"}
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                onClick={handleLogout}
                className="w-full"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
