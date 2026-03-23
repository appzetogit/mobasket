import { Link } from "react-router-dom"
import { CreditCard, Trash2, Edit, Check, Plus } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useProfile } from "../../context/ProfileContext"

export default function Payments() {
  const { paymentMethods, deletePaymentMethod, setDefaultPaymentMethod } = useProfile()

  const formatCardNumber = (cardNumber) => {
    if (!cardNumber) return "****"
    return `**** **** **** ${cardNumber}`
  }

  const formatExpiry = (month, year) => {
    if (!month || !year) return ""
    return `${month.padStart(2, "0")}/${year.slice(-2)}`
  }

  const getCardTypeIcon = (type) => {
    if (type === "visa") return "💳"
    if (type === "mastercard") return "💳"
    return "💳"
  }

  const getCardTypeName = (type) => {
    if (type === "visa") return "Visa"
    if (type === "mastercard") return "Mastercard"
    return "Card"
  }

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this payment method?")) {
      deletePaymentMethod(id)
    }
  }

  const handleSetDefault = (id) => {
    setDefaultPaymentMethod(id)
  }

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 p-4 text-slate-900 sm:p-6 md:p-8 lg:p-10 dark:bg-gradient-to-b dark:from-[#06080d] dark:via-[#0b0f17] dark:to-[#101522] dark:text-slate-100">
      <div className="max-w-[1100px] mx-auto space-y-4 md:pt-20 lg:pt-24 md:pb-6 lg:pb-8 sm:space-y-6 md:space-y-8 lg:space-y-10">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              Payment Methods
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base dark:text-slate-400">
              Manage your payment methods
            </p>
          </div>
          <Link to="/user/profile/payments/new" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white text-sm sm:text-base">
              <Plus className="h-4 w-4 mr-2" />
              Add Payment Method
            </Button>
          </Link>
        </div>
        {paymentMethods.length === 0 ? (
          <Card className="border-slate-200/70 shadow-lg dark:border-white/10 dark:bg-[#111827] dark:shadow-black/30">
            <CardContent className="py-12 text-center">
              <CreditCard className="h-16 w-16 mx-auto mb-4 text-muted-foreground dark:text-slate-500" />
              <h3 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                No payment methods saved yet
              </h3>
              <p className="mb-6 text-muted-foreground dark:text-slate-400">
                Add your first payment method to get started with orders
              </p>
              <Link to="/user/profile/payments/new">
                <Button className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Payment Method
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-5 lg:gap-6 md:space-y-0">
            {paymentMethods.map((payment) => (
              <Card
                key={payment.id}
                className={`border border-slate-200/80 bg-white shadow-lg shadow-black/5 dark:border-white/10 dark:bg-[#151a23] dark:shadow-black/30 ${payment.isDefault ? "border-2 border-yellow-500 bg-yellow-50/50 dark:border-yellow-400/70 dark:bg-yellow-500/10" : ""
                  }`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                      <CreditCard
                        className={`h-5 w-5 ${payment.isDefault ? "text-yellow-600 dark:text-yellow-300" : "text-muted-foreground dark:text-slate-400"}`}
                      />
                      {getCardTypeName(payment.type)} Card
                    </CardTitle>
                    {payment.isDefault && (
                      <Badge className="bg-yellow-500 text-white dark:bg-yellow-400 dark:text-[#111827]">
                        Default
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-yellow-200 bg-gradient-to-br from-yellow-50 to-orange-50 p-4 dark:border-yellow-500/30 dark:from-[#1b2230] dark:to-[#111827]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{getCardTypeIcon(payment.type)}</span>
                        <div>
                          <p className="text-xl font-bold tracking-wide text-slate-900 dark:text-slate-100">
                            {formatCardNumber(payment.cardNumber)}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground dark:text-slate-400">
                            {payment.cardHolder}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 border-t border-yellow-200 pt-3 text-sm text-slate-700 dark:border-white/10 dark:text-slate-300">
                      <div>
                        <span className="text-muted-foreground dark:text-slate-400">Expires: </span>
                        <span className="font-semibold">
                          {formatExpiry(payment.expiryMonth, payment.expiryYear)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground dark:text-slate-400">Type: </span>
                        <span className="font-semibold capitalize">{getCardTypeName(payment.type)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-slate-200/70 pt-2 dark:border-white/10">
                    {!payment.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(payment.id)}
                        className="flex items-center gap-1 border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-[#0f172a] dark:text-slate-100 dark:hover:bg-white/10"
                      >
                        <Check className="h-4 w-4" />
                        Set as Default
                      </Button>
                    )}
                    <Link to={`/user/profile/payments/${payment.id}/edit`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1 border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-[#0f172a] dark:text-slate-100 dark:hover:bg-white/10"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(payment.id)}
                      className="flex items-center gap-1 border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:bg-[#0f172a] dark:text-red-300 dark:hover:border-red-400/50 dark:hover:bg-red-500/10 dark:hover:text-red-200"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
