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
    console.warn("CartProvider not available - addToCart called");
  },
  removeFromCart: () => {
    console.warn("CartProvider not available - removeFromCart called");
  },
  updateQuantity: () => {
    console.warn("CartProvider not available - updateQuantity called");
  },
  getCartCount: () => 0,
  isInCart: () => false,
  getCartItem: () => null,
  clearCart: () => {
    console.warn("CartProvider not available - clearCart called");
  },
  cleanCartForRestaurant: () => {
    console.warn("CartProvider not available - cleanCartForRestaurant called");
  },
  getFoodCartCount: () => 0,
  getGroceryCartCount: () => 0,
  isGroceryCart: () => false,
  isGroceryItem: () => false,
};

const CartContext = createContext(defaultCartContext);

const normalizeName = (name) => (name ? String(name).trim().toLowerCase() : "");

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

  const restaurantIds = items.map((i) => i?.restaurantId).filter(Boolean);
  const restaurantNames = items.map((i) => i?.restaurant).filter(Boolean);
  const firstRestaurantId = restaurantIds[0] || null;
  const firstRestaurantName = restaurantNames[0] || null;
  const firstRestaurantNameNormalized = normalizeName(firstRestaurantName);

  if (!firstRestaurantId && !firstRestaurantNameNormalized) return items;

  return items.filter((item) => {
    const itemRestaurantId = item?.restaurantId;
    const itemRestaurantNameNormalized = normalizeName(item?.restaurant);

    if (firstRestaurantNameNormalized && itemRestaurantNameNormalized) {
      return itemRestaurantNameNormalized === firstRestaurantNameNormalized;
    }

    if (firstRestaurantId && itemRestaurantId) {
      return (
        itemRestaurantId === firstRestaurantId ||
        String(itemRestaurantId) === String(firstRestaurantId)
      );
    }

    return false;
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
        food: keepSingleRestaurant(storedFood.map((i) => ({ ...i, platform: "mofood" }))),
        grocery: keepSingleRestaurant(storedGrocery.map((i) => ({ ...i, platform: "mogrocery" }))),
      };
    }

    // Migrate old single cart key
    const legacy = parseStoredCart(localStorage.getItem(STORAGE_KEYS.legacy));
    const food = legacy
      .filter((item) => detectItemPlatform(item) === "mofood")
      .map((item) => ({ ...item, platform: "mofood" }));
    const grocery = legacy
      .filter((item) => detectItemPlatform(item) === "mogrocery")
      .map((item) => ({ ...item, platform: "mogrocery" }));

    return {
      food: keepSingleRestaurant(food),
      grocery: keepSingleRestaurant(grocery),
    };
  });

  const [foodCart, setFoodCart] = useState(initialCarts.food);
  const [groceryCart, setGroceryCart] = useState(initialCarts.grocery);

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

  const addToCart = (item, sourcePosition = null) => {
    const itemPlatform = detectItemPlatform(item);
    const setTargetCart = itemPlatform === "mogrocery" ? setGroceryCart : setFoodCart;
    const targetCart = itemPlatform === "mogrocery" ? groceryCart : foodCart;

    if (!item?.restaurantId && !item?.restaurant) {
      console.error("Cannot add item: missing restaurant information", item);
      toast.error("Item is missing restaurant information. Please refresh.");
      return false;
    }

    // Restaurant consistency only within the same platform cart.
    if (targetCart.length > 0) {
      const firstItemRestaurantId = targetCart[0]?.restaurantId;
      const firstItemRestaurantName = targetCart[0]?.restaurant;
      const newItemRestaurantId = item?.restaurantId;
      const newItemRestaurantName = item?.restaurant;

      const firstRestaurantNameNormalized = normalizeName(firstItemRestaurantName);
      const newRestaurantNameNormalized = normalizeName(newItemRestaurantName);

      if (firstRestaurantNameNormalized && newRestaurantNameNormalized) {
        if (firstRestaurantNameNormalized !== newRestaurantNameNormalized) {
          toast.error(
            `Cart already contains items from "${firstItemRestaurantName}". Please clear cart or complete order first.`,
          );
          return false;
        }
      } else if (firstItemRestaurantId && newItemRestaurantId) {
        if (String(firstItemRestaurantId) !== String(newItemRestaurantId)) {
          toast.error(
            `Cart already contains items from "${firstItemRestaurantName || "another restaurant"}". Please clear cart or complete order first.`,
          );
          return false;
        }
      }
    }

    setTargetCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        if (sourcePosition) {
          const addEvent = {
            product: {
              id: item.id,
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
          i.id === item.id ? { ...i, quantity: (i.quantity || 0) + 1 } : i,
        );
      }

      const newItem = {
        ...item,
        platform: itemPlatform,
        restaurantPlatform: itemPlatform,
        quantity: 1,
      };

      if (sourcePosition) {
        const addEvent = {
          product: {
            id: item.id,
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

      const targetRestaurantNameNormalized = normalizeName(restaurantName);

      const cleanedCart = prev.filter((item) => {
        const itemRestaurantId = item?.restaurantId;
        const itemRestaurantNameNormalized = normalizeName(item?.restaurant);

        if (targetRestaurantNameNormalized && itemRestaurantNameNormalized) {
          return itemRestaurantNameNormalized === targetRestaurantNameNormalized;
        }

        if (restaurantId && itemRestaurantId) {
          return String(itemRestaurantId) === String(restaurantId);
        }

        return false;
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
