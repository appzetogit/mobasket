import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { resolveEntityId } from "@/lib/utils/entityIdResolver";

const CartContext = createContext();

const STORAGE_KEYS = {
  food: "cart_food", // Restaurant items
  grocery: "cart_grocery", // Grocery store items
  legacy: "cart", // For backward compatibility
};

// --- Utility Helpers ---

const normalizeVariantKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const getGroceryCartItemId = (item) => {
  const productId = String(item?._id || item?.id || item?.productId || "").trim();
  if (!productId) return "";

  const variantLabel =
    item?.selectedVariant?.name ||
    item?.variantName ||
    item?.weight ||
    item?.unit ||
    "";
  const variantKey = normalizeVariantKey(variantLabel);

  return variantKey ? `${productId}::${variantKey}` : productId;
};

const resolveGroceryProductId = (item) => {
  return String(
    item?.productId || item?._id || item?.id || ""
  ).trim();
};

const detectItemPlatform = (item) => {
  if (item?.platform === "mogrocery" || item?.restaurantPlatform === "mogrocery") return "mogrocery";
  if (item?.platform === "mofood" || item?.restaurantPlatform === "mofood") return "mofood";

  const storeId = String(item?.storeId?._id || item?.storeId?.id || item?.storeId || "").trim();
  const restaurantId = String(item?.restaurantId?._id || item?.restaurantId?.id || item?.restaurantId || "").trim();

  if (storeId && storeId !== "grocery-store" && !restaurantId) return "mogrocery";
  return "mofood";
};

const getRestaurantIdentity = (item) => {
  const platform = detectItemPlatform(item);
  const id = String(item?.restaurantId || item?.storeId || item?.restaurant?._id || "").trim();
  const name = String(item?.restaurant || item?.storeName || "").trim();
  return { identityKey: id || name, platform };
};

const normalizeGroceryCartItem = (item) => {
  const normalizedId = resolveGroceryProductId(item);
  if (!normalizedId) return null;
  return { ...item, id: getGroceryCartItemId(item), productId: normalizedId };
};

const normalizeFoodCartItem = (item) => {
  const normalizedId = String(item?.itemId || item?.id || item?._id || "").trim();
  if (!normalizedId) return null;
  return { ...item, id: normalizedId, itemId: normalizedId };
};

const getNormalizedStoreId = (item) => {
  const restaurantId = resolveEntityId(item?.restaurantId);
  const storeId = resolveEntityId(item?.storeId);

  if (storeId && storeId !== "grocery-store") return storeId;
  if (restaurantId && restaurantId !== "grocery-store") return restaurantId;
  return "";
};

const isValidGroceryCartItem = (item) => {
  if (!item || typeof item !== "object") return false;
  if (!resolveGroceryProductId(item)) return false;
  return Boolean(getNormalizedStoreId(item));
};

const isGroceryItem = (item) => {
  return detectItemPlatform(item) === "mogrocery";
};
const parseStoredCart = (raw) => {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const keepSingleRestaurant = (items) => {
  if (!Array.isArray(items) || items.length <= 1) return Array.isArray(items) ? items : [];

  const firstIdentity = getRestaurantIdentity(items[0]);
  if (!firstIdentity.identityKey) return items;
  return items.filter((item) => {
    const itemIdentity = getRestaurantIdentity(item);
    return itemIdentity.identityKey === firstIdentity.identityKey;
  });
};

const getActivePlatformFromPath = (pathname = "") => {
  if (pathname.startsWith("/grocery") || pathname.startsWith("/user/grocery")) {
    return "mogrocery";
  }
  return "mofood";
};

export function CartProvider({ children }) {
  const location = useLocation();

  const [initialCarts] = useState(() => {
    if (typeof window === "undefined") return { food: [], grocery: [] };

    const storedFood = parseStoredCart(localStorage.getItem(STORAGE_KEYS.food));
    const storedGrocery = parseStoredCart(localStorage.getItem(STORAGE_KEYS.grocery));

    if (storedFood.length > 0 || storedGrocery.length > 0) {
      return {
        food: keepSingleRestaurant(
          storedFood
            .map((i) => normalizeFoodCartItem({ ...i, platform: "mofood" }))
            .filter(Boolean),
        ),
        grocery: keepSingleRestaurant(
          storedGrocery
            .filter(isValidGroceryCartItem)
            .map((i) => normalizeGroceryCartItem({ ...i, platform: "mogrocery" }))
            .filter(Boolean),
        ),
      };
    }

    // Migrate old single cart key
    const legacy = parseStoredCart(localStorage.getItem(STORAGE_KEYS.legacy));
    const food = legacy
      .filter((item) => detectItemPlatform(item) === "mofood")
      .map((item) => normalizeFoodCartItem({ ...item, platform: "mofood" }))
      .filter(Boolean);
    const grocery = legacy
      .filter((item) => detectItemPlatform(item) === "mogrocery")
      .filter(isValidGroceryCartItem)
      .map((item) => normalizeGroceryCartItem({ ...item, platform: "mogrocery" }))
      .filter(Boolean);

    return {
      food: keepSingleRestaurant(food),
      grocery: keepSingleRestaurant(grocery),
    };
  });

  const [foodCart, setFoodCart] = useState(initialCarts.food);
  const [groceryCart, setGroceryCart] = useState(initialCarts.grocery);

  useEffect(() => {
    setFoodCart((prev) => {
      const normalized = prev
        .map((item) => normalizeFoodCartItem(item))
        .filter(Boolean);
      return normalized.length === prev.length ? prev : normalized;
    });
  }, []);

  useEffect(() => {
    setGroceryCart((prev) => {
      const normalized = prev
        .filter(isValidGroceryCartItem)
        .map((item) => normalizeGroceryCartItem(item))
        .filter(Boolean);
      return normalized.length === prev.length ? prev : normalized;
    });
  }, []);

  // Track last add event for animation
  const [lastAddEvent, setLastAddEvent] = useState(null);
  // Track last remove event for animation
  const [lastRemoveEvent, setLastRemoveEvent] = useState(null);
  const [lastAddEventFood, setLastAddEventFood] = useState(null);
  const [lastAddEventGrocery, setLastAddEventGrocery] = useState(null);
  const [lastRemoveEventFood, setLastRemoveEventFood] = useState(null);
  const [lastRemoveEventGrocery, setLastRemoveEventGrocery] = useState(null);

  const activePlatform = getActivePlatformFromPath(location?.pathname || "");

  const activeCart = activePlatform === "mogrocery" ? groceryCart : foodCart;

  // Persist carts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.food, JSON.stringify(foodCart));
      localStorage.setItem(STORAGE_KEYS.grocery, JSON.stringify(groceryCart));
      // Keep legacy key for backward compatibility and debug visibility.
      localStorage.setItem(STORAGE_KEYS.legacy, JSON.stringify([...foodCart, ...groceryCart]));
    } catch {
      // ignore storage errors
    }
  }, [foodCart, groceryCart]);

  // Clear cart when authentication state changes (logout or new login)
  useEffect(() => {
    const handleAuthChange = () => {
      setFoodCart([]);
      setGroceryCart([]);
    };

    window.addEventListener('userAuthChanged', handleAuthChange);
    return () => window.removeEventListener('userAuthChanged', handleAuthChange);
  }, []);

  const addToCart = (item, sourcePosition = null) => {
    const itemPlatform = detectItemPlatform(item);
    const setTargetCart = itemPlatform === "mogrocery" ? setGroceryCart : setFoodCart;
    const targetCart = itemPlatform === "mogrocery" ? groceryCart : foodCart;
    const normalizedGroceryProductId =
      itemPlatform === "mogrocery" ? resolveGroceryProductId(item) : "";

    if (itemPlatform === "mogrocery" && !normalizedGroceryProductId) {
      console.error("Cannot add grocery item: invalid product id", item);
      toast.error("Invalid product. Please refresh and try again.");
      return false;
    }

    if (!item?.restaurantId && !item?.restaurant) {
      console.error("Cannot add item: missing restaurant information", item);
      toast.error("Item is missing restaurant information. Please refresh.");
      return false;
    }

    // Restaurant consistency only within the same platform cart.
    if (targetCart.length > 0) {
      const firstItemIdentity = getRestaurantIdentity(targetCart[0]);
      const newItemIdentity = getRestaurantIdentity(item);
      const firstItemRestaurantName =
        targetCart[0]?.restaurant || targetCart[0]?.storeName || "another restaurant";

      if (
        firstItemIdentity.identityKey &&
        newItemIdentity.identityKey &&
        firstItemIdentity.identityKey !== newItemIdentity.identityKey
      ) {
        toast.error(
          `Cart already contains items from "${firstItemRestaurantName}". Please clear cart or complete order first.`,
        );
        return false;
      }
    }

    const normalizedItemId =
      itemPlatform === "mogrocery"
        ? getGroceryCartItemId({ ...item, productId: normalizedGroceryProductId })
        : String(item?.itemId || item?.id || item?._id || "").trim();

    if (!normalizedItemId) {
      console.error("Cannot add item: missing item id", item);
      toast.error("Invalid item. Please refresh and try again.");
      return false;
    }

    setTargetCart((prev) => {
      const existing = prev.find((i) => String(i.id) === normalizedItemId);
      if (existing) {
        // Stock Validation
        const stockAvailable = (item.stockQuantity !== undefined && item.stockQuantity !== null)
          ? Number(item.stockQuantity)
          : ((existing.stockQuantity !== undefined && existing.stockQuantity !== null) ? Number(existing.stockQuantity) : Infinity);

        if (existing.quantity + 1 > stockAvailable) {
          toast.error(`Only ${stockAvailable} units available in stock`);
          return prev;
        }

        if (sourcePosition) {
          const addEvent = {
            product: {
              id: normalizedItemId,
              name: item.name,
              imageUrl: item.image || item.imageUrl,
            },
            sourcePosition,
          };
          setLastAddEvent(addEvent);
          if (itemPlatform === "mogrocery") {
            setLastAddEventGrocery(addEvent);
            setTimeout(() => setLastAddEventGrocery(null), 1500);
          } else {
            setLastAddEventFood(addEvent);
            setTimeout(() => setLastAddEventFood(null), 1500);
          }
          setTimeout(() => setLastAddEvent(null), 1500);
        }
        return prev.map((i) =>
          String(i.id) === normalizedItemId ? { ...i, quantity: (i.quantity || 0) + 1 } : i,
        );
      }

      // Stock Validation for first item
      const stockAvailable = (item.stockQuantity !== undefined && item.stockQuantity !== null)
        ? Number(item.stockQuantity)
        : Infinity;

      if (1 > stockAvailable) {
        toast.error(`Only ${stockAvailable} units available in stock`);
        return prev;
      }

      const newItem = {
        ...item,
        ...(itemPlatform === "mogrocery"
          ? { id: normalizedItemId, cartItemId: normalizedItemId, productId: normalizedGroceryProductId }
          : {}),
        ...(itemPlatform === "mofood" ? { id: normalizedItemId, itemId: normalizedItemId } : {}),
        platform: itemPlatform,
        restaurantPlatform: itemPlatform,
        quantity: 1,
      };

      if (sourcePosition) {
        const addEvent = {
          product: {
            id: normalizedItemId,
            name: item.name,
            imageUrl: item.image || item.imageUrl,
          },
          sourcePosition,
        };
        setLastAddEvent(addEvent);
        if (itemPlatform === "mogrocery") {
          setLastAddEventGrocery(addEvent);
          setTimeout(() => setLastAddEventGrocery(null), 1500);
        } else {
          setLastAddEventFood(addEvent);
          setTimeout(() => setLastAddEventFood(null), 1500);
        }
        setTimeout(() => setLastAddEvent(null), 1500);
      }

      return [...prev, newItem];
    });

    return true;
  };

  const removeFromCart = (
    itemId,
    sourcePosition = null,
    productInfo = null,
  ) => {
    const setTargetCart = activePlatform === "mogrocery" ? setGroceryCart : setFoodCart;

    setTargetCart((prev) => {
      const itemToRemove = prev.find((i) => i.id === itemId);
      if (itemToRemove && sourcePosition && productInfo) {
        const removeEvent = {
          product: {
            id: productInfo.id || itemToRemove.id,
            name: productInfo.name || itemToRemove.name,
            imageUrl:
              productInfo.imageUrl ||
              productInfo.image ||
              itemToRemove.image ||
              itemToRemove.imageUrl,
          },
          sourcePosition,
        };
        setLastRemoveEvent(removeEvent);
        if (activePlatform === "mogrocery") {
          setLastRemoveEventGrocery(removeEvent);
          setTimeout(() => setLastRemoveEventGrocery(null), 1500);
        } else {
          setLastRemoveEventFood(removeEvent);
          setTimeout(() => setLastRemoveEventFood(null), 1500);
        }
        setTimeout(() => setLastRemoveEvent(null), 1500);
      }
      return prev.filter((i) => i.id !== itemId);
    });
  };

  const updateQuantity = (
    itemId,
    quantity,
    sourcePosition = null,
    productInfo = null,
  ) => {
    const setTargetCart = activePlatform === "mogrocery" ? setGroceryCart : setFoodCart;

    if (quantity <= 0) {
      setTargetCart((prev) => {
        const itemToRemove = prev.find((i) => i.id === itemId);
        if (itemToRemove && sourcePosition && productInfo) {
          const removeEvent = {
            product: {
              id: productInfo.id || itemToRemove.id,
              name: productInfo.name || itemToRemove.name,
              imageUrl:
                productInfo.imageUrl ||
                productInfo.image ||
                itemToRemove.image ||
                itemToRemove.imageUrl,
            },
            sourcePosition,
          };
          setLastRemoveEvent(removeEvent);
          if (activePlatform === "mogrocery") {
            setLastRemoveEventGrocery(removeEvent);
            setTimeout(() => setLastRemoveEventGrocery(null), 1500);
          } else {
            setLastRemoveEventFood(removeEvent);
            setTimeout(() => setLastRemoveEventFood(null), 1500);
          }
          setTimeout(() => setLastRemoveEvent(null), 1500);
        }
        return prev.filter((i) => i.id !== itemId);
      });
      return;
    }

    setTargetCart((prev) => {
      const existingItem = prev.find((i) => i.id === itemId);

      if (existingItem) {
        // Stock Validation
        const stockAvailable = (productInfo?.stockQuantity !== undefined && productInfo?.stockQuantity !== null)
          ? Number(productInfo.stockQuantity)
          : ((existingItem.stockQuantity !== undefined && existingItem.stockQuantity !== null) ? Number(existingItem.stockQuantity) : Infinity);

        if (quantity > stockAvailable) {
          toast.error(`Only ${stockAvailable} units available in stock`);
          return prev;
        }

        if (
          quantity < (existingItem.quantity || 0) &&
          sourcePosition &&
          productInfo
        ) {
          const removeEvent = {
            product: {
              id: productInfo.id || existingItem.id,
              name: productInfo.name || existingItem.name,
              imageUrl:
                productInfo.imageUrl ||
                productInfo.image ||
                existingItem.image ||
                existingItem.imageUrl,
            },
            sourcePosition,
          };
          setLastRemoveEvent(removeEvent);
          if (activePlatform === "mogrocery") {
            setLastRemoveEventGrocery(removeEvent);
            setTimeout(() => setLastRemoveEventGrocery(null), 1500);
          } else {
            setLastRemoveEventFood(removeEvent);
            setTimeout(() => setLastRemoveEventFood(null), 1500);
          }
          setTimeout(() => setLastRemoveEvent(null), 1500);
        }
        return prev.map((i) =>
          i.id === itemId ? { ...i, quantity } : i,
        );
      }
      return prev;
    });
  };

  const updateQuantityByPlatform = (itemId, quantity, platform) => {
    const setTargetCart = platform === "mogrocery" ? setGroceryCart : setFoodCart;
    const targetCart = platform === "mogrocery" ? groceryCart : foodCart;

    if (quantity <= 0) {
      setTargetCart((prev) => prev.filter((i) => i.id === itemId));
      return;
    }

    setTargetCart((prev) => {
      const existingItem = prev.find((i) => i.id === itemId);
      if (existingItem) {
        // Stock Validation
        const stockAvailable = (existingItem.stockQuantity !== undefined && existingItem.stockQuantity !== null)
          ? Number(existingItem.stockQuantity)
          : Infinity;

        if (quantity > stockAvailable) {
          toast.error(`Only ${stockAvailable} units available in stock`);
          return prev;
        }
        return prev.map((i) => (i.id === itemId ? { ...i, quantity } : i));
      }
      return prev;
    });
  };

  const clearCart = () => {
    setFoodCart([]);
    setGroceryCart([]);
  };

  const clearPlatformCart = (platform) => {
    if (platform === "mogrocery") setGroceryCart([]);
    else setFoodCart([]);
  };

  const getCartCount = useCallback(() => {
    return activeCart.reduce((total, item) => total + (item.quantity || 0), 0);
  }, [activeCart]);

  const getFoodCartCount = useCallback(() => {
    return foodCart.reduce((total, item) => total + (item.quantity || 0), 0);
  }, [foodCart]);

  const getGroceryCartCount = useCallback(() => {
    return groceryCart.reduce((total, item) => total + (item.quantity || 0), 0);
  }, [groceryCart]);

  const getCartTotal = useCallback(() => {
    return activeCart.reduce(
      (total, item) => total + (item.price || 0) * (item.quantity || 0),
      0,
    );
  }, [activeCart]);

  const getPlatformCartTotal = useCallback((platform) => {
    const cart = platform === "mogrocery" ? groceryCart : foodCart;
    return cart.reduce(
      (total, item) => total + (item.price || 0) * (item.quantity || 0),
      0,
    );
  }, [foodCart, groceryCart]);

  const isInCart = useCallback((itemId) => {
    return activeCart.some((item) => item.id === itemId);
  }, [activeCart]);

  const getCartItem = useCallback((itemId) => {
    return activeCart.find((item) => item.id === itemId);
  }, [activeCart]);

  const value = useMemo(() => {
    const foodItemCount = foodCart.reduce((total, item) => total + (item.quantity || 0), 0);
    const groceryItemCount = groceryCart.reduce((total, item) => total + (item.quantity || 0), 0);
    const foodTotal = foodCart.reduce((total, item) => total + (item.price || 0) * (item.quantity || 0), 0);
    const groceryTotal = groceryCart.reduce((total, item) => total + (item.price || 0) * (item.quantity || 0), 0);

    const contextValue = {
      foodCart,
      groceryCart,
      activeCart,
      cart: activeCart,
      items: activeCart,
      foodItems: foodCart,
      groceryItems: groceryCart,
      activePlatform,
      isGroceryItem,
      addToCart,
      removeFromCart,
      updateQuantity,
      updateQuantityByPlatform,
      clearCart,
      clearPlatformCart,
      getCartCount,
      getFoodCartCount,
      getGroceryCartCount,
      getCartTotal,
      getPlatformCartTotal,
      isInCart,
      getCartItem,
      lastAddEvent,
      lastRemoveEvent,
      lastAddEventFood,
      lastAddEventGrocery,
      lastRemoveEventFood,
      lastRemoveEventGrocery,
      foodItemCount,
      groceryItemCount,
      itemCount: activePlatform === "mogrocery" ? groceryItemCount : foodItemCount,
      foodTotal,
      groceryTotal,
      total: activePlatform === "mogrocery" ? groceryTotal : foodTotal,
    };
    return contextValue;
  }, [
    foodCart,
    groceryCart,
    activeCart,
    activePlatform,
    lastAddEvent,
    lastRemoveEvent,
    lastAddEventFood,
    lastAddEventGrocery,
    lastRemoveEventFood,
    lastRemoveEventGrocery,
    getFoodCartCount,
    getGroceryCartCount,
    getCartTotal,
    isInCart,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
