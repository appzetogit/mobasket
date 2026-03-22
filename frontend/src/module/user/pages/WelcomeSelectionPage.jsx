import React from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBasket, UtensilsCrossed, ArrowRight, Heart, Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Asset imports
import mofoods_hero from "@/assets/mofoods_hero.png";
import mogrocery_hero from "@/assets/mogrocery_hero.png";
import mocare_hero from "@/assets/mocare_hero.png";

const SelectionCard = ({ title, subtitle, image, icon: Icon, color, onClick, comingSoon, delay }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      whileInView={{ 
        opacity: 1, 
        y: 0, 
        scale: [0.9, 1.05, 1],
        filter: "brightness(1.1)" 
      }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ 
        duration: 0.8, 
        ease: [0.16, 1, 0.3, 1]
      }}
      whileHover={{ y: -8, scale: 1.02, filter: "brightness(1.2)" }}
      className="group relative w-full h-[320px] rounded-[2rem] overflow-hidden cursor-pointer shadow-xl transition-all duration-500 hover:shadow-2xl"
      onClick={!comingSoon ? onClick : undefined}
    >
      {/* Flashing Shimmer Effect - More prominent when in view */}
      <motion.div 
        animate={{ 
          x: ["-100%", "200%"],
        }}
        transition={{ 
          repeat: Infinity, 
          duration: 2.2, 
          ease: "easeInOut",
          repeatDelay: 3.5,
          delay: delay + 0.5
        }}
        className="absolute inset-0 z-30 pointer-events-none skew-x-[-20deg]"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
          width: "70%"
        }}
      />

      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <motion.img
          src={image}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
        />
        <div className={`absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/80 transition-opacity duration-500 ${comingSoon ? 'opacity-90 grayscale' : 'opacity-75 group-hover:opacity-60'}`} />
      </div>

      {/* Glow Effect on Scroll/Hover */}
      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 0.3 }}
        className={`absolute inset-0 z-10 transition-opacity duration-700 bg-gradient-to-tr ${color}`} 
      />

      {/* Content Container */}
      <div className="relative z-20 h-full p-6 flex flex-col justify-end items-start gap-2">
        {/* Floating Icon */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute top-6 left-6 p-3 rounded-xl bg-white/20 backdrop-blur-md border border-white/30"
        >
          <Icon className="w-5 h-5 text-white" />
        </motion.div>

        {comingSoon && (
          <div className="absolute top-6 right-6 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-[9px] font-bold tracking-widest uppercase">
            Coming Soon
          </div>
        )}

        <div className="space-y-1">
          <motion.h2 
            className="text-3xl font-black text-white tracking-tight"
          >
            {title}
          </motion.h2>
          <p className="text-white/90 font-medium text-sm leading-tight max-w-[180px]">
            {subtitle}
          </p>
        </div>

        {/* Action Button Area */}
        <div className="w-full mt-2 flex items-center justify-between opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-500">
          {!comingSoon ? (
            <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-widest">
              Explore <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
            </div>
          ) : (
            <div className="h-4" />
          )}
        </div>
      </div>
      
      {/* Decorative Border */}
      <div className="absolute inset-0 border-[1px] border-white/10 rounded-[2rem] pointer-events-none group-hover:border-white/20 transition-colors duration-500" />
    </motion.div>
  );
};

export default function WelcomeSelectionPage() {
  const navigate = useNavigate();

  const handleSelection = (module, path) => {
    localStorage.setItem("mobasket_preference", module);
    navigate(path);
  };

  return (
    <div className="relative min-h-screen w-full bg-slate-50 overflow-hidden flex flex-col font-sans">
      {/* Interactive Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-red-100/50 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-100/50 blur-[140px] animate-pulse-slow" />
        <div className="absolute top-1/4 right-[10%] w-[30%] h-[30%] rounded-full bg-blue-100/30 blur-[100px]" />
        
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-12 md:py-16 flex flex-col items-center flex-grow justify-center">
        {/* Header Section */}
        <header className="text-center mb-12 space-y-4 max-w-2xl flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex flex-col items-center gap-6"
          >
            {/* Logo */}
            <motion.img 
              src="/2.png" 
              alt="MoBasket Logo" 
              className="h-16 w-16 md:h-20 md:w-20 object-contain drop-shadow-sm"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            />

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm text-yellow-600 text-[10px] font-bold tracking-widest uppercase mb-2">
              <Sparkles className="w-3 h-3" />
              Everything You Need, Delivered
            </div>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl md:text-6xl font-black text-slate-800 tracking-tighter"
          >
            Welcome to<br/>
            <span>
              <span className="text-black">Mo</span>
              <span className="text-[#2f8d2f]">Basket</span>
            </span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="text-slate-500 text-base md:text-lg font-medium"
          >
            Your everyday companion for food, grocery & more.
          </motion.p>
        </header>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
          <SelectionCard
            title="MoFood"
            subtitle="Gourmet meals from local favorites"
            image={mofoods_hero}
            icon={UtensilsCrossed}
            color="from-red-600/30 to-orange-600/30"
            delay={0.4}
            onClick={() => handleSelection("food", "/home")}
          />
          
          <SelectionCard
            title="MoGrocery"
            subtitle="Fresh daily essentials at your door"
            image={mogrocery_hero}
            icon={ShoppingBasket}
            color="from-emerald-600/30 to-teal-600/30"
            delay={0.6}
            onClick={() => handleSelection("grocery", "/grocery")}
          />
          
          <SelectionCard
            title="MoCare"
            subtitle="Wellness & health essentials"
            image={mocare_hero}
            icon={Heart}
            color="from-blue-600/30 to-indigo-600/30"
            delay={0.8}
            comingSoon={true}
          />
        </div>

        {/* Footer info */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="mt-16 text-slate-400 text-xs font-semibold tracking-widest uppercase flex flex-wrap justify-center items-center gap-8"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-red-500" />
            Express Delivery
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-emerald-500" />
            Top Rated Stores
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-500" />
            Secure Payments
          </div>
        </motion.div>
      </div>

      {/* Subtle Bottom Decoration */}
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-emerald-500 opacity-20" />
    </div>
  );
}
