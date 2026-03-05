import { groceryStoreAPI, restaurantAPI } from "@/lib/api"

const WALLET_STORAGE_KEY = "restaurant_wallet_state"

const DEFAULT_WALLET_STATE = {
  totalEarning: 0,
  cashInHand: 0,
  balanceUnadjusted: 0,
  withdrawalBalance: 0,
  pendingWithdraw: 0,
  alreadyWithdraw: 0,
  transactions: [],
  withdrawRequests: [],
  isBalanceAdjusted: false,
}

const resolveApi = () => {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/store")) {
    return groceryStoreAPI
  }
  return restaurantAPI
}

const toDateLabel = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const normalizeStatus = (status) => {
  const value = String(status || "").trim().toLowerCase()
  if (value === "approved" || value === "processed" || value === "completed") return "Completed"
  if (value === "rejected" || value === "failed" || value === "cancelled") return "Failed"
  return "Pending"
}

const mapWalletResponseToState = ({ wallet = {}, transactions = [], withdrawalRequests = [] }) => {
  const normalizedWithdrawRequests = (withdrawalRequests || []).map((request) => ({
    id: request.id || request._id,
    amount: Number(request.amount) || 0,
    description: `Withdrawal request (${request.paymentMethod || "bank_transfer"})`,
    status: normalizeStatus(request.status),
    rawStatus: request.status || "Pending",
    date: toDateLabel(request.requestedAt || request.createdAt),
    createdAt: request.requestedAt || request.createdAt,
    type: "withdrawal",
  }))

  const nonWithdrawalTransactions = (transactions || [])
    .filter((tx) => String(tx.type || "").toLowerCase() !== "withdrawal")
    .map((tx) => ({
      id: tx.id || tx._id,
      amount: Number(tx.amount) || 0,
      description: tx.description || "Wallet transaction",
      status: normalizeStatus(tx.status),
      rawStatus: tx.status || "Pending",
      date: toDateLabel(tx.createdAt || tx.date),
      createdAt: tx.createdAt || tx.date,
      type: String(tx.type || "").toLowerCase() || "payment",
      orderId: tx.orderId || null,
    }))

  const combinedTransactions = [...normalizedWithdrawRequests, ...nonWithdrawalTransactions].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime()
    const tb = new Date(b.createdAt || 0).getTime()
    return tb - ta
  })

  const pendingWithdraw = normalizedWithdrawRequests
    .filter((row) => row.status === "Pending")
    .reduce((sum, row) => sum + row.amount, 0)
  const alreadyWithdraw = normalizedWithdrawRequests
    .filter((row) => row.status === "Completed")
    .reduce((sum, row) => sum + row.amount, 0)

  return {
    totalEarning: Number(wallet.totalEarned) || 0,
    cashInHand: 0,
    balanceUnadjusted: Number(wallet.totalBalance) || 0,
    withdrawalBalance: Number(wallet.totalBalance) || 0,
    pendingWithdraw,
    alreadyWithdraw,
    transactions: combinedTransactions,
    withdrawRequests: normalizedWithdrawRequests,
    isBalanceAdjusted: false,
  }
}

export const getWalletState = () => {
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_WALLET_STATE }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_WALLET_STATE, ...(parsed || {}) }
  } catch {
    return { ...DEFAULT_WALLET_STATE }
  }
}

export const setWalletState = (state) => {
  try {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ ...DEFAULT_WALLET_STATE, ...(state || {}) }))
    window.dispatchEvent(new CustomEvent("walletStateUpdated"))
  } catch {
    // Ignore storage errors.
  }
}

export const syncWalletState = async () => {
  const api = resolveApi()

  const [walletRes, txRes, withdrawRes] = await Promise.all([
    api.getWallet(),
    api.getWalletTransactions({ limit: 200 }),
    api.getWithdrawalRequests({ limit: 200 }),
  ])

  const wallet = walletRes?.data?.data?.wallet || walletRes?.data?.wallet || {}
  const transactions = txRes?.data?.data?.transactions || txRes?.data?.transactions || []
  const withdrawalRequests = withdrawRes?.data?.data?.requests || withdrawRes?.data?.requests || []

  const nextState = mapWalletResponseToState({ wallet, transactions, withdrawalRequests })
  setWalletState(nextState)
  return nextState
}

export const calculateWithdrawableBalance = (state) => {
  if (Number.isFinite(Number(state?.withdrawalBalance))) {
    return Number(state.withdrawalBalance)
  }
  const totalEarning = Number(state?.totalEarning) || 0
  const alreadyWithdraw = Number(state?.alreadyWithdraw) || 0
  const pendingWithdraw = Number(state?.pendingWithdraw) || 0
  return Math.max(0, totalEarning - alreadyWithdraw - pendingWithdraw)
}

export const calculateBalances = (state = DEFAULT_WALLET_STATE) => {
  const pendingWithdraw = Number(state.pendingWithdraw) || 0
  const alreadyWithdraw = Number(state.alreadyWithdraw) || 0
  const withdrawalBalance = calculateWithdrawableBalance(state)

  return {
    totalEarning: Number(state.totalEarning) || 0,
    cashInHand: Number(state.cashInHand) || 0,
    balanceUnadjusted: Number(state.balanceUnadjusted ?? withdrawalBalance) || 0,
    withdrawalBalance,
    pendingWithdraw,
    alreadyWithdraw,
  }
}

export const createWithdrawRequest = async (amount) => {
  const api = resolveApi()
  await api.createWithdrawalRequest(Number(amount))
  return syncWalletState()
}

export const setBalanceAdjusted = (isAdjusted) => {
  const state = getWalletState()
  state.isBalanceAdjusted = Boolean(isAdjusted)
  setWalletState(state)
}

export const getBalanceAdjusted = () => {
  const state = getWalletState()
  return Boolean(state.isBalanceAdjusted)
}

export const getTransactionsByType = (type = "all") => {
  const state = getWalletState()
  if (type === "all") return state.transactions || []
  return (state.transactions || []).filter((row) => String(row.type || "").toLowerCase() === String(type).toLowerCase())
}

export const getTransactionsByStatus = (status) => {
  const state = getWalletState()
  const expected = normalizeStatus(status)
  return (state.transactions || []).filter((row) => normalizeStatus(row.status) === expected)
}

export const getOrderPaymentAmount = (orderId) => {
  const state = getWalletState()
  const match = (state.transactions || []).find(
    (row) => row.type === "payment" && String(row.orderId || "") === String(orderId || "")
  )
  return match ? Number(match.amount) || 0 : null
}

export const getOrderPaymentStatus = (orderId) => {
  const state = getWalletState()
  const match = (state.transactions || []).find(
    (row) =>
      row.type === "payment" &&
      row.status === "Completed" &&
      String(row.orderId || "") === String(orderId || "")
  )
  return match ? "Paid" : "Unpaid"
}

export const getPaidOrderIds = () => {
  const state = getWalletState()
  return (state.transactions || [])
    .filter((row) => row.type === "payment" && row.status === "Completed" && row.orderId)
    .map((row) => row.orderId)
}

