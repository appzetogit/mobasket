import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Star,
  Clock,
  Search,
  SlidersHorizontal,
  ChevronDown,
  Bookmark,
  BadgePercent,
  Mic,
  MapPin,
  ArrowDownUp,
  Timer,
  IndianRupee,
  UtensilsCrossed,
  ShieldCheck,
  X,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import api from "@/lib/api";
import { restaurantAPI, adminAPI } from "@/lib/api";
import { useProfile } from "../context/ProfileContext";
import { useCart } from "../context/CartContext";
import { useLocation } from "../hooks/useLocation";
import { useZone } from "../hooks/useZone";

// Filter options
const filterOptions = [
  { id: "under-30-mins", label: "Under 30 mins" },
  { id: "price-match", label: "Price Match", hasIcon: true },
  { id: "flat-50-off", label: "Flat 50% OFF", hasIcon: true },
  { id: "under-250", label: "Under ₹250" },
  { id: "rating-4-plus", label: "Rating 4.0+" },
];

const normalizeCityName = (value) => String(value || "").trim().toLowerCase();

const CITY_PLACEHOLDERS = new Set([
  "",
  "current location",
  "select location",
  "unknown city",
]);

const isUsableCityValue = (value) => {
  const normalized = normalizeCityName(value);
  return normalized && !CITY_PLACEHOLDERS.has(normalized);
};

const extractCityFromAddressText = (value) => {
  if (!value || typeof value !== "string") return "";
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return "";

  const pincodeIndex = parts.findIndex((part) => /^\d{5,6}$/.test(part));
  if (pincodeIndex >= 1) {
    return parts[pincodeIndex - 1] || "";
  }

  if (parts.length >= 2) {
    return parts[parts.length - 2] || "";
  }

  return parts[0] || "";
};

const getSavedUserCity = () => {
  if (typeof window === "undefined") return "";
  try {
    const savedLocation = JSON.parse(localStorage.getItem("userLocation") || "null");
    if (!savedLocation || typeof savedLocation !== "object") return "";

    const directCity = savedLocation.city || savedLocation.location?.city || "";
    if (isUsableCityValue(directCity)) return String(directCity).trim();

    const fromAddress =
      extractCityFromAddressText(savedLocation.formattedAddress) ||
      extractCityFromAddressText(savedLocation.address);
    return isUsableCityValue(fromAddress) ? String(fromAddress).trim() : "";
  } catch {
    return "";
  }
};

const resolveUserCity = (locationLike) => {
  const directCity = locationLike?.city || locationLike?.location?.city || "";
  if (isUsableCityValue(directCity)) return String(directCity).trim();

  const fromAddress =
    extractCityFromAddressText(locationLike?.formattedAddress) ||
    extractCityFromAddressText(locationLike?.address);
  if (isUsableCityValue(fromAddress)) return String(fromAddress).trim();

  return getSavedUserCity();
};

const extractRestaurantCity = (restaurant) => {
  const directCity =
    restaurant?.location?.city ||
    restaurant?.city ||
    restaurant?.address?.city ||
    "";

  if (String(directCity || "").trim()) {
    return String(directCity).trim();
  }

  const formattedAddress =
    restaurant?.location?.formattedAddress ||
    restaurant?.location?.address ||
    restaurant?.address ||
    "";

  if (!formattedAddress || typeof formattedAddress !== "string") return "";

  const parts = formattedAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const pincodeIndex = parts.findIndex((part) => /^\d{5,6}$/.test(part));
  if (pincodeIndex >= 1) {
    return parts[pincodeIndex - 1] || "";
  }

  if (parts.length >= 2) {
    return parts[parts.length - 2] || "";
  }

  return "";
};

const matchesRestaurantCity = (restaurant, normalizedUserCity) => {
  if (!normalizedUserCity) return false;

  const candidates = [
    restaurant?.location?.city,
    restaurant?.city,
    restaurant?.address?.city,
    restaurant?.location?.formattedAddress,
    restaurant?.location?.address,
    extractRestaurantCity(restaurant),
  ]
    .map((value) => normalizeCityName(value))
    .filter(Boolean);

  if (candidates.length === 0) return false;

  return candidates.some(
    (candidate) =>
      candidate === normalizedUserCity ||
      candidate.includes(normalizedUserCity) ||
      normalizedUserCity.includes(candidate),
  );
};

// Mock data removed - using backend data only

export default function CategoryPage() {
  const { category } = useParams();
  const navigate = useNavigate();
  const { vegMode } = useProfile();
  const { addToCart, getCartItem, updateQuantity } = useCart();
  const { location } = useLocation();
  const { zoneId, isOutOfService, loading: zoneLoading } = useZone(location);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    category?.toLowerCase() || "all",
  );
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [favorites, setFavorites] = useState(new Set());
  const [sortBy, setSortBy] = useState(null);
  const [selectedCuisine, setSelectedCuisine] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState("sort");
  const [activeScrollSection, setActiveScrollSection] = useState("sort");
  const [isLoadingFilterResults, setIsLoadingFilterResults] = useState(false);
  const filterSectionRefs = useRef({});
  const rightContentRef = useRef(null);
  const categoryScrollRef = useRef(null);

  // State for categories from admin
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // State for restaurants from backend
  const [restaurantsData, setRestaurantsData] = useState([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [isCategorySwitching, setIsCategorySwitching] = useState(false);
  const [categoryKeywords, setCategoryKeywords] = useState({});

  const getCategoryKeywords = (categoryId) => {
    const mapped = categoryKeywords[categoryId];
    if (Array.isArray(mapped) && mapped.length > 0) {
      return mapped;
    }

    const normalized = String(categoryId || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (!normalized) return [];

    return [normalized];
  };

  // Fetch categories from admin API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true);
        const response = await adminAPI.getPublicCategories();

        if (
          response.data &&
          response.data.success &&
          response.data.data &&
          response.data.data.categories
        ) {
          const categoriesArray = response.data.data.categories;

          // Filter out any category with id or slug "all" to prevent duplicates
          const filteredCategories = categoriesArray.filter((cat) => {
            const catId = cat.slug || cat.id;
            const catSlug =
              cat.slug || cat.name?.toLowerCase().replace(/\s+/g, "-");
            return catId !== "all" && catSlug !== "all";
          });

          // Transform API categories to match expected format
          const transformedCategories = [
            {
              id: "all",
              name: "All",
              image: null,
              slug: "all",
            },
            ...filteredCategories.map((cat) => ({
              id: cat.slug || cat.id,
              name: cat.name,
              image: cat.image?.url || cat.image || null,
              slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, "-"),
              type: cat.type,
            })),
          ];

          setCategories(transformedCategories);

          // Generate strict category keywords from category names/slugs
          const keywordsMap = {};
          categoriesArray.forEach((cat) => {
            const categoryId = cat.slug || cat.id;
            const categoryName = String(cat.name || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, " ")
              .trim();
            const categorySlug = String(cat.slug || cat.id || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, " ")
              .trim();
            keywordsMap[categoryId] = Array.from(
              new Set([categoryName, categorySlug].filter(Boolean)),
            );
          });

          setCategoryKeywords(keywordsMap);
        } else {
          // Keep default "All" category on error
          setCategories([
            {
              id: "all",
              name: "All",
              image: null,
              slug: "all",
            },
          ]);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
        // Keep default "All" category on error
        setCategories([
          {
            id: "all",
            name: "All",
            image: null,
            slug: "all",
          },
        ]);
      } finally {
        setLoadingCategories(false);
      }
    };

    fetchCategories();
  }, []);

  // Helper function to check if menu has dishes matching category keywords
  const checkCategoryInMenu = (menu, categoryId) => {
    if (!menu || !menu.sections || !Array.isArray(menu.sections)) {
      return false;
    }

    const keywords = getCategoryKeywords(categoryId);
    if (keywords.length === 0) {
      return false;
    }

    for (const section of menu.sections) {
      const sectionNameLower = (section.name || "").toLowerCase();
      if (keywords.some((keyword) => sectionNameLower.includes(keyword))) {
        return true;
      }

      if (section.items && Array.isArray(section.items)) {
        for (const item of section.items) {
          const itemNameLower = (item.name || "").toLowerCase();
          const itemCategoryLower = (item.category || "").toLowerCase();

          if (
            keywords.some(
              (keyword) =>
                itemNameLower.includes(keyword) ||
                itemCategoryLower.includes(keyword),
            )
          ) {
            return true;
          }
        }
      }

      if (section.subsections && Array.isArray(section.subsections)) {
        for (const subsection of section.subsections) {
          const subsectionNameLower = (subsection.name || "").toLowerCase();
          if (keywords.some((keyword) => subsectionNameLower.includes(keyword))) {
            return true;
          }

          if (subsection.items && Array.isArray(subsection.items)) {
            for (const item of subsection.items) {
              const itemNameLower = (item.name || "").toLowerCase();
              const itemCategoryLower = (item.category || "").toLowerCase();

              if (
                keywords.some(
                  (keyword) =>
                    itemNameLower.includes(keyword) ||
                    itemCategoryLower.includes(keyword),
                )
              ) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  };

  // Helper function to get ALL dishes matching a category from menu (returns array of dish info)
  const getAllCategoryDishesFromMenu = (menu, categoryId) => {
    if (!menu || !menu.sections || !Array.isArray(menu.sections)) {
      return [];
    }

    const keywords = getCategoryKeywords(categoryId);
    if (keywords.length === 0) {
      return [];
    }

    const matchingDishes = [];
    const seenDishIds = new Set();

    const appendDish = (item, section, subsection = null) => {
      const originalPrice = item.originalPrice || item.price || 0;
      const discountPercent = item.discountPercent || 0;
      const finalPrice =
        discountPercent > 0
          ? Math.round(originalPrice * (1 - discountPercent / 100))
          : originalPrice;

      const rawItemId = item._id || item.id || `${item.name}-${finalPrice}`;
      const stableItemId = String(rawItemId || "").trim();
      const dedupeKey = stableItemId || `${item.name}-${finalPrice}`;
      if (seenDishIds.has(dedupeKey)) return;
      seenDishIds.add(dedupeKey);

      const dishImage =
        item.image?.url ||
        item.image ||
        subsection?.image?.url ||
        subsection?.image ||
        section?.image?.url ||
        section?.image ||
        null;

      matchingDishes.push({
        name: item.name,
        price: finalPrice,
        image: dishImage,
        originalPrice: originalPrice,
        itemId: stableItemId || `${item.name}-${finalPrice}`,
        foodType: item.foodType,
      });
    };

    for (const section of menu.sections) {
      const sectionNameLower = (section.name || "").toLowerCase();
      const sectionMatches = keywords.some((keyword) =>
        sectionNameLower.includes(keyword),
      );

      if (section.items && Array.isArray(section.items)) {
        for (const item of section.items) {
          const itemNameLower = (item.name || "").toLowerCase();
          const itemCategoryLower = (item.category || "").toLowerCase();
          const itemMatches = keywords.some(
            (keyword) =>
              itemNameLower.includes(keyword) ||
              itemCategoryLower.includes(keyword),
          );

          if (sectionMatches || itemMatches) {
            appendDish(item, section);
          }
        }
      }

      if (section.subsections && Array.isArray(section.subsections)) {
        for (const subsection of section.subsections) {
          const subsectionNameLower = (subsection.name || "").toLowerCase();
          const subsectionMatches = keywords.some((keyword) =>
            subsectionNameLower.includes(keyword),
          );

          if (subsection.items && Array.isArray(subsection.items)) {
            for (const item of subsection.items) {
              const itemNameLower = (item.name || "").toLowerCase();
              const itemCategoryLower = (item.category || "").toLowerCase();
              const itemMatches = keywords.some(
                (keyword) =>
                  itemNameLower.includes(keyword) ||
                  itemCategoryLower.includes(keyword),
              );

              if (sectionMatches || subsectionMatches || itemMatches) {
                appendDish(item, section, subsection);
              }
            }
          }
        }
      }
    }

    return matchingDishes;
  };

  // Helper function to get FIRST featured dish for a category from menu (for backward compatibility)
  const getCategoryDishFromMenu = (menu, categoryId) => {
    const allDishes = getAllCategoryDishesFromMenu(menu, categoryId);
    return allDishes.length > 0 ? allDishes[0] : null;
  };

  // Fetch restaurants from API
  useEffect(() => {
    const fetchRestaurants = async () => {
      if (zoneLoading) {
        return;
      }

      try {
        setLoadingRestaurants(true);

        const params = {};
        params.platform = "mofood";

        const hasResolvedZone = Boolean(zoneId);
        let normalizedUserCity = "";

        if (hasResolvedZone) {
          params.zoneId = zoneId;
          params.onlyZone = "true";
        } else {
          const resolvedUserCity = resolveUserCity(location);
          normalizedUserCity = normalizeCityName(resolvedUserCity);
          if (!normalizedUserCity) {
            setRestaurantsData([]);
            return;
          }
          params.city = resolvedUserCity;
        }

        const response = await restaurantAPI.getRestaurants(params);

        if (
          response.data &&
          response.data.success &&
          response.data.data &&
          response.data.data.restaurants
        ) {
          const restaurantsArrayRaw = response.data.data.restaurants || [];
          const restaurantsArray = restaurantsArrayRaw.filter((restaurant) => {
            const platform = String(restaurant?.platform || "").toLowerCase();
            if (platform && platform !== "mofood") return false;
            if (hasResolvedZone) return true;
            return matchesRestaurantCity(restaurant, normalizedUserCity);
          });

          // Helper function to check if value is a default/mock value
          const isDefaultValue = (value, fieldName) => {
            if (!value) return false;

            const defaultOffers = [
              "Flat ₹50 OFF above ₹199",
              "Flat 50% OFF",
              "Flat ₹40 OFF above ₹149",
            ];
            const defaultDeliveryTimes = [
              "25-30 mins",
              "20-25 mins",
              "30-35 mins",
            ];
            const defaultDistances = ["1.2 km", "1 km", "0.8 km"];
            const defaultFeaturedPrice = 249;

            if (fieldName === "offer" && defaultOffers.includes(value))
              return true;
            if (
              fieldName === "deliveryTime" &&
              defaultDeliveryTimes.includes(value)
            )
              return true;
            if (fieldName === "distance" && defaultDistances.includes(value))
              return true;
            if (fieldName === "featuredPrice" && value === defaultFeaturedPrice)
              return true;

            return false;
          };

          // Transform restaurants - filter out default values
          const restaurantsWithIds = restaurantsArray
            .filter((restaurant) => {
              const hasName =
                restaurant.name && restaurant.name.trim().length > 0;
              return hasName;
            })
            .map((restaurant) => {
              let deliveryTime = restaurant.estimatedDeliveryTime || null;
              let distance = restaurant.distance || null;
              let offer = restaurant.offer || null;

              if (isDefaultValue(deliveryTime, "deliveryTime"))
                deliveryTime = null;
              if (isDefaultValue(distance, "distance")) distance = null;
              if (isDefaultValue(offer, "offer")) offer = null;

              const cuisine =
                restaurant.cuisines && restaurant.cuisines.length > 0
                  ? restaurant.cuisines.join(", ")
                  : null;

              const coverImages =
                restaurant.coverImages && restaurant.coverImages.length > 0
                  ? restaurant.coverImages
                    .map((img) => img.url || img)
                    .filter(Boolean)
                  : [];

              const fallbackImages =
                restaurant.menuImages && restaurant.menuImages.length > 0
                  ? restaurant.menuImages
                    .map((img) => img.url || img)
                    .filter(Boolean)
                  : [];

              const allImages =
                coverImages.length > 0
                  ? coverImages
                  : fallbackImages.length > 0
                    ? fallbackImages
                    : restaurant.profileImage?.url
                      ? [restaurant.profileImage.url]
                      : [];

              const image = allImages[0] || null;
              const restaurantMongoId = String(
                restaurant._id || restaurant.id || "",
              ).trim();
              const restaurantLookupId = String(
                restaurant.restaurantId || restaurantMongoId,
              ).trim();

              let featuredDish = restaurant.featuredDish || null;
              let featuredPrice = restaurant.featuredPrice || null;

              if (
                featuredPrice &&
                isDefaultValue(featuredPrice, "featuredPrice")
              ) {
                featuredPrice = null;
              }

              return {
                id: restaurantLookupId,
                name: restaurant.name,
                cuisine: cuisine,
                rating: restaurant.rating || null,
                deliveryTime: deliveryTime,
                distance: distance,
                image: image,
                images: allImages,
                priceRange: typeof restaurant.priceRange === "string"
                  ? restaurant.priceRange.replace(/\$/g, "₹")
                  : (restaurant.priceRange || null),
                featuredDish: featuredDish,
                featuredPrice: featuredPrice,
                offer: offer,
                slug:
                  restaurant.slug ||
                  restaurant.name?.toLowerCase().replace(/\s+/g, "-"),
                restaurantId: restaurantLookupId,
                restaurantMongoId: restaurantMongoId || restaurantLookupId,
                hasPaneer: false,
                category: "all",
              };
            });

          // Fetch menus for all restaurants
          const menuPromises = restaurantsWithIds.map(async (restaurant) => {
            try {
              const menuResponse = await restaurantAPI.getMenuByRestaurantId(
                restaurant.restaurantId,
              );
              if (
                menuResponse.data &&
                menuResponse.data.success &&
                menuResponse.data.data &&
                menuResponse.data.data.menu
              ) {
                const menu = menuResponse.data.data.menu;
                const hasPaneer = checkCategoryInMenu(menu, "paneer-tikka");

                let featuredDish = restaurant.featuredDish;
                let featuredPrice = restaurant.featuredPrice;

                if (!featuredDish || !featuredPrice) {
                  for (const section of menu.sections || []) {
                    if (section.items && section.items.length > 0) {
                      const firstItem = section.items[0];
                      if (!featuredDish) featuredDish = firstItem.name;
                      if (!featuredPrice) {
                        const originalPrice =
                          firstItem.originalPrice || firstItem.price || 0;
                        const discountPercent = firstItem.discountPercent || 0;
                        featuredPrice =
                          discountPercent > 0
                            ? Math.round(
                              originalPrice * (1 - discountPercent / 100),
                            )
                            : originalPrice;
                      }
                      break;
                    }
                  }
                }

                return {
                  ...restaurant,
                  menu: menu,
                  hasPaneer: hasPaneer,
                  featuredDish: featuredDish || null,
                  featuredPrice: featuredPrice || null,
                  categoryMatches: {},
                };
              }
              return {
                ...restaurant,
                menu: null,
                hasPaneer: false,
                categoryMatches: {},
              };
            } catch (error) {
              console.warn(
                `Failed to fetch menu for restaurant ${restaurant.restaurantId}:`,
                error,
              );
              return {
                ...restaurant,
                menu: null,
                hasPaneer: false,
                categoryMatches: {},
              };
            }
          });

          const transformedRestaurants = await Promise.all(menuPromises);
          setRestaurantsData(transformedRestaurants);
        } else {
          setRestaurantsData([]);
        }
      } catch (error) {
        console.error("Error fetching restaurants:", error);
        setRestaurantsData([]);
      } finally {
        setLoadingRestaurants(false);
      }
    };

    fetchRestaurants();
  }, [
    zoneId,
    zoneLoading,
    isOutOfService,
    location?.city,
    location?.formattedAddress,
    location?.address,
  ]);

  // Update selected category when URL changes
  useEffect(() => {
    if (category && categories && categories.length > 0) {
      const categorySlug = category.toLowerCase();
      const matchedCategory = categories.find(
        (cat) =>
          cat.slug === categorySlug ||
          cat.id === categorySlug ||
          cat.name.toLowerCase().replace(/\s+/g, "-") === categorySlug,
      );
      if (matchedCategory) {
        setSelectedCategory(matchedCategory.slug || matchedCategory.id);
      } else {
        setSelectedCategory(categorySlug);
      }
    } else if (category) {
      setSelectedCategory(category.toLowerCase());
    }
  }, [category, categories]);

  const toggleFilter = (filterId) => {
    setActiveFilters((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(filterId)) {
        newSet.delete(filterId);
      } else {
        newSet.add(filterId);
      }
      return newSet;
    });
    // Show loading when filter is toggled
    setIsLoadingFilterResults(true);
    setTimeout(() => {
      setIsLoadingFilterResults(false);
    }, 500);
  };

  // Scroll tracking effect for filter modal
  useEffect(() => {
    if (!isFilterOpen || !rightContentRef.current) return;

    const observerOptions = {
      root: rightContentRef.current,
      rootMargin: "-20% 0px -70% 0px",
      threshold: 0,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute("data-section-id");
          if (sectionId) {
            setActiveScrollSection(sectionId);
            setActiveFilterTab(sectionId);
          }
        }
      });
    }, observerOptions);

    Object.values(filterSectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [isFilterOpen]);

  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Filter restaurants based on active filters and selected category
  // If category is selected, expand restaurants into dish cards (one card per matching dish)
  const filteredRecommended = useMemo(() => {
    const sourceData = restaurantsData.length > 0 ? restaurantsData : [];
    let filtered = [...sourceData];

    // Filter by category - Dynamic filtering based on menu items
    if (selectedCategory && selectedCategory !== "all") {
      const expandedDishes = [];

      filtered.forEach((r) => {
        if (r.menu) {
          const hasCategoryItem = checkCategoryInMenu(r.menu, selectedCategory);
          if (hasCategoryItem) {
            const categoryDishes = getAllCategoryDishesFromMenu(
              r.menu,
              selectedCategory,
            );

            if (categoryDishes.length > 0) {
              // Create one card per dish
              categoryDishes.forEach((dish, index) => {
                expandedDishes.push({
                  ...r,
                  // Unique ID for each dish card
                  id: `${r.id}-dish-${dish.itemId || index}`,
                  dishId: dish.itemId || `${r.id}-dish-${index}`,
                  // Category dish info for this specific dish
                  categoryDish: dish,
                  categoryDishName: dish.name,
                  categoryDishPrice: dish.price,
                  categoryDishImage: dish.image,
                });
              });
            } else {
              // If no dishes found but menu exists, skip this restaurant
            }
          }
        }
      });

      filtered = expandedDishes;
    }

    // Apply filters
    if (activeFilters.has("under-30-mins")) {
      filtered = filtered.filter((r) => {
        if (!r.deliveryTime) return false;
        const timeMatch = r.deliveryTime.match(/(\d+)/);
        return timeMatch && parseInt(timeMatch[1]) <= 30;
      });
    }
    if (activeFilters.has("rating-4-plus")) {
      filtered = filtered.filter((r) => r.rating && r.rating >= 4.0);
    }
    if (activeFilters.has("flat-50-off")) {
      filtered = filtered.filter((r) => r.offer && r.offer.includes("50%"));
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name?.toLowerCase().includes(query) ||
          r.cuisine?.toLowerCase().includes(query) ||
          r.featuredDish?.toLowerCase().includes(query) ||
          r.categoryDishName?.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [
    selectedCategory,
    activeFilters,
    searchQuery,
    restaurantsData,
    categoryKeywords,
    vegMode,
  ]);

  const filteredAllRestaurants = useMemo(() => {
    const sourceData = restaurantsData.length > 0 ? restaurantsData : [];
    let filtered = [...sourceData];

    // Filter by category - Dynamic filtering based on menu items
    // If category is selected, expand restaurants into dish cards (one card per matching dish)
    if (selectedCategory && selectedCategory !== "all") {
      const expandedDishes = [];

      filtered.forEach((r) => {
        if (r.menu) {
          const hasCategoryItem = checkCategoryInMenu(r.menu, selectedCategory);
          if (hasCategoryItem) {
            const categoryDishes = getAllCategoryDishesFromMenu(
              r.menu,
              selectedCategory,
            );

            if (categoryDishes.length > 0) {
              // Create one card per dish
              categoryDishes.forEach((dish, index) => {
                // Filter by vegMode if enabled
                if (vegMode && dish.foodType !== "Veg") {
                  return; // Skip non-veg dishes when vegMode is ON
                }

                expandedDishes.push({
                  ...r,
                  // Unique ID for each dish card
                  id: `${r.id}-dish-${dish.itemId || index}`,
                  dishId: dish.itemId || `${r.id}-dish-${index}`,
                  // Category dish info for this specific dish
                  categoryDish: dish,
                  categoryDishName: dish.name,
                  categoryDishPrice: dish.price,
                  categoryDishImage: dish.image,
                });
              });
            }
          }
        }
      });

      filtered = expandedDishes;
    }

    // Apply filters
    if (activeFilters.has("under-30-mins")) {
      filtered = filtered.filter((r) => {
        if (!r.deliveryTime) return false;
        const timeMatch = r.deliveryTime.match(/(\d+)/);
        return timeMatch && parseInt(timeMatch[1]) <= 30;
      });
    }
    if (activeFilters.has("rating-4-plus")) {
      filtered = filtered.filter((r) => r.rating && r.rating >= 4.0);
    }
    if (activeFilters.has("under-250")) {
      filtered = filtered.filter(
        (r) => r.featuredPrice && r.featuredPrice <= 250,
      );
    }
    if (activeFilters.has("flat-50-off")) {
      filtered = filtered.filter((r) => r.offer && r.offer.includes("50%"));
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name?.toLowerCase().includes(query) ||
          r.cuisine?.toLowerCase().includes(query) ||
          r.featuredDish?.toLowerCase().includes(query) ||
          r.categoryDishName?.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [
    selectedCategory,
    activeFilters,
    searchQuery,
    restaurantsData,
    categoryKeywords,
    vegMode,
  ]);

  const handleCategorySelect = (category) => {
    const categorySlug = category.slug || category.id;
    if (String(categorySlug) === String(selectedCategory)) {
      return;
    }
    setIsCategorySwitching(true);
    setSelectedCategory(categorySlug);
    // Keep route inside the same page to avoid full UI remount behavior.
    if (categorySlug === "all") {
      navigate("/category/all", { replace: true });
    } else {
      navigate(`/category/${categorySlug}`, { replace: true });
    }
  };

  useEffect(() => {
    if (loadingRestaurants) return;
    const timeoutId = setTimeout(() => {
      setIsCategorySwitching(false);
    }, 180);
    return () => clearTimeout(timeoutId);
  }, [selectedCategory, loadingRestaurants]);

  // Check if should show grayscale (user out of service)
  const shouldShowGrayscale = isOutOfService;
  const showDishSkeleton = loadingRestaurants || isCategorySwitching;

  const getDishCartId = (dish) =>
    String(
      dish?.dishId ||
      dish?.categoryDish?.itemId ||
      dish?.categoryDish?.id ||
      dish?.itemId ||
      "",
    ).trim();

  const getDishPrice = (dish) =>
    Number(dish?.categoryDishPrice ?? dish?.featuredPrice ?? dish?.price ?? 0) || 0;

  const toCartDishItem = (dish) => {
    const itemId = getDishCartId(dish);
    return {
      id: itemId,
      itemId,
      name: dish?.categoryDishName || dish?.featuredDish || "Dish",
      price: getDishPrice(dish),
      originalPrice:
        Number(
          dish?.categoryDish?.originalPrice ??
          dish?.originalPrice ??
          dish?.categoryDishPrice ??
          dish?.featuredPrice ??
          0,
        ) || getDishPrice(dish),
      image: dish?.categoryDishImage || dish?.image || "",
      restaurantId: String(
        dish?.restaurantMongoId || dish?.restaurantId || dish?.id || "",
      ).trim(),
      restaurant: dish?.name || "Restaurant",
      foodType: dish?.categoryDish?.foodType || dish?.foodType || "",
      platform: "mofood",
      restaurantPlatform: "mofood",
    };
  };

  const handleAddDishToCart = (dish, event) => {
    event.preventDefault();
    event.stopPropagation();
    const cartItem = toCartDishItem(dish);
    if (!cartItem.itemId || !cartItem.restaurantId) return;
    addToCart(cartItem);
  };

  const handleDishQtyChange = (dish, nextQty, event) => {
    event.preventDefault();
    event.stopPropagation();
    const itemId = getDishCartId(dish);
    if (!itemId) return;
    updateQuantity(itemId, nextQty);
  };

  const dishRowsByRestaurant = useMemo(() => {
    if (selectedCategory === "all") return [];

    const rowsMap = new Map();
    filteredAllRestaurants.forEach((dishCard) => {
      const restaurantId = String(
        dishCard?.restaurantId || dishCard?.id || "",
      ).trim();
      if (!restaurantId) return;

      if (!rowsMap.has(restaurantId)) {
        rowsMap.set(restaurantId, {
          restaurantId,
          restaurantName: dishCard?.name || "Restaurant",
          restaurantSlug:
            dishCard?.slug ||
            String(dishCard?.name || "")
              .toLowerCase()
              .replace(/\s+/g, "-"),
          dishes: [],
        });
      }
      rowsMap.get(restaurantId).dishes.push(dishCard);
    });

    return Array.from(rowsMap.values()).filter((row) => row.dishes.length > 0);
  }, [selectedCategory, filteredAllRestaurants]);

  return (
    <div
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] ${shouldShowGrayscale ? "grayscale opacity-75" : ""}`}
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-[#1a1a1a] shadow-sm">
        <div className="max-w-[1100px] mx-auto">
          {/* Search Bar with Back Button */}
          <div className="flex items-center gap-2 px-3 md:px-6 lg:px-8 xl:px-0 py-3 border-b border-gray-100 dark:border-gray-800">
            <button
              onClick={() => navigate("/user")}
              className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>

            <div className="flex-1 relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Restaurant name or a dish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-11 md:h-12 rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] focus:bg-white dark:focus:bg-[#2a2a2a] focus:border-gray-500 dark:focus:border-gray-600 text-sm md:text-base dark:text-white placeholder:text-gray-600 dark:placeholder:text-gray-400"
              />
{/* <button className="absolute right-3 top-1/2 -translate-y-1/2">
                <Mic className="h-4 w-4 text-gray-500" />
              </button> */}
            </div>
          </div>

          {/* Browse Category Section */}
          <div
            ref={categoryScrollRef}
            className="flex gap-4 md:gap-6 overflow-x-auto scrollbar-hide px-4 md:px-6 lg:px-8 xl:px-0 py-3 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {loadingCategories ? (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-green-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Loading categories...
                </span>
              </div>
            ) : categories && categories.length > 0 ? (
              categories.map((cat, index) => {
                const categorySlug = cat.slug || cat.id;
                const isSelected =
                  selectedCategory === categorySlug ||
                  selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id || cat.slug || `category-${index}`}
                    onClick={() => handleCategorySelect(cat)}
                    className={`flex flex-col items-center gap-1.5 flex-shrink-0 pb-2 transition-all ${isSelected ? "border-b-2 border-green-600" : ""
                      }`}
                  >
                    {String(categorySlug) === "all" ? (
                      <div
                        className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center border-2 transition-all ${isSelected
                          ? "border-green-600 shadow-lg bg-green-50 dark:bg-green-900/20"
                          : "border-transparent bg-gray-100 dark:bg-gray-800"
                          }`}
                      >
                        <UtensilsCrossed className="h-6 w-6 md:h-7 md:w-7 text-green-700 dark:text-green-400" />
                      </div>
                    ) : cat.image ? (
                      <div
                        className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-2 transition-all ${isSelected
                          ? "border-green-600 shadow-lg"
                          : "border-transparent"
                          }`}
                      >
                        <img
                          src={cat.image}
                          alt={cat.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-2 transition-all ${isSelected
                          ? "border-green-600 shadow-lg bg-green-50 dark:bg-green-900/20"
                          : "border-transparent"
                          }`}
                      >
                        <span className="text-sm md:text-base font-bold uppercase text-gray-700 dark:text-gray-300">
                          {String(cat.name || "?").trim().slice(0, 2)}
                        </span>
                      </div>
                    )}
                    <span
                      className={`text-xs md:text-sm font-medium whitespace-nowrap ${isSelected
                        ? "text-green-700 dark:text-green-400"
                        : "text-gray-600 dark:text-gray-400"
                        }`}
                    >
                      {cat.name}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="flex items-center justify-center py-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  No categories available
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex flex-col md:flex-row md:flex-wrap gap-2 px-4 md:px-6 lg:px-8 xl:px-0 py-3">
            {/* Row 1 */}
            <div
              className="flex items-center gap-2 overflow-x-auto md:overflow-x-visible scrollbar-hide pb-1 md:pb-0"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              <Button
                variant="outline"
                onClick={() => setIsFilterOpen(true)}
                className="h-7 md:h-8 px-2.5 md:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span className="text-xs md:text-sm font-bold text-black dark:text-white">
                  Filters
                </span>
              </Button>
              {[
                { id: "under-30-mins", label: "Under 30 mins" },
                { id: "delivery-under-45", label: "Under 45 mins" },
                { id: "rating-4-plus", label: "Rating 4.0+" },
                { id: "rating-45-plus", label: "Rating 4.5+" },
              ].map((filter) => {
                const isActive = activeFilters.has(filter.id);
                return (
                  <Button
                    key={filter.id}
                    variant="outline"
                    onClick={() => toggleFilter(filter.id)}
                    className={`h-7 md:h-8 px-2.5 md:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${isActive
                      ? "bg-green-600 text-white border border-green-600 hover:bg-green-600/90"
                      : "bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                  >
                    <span
                      className={`text-xs md:text-sm text-black dark:text-white font-bold ${isActive ? "text-white" : "text-black dark:text-white"}`}
                    >
                      {filter.label}
                    </span>
                  </Button>
                );
              })}
            </div>

            {/* Row 2 */}
            <div
              className="flex items-center gap-2 overflow-x-auto md:overflow-x-visible scrollbar-hide pb-1 md:pb-0"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {[
                { id: "distance-under-1km", label: "Under 1km", icon: MapPin },
                { id: "distance-under-2km", label: "Under 2km", icon: MapPin },
                { id: "flat-50-off", label: "Flat 50% OFF" },
                { id: "under-250", label: "Under ₹250" },
              ].map((filter) => {
                const Icon = filter.icon;
                const isActive = activeFilters.has(filter.id);
                return (
                  <Button
                    key={filter.id}
                    variant="outline"
                    onClick={() => toggleFilter(filter.id)}
                    className={`h-7 md:h-8 px-2.5 md:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${isActive
                      ? "bg-green-600 text-white border border-green-600 hover:bg-green-600/90"
                      : "bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                  >
                    {Icon && (
                      <Icon
                        className={`h-3.5 w-3.5 md:h-4 md:w-4 ${isActive ? "text-white" : "text-gray-900 dark:text-white"}`}
                      />
                    )}
                    <span
                      className={`text-xs md:text-sm font-bold ${isActive ? "text-white" : "text-black dark:text-white"}`}
                    >
                      {filter.label}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 md:px-6 lg:px-8 xl:px-0 py-4 sm:py-6 md:py-8 lg:py-10 space-y-6 md:space-y-8 lg:space-y-10">
        <div className="max-w-[1100px] mx-auto">
          {/* RECOMMENDED FOR YOU Section - Show only on "All" category */}
          {!showDishSkeleton && filteredRecommended.length > 0 && selectedCategory === "all" && (
            <section>
              <h2 className="text-xs sm:text-sm md:text-base font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-4 md:mb-6">
                RECOMMENDED FOR YOU
              </h2>

              {/* Small Restaurant Cards - Grid - Show all dishes when category is selected */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
                {(selectedCategory && selectedCategory !== "all"
                  ? filteredRecommended
                  : filteredRecommended.slice(0, 6)
                ).map((restaurant) => {
                  return (
                    <Link
                      key={restaurant.id}
                      to={`/user/restaurants/${restaurant.name.toLowerCase().replace(/\s+/g, "-")}`}
                      className="block"
                    >
                      <div
                        className={`group ${shouldShowGrayscale ? "grayscale opacity-75" : ""}`}
                      >
                        {/* Image Container */}
                        <div className="relative aspect-square rounded-xl md:rounded-2xl overflow-hidden mb-2">
                          {/* Use category dish image if available, otherwise restaurant image */}
                          {restaurant.categoryDishImage ? (
                            <img
                              src={restaurant.categoryDishImage}
                              alt={
                                restaurant.categoryDishName || restaurant.name
                              }
                              className="w-full h-full object-cover transition-transform duration-300"
                              onError={(e) => {
                                // Fallback to restaurant image if dish image fails
                                if (restaurant.image) {
                                  e.target.src = restaurant.image;
                                } else {
                                  // Show emoji placeholder
                                  e.target.style.display = "none";
                                  const placeholder =
                                    document.createElement("div");
                                  placeholder.className =
                                    "w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-6xl";
                                  placeholder.textContent = "🍽️";
                                  e.target.parentElement.appendChild(
                                    placeholder,
                                  );
                                }
                              }}
                            />
                          ) : restaurant.image ? (
                            <img
                              src={restaurant.image}
                              alt={restaurant.name}
                              className="w-full h-full object-cover transition-transform duration-300"
                              onError={(e) => {
                                // Show emoji placeholder
                                e.target.style.display = "none";
                                const placeholder =
                                  document.createElement("div");
                                placeholder.className =
                                  "w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-6xl";
                                placeholder.textContent = "🍽️";
                                e.target.parentElement.appendChild(placeholder);
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-6xl">
                              🍽️
                            </div>
                          )}

                          {/* Offer Badge */}
                          {restaurant.offer && (
                            <div className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[10px] md:text-xs font-semibold px-1.5 py-0.5 rounded">
                              {restaurant.offer}
                            </div>
                          )}

                          {/* Rating Badge (NOW ON IMAGE, bottom-left with white border) */}
                          <div className="absolute bottom-0 left-0 bg-green-600 border-[4px] rounded-md border-white text-white text-[11px] md:text-xs font-bold px-1.5 py-0.5 flex items-center gap-0.5">
                            {restaurant.rating}
                            <Star className="h-2.5 w-2.5 md:h-3 md:w-3 fill-white" />
                          </div>
                        </div>

                        {/* Restaurant Info - Show category dish name if available, otherwise restaurant name */}
                        <h3 className="font-semibold text-gray-900 dark:text-white text-xs md:text-sm line-clamp-1">
                          {restaurant.categoryDishName || restaurant.name}
                        </h3>
                        <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-[10px] md:text-xs">
                          <Clock className="h-2.5 w-2.5 md:h-3 md:w-3" />
                          <span>
                            {restaurant.deliveryTime || "Not available"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* DISH ROWS Section - Selected Category */}
          {selectedCategory !== "all" && (
            <section className="space-y-6">
              <h2 className="text-xs sm:text-sm md:text-base font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
                DISHES
              </h2>

              {showDishSkeleton ? (
                <div className="space-y-5">
                  {Array.from({ length: 3 }).map((_, rowIndex) => (
                    <div key={`dish-row-skeleton-${rowIndex}`} className="space-y-3">
                      <div className="h-4 w-40 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {Array.from({ length: 5 }).map((__, cardIndex) => (
                          <div
                            key={`dish-card-skeleton-${rowIndex}-${cardIndex}`}
                            className="w-44 min-w-[11rem] rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] overflow-hidden animate-pulse"
                          >
                            <div className="h-28 w-full bg-gray-200 dark:bg-gray-800" />
                            <div className="p-3 space-y-2">
                              <div className="h-3.5 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
                              <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-800 rounded" />
                              <div className="h-7 w-16 bg-gray-200 dark:bg-gray-800 rounded-md ml-auto" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-7">
                  {dishRowsByRestaurant.map((row) => (
                    <div key={row.restaurantId} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">
                          {row.restaurantName}
                        </h3>
                        <Link
                          to={`/user/restaurants/${row.restaurantSlug}`}
                          className="text-xs font-semibold text-green-700 dark:text-green-400 whitespace-nowrap"
                        >
                          View menu
                        </Link>
                      </div>

                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {row.dishes.map((dish) => {
                          const cartId = getDishCartId(dish);
                          const cartDish = cartId ? getCartItem(cartId) : null;
                          const qty = cartDish?.quantity || 0;
                          return (
                            <div
                              key={dish.id}
                              className="w-44 min-w-[11rem] rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] overflow-hidden shadow-sm"
                            >
                              <div className="h-28 w-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                {dish.categoryDishImage || dish.image ? (
                                  <img
                                    src={dish.categoryDishImage || dish.image}
                                    alt={dish.categoryDishName || "Dish"}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-3xl">🍽️</div>
                                )}
                              </div>

                              <div className="p-3 space-y-2">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                                  {dish.categoryDishName || dish.featuredDish || "Dish"}
                                </p>
                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                  ₹{getDishPrice(dish)}
                                </p>

                                {qty > 0 ? (
                                  <div className="ml-auto inline-flex items-center rounded-md border border-green-600 overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={(event) => handleDishQtyChange(dish, qty - 1, event)}
                                      className="h-7 w-7 text-green-700 bg-green-50 dark:bg-green-900/20"
                                    >
                                      -
                                    </button>
                                    <span className="px-2 text-xs font-bold text-green-700 dark:text-green-400">
                                      {qty}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(event) => handleDishQtyChange(dish, qty + 1, event)}
                                      className="h-7 w-7 text-green-700 bg-green-50 dark:bg-green-900/20"
                                    >
                                      +
                                    </button>
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="ml-auto h-7 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                                    onClick={(event) => handleAddDishToCart(dish, event)}
                                  >
                                    Add
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!showDishSkeleton && dishRowsByRestaurant.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No dishes found in this category.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ALL RESTAURANTS Section */}
          {selectedCategory === "all" && (
          <section className="relative">
            <h2 className="text-xs sm:text-sm md:text-base font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-4 md:mb-6">
              {selectedCategory === "all" ? "ALL RESTAURANTS" : "DISHES"}
            </h2>

            {/* Loading Overlay */}
            {isLoadingFilterResults && (
              <div className="absolute inset-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg min-h-[400px]">
                <div className="flex flex-col items-center gap-3">
                  <Loader2
                    className="h-8 w-8 text-green-600 animate-spin"
                    strokeWidth={2.5}
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Loading restaurants...
                  </span>
                </div>
              </div>
            )}

            {/* Large Restaurant Cards */}
            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 lg:gap-6 xl:gap-7 items-stretch ${(isLoadingFilterResults || showDishSkeleton) ? "opacity-50" : "opacity-100"} transition-opacity duration-300`}
            >
              {showDishSkeleton
                ? Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={`dish-skeleton-${index}`}
                    className="overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] rounded-[20px] h-full flex flex-col w-full animate-pulse"
                  >
                    <div className="aspect-[16/9] w-full rounded-t-[20px] bg-gray-200 dark:bg-gray-800" />
                    <div className="p-3 sm:px-4 py-3">
                      <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-800 rounded mb-2" />
                      <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
                      <div className="flex justify-between">
                        <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
                        <div className="h-3 w-12 bg-gray-200 dark:bg-gray-800 rounded" />
                      </div>
                    </div>
                  </div>
                ))
                : filteredAllRestaurants.map((restaurant) => {
                const restaurantSlug = restaurant.name
                  .toLowerCase()
                  .replace(/\s+/g, "-");
                const isFavorite = favorites.has(restaurant.id);

                return (
                  <Link
                    key={restaurant.id}
                    to={`/user/restaurants/${restaurantSlug}`}
                    className="h-full flex"
                  >
                    <Card
                      className={`overflow-hidden cursor-pointer gap-0 border border-gray-100 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] shadow-sm hover:shadow-md transition-all duration-300 py-0 rounded-[20px] h-full flex flex-col w-full ${shouldShowGrayscale ? "grayscale opacity-75" : ""
                        }`}
                    >
                      {/* Image Section */}
                      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-[20px] flex-shrink-0">
                        {/* Use category dish image if available, otherwise restaurant image */}
                        {restaurant.categoryDishImage ? (
                          <img
                            src={restaurant.categoryDishImage}
                            alt={restaurant.categoryDishName || restaurant.name}
                            className="w-full h-full object-cover transition-transform duration-500"
                            onError={(e) => {
                              // Fallback to restaurant image if dish image fails
                              if (restaurant.image) {
                                e.target.src = restaurant.image;
                              } else {
                                // Show emoji placeholder
                                e.target.style.display = "none";
                                const placeholder =
                                  document.createElement("div");
                                placeholder.className =
                                  "w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-6xl";
                                placeholder.textContent = "🍽️";
                                e.target.parentElement.appendChild(placeholder);
                              }
                            }}
                          />
                        ) : restaurant.image ? (
                          <img
                            src={restaurant.image}
                            alt={restaurant.name}
                            className="w-full h-full object-cover transition-transform duration-500"
                            onError={(e) => {
                              // Show emoji placeholder
                              e.target.style.display = "none";
                              const placeholder = document.createElement("div");
                              placeholder.className =
                                "w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-6xl";
                              placeholder.textContent = "🍽️";
                              e.target.parentElement.appendChild(placeholder);
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-6xl">
                            🍽️
                          </div>
                        )}

                        {/* Category Dish Badge - Top Left */}
                        {(restaurant.categoryDishName ||
                          restaurant.featuredDish) && (
                            <div className="absolute top-3 left-3 z-10">
                              <div className="bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium border border-white/20">
                                {restaurant.categoryDishName ||
                                  restaurant.featuredDish}{" "}
                                · ₹
                                {restaurant.categoryDishPrice ||
                                  restaurant.featuredPrice}
                              </div>
                            </div>
                          )}

                        {/* Ad Badge */}
                        {restaurant.isAd && (
                          <div className="absolute top-3 right-14 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded z-10 uppercase tracking-widest font-bold">
                            Ad
                          </div>
                        )}

                        {/* Offer Badge on Image - Bottom Left */}
                        {restaurant.offer && (
                          <div className="absolute bottom-3 left-0 bg-[#2563eb] text-white text-[10px] font-bold px-2 py-1 shadow-lg z-10 leading-none">
                            {restaurant.offer.toUpperCase()}
                          </div>
                        )}

                        {/* Bookmark Icon - Top Right */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-3 right-3 h-8 w-8 bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm rounded-full hover:bg-white dark:hover:bg-[#2a2a2a] transition-colors z-10"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavorite(restaurant.id);
                          }}
                        >
                          <Bookmark
                            className={`h-4 w-4 ${isFavorite ? "fill-rose-500 text-rose-500" : "text-gray-600 dark:text-gray-400"}`}
                          />
                        </Button>
                      </div>

                      {/* Content Section */}
                      <CardContent className="p-3 sm:px-4 py-3 flex flex-col flex-grow">
                        <div className="flex justify-between items-start">
                          {/* Left Info */}
                          <div className="flex-1 min-w-0 pr-2">
                            <h3 className="text-[17px] font-bold text-neutral-900 dark:text-gray-100 line-clamp-1 leading-tight mb-0.5">
                              {restaurant.name}
                            </h3>
                            <p className="text-[12px] text-neutral-500 dark:text-gray-500 font-medium truncate">
                              {restaurant.cuisine ||
                                "North Indian, Fast Food, Chinese"}
                            </p>
                          </div>

                          {/* Right Info */}
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <div className="bg-[#15803d] text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5 text-[11px] font-bold">
                              <span>{restaurant.rating}</span>
                              <Star
                                className="h-2.5 w-2.5 fill-white text-white"
                                strokeWidth={3}
                              />
                            </div>
                            <p className="text-[11px] text-neutral-500 dark:text-gray-400 font-medium whitespace-nowrap">
                              ₹{restaurant.priceRange || "200"} for one
                            </p>
                            <p className="text-[11px] text-neutral-500 dark:text-gray-400 font-medium">
                              {restaurant.deliveryTime || "25-30"} min
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>

            {/* Empty State */}
            {!showDishSkeleton && filteredAllRestaurants.length === 0 && (
              <div className="text-center py-12 md:py-16">
                <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base">
                  {searchQuery
                    ? `No restaurants found for "${searchQuery}"`
                    : "No restaurants found with selected filters"}
                </p>
                <Button
                  variant="outline"
                  className="mt-4 md:mt-6"
                  onClick={() => {
                    setActiveFilters(new Set());
                    setSearchQuery("");
                    setSelectedCategory("all");
                  }}
                >
                  Clear all filters
                </Button>
              </div>
            )}
          </section>
          )}
        </div>
      </div>

      {/* Filter Modal - Bottom Sheet */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isFilterOpen && (
              <div className="fixed inset-0 z-[100]">
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setIsFilterOpen(false)}
                />

                {/* Modal Content */}
                <div className="absolute bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-4xl bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl max-h-[85vh] md:max-h-[90vh] flex flex-col animate-[slideUp_0.3s_ease-out]">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">
                      Filters and sorting
                    </h2>
                    <button
                      onClick={() => {
                        setActiveFilters(new Set());
                        setSortBy(null);
                        setSelectedCuisine(null);
                      }}
                      className="text-green-600 dark:text-green-400 font-medium text-sm md:text-base"
                    >
                      Clear all
                    </button>
                  </div>

                  {/* Body */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar - Tabs */}
                    <div className="w-24 sm:w-28 md:w-32 bg-gray-50 dark:bg-[#0a0a0a] border-r border-gray-200 dark:border-gray-800 flex flex-col">
                      {[
                        { id: "sort", label: "Sort By", icon: ArrowDownUp },
                        { id: "time", label: "Time", icon: Timer },
                        { id: "rating", label: "Rating", icon: Star },
                        { id: "distance", label: "Distance", icon: MapPin },
                        { id: "price", label: "Dish Price", icon: IndianRupee },
                        {
                          id: "cuisine",
                          label: "Cuisine",
                          icon: UtensilsCrossed,
                        },
                        { id: "offers", label: "Offers", icon: BadgePercent },
                        { id: "trust", label: "Trust", icon: ShieldCheck },
                      ].map((tab) => {
                        const Icon = tab.icon;
                        const isActive =
                          activeScrollSection === tab.id ||
                          activeFilterTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => {
                              setActiveFilterTab(tab.id);
                              const section = filterSectionRefs.current[tab.id];
                              if (section) {
                                section.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                              }
                            }}
                            className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${isActive
                              ? "bg-white dark:bg-[#1a1a1a] text-green-600 dark:text-green-400"
                              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                              }`}
                          >
                            {isActive && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-600 rounded-r" />
                            )}
                            <Icon
                              className="h-5 w-5 md:h-6 md:w-6"
                              strokeWidth={1.5}
                            />
                            <span className="text-xs md:text-sm font-medium leading-tight">
                              {tab.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Right Content Area - Scrollable */}
                    <div
                      ref={rightContentRef}
                      className="flex-1 overflow-y-auto p-4 md:p-6"
                    >
                      {/* Sort By Tab */}
                      <div
                        ref={(el) => (filterSectionRefs.current["sort"] = el)}
                        data-section-id="sort"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">
                          Sort by
                        </h3>
                        <div className="flex flex-col gap-3">
                          {[
                            { id: null, label: "Relevance" },
                            { id: "price-low", label: "Price: Low to High" },
                            { id: "price-high", label: "Price: High to Low" },
                            { id: "rating-high", label: "Rating: High to Low" },
                            { id: "rating-low", label: "Rating: Low to High" },
                          ].map((option) => (
                            <button
                              key={option.id || "relevance"}
                              onClick={() => setSortBy(option.id)}
                              className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${sortBy === option.id
                                ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                                }`}
                            >
                              <span
                                className={`text-sm md:text-base font-medium ${sortBy === option.id ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                              >
                                {option.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Time Tab */}
                      <div
                        ref={(el) => (filterSectionRefs.current["time"] = el)}
                        data-section-id="time"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">
                          Delivery Time
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                          <button
                            onClick={() => toggleFilter("under-30-mins")}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${activeFilters.has("under-30-mins")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <Timer
                              className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has("under-30-mins") ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}`}
                              strokeWidth={1.5}
                            />
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("under-30-mins") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Under 30 mins
                            </span>
                          </button>
                          <button
                            onClick={() => toggleFilter("delivery-under-45")}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${activeFilters.has("delivery-under-45")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <Timer
                              className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has("delivery-under-45") ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}`}
                              strokeWidth={1.5}
                            />
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("delivery-under-45") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Under 45 mins
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Rating Tab */}
                      <div
                        ref={(el) => (filterSectionRefs.current["rating"] = el)}
                        data-section-id="rating"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">
                          Restaurant Rating
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                          <button
                            onClick={() => toggleFilter("rating-35-plus")}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${activeFilters.has("rating-35-plus")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <Star
                              className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has("rating-35-plus") ? "text-green-600 fill-green-600 dark:text-green-400 dark:fill-green-400" : "text-gray-400 dark:text-gray-500"}`}
                            />
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("rating-35-plus") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Rated 3.5+
                            </span>
                          </button>
                          <button
                            onClick={() => toggleFilter("rating-4-plus")}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${activeFilters.has("rating-4-plus")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <Star
                              className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has("rating-4-plus") ? "text-green-600 fill-green-600 dark:text-green-400 dark:fill-green-400" : "text-gray-400 dark:text-gray-500"}`}
                            />
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("rating-4-plus") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Rated 4.0+
                            </span>
                          </button>
                          <button
                            onClick={() => toggleFilter("rating-45-plus")}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${activeFilters.has("rating-45-plus")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <Star
                              className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has("rating-45-plus") ? "text-green-600 fill-green-600 dark:text-green-400 dark:fill-green-400" : "text-gray-400 dark:text-gray-500"}`}
                            />
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("rating-45-plus") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Rated 4.5+
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Distance Tab */}
                      <div
                        ref={(el) =>
                          (filterSectionRefs.current["distance"] = el)
                        }
                        data-section-id="distance"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">
                          Distance
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                          <button
                            onClick={() => toggleFilter("distance-under-1km")}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${activeFilters.has("distance-under-1km")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <MapPin
                              className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has("distance-under-1km") ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}`}
                              strokeWidth={1.5}
                            />
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("distance-under-1km") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Under 1 km
                            </span>
                          </button>
                          <button
                            onClick={() => toggleFilter("distance-under-2km")}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${activeFilters.has("distance-under-2km")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <MapPin
                              className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has("distance-under-2km") ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}`}
                              strokeWidth={1.5}
                            />
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("distance-under-2km") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Under 2 km
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Price Tab */}
                      <div
                        ref={(el) => (filterSectionRefs.current["price"] = el)}
                        data-section-id="price"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">
                          Dish Price
                        </h3>
                        <div className="flex flex-col gap-3 md:gap-4">
                          <button
                            onClick={() => toggleFilter("price-under-200")}
                            className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${activeFilters.has("price-under-200")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("price-under-200") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Under ₹200
                            </span>
                          </button>
                          <button
                            onClick={() => toggleFilter("under-250")}
                            className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${activeFilters.has("under-250")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("under-250") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Under ₹250
                            </span>
                          </button>
                          <button
                            onClick={() => toggleFilter("price-under-500")}
                            className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${activeFilters.has("price-under-500")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("price-under-500") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Under ₹500
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Cuisine Tab */}
                      <div
                        ref={(el) =>
                          (filterSectionRefs.current["cuisine"] = el)
                        }
                        data-section-id="cuisine"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">
                          Cuisine
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                          {[
                            "Chinese",
                            "American",
                            "Japanese",
                            "Italian",
                            "Mexican",
                            "Indian",
                            "Asian",
                            "Seafood",
                            "Desserts",
                            "Cafe",
                            "Healthy",
                          ].map((cuisine) => (
                            <button
                              key={cuisine}
                              onClick={() =>
                                setSelectedCuisine(
                                  selectedCuisine === cuisine ? null : cuisine,
                                )
                              }
                              className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-center transition-colors ${selectedCuisine === cuisine
                                ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                                }`}
                            >
                              <span
                                className={`text-sm md:text-base font-medium ${selectedCuisine === cuisine ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                              >
                                {cuisine}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Offers Tab */}
                      <div
                        ref={(el) => (filterSectionRefs.current["offers"] = el)}
                        data-section-id="offers"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">
                          Offers
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                          <button
                            onClick={() => toggleFilter("flat-50-off")}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${activeFilters.has("flat-50-off")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <BadgePercent
                              className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has("flat-50-off") ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}`}
                              strokeWidth={1.5}
                            />
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("flat-50-off") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Flat 50% OFF
                            </span>
                          </button>
                          <button
                            onClick={() => toggleFilter("price-match")}
                            className={`flex flex-col items-center gap-2 p-4 md:p-5 rounded-xl border transition-colors ${activeFilters.has("price-match")
                              ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-green-600"
                              }`}
                          >
                            <BadgePercent
                              className={`h-6 w-6 md:h-7 md:w-7 ${activeFilters.has("price-match") ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}`}
                              strokeWidth={1.5}
                            />
                            <span
                              className={`text-sm md:text-base font-medium ${activeFilters.has("price-match") ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"}`}
                            >
                              Price Match
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Trust Markers Tab */}
                      {activeFilterTab === "trust" && (
                        <div className="space-y-4">
                          <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">
                            Trust Markers
                          </h3>
                          <div className="flex flex-col gap-3 md:gap-4">
                            <button className="px-4 md:px-5 py-3 md:py-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-green-600 text-left transition-colors">
                              <span className="text-sm md:text-base font-medium text-gray-700 dark:text-gray-300">
                                Top Rated
                              </span>
                            </button>
                            <button className="px-4 md:px-5 py-3 md:py-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-green-600 text-left transition-colors">
                              <span className="text-sm md:text-base font-medium text-gray-700 dark:text-gray-300">
                                Trusted by 1000+ users
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-4 px-4 md:px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
                    <button
                      onClick={() => setIsFilterOpen(false)}
                      className="flex-1 py-3 md:py-4 text-center font-semibold text-gray-700 dark:text-gray-300 text-sm md:text-base"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        setIsLoadingFilterResults(true);
                        setIsFilterOpen(false);
                        // Simulate loading for 500ms
                        setTimeout(() => {
                          setIsLoadingFilterResults(false);
                        }, 500);
                      }}
                      className={`flex-1 py-3 md:py-4 font-semibold rounded-xl transition-colors text-sm md:text-base ${activeFilters.size > 0 || sortBy || selectedCuisine
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}
                    >
                      {activeFilters.size > 0 || sortBy || selectedCuisine
                        ? "Show results"
                        : "Show results"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      <style>{`
        @keyframes slideUp {
          0% {
            transform: translateY(100%);
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
