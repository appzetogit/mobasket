import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "../../user/context/CartContext";
import WishlistButton from "@/components/WishlistButton";
import api from "@/lib/api";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";

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

const buildProductDetailState = (product) => {
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
    weight: product?.unit || "",
    price: Number(product?.sellingPrice || product?.price || 0),
    mrp: Number(product?.mrp || product?.sellingPrice || product?.price || 0),
    image: extractImage(product),
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
}) {
  const navigate = useNavigate();
  const { addToCart, isInCart } = useCart();
  const { location: userLocation } = useUserLocation();
  const { zoneId } = useZone(userLocation, "mogrocery");

  const [selectedCategory, setSelectedCategory] = useState(initialCategory || "all");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(initialSubcategoryId || "");
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
      if (!zoneId) {
        if (mounted) {
          setProducts([]);
          setIsProductsLoading(false);
        }
        return;
      }

      try {
        setIsProductsLoading(true);
        const params = {
          page: 1,
          limit: 200,
          zoneId,
          ...(selectedCategory && selectedCategory !== "all" ? { categoryId: selectedCategory } : {}),
          ...(selectedSubcategoryId ? { subcategoryId: selectedSubcategoryId } : {}),
        };

        const response = await api.get("/grocery/products", { params });
        const data = Array.isArray(response?.data?.data) ? response.data.data : [];
        const zoneSafeData = data.filter((product) => {
          const productZoneId = String(
            product?.zoneId?._id ||
              product?.zoneId?.id ||
              product?.zoneId ||
              product?.storeId?.zoneId?._id ||
              product?.storeId?.zoneId?.id ||
              product?.storeId?.zoneId ||
              "",
          ).trim();
          return !productZoneId || productZoneId === String(zoneId);
        });
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
  }, [selectedCategory, selectedSubcategoryId, zoneId]);

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

    addToCart({
      id: product?._id || product?.id,
      name: product?.name || "Product",
      price: Number(product?.sellingPrice || product?.price || 0),
      mrp: Number(product?.mrp || product?.sellingPrice || product?.price || 0),
      weight: product?.unit || "",
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
    });

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
        position: "bottom-right",
      },
    );
  };

  return (
    <div className={`bg-[#f4f6fb] flex flex-col min-h-0 font-sans ${isModal ? "h-full w-full" : "min-h-screen h-full w-full"}`}>
      <div className={`flex flex-col h-full min-h-0 ${!isModal ? "md:max-w-7xl md:mx-auto w-full bg-white md:shadow-xl md:my-4 md:rounded-2xl md:overflow-hidden" : ""}`}>
        <div className="bg-white sticky top-0 z-50 px-4 py-3 flex items-center gap-3 border-b border-gray-100 shadow-sm relative">
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} className="text-slate-800" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-sm font-black text-slate-800 tracking-wide line-clamp-1">
              {sidebarCategories.find((c) => c.id === selectedCategory)?.name || "All Products"}
            </h1>
            <span className="text-[10px] text-slate-500 font-bold">{products.length} items</span>
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
          <div className="w-full bg-white overflow-x-auto no-scrollbar z-10 flex items-center px-2 shadow-sm border-b border-gray-50 flex-shrink-0">
            {sidebarCategories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setSelectedSubcategoryId("");
                }}
                className={`relative flex flex-col items-center justify-center gap-1.5 py-3 px-1 cursor-pointer transition-all min-w-[76px] flex-shrink-0 ${selectedCategory === cat.id ? "bg-transparent" : "bg-white"}`}
              >
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${selectedCategory === cat.id
                    ? "bg-[#fef3c7] scale-105 border-2 border-[#facd01]"
                    : "bg-slate-50 border border-transparent"
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
                  className={`text-[10px] text-center leading-tight px-0.5 font-bold line-clamp-2 max-w-[70px] ${selectedCategory === cat.id ? "text-slate-900" : "text-slate-500"}`}
                >
                  {cat.name}
                </span>

                {selectedCategory === cat.id && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#facd01] rounded-t-full" />
                )}
              </div>
            ))}
          </div>

          <div data-sheet-scrollable="true" className="flex-1 min-h-0 bg-white h-full overflow-y-auto pb-24 px-3 pt-4 touch-auto [-webkit-overflow-scrolling:touch]">
            {isProductsLoading && (
              <div className="text-sm text-slate-500 px-1 py-2">Loading products...</div>
            )}

            {!isProductsLoading && products.length === 0 && (
              <div className="text-sm text-slate-500 px-1 py-2">
                {isCategoriesLoading ? "Loading categories..." : "No products available."}
              </div>
            )}

            {!isProductsLoading && products.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {products.map((item) => {
                  const productId = String(item?._id || item?.id || "");
                  const alreadyInCart = productId ? isInCart(productId) : false;
                  const price = Number(item?.sellingPrice || item?.price || 0);
                  const mrp = Number(item?.mrp || price || 0);
                  const discountPercent =
                    mrp > price && mrp > 0
                      ? Math.max(1, Math.round(((mrp - price) / mrp) * 100))
                      : 0;

                  return (
                    <div
                      key={productId || item?.name}
                      className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow h-full"
                      onClick={() => handleProductCardClick(item)}
                    >
                      <div className="relative w-full h-40 md:h-48 p-2 bg-white">
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

                        <button
                          className={`absolute bottom-1 right-2 border text-[10px] font-black px-4 py-1 rounded shadow-sm transition-colors z-20 ${alreadyInCart
                            ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                            : "bg-white border-[#facd01] text-gray-900 hover:bg-[#facd01]"
                            }`}
                          onClick={(e) => handleAddToCart(item, e)}
                        >
                          {alreadyInCart ? "ADDED" : "ADD"}
                        </button>
                      </div>

                      <div className="px-2 pb-2 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="text-[12px] font-bold text-slate-900 leading-tight line-clamp-2 mb-1 min-h-[2.4em]">
                            {item?.name || "Product"}
                          </h3>

                          <p className="text-[10px] font-medium text-slate-400 mb-2">
                            {item?.unit || "Unit"}
                          </p>

                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-black text-slate-900">
                              Rs {price}
                            </span>
                            {mrp > price && (
                              <span className="text-[10px] text-slate-400 line-through decoration-slate-400">
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
    </div>
  );
}

const CategoryFoodsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isCategoriesRootPage = location?.pathname === "/grocery/categories";
  const stateCategoryId = String(location?.state?.categoryId || "").trim();
  const initialCategory = isCategoriesRootPage ? "all" : (id || stateCategoryId || "all");

  return (
    <CategoryFoodsContent
      onClose={() => navigate(-1)}
      initialCategory={initialCategory}
    />
  );
};

export default CategoryFoodsPage;
