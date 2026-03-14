import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { 
  ChevronLeft, 
  Search, 
  Power, 
  Utensils, 
  Building2, 
  FileText, 
  Wallet,
  ChevronRight,
  Languages,
  ClipboardList
} from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import { toast } from "sonner"

export default function HelpCentre() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [language, setLanguage] = useState("en")
  const isStore = location.pathname.startsWith("/store")
  const baseRoute = isStore ? "/store" : "/restaurant"

  const helpTopics = [
    {
      id: 1,
      icon: Power,
      title: "Outlet online / offline status",
      subtitle: "Current status & details",
      path: `${baseRoute}/delivery-settings`
    },
    {
      id: 2,
      icon: Utensils,
      title: "Order related issues",
      subtitle: "Cancellations & delivery related concerns",
      path: `${baseRoute}/orders/all`
    },
    {
      id: 3,
      icon: Building2,
      title: isStore ? "Store" : "Restaurant",
      subtitle: "Timings, contacts, FSSAI, bank details, location etc.",
      path: `${baseRoute}/outlet-info`
    },
    {
      id: 5,
      icon: FileText,
      title: "Menu",
      subtitle: "Items, photos, prices, charges etc.",
      path: isStore ? "/store/products/all" : "/restaurant/hub-menu"
    },
    {
      id: 6,
      icon: Wallet,
      title: "Payments",
      subtitle: "Statement of account, invoices etc.",
      path: isStore ? "/store/wallet" : "/restaurant/hub-finance"
    }
  ]

  const filteredTopics = helpTopics.filter(topic =>
    topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    topic.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const copyHelpSummary = async () => {
    const lines = filteredTopics.map((topic, index) => `${index + 1}. ${topic.title} - ${topic.subtitle}`)
    const textToCopy = lines.length > 0
      ? `Help topics:\n${lines.join("\n")}`
      : "No help topics available."

    try {
      await navigator.clipboard.writeText(textToCopy)
      toast.success("Copied help topics")
    } catch (error) {
      console.error("Failed to copy help topics:", error)
      toast.error("Unable to copy right now")
    }
  }

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "en" ? "hi" : "en"))
  }

  const translations = {
    en: {
      header: "Help centre",
      prompt: "How can we help you",
      search: "Search by issue",
      noResults: `No help topics found matching "${searchQuery}"`,
    },
    hi: {
      header: "सहायता केंद्र",
      prompt: "हम आपकी कैसे मदद कर सकते हैं",
      search: "समस्या खोजें",
      noResults: `"${searchQuery}" के लिए कोई सहायता विषय नहीं मिला`,
    },
  }

  const t = translations[language] || translations.en

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white z-50 border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">{t.header}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleLanguage}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Toggle language"
            >
              <Languages className="w-6 h-6 text-gray-700" />
            </button>
            <button
              onClick={copyHelpSummary}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Copy help topics"
            >
              <ClipboardList className="w-6 h-6 text-gray-700" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* How can we help you section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            {t.prompt}
          </h2>
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.search}
              className="w-full pl-10 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
        </div>

        {/* Help Topics List */}
        <div className="space-y-1">
          {filteredTopics.map((topic, index) => {
            const IconComponent = topic.icon
            return (
              <motion.button
                key={topic.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="w-full flex items-center gap-4 px-0 py-4 border-b border-gray-200 hover:bg-gray-50 transition-colors text-left"
                onClick={() => {
                  if (topic.path) {
                    navigate(topic.path)
                  }
                }}
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  <IconComponent className="w-6 h-6 text-gray-900" />
                </div>

                {/* Text Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
                    {topic.title}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {topic.subtitle}
                  </p>
                </div>

                {/* Navigation Arrow */}
                <div className="flex-shrink-0">
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* No results message */}
        {filteredTopics.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">
              {t.noResults}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNavOrders />
    </div>
  )
}
