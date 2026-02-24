import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBasket, UtensilsCrossed, ArrowRight, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WelcomeSelectionPage() {
  const navigate = useNavigate();

  const handleSelection = (module, path) => {
    localStorage.setItem("mobasket_preference", module);
    navigate(path);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center py-12 bg-gray-50 dark:bg-gray-900 font-sans">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Gradient Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-200/30 blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-green-200/30 blur-[100px] animate-pulse delay-1000" />
        <div className="absolute top-[20%] right-[20%] w-[20%] h-[20%] rounded-full bg-purple-200/20 blur-[80px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-3xl px-4 sm:px-6 flex flex-col items-center gap-6"
      >
        {/* Header Section */}
        <div className="text-center space-y-4 mb-2">
          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-2xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight"
          >
            Welcome to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
              MoBasket
            </span>{" "}
            <span className="inline-block animate-wave">👋</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-base md:text-lg text-gray-600 dark:text-gray-300 font-medium"
          >
            What would you like to verify today?
          </motion.p>
        </div>

        {/* Cards Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl px-2">
          {/* MoFood Card */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 100 }}
            whileHover={{ y: -10, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative cursor-pointer"
            onClick={() => handleSelection("food", "/home")}
          >
            {/* Hover Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-red-500 rounded-[2rem] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />

            <div className="relative h-full bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-3xl p-5 md:p-6 flex flex-col items-center gap-4 shadow-xl shadow-gray-200/50 dark:shadow-none transition-all duration-300 group-hover:border-orange-200 dark:group-hover:border-orange-800 group-hover:shadow-2xl group-hover:shadow-orange-100/50">
              {/* Floating Icon Badge */}
              <div className="absolute top-6 right-6 bg-orange-50 dark:bg-orange-900/30 p-3 rounded-2xl group-hover:bg-orange-100 dark:group-hover:bg-orange-800/50 transition-colors">
                <UtensilsCrossed className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>

              {/* Main Illustration Area */}
              <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-b from-orange-50 to-white dark:from-orange-900/10 dark:to-transparent flex items-center justify-center p-3 mb-1 group-hover:scale-110 transition-transform duration-500 ease-out">
                <div
                  className="absolute inset-0 border-[3px] border-dashed border-orange-200 dark:border-orange-800 rounded-full animate-spin-slow"
                  style={{ animationDuration: "20s" }}
                />
                <img
                  src="https://cdn-icons-png.flaticon.com/512/3075/3075977.png"
                  alt="Burger and Fries"
                  className="w-20 h-20 md:w-24 md:h-24 object-contain drop-shadow-xl transform group-hover:-rotate-3 transition-transform duration-500"
                />
              </div>

              {/* Content */}
              <div className="text-center space-y-3 w-full">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                  MoFood
                </h2>
                <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">
                  Delicious meals delivered hot & fast
                </p>
              </div>

              {/* Action Button */}
              <div className="w-full mt-1">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelection("food", "/home");
                  }}
                  className="w-full py-4 text-sm font-bold bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-lg shadow-orange-200 dark:shadow-none rounded-xl transition-all group-hover:shadow-orange-300 dark:group-hover:shadow-none"
                >
                  Order Food{" "}
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </div>
          </motion.div>

          {/* MoGrocery Card */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 100 }}
            whileHover={{ y: -10, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative cursor-pointer"
            onClick={() => handleSelection("grocery", "/grocery")}
          >
            {/* Hover Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-500 rounded-[2rem] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />

            <div className="relative h-full bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-3xl p-5 md:p-6 flex flex-col items-center gap-4 shadow-xl shadow-gray-200/50 dark:shadow-none transition-all duration-300 group-hover:border-green-200 dark:group-hover:border-green-800 group-hover:shadow-2xl group-hover:shadow-green-100/50">
              {/* Floating Icon Badge */}
              <div className="absolute top-6 right-6 bg-green-50 dark:bg-green-900/30 p-3 rounded-2xl group-hover:bg-green-100 dark:group-hover:bg-green-800/50 transition-colors">
                <ShoppingBasket className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>

              {/* Main Illustration Area */}
              <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-b from-green-50 to-white dark:from-green-900/10 dark:to-transparent flex items-center justify-center p-3 mb-1 group-hover:scale-110 transition-transform duration-500 ease-out">
                <div
                  className="absolute inset-0 border-[3px] border-dashed border-green-200 dark:border-green-800 rounded-full animate-spin-slow"
                  style={{
                    animationDuration: "20s",
                    animationDirection: "reverse",
                  }}
                />
                <img
                  src="https://cdn-icons-png.flaticon.com/512/766/766023.png"
                  alt="Grocery Cart"
                  className="w-20 h-20 md:w-24 md:h-24 object-contain drop-shadow-xl transform group-hover:rotate-3 transition-transform duration-500"
                />
              </div>

              {/* Content */}
              <div className="text-center space-y-3 w-full">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                  MoGrocery
                </h2>
                <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">
                  Daily essentials at your doorstep
                </p>
              </div>

              {/* Action Button */}
              <div className="w-full mt-1">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelection("grocery", "/grocery");
                  }}
                  className="w-full py-4 text-sm font-bold bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-200 dark:shadow-none rounded-xl transition-all group-hover:shadow-green-300 dark:group-hover:shadow-none"
                >
                  Shop Grocery{" "}
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </div>
          </motion.div>

          {/* MoCare Card */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
            whileHover={{ y: -10, scale: 1.02 }}
            className="group relative cursor-default"
          >
            {/* Hover Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-[2rem] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />

            <div className="relative h-full bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-3xl p-5 md:p-6 flex flex-col items-center gap-4 shadow-xl shadow-gray-200/50 dark:shadow-none transition-all duration-300 group-hover:border-blue-200 dark:group-hover:border-blue-800 group-hover:shadow-2xl group-hover:shadow-blue-100/50">
              {/* Floating Icon Badge */}
              <div className="absolute top-6 right-6 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-2xl group-hover:bg-blue-100 dark:group-hover:bg-blue-800/50 transition-colors">
                <Heart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>

              {/* Main Illustration Area */}
              <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-b from-blue-50 to-white dark:from-blue-900/10 dark:to-transparent flex items-center justify-center p-3 mb-1 group-hover:scale-110 transition-transform duration-500 ease-out">
                <div
                  className="absolute inset-0 border-[3px] border-dashed border-blue-200 dark:border-blue-800 rounded-full animate-spin-slow"
                  style={{ animationDuration: "20s" }}
                />
                <img
                  src="https://cdn-icons-png.flaticon.com/512/3004/3004458.png"
                  alt="Medicines"
                  className="w-20 h-20 md:w-24 md:h-24 object-contain drop-shadow-xl transform group-hover:rotate-3 transition-transform duration-500"
                />
              </div>

              {/* Content */}
              <div className="text-center space-y-3 w-full">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  MoCare
                </h2>
                <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">
                  Top-quality medicines & health products
                </p>
                <p className="text-blue-500 font-semibold text-xs tracking-wide">
                  coming soon....
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer/Tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-sm text-gray-400 mt-4 font-medium"
        >
          Choose a service to continue
        </motion.div>
      </motion.div>
    </div>
  );
}
