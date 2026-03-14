import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, Star, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WishlistPage() {
  const navigate = useNavigate();
  // Load wishlist from localStorage
  const loadWishlist = () => {
    const saved = localStorage.getItem("wishlist");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        // Ensure it's an array
        if (!Array.isArray(parsed)) {
          setWishlist([]);
          return;
        }

        // Filter valid items (must have id at minimum)
        const validItems = parsed.filter((item) => {
          return item && typeof item === "object" && item.id;
        });

        // Remove duplicates based on id
        const unique = validItems.filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.id === item.id),
        );

        setWishlist(unique);
      } catch {
        setWishlist([]);
      }
    } else {
      setWishlist([]);
    }
  };
  const [wishlist, setWishlist] = useState(() => {
    const saved = localStorage.getItem("wishlist");
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      const validItems = parsed.filter((item) => item && typeof item === "object" && item.id);
      return validItems.filter(
        (item, index, self) => index === self.findIndex((t) => t.id === item.id),
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    // Listen for storage changes (when wishlist is updated from other tabs/pages)
    const handleStorageChange = (e) => {
      if (e.key === "wishlist") {
        loadWishlist();
      }
    };

    // Listen for custom event (when wishlist is updated in same tab)
    const handleWishlistUpdate = () => {
      loadWishlist();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("wishlistUpdated", handleWishlistUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("wishlistUpdated", handleWishlistUpdate);
    };
  }, []);

  // Remove item from wishlist
  const removeFromWishlist = (itemId) => {
    const updated = wishlist.filter((item) => item.id !== itemId);
    setWishlist(updated);
    localStorage.setItem("wishlist", JSON.stringify(updated));
    window.dispatchEvent(new Event("wishlistUpdated"));
  };

  // Clear all wishlist
  const clearWishlist = () => {
    setWishlist([]);
    localStorage.setItem("wishlist", JSON.stringify([]));
    window.dispatchEvent(new Event("wishlistUpdated"));
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1],
      },
    },
  };

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">My Wishlist</h1>
          </div>
          {wishlist.length > 0 && (
            <button
              onClick={clearWishlist}
              className="text-sm text-red-500 hover:text-red-600 font-medium"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Wishlist Content */}
      {wishlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-4"
          >
            <Heart className="w-12 h-12 text-gray-400" />
          </motion.div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Your Wishlist is Empty
          </h3>
          <p className="text-gray-600 text-center mb-6 max-w-sm">
            Start adding your favorite foods and restaurants to your wishlist!
          </p>
          <Button
            onClick={() => navigate("/grocery")}
            className="bg-[#ff8100] hover:bg-[#e67300] text-white"
          >
            Explore Foods
          </Button>
        </div>
      ) : (
        <div className="px-4 py-6">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {wishlist.map((item) => (
              <motion.div
                key={item.id}
                variants={itemVariants}
                whileHover={{ y: -5 }}
                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {item.type === "food" ? (
                  // Product Item Card
                  <div
                    className="flex gap-4 p-4 cursor-pointer"
                    onClick={() =>
                      navigate(
                        `/food/${item.originalId || item.id.replace("food-", "")}`,
                      )
                    }
                  >
                    <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = `https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=400&fit=crop`;
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-bold text-gray-900 mb-1 line-clamp-1">
                            {item.name}
                          </h3>
                          {item.description && (
                            <p className="text-xs text-gray-600 line-clamp-1 mb-2">
                              {item.description}
                            </p>
                          )}
                          {item.weight && (
                            <p className="text-xs text-gray-500 mb-1 font-medium">
                              {item.weight}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            {item.rating && (
                              <div className="flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                                <span className="text-xs font-semibold text-gray-900">
                                  {item.rating}
                                </span>
                                {item.reviews && (
                                  <span className="text-xs text-gray-500">
                                    ({item.reviews}+)
                                  </span>
                                )}
                              </div>
                            )}
                            {item.price && (
                              <span className="text-sm font-bold text-[#ff8100]">
                                ₹{item.price}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromWishlist(item.id);
                          }}
                          className="p-2 hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-5 h-5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Restaurant Item Card
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => {
                      // Navigate to restaurant page
                      // TODO: Add restaurant navigation
                    }}
                  >
                    <div className="flex gap-4">
                      <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden">
                        <img
                          src={item.foodImage}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = `https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop`;
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-gray-900 mb-1 line-clamp-1">
                              {item.name}
                            </h3>
                            {item.cuisines && (
                              <p className="text-xs text-gray-600 line-clamp-1 mb-2">
                                {item.cuisines}
                              </p>
                            )}
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 text-[#ff8100] fill-[#ff8100]" />
                                <span className="text-xs font-semibold text-gray-900">
                                  {item.rating}
                                </span>
                              </div>
                              {item.deliveryTime && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-[#ff8100]" />
                                  <span className="text-xs text-gray-700">
                                    {item.deliveryTime}
                                  </span>
                                </div>
                              )}
                              {item.distance && (
                                <span className="text-xs text-gray-600">
                                  {item.distance}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromWishlist(item.id);
                            }}
                            className="p-2 hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-5 h-5 text-red-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}
