// src/context/cart-context.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

const STORAGE_KEYS = {
  food: "cart_mofood",
  grocery: "cart_mogrocery",
  legacy: "cart",
};

// Default cart context value to prevent errors during initial render
const defaultCartContext = {
  _isProvider: false,
  cart: [],
  foodCart: [],
  groceryCart: [],
  items: [],
  itemCount: 0,
  total: 0,
  lastAddEvent: null,
  lastRemoveEvent: null,
  foodItems: [],
  groceryItems: [],
  foodItemCount: 0,
  groceryItemCount: 0,
  foodTotal: 0,
  groceryTotal: 0,
  lastAddEventFood: null,
  lastAddEventGrocery: null,
  lastRemoveEventFood: null,
  lastRemoveEventGrocery: null,
  addToCart: () => {
  },
  removeFromCart: () => {
  },
  updateQuantity: () => {
  },
  getCartCount: () => 0,
  isInCart: () => false,
  getCartItem: () => null,
  clearCart: () => {
  },
  cleanCartForRestaurant: () => {
  },
  getFoodCartCount: () => 0,
  getGroceryCartCount: () => 0,
  isGroceryCart: () => false,
  isGroceryItem: () => false,
};

const CartContext = createContext(defaultCartContext);

const normalizeName = (name) => (name ? String(name).trim().toLowerCase() : "");

const resolveEntityId = (value) =>
  String(
    value?._id ||
      value?.id ||
      value?.restaurantId ||
      value?.storeId ||
      value ||
      "",
  ).trim();

const getRestaurantIdentity = (item) => {
  const restaurantId = resolveEntityId(item?.restaurantId) || resolveEntityId(item?.storeId);
  const restaurantName = normalizeName(item?.restaurant || item?.storeName || "");
  const identityKey = restaurantId
    ? `id:${restaurantId}`
    : restaurantName
      ? `name:${restaurantName}`
      : "";

  return {
    restaurantId,
    restaurantName,
    identityKey,
  };
};

const detectItemPlatform = (item) => {
  const normalizedPlatform = String(
    item?.platform || item?.restaurantPlatform || "",
  ).toLowerCase();

  if (normalizedPlatform === "mogrocery") return "mogrocery";
  if (normalizedPlatform === "mofood") return "mofood";

  // Backward-compatible fallback for old cart items.
  if (
    item?.restaurantId === "grocery-store" ||
    String(item?.restaurant || "").toLowerCase().includes("mogrocery")
  ) {
    return "mogrocery";
  }

  return "mofood";
};

const isGroceryItem = (item) => detectItemPlatform(item) === "mogrocery";

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || "").trim());

const resolveGroceryProductId = (item) => {
  const candidates = [
    item?._id,
    item?.itemId,
    item?.productId,
    item?.id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return candidates.find((id) => isMongoObjectId(id)) || "";
};

const normalizeGroceryCartItem = (item) => {
  const normalizedId = resolveGroceryProductId(item);
  if (!normalizedId) return null;
  return { ...item, id: normalizedId };
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
        ? normalizedGroceryProductId
        : String(item?.itemId || item?.id || item?._id || "").trim();

    if (!normalizedItemId) {
      console.error("Cannot add item: missing item id", item);
      toast.error("Invalid item. Please refresh and try again.");
      return false;
    }

    setTargetCart((prev) => {
      const existing = prev.find((i) => String(i.id) === normalizedItemId);
      if (existing) {
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

      const newItem = {
        ...item,
        ...(itemPlatform === "mogrocery" ? { id: normalizedGroceryProductId } : {}),
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
      if (
        existingItem &&
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
      return prev.map((i) => (i.id === itemId ? { ...i, quantity } : i));
    });
  };

  const updateQuantityByPlatform = (
    itemId,
    quantity,
    platform = "mofood",
    sourcePosition = null,
    productInfo = null,
  ) => {
    const resolvedPlatform = platform === "mogrocery" ? "mogrocery" : "mofood";
    const setTargetCart = resolvedPlatform === "mogrocery" ? setGroceryCart : setFoodCart;

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
          if (resolvedPlatform === "mogrocery") {
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
      if (
        existingItem &&
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
        if (resolvedPlatform === "mogrocery") {
          setLastRemoveEventGrocery(removeEvent);
          setTimeout(() => setLastRemoveEventGrocery(null), 1500);
        } else {
          setLastRemoveEventFood(removeEvent);
          setTimeout(() => setLastRemoveEventFood(null), 1500);
        }
        setTimeout(() => setLastRemoveEvent(null), 1500);
      }

      return prev.map((i) => (i.id === itemId ? { ...i, quantity } : i));
    });
  };

  const getCartCount = () =>
    activeCart.reduce((total, item) => total + (item.quantity || 0), 0);

  const getFoodCartCount = () =>
    foodCart.reduce((total, item) => total + (item.quantity || 0), 0);

  const getGroceryCartCount = () =>
    groceryCart.reduce((total, item) => total + (item.quantity || 0), 0);

  const isGroceryCart = () => activePlatform === "mogrocery" && groceryCart.length > 0;

  const isInCart = (itemId) => activeCart.some((i) => i.id === itemId);

  const getCartItem = (itemId) => activeCart.find((i) => i.id === itemId);

  const clearCart = (platform = activePlatform) => {
    if (platform === "mogrocery") {
      setGroceryCart([]);
      return;
    }
    if (platform === "mofood") {
      setFoodCart([]);
      return;
    }
    setFoodCart([]);
    setGroceryCart([]);
  };

  // Keeps only items from one restaurant in food cart.
  const cleanCartForRestaurant = (restaurantId, restaurantName) => {
    setFoodCart((prev) => {
      if (prev.length === 0) return prev;

      const targetIdentity = getRestaurantIdentity({
        restaurantId,
        restaurant: restaurantName,
      });

      const cleanedCart = prev.filter((item) => {
        const itemIdentity = getRestaurantIdentity(item);
        return (
          Boolean(targetIdentity.identityKey) &&
          itemIdentity.identityKey === targetIdentity.identityKey
        );
      });

      if (cleanedCart.length !== prev.length) {
        console.warn("Cleaned food cart: removed items from different restaurants", {
          before: prev.length,
          after: cleanedCart.length,
          removed: prev.length - cleanedCart.length,
        });
      }

      return cleanedCart;
    });
  };

  // Transform active cart to match AddToCartAnimation expected structure
  const cartForAnimation = useMemo(() => {
    const items = activeCart.map((item) => ({
      product: {
        id: item.id,
        name: item.name,
        imageUrl: item.image || item.imageUrl,
      },
      quantity: item.quantity || 1,
    }));

    const itemCount = activeCart.reduce(
      (total, item) => total + (item.quantity || 0),
      0,
    );
    const total = activeCart.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0,
    );

    return {
      items,
      itemCount,
      total,
    };
  }, [activeCart]);

  const foodCartForAnimation = useMemo(() => {
    const items = foodCart.map((item) => ({
      product: {
        id: item.id,
        name: item.name,
        imageUrl: item.image || item.imageUrl,
      },
      quantity: item.quantity || 1,
    }));

    return {
      items,
      itemCount: foodCart.reduce((total, item) => total + (item.quantity || 0), 0),
      total: foodCart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0),
    };
  }, [foodCart]);

  const groceryCartForAnimation = useMemo(() => {
    const items = groceryCart.map((item) => ({
      product: {
        id: item.id,
        name: item.name,
        imageUrl: item.image || item.imageUrl,
      },
      quantity: item.quantity || 1,
    }));

    return {
      items,
      itemCount: groceryCart.reduce((total, item) => total + (item.quantity || 0), 0),
      total: groceryCart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0),
    };
  }, [groceryCart]);

  const value = {
    _isProvider: true,
    cart: activeCart,
    foodCart,
    groceryCart,
    items: cartForAnimation.items,
    itemCount: cartForAnimation.itemCount,
    total: cartForAnimation.total,
    lastAddEvent,
    lastRemoveEvent,
    foodItems: foodCartForAnimation.items,
    groceryItems: groceryCartForAnimation.items,
    foodItemCount: foodCartForAnimation.itemCount,
    groceryItemCount: groceryCartForAnimation.itemCount,
    foodTotal: foodCartForAnimation.total,
    groceryTotal: groceryCartForAnimation.total,
    lastAddEventFood,
    lastAddEventGrocery,
    lastRemoveEventFood,
    lastRemoveEventGrocery,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateQuantityByPlatform,
    getCartCount,
    isInCart,
    getCartItem,
    clearCart,
    cleanCartForRestaurant,
    getFoodCartCount,
    getGroceryCartCount,
    isGroceryCart,
    isGroceryItem,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context || context._isProvider !== true) {
    if (import.meta.env.DEV) {
      console.warn(
        "useCart called outside CartProvider. Using default values.",
      );
      console.warn(
        "Make sure the component is rendered inside UserLayout which provides CartProvider.",
      );
    }
    return defaultCartContext;
  }
  return context;
}
