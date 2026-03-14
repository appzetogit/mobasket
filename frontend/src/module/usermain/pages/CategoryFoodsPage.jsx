import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "../../user/context/CartContext";
import WishlistButton from "@/components/WishlistButton";
import api from "@/lib/api";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";
import AddToCartAnimation from "../../user/components/AddToCartAnimation";

const FALLBACK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const extractImage = (product) => {
  const images = Array.isArray(product?.images) ? product.images : [];
  const firstArrayImage = images.find((img) => typeof img === "string" && img.trim());
  if (firstArrayImage) return firstArrayImage;
  if (typeof product?.image === "string" && product.image.trim()) return product.image;
  return FALLBACK_IMAGE;
};

const extractId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value?._id || value?.id || "";
  return "";
};

const extractStoreId = (product) =>
  String(
    product?.storeId?._id ||
      product?.storeId?.id ||
      product?.storeId ||
      product?.restaurantId?._id ||
      product?.restaurantId?.id ||
      product?.restaurantId ||
      "",
  ).trim();

const getStoreIdCandidates = (storeLike) => {
  const rawCandidates = [
    storeLike?._id,
    storeLike?.id,
    storeLike?.restaurantId,
    storeLike?.storeId?._id,
    storeLike?.storeId?.id,
    storeLike?.storeId,
    storeLike?.storeId?.restaurantId,
    storeLike?.restaurant?._id,
    storeLike?.restaurant?.id,
    storeLike?.restaurant?.restaurantId,
    storeLike?.restaurantId?._id,
    storeLike?.restaurantId?.id,
    storeLike?.restaurantId?.restaurantId,
  ];

  return Array.from(
    new Set(
      rawCandidates
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
};

const doesProductMatchStore = (product, selectedStoreId) => {
  const normalizedSelectedStoreId = String(selectedStoreId || "").trim();
  if (!normalizedSelectedStoreId || normalizedSelectedStoreId === "all-stores") return true;
  const selectedIds = new Set([normalizedSelectedStoreId]);
  const productStoreIds = getStoreIdCandidates(product);
  return productStoreIds.some((id) => selectedIds.has(id));
};

const normalizeVariantKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const getDefaultVariant = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const normalized = variants
    .map((variant, index) => {
      const name = String(variant?.name || "").trim();
      const price = Number(variant?.sellingPrice ?? variant?.price ?? 0);
      const mrp = Number(variant?.mrp ?? price);
      if (!name || !Number.isFinite(price)) return null;

      return {
        ...variant,
        key: normalizeVariantKey(name) || `variant-${index}`,
        name,
        price,
        mrp,
        isDefault: variant?.isDefault === true,
      };
    })
    .filter(Boolean);

  return normalized.find((variant) => variant.isDefault) || normalized[0] || null;
};

const getCardProductData = (product) => {
  const productId = String(product?._id || product?.id || "").trim();
  const defaultVariant = getDefaultVariant(product);
  const price = Number(defaultVariant?.price ?? product?.sellingPrice ?? product?.price ?? 0);
  const mrp = Number(defaultVariant?.mrp ?? product?.mrp ?? price);
  const weight = defaultVariant?.name || product?.unit || product?.weight || "";
  const cartItemId = defaultVariant ? `${productId}::${defaultVariant.key}` : productId;

  return { productId, defaultVariant, price, mrp, weight, cartItemId };
};

const buildProductDetailState = (product) => {
  const { price, mrp, weight } = getCardProductData(product);
  const storeId = String(product?.storeId?._id || product?.storeId?.id || product?.storeId || "").trim();
  const storeName = String(product?.storeId?.name || product?.storeName || "").trim();
  const storeAddress = String(
    product?.storeAddress ||
    product?.storeId?.address ||
    product?.storeId?.location?.formattedAddress ||
    product?.storeId?.location?.address ||
    "",
  ).trim();

  return {
    id: product?._id || product?.id,
    name: product?.name || "Product",
    description: product?.description || "",
    weight,
    unit: weight,
    price,
    mrp,
    image: extractImage(product),
    variants: Array.isArray(product?.variants) ? product.variants : [],
    categoryId: extractId(product?.category),
    subcategoryId: extractId(product?.subcategory) || extractId(Array.isArray(product?.subcategories) ? product.subcategories[0] : ""),
    storeId,
    storeName,
    storeAddress,
    storeLocation: product?.storeLocation || product?.storeId?.location || null,
    platform: "mogrocery",
  };
};

export function CategoryFoodsContent({
  onClose,
  isModal = false,
  initialCategory = "all",
  initialSubcategoryId = "",
  initialStoreId = "all-stores",
}) {
  const navigate = useNavigate();
  const { addToCart, getCartItem, isInCart, updateQuantity } = useCart();
  const { location: userLocation, loading: locationLoading } = useUserLocation();
  const { zoneId, loading: zoneLoading } = useZone(userLocation, "mogrocery");
  const cachedZoneId =
    typeof window !== "undefined" ? localStorage.getItem("userZoneId:mogrocery") : "";
  const effectiveZoneId = String(zoneId || cachedZoneId || "").trim();

  const [selectedCategory, setSelectedCategory] = useState(initialCategory || "all");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(initialSubcategoryId || "");
  const [selectedStoreId, setSelectedStoreId] = useState(initialStoreId || "all-stores");
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);

  useEffect(() => {
    setSelectedCategory(initialCategory || "all");
  }, [initialCategory]);

  useEffect(() => {
    setSelectedSubcategoryId(initialSubcategoryId || "");
  }, [initialSubcategoryId]);

  useEffect(() => {
    setSelectedStoreId(initialStoreId || "all-stores");
  }, [initialStoreId]);

  useEffect(() => {
    let mounted = true;

    const fetchCategories = async () => {
      try {
        const response = await api.get("/grocery/categories", {
          params: { includeSubcategories: true, activeOnly: "true" },
        });
        const data = Array.isArray(response?.data?.data) ? response.data.data : [];
        if (!mounted) return;
        setCategories(data);
      } catch {
        if (!mounted) return;
        setCategories([]);
      } finally {
        if (mounted) setIsCategoriesLoading(false);
      }
    };

    fetchCategories();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isCategoriesLoading && selectedCategory !== "all") {
      const exists = categories.some((cat) => String(cat?._id || "") === String(selectedCategory));
      if (!exists) setSelectedCategory("all");
    }
  }, [categories, isCategoriesLoading, selectedCategory]);

  useEffect(() => {
    let mounted = true;

    const fetchProducts = async () => {
      if ((locationLoading || zoneLoading) && !effectiveZoneId) {
        return;
      }

      try {
        setIsProductsLoading(true);
        const params = {
          page: 1,
          limit: 200,
          ...(effectiveZoneId ? { zoneId: effectiveZoneId } : {}),
          ...(selectedCategory && selectedCategory !== "all" ? { categoryId: selectedCategory } : {}),
          ...(selectedSubcategoryId ? { subcategoryId: selectedSubcategoryId } : {}),
          ...(selectedStoreId && selectedStoreId !== "all-stores"
            ? { storeId: selectedStoreId }
            : {}),
        };

        const response = await api.get("/grocery/products", { params });
        const data = Array.isArray(response?.data?.data) ? response.data.data : [];
        let zoneSafeData = data.filter((product) => {
          if (!effectiveZoneId) return true;
          const productZoneId = String(
            product?.zoneId?._id ||
            product?.zoneId?.id ||
            product?.zoneId ||
            product?.storeId?.zoneId?._id ||
            product?.storeId?.zoneId?.id ||
            product?.storeId?.zoneId ||
            "",
          ).trim();
          return !productZoneId || productZoneId === String(effectiveZoneId);
        });

        if (zoneSafeData.length === 0) {
          const fallbackResponse = await api.get("/grocery/products", {
            params: {
              limit: 1000,
              ...(effectiveZoneId ? { zoneId: effectiveZoneId } : {}),
            },
          });
          const fallbackData = Array.isArray(fallbackResponse?.data?.data) ? fallbackResponse.data.data : [];
          zoneSafeData = fallbackData.filter((product) => {
            const productCategoryId = extractId(product?.category);
            const productSubcategoryIds = [
              ...(Array.isArray(product?.subcategories) ? product.subcategories : []),
              product?.subcategory,
            ]
              .map((subcategory) => extractId(subcategory))
              .filter(Boolean);

            const categoryMatch =
              !selectedCategory ||
              selectedCategory === "all" ||
              productCategoryId === String(selectedCategory);
            const subcategoryMatch =
              !selectedSubcategoryId ||
              productSubcategoryIds.includes(String(selectedSubcategoryId));
            const storeMatch =
              !selectedStoreId ||
              selectedStoreId === "all-stores" ||
              doesProductMatchStore(product, selectedStoreId);

            return categoryMatch && subcategoryMatch && storeMatch;
          });
        }

        if (selectedStoreId && selectedStoreId !== "all-stores") {
          zoneSafeData = zoneSafeData.filter(
            (product) => doesProductMatchStore(product, selectedStoreId),
          );
        }

        if (!mounted) return;
        setProducts(zoneSafeData);
      } catch {
        if (!mounted) return;
        setProducts([]);
      } finally {
        if (mounted) setIsProductsLoading(false);
      }
    };

    fetchProducts();

    return () => {
      mounted = false;
    };
  }, [
    effectiveZoneId,
    locationLoading,
    selectedCategory,
    selectedStoreId,
    selectedSubcategoryId,
    zoneLoading,
  ]);

  const sidebarCategories = useMemo(() => {
    const dynamic = categories.map((category) => ({
      id: String(category?._id || ""),
      name: category?.name || "Category",
      icon: category?.image || FALLBACK_IMAGE,
    })).filter((category) => category.id);

    return [{ id: "all", name: "All", icon: dynamic[0]?.icon || FALLBACK_IMAGE }, ...dynamic];
  }, [categories]);

  const handleProductCardClick = (product) => {
    const productId = product?._id || product?.id;
    if (!productId) return;
    navigate(`/food/${productId}`, {
      state: {
        item: buildProductDetailState(product),
      },
    });
  };

  const handleAddToCart = (product, event) => {
    event?.stopPropagation();

    const storeId = String(product?.storeId?._id || product?.storeId?.id || product?.storeId || "").trim();
    const storeName = String(product?.storeId?.name || product?.storeName || "").trim();
    const storeAddress = String(
      product?.storeAddress ||
      product?.storeId?.address ||
      product?.storeId?.location?.formattedAddress ||
      product?.storeId?.location?.address ||
      "",
    ).trim();

    if (!storeId) {
      toast.error("Store information missing for this product.");
      return;
    }

    const { defaultVariant, price, mrp, weight, cartItemId } = getCardProductData(product);

    const didAdd = addToCart({
      id: cartItemId,
      cartItemId,
      productId: product?._id || product?.id,
      name: product?.name || "Product",
      price,
      mrp,
      weight,
      unit: weight,
      variantName: defaultVariant?.name || "",
      selectedVariant: defaultVariant
        ? {
            name: defaultVariant.name,
            key: defaultVariant.key,
            price: defaultVariant.price,
            mrp: defaultVariant.mrp,
          }
        : null,
      image: extractImage(product),
      categoryId: extractId(product?.category),
      subcategoryId: extractId(product?.subcategory) || extractId(Array.isArray(product?.subcategories) ? product.subcategories[0] : ""),
      storeId,
      storeName,
      storeAddress,
      storeLocation: product?.storeLocation || product?.storeId?.location || null,
      restaurantId: storeId,
      restaurant: storeName || "MoGrocery",
      restaurantAddress: storeAddress,
      restaurantLocation: product?.storeLocation || product?.storeId?.location || null,
      platform: "mogrocery",
      stockQuantity: product?.stockQuantity,
    });

    if (!didAdd) return;

    toast.custom(
      (t) => (
        <div className="bg-white border-l-4 border-yellow-400 shadow-lg rounded-lg p-4 flex flex-col gap-3 min-w-[300px] overflow-hidden relative">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-100 p-1.5 rounded-full">
              <CheckCircle className="text-yellow-600 w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Added to Cart!</p>
              <p className="text-xs text-gray-500">{product?.name || "Product"} is now in your basket.</p>
            </div>
            <button onClick={() => toast.dismiss(t)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-yellow-400 w-full" />
        </div>
      ),
      {
        duration: 2000,
        position: "top-center",
      },
    );
  };

  return (
    <div className={`bg-[#f4f6fb] dark:bg-[#0b0f17] dark:text-slate-100 flex flex-col min-h-0 font-sans ${isModal ? "h-full w-full" : "min-h-screen h-full w-full"}`}>
      <div className={`flex flex-col h-full min-h-0 ${!isModal ? "md:max-w-7xl md:mx-auto w-full bg-white dark:bg-[#0f172a] md:shadow-xl dark:md:shadow-black/40 md:my-4 md:rounded-2xl md:overflow-hidden" : ""}`}>
        <div className="bg-white dark:bg-[#0f172a] sticky top-0 z-50 px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-black/40 relative">
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft size={20} className="text-slate-800 dark:text-slate-100" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-wide line-clamp-1">
              {sidebarCategories.find((c) => c.id === selectedCategory)?.name || "All Products"}
            </h1>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">{products.length} items</span>
          </div>

          {isModal && (
            <button
              onClick={onClose}
              className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#1a1a1a] p-2 rounded-full shadow-lg border border-white/20 active:scale-95 transition-transform z-[80] md:hidden"
            >
              <X size={20} className="text-white" strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="w-full bg-white dark:bg-[#0f172a] overflow-x-auto no-scrollbar z-10 flex items-center px-2 shadow-sm border-b border-gray-50 dark:border-slate-800 flex-shrink-0">
            {sidebarCategories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setSelectedSubcategoryId("");
                }}
                className={`relative flex flex-col items-center justify-center gap-1.5 py-3 px-1 cursor-pointer transition-all min-w-[76px] flex-shrink-0 ${selectedCategory === cat.id ? "bg-transparent" : "bg-white dark:bg-[#0f172a]"}`}
              >
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${selectedCategory === cat.id
                    ? "bg-[#fef3c7] scale-105 border-2 border-[#facd01] dark:bg-[#152338]"
                    : "bg-slate-50 border border-transparent dark:bg-[#111827] dark:border-slate-700"
                    } p-1.5`}
                >
                  <img
                    src={cat.icon || FALLBACK_IMAGE}
                    alt={cat.name}
                    className="w-full h-full object-contain drop-shadow-sm"
                    onError={(e) => {
                      e.currentTarget.src = FALLBACK_IMAGE;
                    }}
                  />
                </div>

                <span
                  className={`text-[10px] text-center leading-tight px-0.5 font-bold line-clamp-2 max-w-[70px] ${selectedCategory === cat.id ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
                >
                  {cat.name}
                </span>

                {selectedCategory === cat.id && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#facd01] rounded-t-full" />
                )}
              </div>
            ))}
          </div>

          <div data-sheet-scrollable="true" className="flex-1 min-h-0 bg-white dark:bg-[#0b1220] h-full overflow-y-auto pb-24 px-3 pt-4 touch-auto [-webkit-overflow-scrolling:touch]">
            {isProductsLoading && (
              <div className="text-sm text-slate-500 dark:text-slate-400 px-1 py-2">Loading products...</div>
            )}

            {!isProductsLoading && products.length === 0 && (
              <div className="text-sm text-slate-500 dark:text-slate-400 px-1 py-2">
                {isCategoriesLoading ? "Loading categories..." : "No products available."}
              </div>
            )}

            {!isProductsLoading && products.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {products.map((item) => {
                  const { productId, price, mrp, weight, cartItemId } = getCardProductData(item);
                  const cartItem = cartItemId ? getCartItem(cartItemId) : null;
                  const currentQty = Number(cartItem?.quantity || 0);
                  const alreadyInCart = currentQty > 0 || (cartItemId ? isInCart(cartItemId) : false);
                  const discountPercent =
                    mrp > price && mrp > 0
                      ? Math.max(1, Math.round(((mrp - price) / mrp) * 100))
                      : 0;

                  return (
                    <div
                      key={productId || item?.name}
                      className="flex flex-col bg-white dark:bg-[#0f172a] rounded-xl overflow-hidden shadow-sm dark:shadow-black/30 border border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md transition-shadow h-full"
                      onClick={() => handleProductCardClick(item)}
                    >
                      <div className="relative w-full h-40 md:h-48 p-2 bg-white dark:bg-[#0b1220]">
                        {discountPercent > 0 && (
                          <div className="absolute top-2 left-0 bg-[#f8e71d] text-[9px] font-black px-1.5 py-0.5 rounded-r text-slate-900 z-10 shadow-sm">
                            {discountPercent}% OFF
                          </div>
                        )}

                        <div className="absolute top-1 right-1 z-30">
                          <WishlistButton item={buildProductDetailState(item)} />
                        </div>

                        <img
                          src={extractImage(item)}
                          alt={item?.name || "Product"}
                          className="w-full h-full object-contain drop-shadow-[0_8px_6px_rgba(0,0,0,0.15)]"
                        />

                        {alreadyInCart ? (
                          <div className="absolute bottom-1 right-2 z-20">
                            <div
                              className="flex items-center gap-1 rounded-full border border-emerald-300 dark:border-emerald-500/60 bg-white dark:bg-[#0b1220] px-1 py-0.5 shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              <button
                                type="button"
                                className="w-5 h-5 flex items-center justify-center text-emerald-700 dark:text-emerald-300"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateQuantity(
                                    cartItemId,
                                    currentQty - 1,
                                    null,
                                    {
                                      id: cartItemId,
                                      name: item?.name || "Product",
                                      imageUrl: extractImage(item),
                                      stockQuantity: item?.stockQuantity,
                                    },
                                  );
                                }}
                              >
                                <Minus size={12} />
                              </button>
                              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 min-w-[14px] text-center">
                                {currentQty}
                              </span>
                              <button
                                type="button"
                                className="w-5 h-5 flex items-center justify-center text-emerald-700 dark:text-emerald-300"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateQuantity(
                                    cartItemId,
                                    currentQty + 1,
                                    null,
                                    {
                                      id: cartItemId,
                                      name: item?.name || "Product",
                                      imageUrl: extractImage(item),
                                      stockQuantity: item?.stockQuantity,
                                    },
                                  );
                                }}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="absolute bottom-1 right-2 border text-[10px] font-black px-4 py-1 rounded shadow-sm transition-colors z-20 bg-white dark:bg-[#0b1220] border-[#facd01] text-gray-900 dark:text-slate-100 hover:bg-[#facd01]"
                            onClick={(e) => handleAddToCart(item, e)}
                          >
                            ADD
                          </button>
                        )}
                      </div>

                      <div className="px-2 pb-2 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="text-[12px] font-bold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2 mb-1 min-h-[2.4em]">
                            {item?.name || "Product"}
                          </h3>

                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-400 mb-2">
                            {weight || "Unit"}
                          </p>

                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-black text-slate-900 dark:text-slate-100">
                              Rs {price}
                            </span>
                            {mrp > price && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 line-through decoration-slate-400">
                                Rs {mrp}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <AddToCartAnimation
        bottomOffset={20}
        pillClassName="scale-105"
        linkTo="/grocery/cart"
        platform="mogrocery"
        hideOnPages={true}
      />
    </div>
  );
}

const CategoryFoodsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isCategoriesRootPage = location?.pathname === "/grocery/categories";
  const stateCategoryId = String(location?.state?.categoryId || "").trim();
  const stateStoreId = String(location?.state?.storeId || "").trim();
  const queryStoreId = String(new URLSearchParams(location?.search || "").get("storeId") || "").trim();
  const initialCategory = isCategoriesRootPage ? "all" : (id || stateCategoryId || "all");
  const initialStoreId = stateStoreId || queryStoreId || "all-stores";

  return (
    <CategoryFoodsContent
      onClose={() => navigate(-1)}
      initialCategory={initialCategory}
      initialStoreId={initialStoreId}
    />
  );
};

export default CategoryFoodsPage;
