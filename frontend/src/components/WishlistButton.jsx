import React, { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

const WishlistButton = ({ item, type = "food", className = "" }) => {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const productId = item?._id || item?.id;
  const itemId = type === "food" ? `food-${productId}` : `restaurant-${productId}`;

  const getWishlist = () => {
    try {
      const stored = localStorage.getItem("wishlist");
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      // Ensure we only work with objects that have an ID, or filter out legacy usage
      return Array.isArray(parsed)
        ? parsed.filter((i) => typeof i === "object" && i !== null && i.id)
        : [];
    } catch (error) {
      console.error("Error reading wishlist:", error);
      return [];
    }
  };

  useEffect(() => {
    const checkWishlist = () => {
      const wishlist = getWishlist();
      setIsWishlisted(wishlist.some((w) => String(w.id) === String(itemId)));
    };

    checkWishlist();

    const handleStorageChange = () => checkWishlist();
    window.addEventListener("wishlistUpdated", handleStorageChange); // Custom event
    window.addEventListener("storage", handleStorageChange); // Cross-tab

    return () => {
      window.removeEventListener("wishlistUpdated", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [itemId]);

  const toggleWishlist = (e) => {
    e.stopPropagation();

    let wishlist = getWishlist();
    const exists = wishlist.some((w) => String(w.id) === String(itemId));

    if (exists) {
      wishlist = wishlist.filter((w) => String(w.id) !== String(itemId));
      setIsWishlisted(false);
      toast.success("Removed from Wishlist");
    } else {
      const wishlistItem = {
        ...item,
        id: itemId,
        type,
        originalId: productId,
      };
      wishlist.push(wishlistItem);
      setIsWishlisted(true);
      toast.success("Added to Wishlist");
    }

    localStorage.setItem("wishlist", JSON.stringify(wishlist));
    window.dispatchEvent(new Event("wishlistUpdated"));
  };

  return (
    <button
      onClick={toggleWishlist}
      className={twMerge(
        "rounded-full flex items-center justify-center transition-all duration-300 shadow-sm active:scale-90 w-10 h-10 bg-white text-slate-800 hover:scale-110",
        className,
        isWishlisted &&
        "bg-[#ffe0e8] text-[#ff3269] fill-[#ff3269] hover:bg-[#ffe0e8]",
      )}
    >
      <Heart
        size={20}
        className={isWishlisted ? "fill-[#ff3269]" : ""}
        strokeWidth={isWishlisted ? 2.5 : 2}
      />
    </button>
  );
};

export default WishlistButton;
