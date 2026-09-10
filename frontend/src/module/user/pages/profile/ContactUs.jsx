import { Link } from "react-router-dom"
import { useState, useEffect } from "react"
import { ArrowLeft, Mail, Phone, MapPin, MessageCircle, Send, Loader2, CheckCircle2 } from "lucide-react"
import { motion } from "framer-motion"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import api from "@/lib/api"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

/*
 * Contact Us (requirement 14).
 *
 * Support details come from the public business settings route so they are
 * changed in the admin panel rather than in code, and the form posts to the
 * same endpoint the admin inbox reads.
 */
export default function ContactUs() {
  const companyName = useCompanyName()
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" })
  const [status, setStatus] = useState({ state: "idle", message: "" })

  useEffect(() => {
    let cancelled = false
    api.get("/business-settings/public")
      .then((res) => {
        if (!cancelled) setContact(res?.data?.data?.contact || null)
      })
      // The form is still usable if the details fail to load, so this only
      // hides the contact tiles rather than blocking the page.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (status.state === "sending") return

    if (!form.name.trim() || !form.message.trim()) {
      setStatus({ state: "error", message: "Please add your name and a message." })
      return
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setStatus({ state: "error", message: "Add an email address or phone number so we can reply." })
      return
    }

    setStatus({ state: "sending", message: "" })
    try {
      const res = await api.post("/contact", form)
      setStatus({ state: "sent", message: res?.data?.message || "Thanks for getting in touch." })
      setForm({ name: "", email: "", phone: "", subject: "", message: "" })
    } catch (error) {
      setStatus({
        state: "error",
        message: error?.response?.data?.message || "Could not send your message. Please try again.",
      })
    }
  }

  const phone = [contact?.phone?.countryCode, contact?.phone?.number].filter(Boolean).join(" ").trim()
  const whatsapp = String(contact?.whatsapp?.number || "").trim()
  const address = [contact?.address, contact?.state].filter(Boolean).join(", ")
  const field =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#ff8100] focus:ring-2 focus:ring-[#ff8100]/20"

  const tiles = [
    contact?.email && { icon: Mail, label: "Email us", value: contact.email, href: `mailto:${contact.email}` },
    phone && { icon: Phone, label: "Call support", value: phone, href: `tel:${phone.replace(/\s+/g, "")}` },
    whatsapp && {
      icon: MessageCircle,
      label: "WhatsApp",
      value: "Chat with us",
      href: `https://wa.me/${whatsapp.replace(/\D/g, "")}`,
      external: true,
    },
    address && { icon: MapPin, label: "Office", value: address },
  ].filter(Boolean)

  return (
    <AnimatedPage>
      <div className="min-h-screen bg-slate-50 pb-24">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
          <Link to="/profile" aria-label="Back to profile" className="rounded-full p-1.5 transition hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </Link>
          <h1 className="text-base font-bold text-slate-900">Contact Us</h1>
        </header>

        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 text-sm leading-relaxed text-slate-600"
          >
            Questions, complaints or feedback about {companyName || "MoBasket"} — reach us however suits you,
            or send a message below and we will get back to you.
          </motion.p>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : tiles.length > 0 ? (
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              {tiles.map(({ icon: Icon, label, value, href, external }) => {
                const body = (
                  <CardContent className="flex items-start gap-3 p-4">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#ff8100]" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="break-words text-sm font-semibold text-slate-800">{value}</p>
                    </div>
                  </CardContent>
                )
                return href ? (
                  <a
                    key={label}
                    href={href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="block"
                  >
                    <Card className="border-slate-100 transition hover:border-[#ff8100]">{body}</Card>
                  </a>
                ) : (
                  <Card key={label} className="border-slate-100">{body}</Card>
                )
              })}
            </div>
          ) : (
            <p className="mb-6 rounded-xl border border-slate-100 bg-white p-4 text-sm text-slate-500">
              Support details are not available right now. You can still send us a message below.
            </p>
          )}

          <Card className="border-slate-100">
            <CardContent className="p-5">
              <h2 className="mb-4 text-sm font-bold text-slate-900">Send us a message</h2>

              {status.state === "sent" ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                  <p className="text-sm font-semibold text-slate-800">{status.message}</p>
                  <Button
                    type="button"
                    onClick={() => setStatus({ state: "idle", message: "" })}
                    className="bg-[#ff8100] hover:bg-[#e67300]"
                  >
                    Send another message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      className={field}
                      placeholder="Your name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                    <input
                      className={field}
                      placeholder="Phone"
                      inputMode="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <input
                    className={field}
                    type="email"
                    placeholder="Email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <input
                    className={field}
                    placeholder="Subject (optional)"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  />
                  <textarea
                    className={`${field} min-h-[120px] resize-y`}
                    placeholder="Tell us what happened"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    required
                  />

                  <p className="text-[11px] text-slate-400">
                    Give us an email address or a phone number so we can reply.
                  </p>

                  {status.state === "error" && (
                    <p className="text-sm font-semibold text-red-600" role="alert">{status.message}</p>
                  )}

                  <Button
                    type="submit"
                    disabled={status.state === "sending"}
                    className="w-full bg-[#ff8100] hover:bg-[#e67300]"
                  >
                    {status.state === "sending" ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
                    ) : (
                      <><Send className="mr-2 h-4 w-4" /> Send message</>
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AnimatedPage>
  )
}
