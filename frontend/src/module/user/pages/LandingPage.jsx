import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBasket, Clock, MapPin, ShieldCheck, Store, Bike, Search,
  CheckCircle2, Mail, Phone, MessageCircle, Send, Menu, X, ArrowRight,
} from "lucide-react";
import api from "@/lib/api";

/*
 * MoBasket company website (requirement 13).
 *
 * Mounted on its own route rather than replacing "/", which is the app's
 * Food/Grocery selection screen. Repurposing that would break the entry point
 * customers and existing links already use.
 *
 * Contact details are read from the public business settings endpoint and the
 * form posts to the same contact endpoint the admin inbox reads, so this is
 * wired to real data rather than being a mockup.
 */

// Replace with real people before launch. Left deliberately empty rather than
// filled with invented names, which would be published as if genuine.
const TEAM = [];

// Real coverage only. An invented "as seen in" is a false claim about a
// publication, so this stays empty until there is something true to list.
const PRESS = [];

// Real customer reviews only, for the same reason.
const REVIEWS = [];

const ACHIEVEMENTS = [
  { icon: Store, label: "Partner restaurants & stores", note: "Across every zone we serve" },
  { icon: Bike, label: "Delivery partners", note: "Earning on their own schedule" },
  { icon: MapPin, label: "Delivery zones", note: "And steadily expanding" },
  { icon: Clock, label: "Fast local delivery", note: "Food and groceries, one app" },
];

const STEPS = [
  { icon: MapPin, title: "Set your delivery address", body: "Detect it automatically, drop a pin, or pick a saved address. You can order to someone else's address too." },
  { icon: Search, title: "Browse what's near you", body: "Restaurants and stores serving your delivery zone, with prices and offers shown up front." },
  { icon: ShoppingBasket, title: "Order and track it", body: "Pay how you like, then follow your order from the kitchen or shelf to your door." },
];

const NAV = [
  { id: "about", label: "About" },
  { id: "how-it-works", label: "How it works" },
  { id: "achievements", label: "Why MoBasket" },
  { id: "partner", label: "Partner with us" },
  { id: "contact", label: "Contact" },
];

const Section = ({ id, className = "", children }) => (
  <section id={id} className={`scroll-mt-20 px-5 py-16 md:py-24 ${className}`}>
    <div className="mx-auto w-full max-w-6xl">{children}</div>
  </section>
);

const Heading = ({ eyebrow, title, sub }) => (
  <div className="mb-10 max-w-2xl">
    {eyebrow && (
      <span className="mb-3 inline-block rounded-full bg-[#2f8d2f]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#2f8d2f]">
        {eyebrow}
      </span>
    )}
    <h2 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">{title}</h2>
    {sub && <p className="mt-3 text-base leading-relaxed text-slate-600">{sub}</p>}
  </div>
);

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contact, setContact] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [status, setStatus] = useState({ state: "idle", message: "" });

  useEffect(() => {
    let cancelled = false;
    api.get("/business-settings/public")
      .then((res) => {
        if (!cancelled) setContact(res?.data?.data?.contact || null);
      })
      // The page must still render if settings are unavailable.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const go = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (status.state === "sending") return;

    if (!form.name.trim() || !form.message.trim()) {
      setStatus({ state: "error", message: "Please add your name and a message." });
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setStatus({ state: "error", message: "Add an email address or phone number so we can reply." });
      return;
    }

    setStatus({ state: "sending", message: "" });
    try {
      const res = await api.post("/contact", form);
      setStatus({ state: "sent", message: res?.data?.message || "Thanks for getting in touch." });
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (error) {
      setStatus({
        state: "error",
        message: error?.response?.data?.message || "Could not send your message. Please try again.",
      });
    }
  };

  const phone = [contact?.phone?.countryCode, contact?.phone?.number].filter(Boolean).join(" ").trim();
  const whatsapp = String(contact?.whatsapp?.number || "").trim();
  const field = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2f8d2f] focus:ring-2 focus:ring-[#2f8d2f]/20";

  return (
    <div className="min-h-screen scroll-smooth bg-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3">
          <button onClick={() => go("hero")} className="flex items-center gap-2" aria-label="MoBasket home">
            <img src="/2.png" alt="" className="h-9 w-9 object-contain" />
            <span className="text-lg font-black tracking-tight">
              <span className="text-black">Mo</span><span className="text-[#2f8d2f]">Basket</span>
            </span>
          </button>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <button key={item.id} onClick={() => go(item.id)} className="text-sm font-semibold text-slate-600 transition hover:text-[#2f8d2f]">
                {item.label}
              </button>
            ))}
            <a href="/welcome" className="rounded-full bg-[#ff8100] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#e67300]">
              Order now
            </a>
          </nav>

          <button className="md:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle menu" aria-expanded={menuOpen}>
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-slate-100 bg-white px-5 py-3 md:hidden">
            {NAV.map((item) => (
              <button key={item.id} onClick={() => go(item.id)} className="block w-full py-2.5 text-left text-sm font-semibold text-slate-700">
                {item.label}
              </button>
            ))}
            <a href="/welcome" className="mt-2 block rounded-full bg-[#ff8100] px-5 py-3 text-center text-sm font-bold text-white">
              Order now
            </a>
          </nav>
        )}
      </header>

      {/* Hero */}
      <Section id="hero" className="bg-gradient-to-b from-[#2f8d2f]/5 to-white pt-14">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-[#ff8100]">
              <ShoppingBasket className="h-3.5 w-3.5" /> Food &amp; groceries, delivered
            </span>
            <h1 className="text-4xl font-black leading-[1.1] tracking-tight md:text-6xl">
              Your local shops,<br />
              <span className="text-[#2f8d2f]">at your door</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600 md:text-lg">
              MoBasket brings restaurants and grocery stores from your own neighbourhood into one app,
              delivered by riders who know the area.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/welcome" className="inline-flex items-center gap-2 rounded-full bg-[#ff8100] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#e67300]">
                Start an order <ArrowRight className="h-4 w-4" />
              </a>
              <button onClick={() => go("partner")} className="rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:border-[#2f8d2f] hover:text-[#2f8d2f]">
                Partner with us
              </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="flex justify-center">
            <div className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/50">
              <img src="/2.png" alt="MoBasket" className="mx-auto h-24 w-24 object-contain" />
              <div className="mt-6 space-y-3">
                {["Order to any address, not just your own", "Live tracking from shop to door", "Local shops, local riders"].map((line) => (
                  <div key={line} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2f8d2f]" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* About */}
      <Section id="about">
        <Heading
          eyebrow="About MoBasket"
          title="Built for the towns we live in"
          sub="MoBasket is a local delivery service for food and groceries. Instead of serving only large cities, we build zone by zone so smaller towns get the same convenience."
        />
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: Store, title: "Local businesses first", body: "Restaurants and grocery stores keep their own pricing and menus, and reach customers beyond walk-in trade." },
            { icon: Bike, title: "Riders who know the roads", body: "Deliveries are handled by partners working in their own area, which is why orders arrive quickly." },
            { icon: ShieldCheck, title: "Clear pricing", body: "Item prices, delivery fees and taxes are shown before you pay. No surprises at checkout." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <Icon className="mb-4 h-8 w-8 text-[#2f8d2f]" />
              <h3 className="mb-2 text-lg font-bold">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" className="bg-slate-50">
        <Heading eyebrow="How it works" title="Three steps to your door" />
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <div key={title} className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <span className="absolute right-5 top-5 text-4xl font-black text-slate-100">{index + 1}</span>
              <Icon className="mb-4 h-8 w-8 text-[#ff8100]" />
              <h3 className="mb-2 text-lg font-bold">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Achievements */}
      <Section id="achievements">
        <Heading eyebrow="Why MoBasket" title="What we're building" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ACHIEVEMENTS.map(({ icon: Icon, label, note }) => (
            <div key={label} className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
              <Icon className="mx-auto mb-3 h-8 w-8 text-[#2f8d2f]" />
              <p className="text-sm font-bold text-slate-900">{label}</p>
              <p className="mt-1 text-xs text-slate-500">{note}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Team */}
      {TEAM.length > 0 && (
        <Section id="team" className="bg-slate-50">
          <Heading eyebrow="Team" title="The people behind MoBasket" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TEAM.map((member) => (
              <div key={member.name} className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
                {member.photo && <img src={member.photo} alt="" className="mx-auto mb-3 h-20 w-20 rounded-full object-cover" />}
                <p className="font-bold">{member.name}</p>
                <p className="text-sm text-slate-500">{member.role}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Seen in */}
      {PRESS.length > 0 && (
        <Section id="press">
          <Heading eyebrow="Seen in" title="Where we've been mentioned" />
          <div className="flex flex-wrap items-center gap-8 opacity-70">
            {PRESS.map((item) => (
              <img key={item.name} src={item.logo} alt={item.name} className="h-8 object-contain" />
            ))}
          </div>
        </Section>
      )}

      {/* Reviews */}
      {REVIEWS.length > 0 && (
        <Section id="reviews" className="bg-slate-50">
          <Heading eyebrow="Reviews" title="What customers say" />
          <div className="grid gap-5 md:grid-cols-3">
            {REVIEWS.map((review) => (
              <figure key={review.name} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <blockquote className="text-sm leading-relaxed text-slate-700">{review.quote}</blockquote>
                <figcaption className="mt-4 text-sm font-bold text-slate-900">{review.name}</figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}

      {/* Become a partner */}
      <Section id="partner" className="bg-slate-50">
        <Heading eyebrow="Become a partner" title="Grow with MoBasket" sub="Whether you run a kitchen, a shop, or ride your own bike, there's a place for you." />
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: Store, title: "Restaurants", body: "List your menu, manage orders and get paid weekly.", href: "/restaurant/signup", cta: "Register a restaurant" },
            { icon: ShoppingBasket, title: "Grocery stores", body: "Put your catalogue online and reach customers across your zone.", href: "/store/signup", cta: "Register a store" },
            { icon: Bike, title: "Delivery partners", body: "Work the hours that suit you and track your earnings in the app.", href: "/delivery/signup", cta: "Ride with us" },
          ].map(({ icon: Icon, title, body, href, cta }) => (
            <div key={title} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <Icon className="mb-4 h-8 w-8 text-[#ff8100]" />
              <h3 className="mb-2 text-lg font-bold">{title}</h3>
              <p className="mb-5 flex-1 text-sm leading-relaxed text-slate-600">{body}</p>
              <a href={href} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#2f8d2f] hover:underline">
                {cta} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      </Section>

      {/* Contact */}
      <Section id="contact">
        <Heading eyebrow="Contact us" title="Get in touch" sub="Questions, complaints or partnership enquiries — we read everything that comes in." />
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-3">
            {contact?.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-[#2f8d2f]">
                <Mail className="h-5 w-5 text-[#2f8d2f]" />
                <span className="text-sm font-semibold">{contact.email}</span>
              </a>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/\s+/g, "")}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-[#2f8d2f]">
                <Phone className="h-5 w-5 text-[#2f8d2f]" />
                <span className="text-sm font-semibold">{phone}</span>
              </a>
            )}
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-[#2f8d2f]">
                <MessageCircle className="h-5 w-5 text-[#2f8d2f]" />
                <span className="text-sm font-semibold">Chat on WhatsApp</span>
              </a>
            )}
            {contact?.address && (
              <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#2f8d2f]" />
                <span className="text-sm leading-relaxed text-slate-700">
                  {contact.address}{contact.state ? `, ${contact.state}` : ""}
                </span>
              </div>
            )}
          </div>

          <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={field} placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className={field} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <input className={field} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={field} placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <textarea className={`${field} min-h-[120px] resize-y`} placeholder="How can we help?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />

            {status.message && (
              <p className={`text-sm font-semibold ${status.state === "sent" ? "text-[#2f8d2f]" : "text-red-600"}`} role="status">
                {status.message}
              </p>
            )}

            <button type="submit" disabled={status.state === "sending"} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff8100] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#e67300] disabled:opacity-60">
              {status.state === "sending" ? "Sending…" : <>Send message <Send className="h-4 w-4" /></>}
            </button>
          </form>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-slate-50 px-5 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <img src="/2.png" alt="" className="h-8 w-8 object-contain" />
              <span className="text-lg font-black tracking-tight">
                <span className="text-black">Mo</span><span className="text-[#2f8d2f]">Basket</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">© {new Date().getFullYear()} MoBasket. All rights reserved.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            <a href="/profile/about" className="hover:text-[#2f8d2f]">About</a>
            <a href="/profile/terms" className="hover:text-[#2f8d2f]">Terms</a>
            <a href="/profile/privacy" className="hover:text-[#2f8d2f]">Privacy</a>
            <a href="/profile/refund" className="hover:text-[#2f8d2f]">Refunds</a>
            <button onClick={() => go("contact")} className="hover:text-[#2f8d2f]">Contact</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
