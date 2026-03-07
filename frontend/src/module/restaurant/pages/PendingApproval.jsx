import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import { Clock, CheckCircle2, PhoneCall, LogOut, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clearRestaurantSignupSession, clearStoreSignupSession } from "@/lib/utils/auth"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

export default function PendingApproval() {
    const navigate = useNavigate()
    const location = useLocation()
    const companyName = useCompanyName()
    const [userName, setUserName] = useState("Restaurant Owner")
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

    const handleLogout = () => {
        if (isStore) {
            clearStoreSignupSession()
        } else {
            clearRestaurantSignupSession()
        }
        navigate(isStore ? "/store/login" : "/restaurant/login", { replace: true })
    }

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
                            className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center relative z-10 shadow-lg shadow-blue-200"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        >
                            <Clock className="w-10 h-10 text-white" />
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
                        Registration Submitted!
                    </motion.h1>
                    <motion.p
                        className="text-slate-600 leading-relaxed"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        Hi <span className="font-semibold text-slate-900">{userName}</span>, your registration for {companyName} is currently under review.
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
                    <div className="flex items-start gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                            <Clock className="w-5 h-5 text-blue-600 animate-pulse" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm text-slate-900">Verification in Progress</p>
                            <p className="text-xs text-slate-500">Our team is verifying your details. This usually takes 24-48 hours.</p>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
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
