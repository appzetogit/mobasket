import { formatCurrency } from "../../restaurant/utils/currency"

export default function AvailableCashLimit({ onClose, walletData = {} }) {
  const rawLimit = Number(walletData.totalCashLimit)
  const totalCashLimit = Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : 0
  const cashInHand = Number(walletData.cashInHand) || 0
  const deductions = Number(walletData.deductions) || 0
  const pocketWithdrawals = Number(walletData.pocketWithdrawals) || 0
  const availableFromApi = Number(walletData.availableCashLimit)
  const availableCashLimit = Number.isFinite(availableFromApi)
    ? availableFromApi
    : (totalCashLimit - cashInHand - deductions)

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <div className="">
        <div className="py-3 flex justify-between border-b border-gray-200 items-start">
          <div>
            <div className="text-sm font-medium">Total cash limit</div>
            <div className="text-xs text-gray-500 leading-tight mt-1">
              Resets every Monday and increases with<br />
              earnings
            </div>
          </div>
          <div className="text-sm font-semibold">{formatCurrency(totalCashLimit)}</div>
        </div>

        <DetailRow label="Cash in hand" value={formatCurrency(cashInHand)} />
        <DetailRow label="Deductions" value={formatCurrency(deductions)} />
        <DetailRow label="Pocket withdrawals" value={formatCurrency(pocketWithdrawals)} />

        <div className="py-3 flex justify-between items-center border-b border-gray-200">
          <div className="text-sm font-medium">Available cash limit</div>
          <div className="text-sm font-semibold">{formatCurrency(availableCashLimit)}</div>
        </div>

        {cashInHand > totalCashLimit && (
          <div className="py-3 text-xs text-amber-700">
            Cash in hand is above total limit. Deposit to increase available limit.
          </div>
        )}
      </div>

      <div onClick={onClose} className="mt-6">
        <button className="w-full bg-black text-white py-3 rounded-lg text-sm font-medium">
          Okay
        </button>
      </div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="py-3 flex justify-between items-center border-b border-gray-200">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  )
}
