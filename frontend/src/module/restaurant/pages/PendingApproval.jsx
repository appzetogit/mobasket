import { useState, useEffect, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import { Clock, CheckCircle2, PhoneCall, LogOut, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clearRestaurantSignupSession, clearStoreSignupSession } from "@/lib/utils/auth"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { groceryStoreAPI, restaurantAPI } from "@/lib/api"

export default function PendingApproval() {
    const navigate = useNavigate()
    const location = useLocation()
    const companyName = useCompanyName()
    const [userName, setUserName] = useState("Restaurant Owner")
    const [verificationStatus, setVerificationStatus] = useState("pending")
    const [rejectionReason, setRejectionReason] = useState("")
    const [isReverifying, setIsReverifying] = useState(false)
    const isStore = location.pathname.startsWith("/store")

    useEffect(() => {
        try {
            const module = isStore ? "grocery-store" : "restaurant"
            const userData = localStorage.getItem(`${module}_user`)
            if (userData) {
                const user = JSON.parse(userData)
                setUserName(user.ownerName || user.name || "Restaurant Owner")
            }
        } catch (error) {
            console.error("Error loading user data:", error)
        }
    }, [isStore])

    const syncApprovalState = useCallback(async () => {
        const response = isStore
            ? await groceryStoreAPI.getCurrentStore()
            : await restaurantAPI.getCurrentRestaurant()

        const entity = isStore
            ? (response?.data?.data?.store || response?.data?.store || response?.data?.data?.restaurant || response?.data?.restaurant)
            : (response?.data?.data?.restaurant || response?.data?.restaurant)

        if (!entity) {
            return null
        }

        const module = isStore ? "grocery-store" : "restaurant"
        const normalizedStatus = String(entity.status || "").trim().toLowerCase()
        const completedOnboardingSteps = Number(entity?.onboarding?.completedSteps || 0)
        localStorage.setItem(`${module}_user`, JSON.stringify(entity))
        setUserName(entity.ownerName || entity.name || "Restaurant Owner")
        setVerificationStatus(normalizedStatus || "pending")
        setRejectionReason(String(entity.rejectionReason || "").trim())

        if (entity.isActive === true) {
            navigate(isStore ? "/store" : "/restaurant", { replace: true })
            return entity
        }

        if (normalizedStatus === "onboarding" && completedOnboardingSteps < 4) {
            navigate(isStore ? "/store/onboarding?step=1" : "/restaurant/onboarding?step=1", { replace: true })
            return entity
        }

        const approvalStates = new Set([
            "onboarding",
            "pending",
            "rejected",
            "declined",
            "blocked",
            "submitted",
            "verification_pending",
            "in_review",
            "under_review",
        ])
        if (normalizedStatus && !approvalStates.has(normalizedStatus)) {
            navigate(isStore ? "/store" : "/restaurant", { replace: true })
        }

        return entity
    }, [isStore, navigate])

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            try {
                await syncApprovalState()
            } catch (error) {
                if (!cancelled) {
                    console.error("Error syncing approval status:", error)
                }
            }
        }

        load()

        return () => {
            cancelled = true
        }
    }, [syncApprovalState])

    const handleLogout = () => {
        if (isStore) {
            clearStoreSignupSession()
        } else {
            clearRestaurantSignupSession()
        }
        navigate(isStore ? "/store/login" : "/restaurant/login", { replace: true })
    }

    const handleEditDetails = () => {
        navigate(isStore ? "/store/onboarding?step=1" : "/restaurant/onboarding?step=1")
    }

    const handleReverify = async () => {
        try {
            setIsReverifying(true)
            if (isStore) {
                await groceryStoreAPI.reverify()
            } else {
                await restaurantAPI.reverify()
            }
            await syncApprovalState()
            alert(`${isStore ? "Store" : "Restaurant"} re-verification submitted successfully.`)
        } catch (error) {
            const message = error?.response?.data?.message || "Failed to send re-verification request. Please try again."
            alert(message)
        } finally {
            setIsReverifying(false)
        }
    }

    const isRejected =
        verificationStatus === "rejected" ||
        verificationStatus === "declined" ||
        verificationStatus === "blocked"

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
            {/* Decorative Circles */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-3xl opacity-50 z-0"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-100 rounded-full blur-3xl opacity-50 z-0"></div>

            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 relative z-10 border border-slate-100">
                {/* Animated Icon */}
                <div className="flex justify-center mb-8">
                    <div className="relative">
                        <motion.div
                            className="absolute inset-0 bg-blue-100 rounded-full"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1.5, opacity: 0 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        ></motion.div>
                        <motion.div
                            className={`w-20 h-20 rounded-full flex items-center justify-center relative z-10 shadow-lg ${
                                isRejected ? "bg-red-600 shadow-red-200" : "bg-blue-600 shadow-blue-200"
                            }`}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        >
                            {isRejected ? <AlertCircle className="w-10 h-10 text-white" /> : <Clock className="w-10 h-10 text-white" />}
                        </motion.div>
                    </div>
                </div>

                {/* Text Content */}
                <div className="text-center space-y-4 mb-8">
                    <motion.h1
                        className="text-2xl font-bold text-slate-900"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        {isRejected ? "Verification Rejected" : "Registration Submitted!"}
                    </motion.h1>
                    <motion.p
                        className="text-slate-600 leading-relaxed"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        Hi <span className="font-semibold text-slate-900">{userName}</span>, {
                            isRejected
                                ? `your ${isStore ? "store" : "restaurant"} verification for ${companyName} was rejected.`
                                : `your registration for ${companyName} is currently under review.`
                        }
                    </motion.p>
                </div>

                {/* Steps Info */}
                <div className="space-y-4 mb-8">
                    <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm text-slate-900">Application Submitted</p>
                            <p className="text-xs text-slate-500">All documents and details have been received successfully.</p>
                        </div>
                    </div>
                    {isRejected ? (
                        <div className="flex items-start gap-4 p-4 bg-red-50 rounded-2xl border border-red-100">
                            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                <AlertCircle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-red-900">Reason for rejection</p>
                                <p className="text-xs text-red-700 whitespace-pre-line">{rejectionReason || "Please review your submitted details and update them."}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                <Clock className="w-5 h-5 text-blue-600 animate-pulse" />
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-slate-900">Verification in Progress</p>
                                <p className="text-xs text-slate-500">Our team is verifying your details. This usually takes 24-48 hours.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    {isRejected && (
                        <>
                            <Button
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 rounded-2xl font-bold"
                                onClick={handleEditDetails}
                            >
                                Submit details again
                            </Button>
                            <Button
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 rounded-2xl font-bold flex items-center justify-center gap-2"
                                onClick={handleReverify}
                                disabled={isReverifying}
                            >
                                {isReverifying ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    "Send for Re-verification"
                                )}
                            </Button>
                        </>
                    )}
                    <Button
                        className="w-full bg-slate-900 hover:bg-black text-white py-6 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg"
                        onClick={() => window.open('tel:+919876543210', '_self')}
                    >
                        <PhoneCall className="w-5 h-5" />
                        Contact Support
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full text-slate-500 hover:text-slate-900 py-4 font-medium flex items-center justify-center gap-2"
                        onClick={handleLogout}
                    >
                        <LogOut className="w-4 h-4" />
                        Logout & Sign In Later
                    </Button>
                </div>
            </div>

            {/* Footer Branding */}
            <motion.div
                className="mt-12 text-slate-400 text-sm font-medium flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
            >
                <div className="w-8 h-[1px] bg-slate-200"></div>
                {companyName.toUpperCase()} PARTNER
                <div className="w-8 h-[1px] bg-slate-200"></div>
            </motion.div>
        </div>
    )
}
