/**
 * Delivery Wallet State Management Utility
 * Fetches wallet data from API instead of using localStorage/default data
 */

import { deliveryAPI } from '@/lib/api'

// Empty wallet state structure (no default data)
const EMPTY_WALLET_STATE = {
  totalBalance: 0,
  cashInHand: 0,
  deductions: 0,
  totalCashLimit: 0,
  availableCashLimit: 0,
  cashLimitUsed: 0,
  codLimit: 0,
  cashCollected: 0,
  remainingLimit: 0,
  canDeposit: false,
  totalWithdrawn: 0,
  totalEarned: 0,
  transactions: [],
  joiningBonusClaimed: false,
  joiningBonusAmount: 0
}

/**
 * Fetch wallet data from API
 * @returns {Promise<Object>} - Wallet state object
 */
export const fetchDeliveryWallet = async () => {
  try {
    console.log('🚀 Starting wallet fetch...')
    const response = await deliveryAPI.getWallet()
    console.log('🔍 Full API Response:', JSON.stringify(response, null, 2))
    console.log('🔍 Response Status:', response?.status)
    console.log('🔍 Response Data:', response?.data)
    console.log('🔍 Response Data Type:', typeof response?.data)

    // Check multiple possible response structures
    let walletData = null

    if (response?.data?.success && response?.data?.data?.wallet) {
      walletData = response.data.data.wallet
      console.log('✅ Found wallet in: response.data.data.wallet')
    } else if (response?.data?.wallet) {
      walletData = response.data.wallet
      console.log('✅ Found wallet in: response.data.wallet')
    } else if (response?.data?.data) {
      walletData = response.data.data
      console.log('✅ Found wallet in: response.data.data')
    } else if (response?.data) {
      walletData = response.data
      console.log('✅ Found wallet in: response.data')
    }

    if (walletData && typeof walletData === 'object') {
      console.log('💰 Wallet Data from API:', JSON.stringify(walletData, null, 2))
      console.log('💰 Total Balance:', walletData.totalBalance)
      console.log('💰 Cash In Hand:', walletData.cashInHand)
      console.log('💰 Total Earned:', walletData.totalEarned)
      console.log('💰 Transactions Count:', walletData.transactions?.length || walletData.recentTransactions?.length || 0)
      console.log('💰 Transactions:', walletData.transactions || walletData.recentTransactions || [])

      const transformedTotalCashLimit = Number.isFinite(Number(walletData.totalCashLimit))
        ? Number(walletData.totalCashLimit)
        : (Number.isFinite(Number(walletData.codLimit)) ? Number(walletData.codLimit) : 750)
      const transformedCashInHand = Number(
        walletData.cashInHand ??
        walletData.cash_in_hand ??
        walletData.cashCollected ??
        walletData.codCashCollected
      ) || 0
      const transformedDeductions = Number(walletData.deductions) || 0
      const transformedCashCollected = Number(
        walletData.cashCollected ??
        walletData.codCashCollected ??
        walletData.cashInHand ??
        walletData.cash_in_hand
      ) || 0
      const transformedRemainingLimit = Number.isFinite(Number(walletData.remainingLimit))
        ? Number(walletData.remainingLimit)
        : Math.max(0, transformedTotalCashLimit - transformedCashCollected)
      const transformedAvailableCashLimit =
        Number.isFinite(Number(walletData.availableCashLimit))
          ? Number(walletData.availableCashLimit)
          : transformedRemainingLimit
      const transformedCashLimitUsed = transformedCashCollected

      const rawTransactions = walletData.transactions ?? walletData.recentTransactions ?? []
      const normalizedTransactions = Array.isArray(rawTransactions)
        ? rawTransactions
        : Array.isArray(rawTransactions?.transactions)
          ? rawTransactions.transactions
          : Array.isArray(rawTransactions?.items)
            ? rawTransactions.items
            : []

      // Transform API response to match expected format (support both camelCase and snake_case)
      const transformedData = {
        totalBalance: Number(walletData.totalBalance) || 0,
        cashInHand: transformedCashInHand,
        deductions: transformedDeductions,
        totalWithdrawn: Number(walletData.totalWithdrawn) || 0,
        totalEarned: Number(walletData.totalEarned) || 0,
        totalCashLimit: transformedTotalCashLimit,
        availableCashLimit: transformedAvailableCashLimit,
        cashLimitUsed: transformedCashLimitUsed,
        codLimit: Number.isFinite(Number(walletData.codLimit)) ? Number(walletData.codLimit) : transformedTotalCashLimit,
        cashCollected: transformedCashCollected,
        remainingLimit: transformedRemainingLimit,
        canDeposit: Boolean(walletData.canDeposit ?? (transformedCashCollected > 0)),
        deliveryWithdrawalLimit: Number(walletData.deliveryWithdrawalLimit ?? walletData.delivery_withdrawal_limit) || 100,
        deliveryMinimumWalletBalance: Number(walletData.deliveryMinimumWalletBalance ?? walletData.delivery_minimum_wallet_balance) || 0,
        // Pocket balance = total balance (includes bonus)
        pocketBalance: walletData.pocketBalance !== undefined ? Number(walletData.pocketBalance) : (Number(walletData.totalBalance) || 0),
        pendingWithdrawals: walletData.pendingWithdrawals || 0,
        joiningBonusClaimed: walletData.joiningBonusClaimed || false,
        joiningBonusAmount: walletData.joiningBonusAmount || 0,
        // Normalize to a plain array to avoid .filter/.map runtime crashes in UI pages.
        transactions: normalizedTransactions,
        totalTransactions: walletData.totalTransactions || 0
      }

      console.log('✅ Transformed Wallet Data:', JSON.stringify(transformedData, null, 2))
      return transformedData
    } else {
      console.warn('⚠️ No wallet data found in response')
      console.warn('⚠️ Response structure:', Object.keys(response?.data || {}))
      console.warn('⚠️ Full response:', response)
    }

    const missingPayloadError = new Error('Wallet payload missing in API response')
    missingPayloadError.isWalletFetchError = true
    throw missingPayloadError
  } catch (error) {
    // Skip logging network errors - they're handled by axios interceptor
    // Network errors mean backend is not running, which is expected in some scenarios
    if (error.code !== 'ERR_NETWORK' && error.message !== 'Network Error') {
      console.error('❌ Error fetching wallet data:', error)
      console.error('❌ Error response:', error.response)
      console.error('❌ Error response data:', error.response?.data)
      console.error('❌ Error message:', error.message)
    }
    error.isWalletFetchError = true
    throw error
  }
}

/**
 * Get delivery wallet state (deprecated - use fetchDeliveryWallet instead)
 * Kept for backward compatibility but returns empty state
 * @returns {Object} - Wallet state object
 */
export const getDeliveryWalletState = () => {
  // Return empty state - should use fetchDeliveryWallet() instead
  console.warn('getDeliveryWalletState is deprecated. Use fetchDeliveryWallet() instead.')
  return EMPTY_WALLET_STATE
}

/**
 * Save delivery wallet state (deprecated - data is managed by backend)
 * @param {Object} state - Wallet state object
 */
export const setDeliveryWalletState = (state) => {
  // No-op - data is managed by backend
  console.warn('setDeliveryWalletState is deprecated. Wallet data is managed by backend.')
}

/**
 * Calculate all balances dynamically
 * @param {Object} state - Wallet state
 * @returns {Object} - Calculated balances
 */
export const calculateDeliveryBalances = (state) => {
  console.log('📊 calculateDeliveryBalances called with state:', state)

  if (!state) {
    console.warn('⚠️ No state provided to calculateDeliveryBalances')
    return {
      totalBalance: 0,
      cashInHand: 0,
      totalWithdrawn: 0,
      pendingWithdrawals: 0,
      totalEarnings: 0
    }
  }

  // ALWAYS use totalBalance directly from state (backend calculated value)
  // Don't recalculate from transactions as backend is source of truth
  const totalBalance = state.totalBalance || 0
  const cashInHand = state.cashInHand || 0
  const totalWithdrawn = state.totalWithdrawn || 0
  const totalEarned = state.totalEarned || 0

  console.log('📊 Balance values:', { totalBalance, cashInHand, totalWithdrawn, totalEarned })

  // Calculate pending withdrawals from transactions if available
  let pendingWithdrawals = state.pendingWithdrawals || 0
  if (state.transactions && Array.isArray(state.transactions)) {
    const isPendingStatus = (status) => String(status || '').trim().toLowerCase() === 'pending'
    const isWithdrawalType = (type) => String(type || '').trim().toLowerCase() === 'withdrawal'
    const pendingFromTransactions = state.transactions
      .filter(t => isWithdrawalType(t.type) && isPendingStatus(t.status))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    if (pendingFromTransactions > 0) {
      pendingWithdrawals = pendingFromTransactions
    }
  }

  // Calculate total earnings from transactions for display purposes
  let totalEarningsFromTransactions = totalEarned
  if (state.transactions && Array.isArray(state.transactions)) {
    const isCompletedLikeStatus = (status) => {
      const normalized = String(status || '').trim().toLowerCase()
      return normalized === 'completed' || normalized === 'approved' || normalized === 'processed'
    }
    const isEarningType = (type) => {
      const normalized = String(type || '').trim().toLowerCase()
      return normalized === 'payment' || normalized === 'earning_addon' || normalized === 'bonus'
    }
    const earningsFromTransactions = state.transactions
      .filter(t => isEarningType(t.type) && isCompletedLikeStatus(t.status))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    if (earningsFromTransactions > 0) {
      totalEarningsFromTransactions = earningsFromTransactions
    }
  }

  const balances = {
    totalBalance: totalBalance,
    cashInHand: cashInHand,
    totalWithdrawn: totalWithdrawn,
    pendingWithdrawals: pendingWithdrawals,
    totalEarnings: totalEarningsFromTransactions || totalEarned || totalBalance || 0
  }

  console.log('📊 Calculated balances:', balances)
  return balances
}

/**
 * Calculate earnings for a specific time period
 * @param {Object} state - Wallet state
 * @param {string} period - Period: 'today', 'week', 'month'
 * @returns {number} - Earnings for the period
 */
export const calculatePeriodEarnings = (state, period) => {
  if (!state || !state.transactions || !Array.isArray(state.transactions)) {
    return 0
  }

  const isCompletedLikeStatus = (status) => {
    const normalized = String(status || '').trim().toLowerCase()
    return normalized === 'completed' || normalized === 'approved' || normalized === 'processed'
  }

  const isEarningType = (type) => {
    const normalized = String(type || '').trim().toLowerCase()
    return normalized === 'payment' || normalized === 'earning_addon' || normalized === 'bonus'
  }

  const getTransactionDate = (transaction) => {
    const candidates = [transaction?.date, transaction?.createdAt, transaction?.processedAt]
    for (const candidate of candidates) {
      if (!candidate) continue
      const parsed = new Date(candidate)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return null
  }

  const now = new Date()
  let startDate = new Date()

  switch (period) {
    case 'today':
      startDate.setHours(0, 0, 0, 0)
      break
    case 'week':
      startDate.setDate(now.getDate() - now.getDay()) // Start of week (Sunday)
      startDate.setHours(0, 0, 0, 0)
      break
    case 'month':
      startDate.setDate(1) // First day of month
      startDate.setHours(0, 0, 0, 0)
      break
    default:
      return 0
  }

  return state.transactions
    .filter(t => {
      // Include both payment and earning_addon transactions in earnings
      if (!isEarningType(t.type)) return false
      if (!isCompletedLikeStatus(t.status)) return false

      const transactionDate = getTransactionDate(t)
      if (!transactionDate) return false

      return transactionDate >= startDate && transactionDate <= now
    })
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
}

/**
 * Fetch wallet transactions from API
 * @param {Object} params - Query params (type, status, page, limit)
 * @returns {Promise<Array>} - Array of transactions
 */
export const fetchWalletTransactions = async (params = {}) => {
  try {
    const response = await deliveryAPI.getWalletTransactions(params)
    if (response?.data?.success && response?.data?.data?.transactions) {
      return response.data.data.transactions
    }
    return []
  } catch (error) {
    console.error('Error fetching wallet transactions:', error)
    return []
  }
}

/**
 * Create withdrawal request
 * @param {number} amount - Withdrawal amount
 * @param {string} paymentMethod - Payment method (bank_transfer, upi, card)
 * @param {Object} details - Additional details (bankDetails, upiId, etc.)
 * @returns {Promise<Object>} - Created transaction
 */
export const createWithdrawalRequest = async (amount, paymentMethod, details = {}) => {
  try {
    const response = await deliveryAPI.createWithdrawalRequest({
      amount,
      paymentMethod,
      ...details
    })
    if (response?.data?.success) {
      return response.data.data
    }
    throw new Error(response?.data?.message || 'Failed to create withdrawal request')
  } catch (error) {
    console.error('Error creating withdrawal request:', error)
    throw error
  }
}

/**
 * Collect payment (mark COD payment as collected)
 * @param {string} orderId - Order ID
 * @param {number} amount - Payment amount (optional)
 * @returns {Promise<Object>} - Updated transaction
 */
export const collectPayment = async (orderId, amount = null) => {
  try {
    const response = await deliveryAPI.collectPayment({
      orderId,
      amount
    })
    if (response?.data?.success) {
      return response.data.data
    }
    throw new Error(response?.data?.message || 'Failed to collect payment')
  } catch (error) {
    console.error('Error collecting payment:', error)
    throw error
  }
}

/**
 * Get transactions by type (deprecated - use fetchWalletTransactions instead)
 * @param {string} type - Transaction type (withdrawal, payment, all)
 * @returns {Array} - Filtered transactions
 */
export const getDeliveryTransactionsByType = (type = 'all') => {
  console.warn('getDeliveryTransactionsByType is deprecated. Use fetchWalletTransactions() instead.')
  return []
}

/**
 * Get transactions by status (deprecated - use fetchWalletTransactions instead)
 * @param {string} status - Transaction status (Pending, Completed, Failed)
 * @returns {Array} - Filtered transactions
 */
export const getDeliveryTransactionsByStatus = (status) => {
  console.warn('getDeliveryTransactionsByStatus is deprecated. Use fetchWalletTransactions() instead.')
  return []
}

/**
 * Get order payment amount from wallet transactions (deprecated - use API)
 * @param {string|number} orderId - Order ID
 * @returns {number|null} - Payment amount if found, null otherwise
 */
export const getDeliveryOrderPaymentAmount = (orderId) => {
  console.warn('getDeliveryOrderPaymentAmount is deprecated. Use API to fetch transactions instead.')
  return null
}

/**
 * Get payment status for an order (deprecated - use API)
 * @param {string|number} orderId - Order ID
 * @returns {string} - Payment status ("Paid" or "Unpaid")
 */
export const getDeliveryOrderPaymentStatus = (orderId) => {
  console.warn('getDeliveryOrderPaymentStatus is deprecated. Use API to fetch transactions instead.')
  return "Unpaid"
}

/**
 * Check if payment is collected for an order (deprecated - use API)
 * @param {string|number} orderId - Order ID
 * @returns {boolean} - Whether payment is collected
 */
export const isPaymentCollected = (orderId) => {
  console.warn('isPaymentCollected is deprecated. Use API to fetch transactions instead.')
  return false
}

/**
 * Add delivery transaction (deprecated - use API instead)
 * @param {Object} transaction - Transaction object
 */
export const addDeliveryTransaction = (transaction) => {
  console.warn('addDeliveryTransaction is deprecated. Use API endpoints instead.')
  return null
}

/**
 * Create a withdraw request (deprecated - use createWithdrawalRequest instead)
 * @param {number} amount - Withdrawal amount
 * @param {string} paymentMethod - Payment method
 * @returns {Object} - Created transaction
 */
export const createDeliveryWithdrawRequest = (amount, paymentMethod) => {
  console.warn('createDeliveryWithdrawRequest is deprecated. Use createWithdrawalRequest() instead.')
  return createWithdrawalRequest(amount, paymentMethod)
}

/**
 * Add delivery earnings from completed order (deprecated - use API instead)
 * @param {number} amount - Delivery earnings amount
 * @param {string} orderId - Order ID
 * @param {string} description - Payment description
 * @param {boolean} paymentCollected - Whether payment is collected (for COD)
 */
export const addDeliveryEarnings = (amount, orderId, description, paymentCollected = false) => {
  console.warn('addDeliveryEarnings is deprecated. Use deliveryAPI.addEarning() instead.')
  return deliveryAPI.addEarning({
    amount,
    orderId,
    description,
    paymentCollected
  })
}
