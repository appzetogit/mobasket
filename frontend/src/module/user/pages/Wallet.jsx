import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, IndianRupee, Plus, ArrowDownCircle, ArrowUpCircle, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import AnimatedPage from "../components/AnimatedPage"
import AddMoneyModal from "../components/AddMoneyModal"
import { userAPI } from "@/lib/api"
import { toast } from "sonner"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

// Transaction types
const TRANSACTION_TYPES = {
  ALL: 'all',
  ADDITIONS: 'additions',
  DEDUCTIONS: 'deductions',
  REFUNDS: 'refunds'
}

export default function Wallet() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [selectedFilter, setSelectedFilter] = useState(TRANSACTION_TYPES.ALL)
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addMoneyModalOpen, setAddMoneyModalOpen] = useState(false)

  // Fetch wallet data
  const fetchWalletData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await userAPI.getWallet()
      const walletData = response?.data?.data?.wallet || response?.data?.wallet

      if (walletData) {
        setWallet(walletData)
        setTransactions(walletData.transactions || [])
      }
    } catch (err) {
      console.error('Error fetching wallet:', err)
      setError(err?.response?.data?.message || 'Failed to load wallet')
      toast.error('Failed to load wallet data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWalletData()
  }, [])

  // Get current balance from wallet
  const currentBalance = wallet?.balance || 0

  // Filter transactions based on selected filter
  const filteredTransactions = useMemo(() => {
    if (selectedFilter === TRANSACTION_TYPES.ALL) {
      return transactions
    }
    return transactions.filter(transaction => {
      if (selectedFilter === TRANSACTION_TYPES.ADDITIONS) {
        return transaction.type === 'addition'
      } else if (selectedFilter === TRANSACTION_TYPES.DEDUCTIONS) {
        return transaction.type === 'deduction'
      } else if (selectedFilter === TRANSACTION_TYPES.REFUNDS) {
        return transaction.type === 'refund'
      }
      return true
    })
  }, [selectedFilter, transactions])

  const formatAmount = (amount) => {
    return `₹${amount.toLocaleString('en-IN')}`
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    const formattedDate = date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const formattedTime = date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
    return `${formattedDate} • ${formattedTime}`
  }

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'addition':
        return <ArrowDownCircle className="h-6 w-6 md:h-7 md:w-7 lg:h-8 lg:w-8 text-[#EF4F5F] dark:text-[#EF4F5F]" />
      case 'deduction':
        return <ArrowUpCircle className="h-6 w-6 md:h-7 md:w-7 lg:h-8 lg:w-8 text-[#EF4F5F] dark:text-[#EF4F5F]" />
      case 'refund':
        return <RefreshCw className="h-6 w-6 md:h-7 md:w-7 lg:h-8 lg:w-8 text-blue-600 dark:text-blue-400" />
      default:
        return null
    }
  }

  const getTransactionColor = (type) => {
    switch (type) {
      case 'addition':
        return 'text-[#EF4F5F] dark:text-[#EF4F5F]'
      case 'deduction':
        return 'text-[#EF4F5F] dark:text-[#EF4F5F]'
      case 'refund':
        return 'text-blue-600 dark:text-blue-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-white dark:bg-[#1a1a1a] sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 px-4 sm:px-6 md:px-8 lg:px-10 py-4 md:py-5">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-gray-700 dark:text-white" />
            </button>
            <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">Wallet</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-6 md:py-8 lg:py-10 space-y-6 md:space-y-8">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12 md:py-16 lg:py-20">
            <Loader2 className="h-8 w-8 md:h-10 md:w-10 animate-spin text-gray-600 dark:text-gray-400" />
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-[#EF4F5F]/10 dark:bg-[#EF4F5F]/20 border border-[#EF4F5F]/30 dark:border-[#EF4F5F]/30 rounded-lg p-4 md:p-6">
            <p className="text-[#EF4F5F] dark:text-[#EF4F5F] text-sm md:text-base">{error}</p>
          </div>
        )}

        {/* Wallet Content - Only show if not loading and no error */}
        {!loading && !error && (
          <>
            {/* Wallet Info Section */}
            <div className="space-y-5 md:space-y-6">
              <div className="relative rounded-2xl bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 p-4 md:p-6">
                {/* Top Banner */}
                <div className="relative mb-8 md:mb-10">
                  <div className="h-16 md:h-[72px] lg:h-20 rounded-2xl bg-[#EF4F5F]/20 dark:bg-[#EF4F5F]/25 flex items-center justify-center pl-20 md:pl-24 pr-4 transform rotate-[-3deg] origin-left">
                    <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white text-center">
                      {companyName} Money
                    </h2>
                  </div>

                  {/* Wallet Icon */}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2">
                    <div className="w-16 h-16 md:w-[72px] md:h-[72px] lg:w-20 lg:h-20 bg-gradient-to-br from-[#EF4F5F] via-[#EF4F5F] to-[#EF4F5F] rounded-xl flex items-center justify-center shadow-lg transform rotate-[-5deg]">
                      <div className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm border border-white/20">
                        <IndianRupee className="h-8 w-8 md:h-9 md:w-9 lg:h-10 lg:w-10 text-white" strokeWidth={2.5} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Current Balance */}
                <div className="text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm lg:text-base mb-1">Current Balance</p>
                  <p className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white">{formatAmount(currentBalance)}</p>
                  <p className="mt-2 text-gray-500 dark:text-gray-400 text-xs md:text-sm lg:text-base">
                    Add money to enjoy one-tap, seamless payments
                  </p>
                </div>
              </div>

              {/* Add Money Button */}
              <div className="w-full">
                <Button
                  className="w-full h-12 md:h-14 lg:h-16 bg-[#EF4F5F] hover:bg-[#EF4F5F]/90 dark:bg-[#EF4F5F] dark:hover:bg-[#EF4F5F]/90 text-white font-semibold text-sm md:text-base lg:text-lg rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
                  onClick={() => setAddMoneyModalOpen(true)}
                >
                  <Plus className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6" />
                  Add money
                </Button>
              </div>
            </div>

            {/* Transaction History Section */}
            <div className="space-y-4 md:space-y-6 lg:space-y-8">
              {/* Header with Title and Filters */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-6">
                <h2 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
                  TRANSACTION HISTORY
                </h2>

                {/* Filter Tabs */}
                <div className="flex gap-2 md:gap-3 overflow-x-auto md:overflow-x-visible scrollbar-hide pb-2 md:pb-0">
                  {[
                    { id: TRANSACTION_TYPES.ALL, label: 'All Transactions' },
                    { id: TRANSACTION_TYPES.ADDITIONS, label: 'Additions' },
                    { id: TRANSACTION_TYPES.DEDUCTIONS, label: 'Deductions' },
                    { id: TRANSACTION_TYPES.REFUNDS, label: 'Refunds' },
                  ].map((filter) => {
                    const isSelected = selectedFilter === filter.id
                    return (
                      <button
                        key={filter.id}
                        onClick={() => setSelectedFilter(filter.id)}
                        className={`px-4 md:px-5 lg:px-6 py-2 md:py-2.5 lg:py-3 rounded-lg md:rounded-xl text-xs md:text-sm lg:text-base font-medium whitespace-nowrap flex-shrink-0 transition-all ${isSelected
                          ? 'bg-white dark:bg-[#1a1a1a] border-2 border-[#EF4F5F] dark:border-[#EF4F5F] text-[#EF4F5F] dark:text-[#EF4F5F] shadow-sm'
                          : 'bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm'
                          }`}
                      >
                        {filter.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Transactions List */}
              {filteredTransactions.length > 0 ? (
                <div className="space-y-3 md:space-y-4">
                  {filteredTransactions.map((transaction) => (
                    <Card key={transaction.id} className="py-0 border border-gray-100 dark:border-gray-800 shadow-sm dark:bg-[#1a1a1a] hover:shadow-md transition-all duration-200 cursor-pointer">
                      <CardContent className="p-4 md:p-5 lg:p-6">
                        <div className="flex items-center justify-between gap-4 md:gap-6">
                          <div className="flex items-center gap-4 md:gap-5 lg:gap-6 flex-1 min-w-0">
                            {/* Icon */}
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800/50">
                                {getTransactionIcon(transaction.type)}
                              </div>
                            </div>

                            {/* Transaction Details */}
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-900 dark:text-white font-semibold text-sm md:text-base lg:text-lg truncate mb-1">
                                {transaction.description}
                              </p>
                              <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm lg:text-base">
                                {formatDate(transaction.date || transaction.createdAt)}
                              </p>
                            </div>
                          </div>

                          {/* Amount */}
                          <div className={`flex-shrink-0 font-bold text-lg md:text-xl lg:text-2xl ${getTransactionColor(transaction.type)}`}>
                            {transaction.type === 'deduction' ? '-' : '+'}
                            {formatAmount(transaction.amount)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                /* Empty State */
                <div className="py-12 md:py-16 lg:py-20 xl:py-24">
                  {/* Placeholder Cards */}
                  <div className="space-y-3 md:space-y-4 mb-6 md:mb-8 max-w-2xl mx-auto">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 md:gap-4 bg-gray-100 dark:bg-gray-800 rounded-xl px-4 md:px-5 lg:px-6 py-3 md:py-4"
                        style={{
                          opacity: 0.3 + (i * 0.15)
                        }}
                      >
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 md:h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                          <div className="h-2 md:h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base lg:text-lg text-center font-medium">
                    Your transactions will appear here
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add Money Modal */}
      <AddMoneyModal
        open={addMoneyModalOpen}
        onOpenChange={setAddMoneyModalOpen}
        onSuccess={fetchWalletData}
      />
    </AnimatedPage>
  )
}

