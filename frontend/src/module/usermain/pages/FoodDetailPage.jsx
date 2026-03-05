import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Search, Share2, Clock, ChevronDown, CheckCircle, X, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import WishlistButton from "@/components/WishlistButton";
import { useCart } from "../../user/context/CartContext";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";

import imgStrawberry from "@/assets/grocery&kitchen/strawberry2.jpeg";

const extractId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value?._id || value?.id || "";
  return "";
};

const isValidObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || "").trim());

const normalizeProduct = (item = {}, fallbackId = "") => {
  const id = item?.id || item?._id || fallbackId;
  const price = Number(item?.price ?? item?.sellingPrice ?? 0);
  const mrp = Number(item?.mrp ?? price);
  const discountPercent = mrp > price && mrp > 0 ? Math.max(1, Math.round(((mrp - price) / mrp) * 100)) : 0;

  const resolvedStoreId =
    typeof item?.storeId === "object"
      ? item?.storeId?._id || item?.storeId?.id || ""
      : item?.storeId || "";
  const resolvedStoreName =
    item?.storeName ||
    item?.storeId?.name ||
    item?.restaurant ||
    "";
  const resolvedStoreAddress =
    item?.storeAddress ||
    item?.restaurantAddress ||
    item?.storeId?.address ||
    item?.storeId?.location?.formattedAddress ||
    item?.storeId?.location?.address ||
    "";

  return {
    ...item,
    id,
    name: item?.name || "Product",
    weight: item?.weight || item?.unit || "200 g",
    price,
    mrp,
    discount: item?.discount || (discountPercent > 0 ? `${discountPercent}% OFF` : ""),
    time: item?.time || "8 MINS",
    description: item?.description || "",
    image: item?.image || (Array.isArray(item?.images) ? item.images[0] : "") || imgStrawberry,
    categoryId: extractId(item?.categoryId) || extractId(item?.category) || "",
    subcategoryId:
      item?.subcategoryId ||
      item?.subcategory?._id ||
      item?.subcategory?.id ||
      item?.subcategory ||
      (Array.isArray(item?.subcategories) ? extractId(item.subcategories[0]) : "") ||
      "",
    platform: item?.platform || "mogrocery",
    storeName: resolvedStoreName,
    storeId: resolvedStoreId,
    storeAddress: resolvedStoreAddress,
    restaurantId: item?.restaurantId || resolvedStoreId || "",
    restaurant: item?.restaurant || resolvedStoreName || "MoGrocery",
    restaurantAddress: item?.restaurantAddress || resolvedStoreAddress || "",
    storeLocation:
      item?.storeLocation ||
      item?.storeId?.location ||
      item?.restaurantLocation ||
      null,
  };
};

export default function FoodDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const { addToCart, groceryCart, updateQuantityByPlatform } = useCart();
  const [similarProducts, setSimilarProducts] = useState([]);
  const { location: userLocation } = useUserLocation();
  const { zoneId } = useZone(userLocation, "mogrocery");

  const [product, setProduct] = useState(
    normalizeProduct(
      location.state?.item || {
        id,
        name: "Strawberry (Mahabaleshwar)",
        weight: "200 g",
        price: 99,
        mrp: 113,
        image: imgStrawberry,
      },
      id,
    ),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const wishlistItem = useMemo(() => ({ ...product, id: product?.id || id }), [product, id]);
  const productId = String(product?.id || id || "");
  const groceryCartItem = useMemo(
    () => groceryCart.find((item) => String(item?.id || "") === productId),
    [groceryCart, productId],
  );
  const isAddedToCart = Boolean(groceryCartItem);
  const currentQuantity = Number(groceryCartItem?.quantity || 0);

  useEffect(() => {
    const onScroll = () => setShowStickyHeader(window.scrollY > 260);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const loadProduct = async () => {
      window.scrollTo(0, 0);
      setIsDetailsOpen(false);

      if (location.state?.item) {
        const normalizedStateProduct = normalizeProduct(location.state.item, id);
        setProduct(normalizeProduct(location.state.item, id));
        if (normalizedStateProduct.description) {
          return;
        }
      }

      if (!isValidObjectId(id)) {
        return;
      }

      try {
        setIsLoading(true);
        const response = await api.get(`/grocery/products/${id}`, {
          params: zoneId ? { zoneId } : {}
        });
        const data = response?.data?.data;
        if (data) {
          setProduct(normalizeProduct(data, id));
        }
      } catch (error) {
        console.error("Failed to load product detail:", error);
        toast.error("Unable to load product details");
      } finally {
        setIsLoading(false);
      }
    };

    loadProduct();
  }, [id, location.state, zoneId]);

  useEffect(() => {
    const fetchSimilar = async () => {
      const categoryId = product?.categoryId;
      if (!isValidObjectId(categoryId)) return;
      try {
        const response = await api.get("/grocery/products", {
          params: { categoryId, limit: 12, ...(zoneId ? { zoneId } : {}) },
        });
        const data = response?.data?.data;
        if (Array.isArray(data)) {
          // Filter current product and normalize
          const filtered = data
            .filter((p) => String(p._id || p.id) !== productId)
            .map((p) => normalizeProduct(p));
          setSimilarProducts(filtered);
        } else {
          setSimilarProducts([]);
        }
      } catch (error) {
        console.error("Failed to fetch similar products:", error);
        setSimilarProducts([]);
      }
    };
    fetchSimilar();
  }, [product?.categoryId, productId, zoneId]);

  const calculateUnitPrice = (price, weight) => {
    if (!weight || !price) return null;
    const match = String(weight).match(/(\d+(\.\d+)?)\s*(kg|g|pc|pcs|l|ml)/i);
    if (!match) return null;
    const val = parseFloat(match[1]);
    const unit = match[3].toLowerCase();

    if (unit === "kg" || unit === "l") {
      return `₹${(price / val).toFixed(1)}/${unit}`;
    }
    if (unit === "g" || unit === "ml") {
      return `₹${((price / val) * 1000).toFixed(1)}/kg`;
    }
    return null;
  };

  const handleSearchClick = () => navigate("/grocery");

  const handleShareClick = async () => {
    const url = window.location.href;
    const payload = {
      title: product.name,
      text: `Check this on MoBasket: ${product.name}`,
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Product link copied");
        return;
      }
    } catch (error) {
      console.error("Share failed:", error);
    }

    toast.error("Unable to share right now");
  };

  const handleAddToCart = (itemToWeight, e) => {
    if (e) e.stopPropagation();
    const targetProduct = itemToWeight || product;
    const resolvedStoreId = String(targetProduct.restaurantId || targetProduct.storeId || "").trim();

    if (!resolvedStoreId) {
      toast.error("Store information missing for this product.");
      return;
    }

    addToCart({
      ...targetProduct,
      id: targetProduct.id || id,
      restaurantId: resolvedStoreId,
      restaurant: targetProduct.restaurant || targetProduct.storeName || "MoGrocery",
      restaurantAddress:
        targetProduct.restaurantAddress || targetProduct.storeAddress || "",
      restaurantLocation:
        targetProduct.restaurantLocation || targetProduct.storeLocation || null,
      platform: "mogrocery",
    });

    toast.custom(
      (t) => (
        <div className="bg-white border-l-4 border-emerald-500 shadow-lg rounded-lg p-4 flex flex-col gap-3 min-w-[280px] overflow-hidden relative">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-1.5 rounded-full">
              <CheckCircle className="text-emerald-600 w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Added to Cart</p>
              <p className="text-xs text-gray-500">{targetProduct.name}</p>
            </div>
            <button onClick={() => toast.dismiss(t)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 w-full" />
        </div>
      ),
      { duration: 1600, position: "bottom-right" },
    );
  };

  const handleIncreaseQuantity = (e) => {
    if (e) e.stopPropagation();
    if (!isAddedToCart) {
      handleAddToCart(e);
      return;
    }
    updateQuantityByPlatform(productId, currentQuantity + 1, "mogrocery");
  };

  const handleDecreaseQuantity = (e) => {
    if (e) e.stopPropagation();
    if (!isAddedToCart) return;
    updateQuantityByPlatform(productId, currentQuantity - 1, "mogrocery");
  };

  const quickActions = (
    <div className="flex items-center gap-2">
      <WishlistButton item={wishlistItem} type="food" className="w-10 h-10 bg-white/70 backdrop-blur-md border border-white/60" />
      <button
        onClick={handleSearchClick}
        className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-md border border-white/60 flex items-center justify-center"
        aria-label="Search"
      >
        <Search className="w-5 h-5 text-slate-900" />
      </button>
      <button
        onClick={handleShareClick}
        className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-md border border-white/60 flex items-center justify-center"
        aria-label="Share"
      >
        <Share2 className="w-5 h-5 text-slate-900" />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#edf5ff] via-[#f5f8ff] to-white relative pb-24">
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-white/70 backdrop-blur-[2px] flex items-center justify-center">
          <div className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold">Loading product...</div>
        </div>
      )}

      <div className={`fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-md z-50 px-4 py-3 flex items-center gap-3 shadow-sm transition-transform duration-300 ${showStickyHeader ? "translate-y-0" : "-translate-y-full"}`}>
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-slate-800" />
        </button>
        <h1 className="flex-1 text-sm font-bold text-slate-800 truncate">{product.name}</h1>
        <div className="scale-90 origin-right">{quickActions}</div>
      </div>

      <div className="relative md:max-w-6xl md:mx-auto md:flex md:items-start md:gap-14 md:pt-24 md:px-8 md:pb-8">
        {/* Desktop Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="hidden md:flex absolute top-8 left-8 items-center justify-center w-10 h-10 bg-white rounded-full border border-slate-200 shadow-sm text-slate-700 hover:bg-slate-50 transition-colors z-20"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Left Side: Product Image Layout */}
        <div className="relative w-full h-[44vh] md:w-[45%] md:h-[500px] md:shrink-0 md:rounded-[36px] bg-gradient-to-br from-[#ffd9b1] via-[#ffd1a8] to-[#ffc68f] md:shadow-[0_8px_30px_rgba(0,0,0,0.04)] md:overflow-hidden md:border md:border-slate-100 p-2 md:p-8">
          <img src={product.image} alt={product.name} className="w-full h-full object-contain p-5 md:p-2 md:scale-110 md:hover:scale-[1.15] transition-transform duration-500" />

          <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between md:justify-end z-20">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 bg-white/55 backdrop-blur-md rounded-full flex items-center justify-center shadow-sm md:hidden"
              aria-label="Back"
            >
              <ArrowLeft className="w-6 h-6 text-slate-900" />
            </button>
            <div>{quickActions}</div>
          </div>

          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-white/70 to-transparent z-10 md:hidden" />
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white via-white/90 to-transparent z-10 md:hidden" />

          {isAddedToCart ? (
            <div className="absolute bottom-4 right-4 z-20 h-10 px-2 rounded-xl bg-white border border-emerald-300 shadow-sm flex items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={handleDecreaseQuantity}
                className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center"
              >
                <Minus size={14} />
              </button>
              <span className="min-w-[20px] text-center text-sm font-black text-emerald-800">{currentQuantity}</span>
              <button
                type="button"
                onClick={handleIncreaseQuantity}
                className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center"
              >
                <Plus size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => handleAddToCart(null, e)}
              className="absolute bottom-4 right-4 text-xs font-black px-6 py-2 rounded-md shadow-sm transition-colors z-20 border bg-white border-[#facd01] text-slate-900 hover:bg-[#facd01] md:hidden"
            >
              ADD
            </button>
          )}
        </div>

        {/* Right Side: Details Layout */}
        <div className="relative -mt-10 z-10 md:w-[55%] md:mt-0 md:z-auto">
          <div className="bg-white rounded-t-[26px] shadow-[0_-6px_26px_rgba(15,23,42,0.08)] px-5 pt-5 pb-4 border-t border-slate-100 md:rounded-none md:shadow-none md:border-none md:p-0 md:bg-transparent md:flex md:flex-col md:justify-center">

            {/* Breadcrumb style text on desktop */}
            <p className="hidden md:block text-xs font-semibold text-slate-400 mb-3">
              Home / {product.restaurant || "MoGrocery"} / {product.name}
            </p>

            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold mb-2 md:mb-4 w-max">
              <Clock size={12} />
              {product.time}
            </div>

            <h1 className="text-[20px] md:text-3xl font-[900] text-slate-900 leading-snug">{product.name}</h1>

            {product.storeName && (
              <p className="text-[12px] md:text-sm text-slate-600 mt-1.5 font-medium">
                Sold by <span className="font-semibold text-slate-800">{product.storeName}</span>
              </p>
            )}

            <p className="text-[13px] md:text-base font-semibold text-slate-500 mt-1 md:mt-3">{product.weight}</p>

            <div className="flex items-center gap-2 mt-2.5 md:mt-6">
              <span className="text-xl md:text-3xl font-[900] text-slate-900">Rs {product.price}</span>
              {product.mrp > product.price && (
                <span className="text-[11px] md:text-sm font-bold text-slate-400 line-through">MRP Rs {product.mrp}</span>
              )}
              {product.discount && (
                <span className="bg-[#e8f0fe] md:bg-blue-100 text-[#2c73eb] md:text-blue-700 text-[10px] md:text-xs font-[800] px-1.5 py-0.5 md:px-2 md:py-1 rounded-md">
                  {product.discount}
                </span>
              )}
            </div>

            {/* DESKTOP ADD BUTTON */}
            <div className="hidden md:flex mt-8 mb-4">
              {isAddedToCart ? (
                <div className="h-12 w-40 rounded-xl bg-emerald-600 text-white flex items-center justify-between px-3 shadow-md hover:shadow-lg transition-transform">
                  <button
                    type="button"
                    onClick={handleDecreaseQuantity}
                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
                  >
                    <Minus size={16} strokeWidth={2.5} />
                  </button>
                  <span className="text-base font-black text-white">{currentQuantity}</span>
                  <button
                    type="button"
                    onClick={handleIncreaseQuantity}
                    className="w-8 h-8 rounded-full bg-white text-emerald-700 flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    <Plus size={16} strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => handleAddToCart(null, e)}
                  className="h-12 w-40 rounded-xl bg-slate-800 text-white font-[800] text-base shadow-md hover:bg-slate-700 transition-colors"
                >
                  ADD TO CART
                </button>
              )}
            </div>

            <div className="mt-4 md:mt-6 border-t border-slate-100 md:border-slate-200 pt-3 md:pt-6">
              <button
                type="button"
                className="flex items-center gap-1 text-[13px] font-[700] text-[#11a652] md:text-slate-800 md:text-sm"
                onClick={() => setIsDetailsOpen((prev) => !prev)}
              >
                View product details
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isDetailsOpen ? "rotate-180" : ""}`} />
              </button>

              <div className={`overflow-hidden transition-all duration-300 ${isDetailsOpen ? "max-h-64 mt-3 md:mt-4" : "max-h-0"}`}>
                <div className="bg-[#f8f9ff] md:bg-white md:border md:border-slate-100 rounded-xl p-3 md:p-4 text-[12px] md:text-sm text-slate-600 md:text-slate-500 leading-relaxed shadow-sm">
                  {product.description || "Fresh quality grocery item delivered quickly. Store in a cool place and consume before expiry for best taste."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pt-6 pb-8 md:max-w-6xl md:mx-auto md:px-8 md:pt-12">
        <h2 className="text-lg md:text-xl font-[900] text-slate-900 mb-4 md:mb-6">Similar products</h2>
        {similarProducts.length === 0 ? (
          <div className="text-sm text-slate-500">No similar products found in this category.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-3 md:gap-x-5 gap-y-6 md:gap-y-8">
            {similarProducts.map((item) => {
              const itemCartRef = groceryCart.find((c) => String(c.id) === String(item.id));
              const itemInCart = Boolean(itemCartRef);
              const itemQty = itemCartRef?.quantity || 0;
              const discountVal = item.mrp > item.price ? Math.round(((item.mrp - item.price) / item.mrp) * 100) : 0;

              return (
                <div
                  key={item.id}
                  className="flex flex-col h-full bg-white relative cursor-pointer group"
                  onClick={() => {
                    navigate(`/food/${item.id}`, { state: { item } });
                    window.scrollTo(0, 0);
                  }}
                >
                  {/* Image Section */}
                  <div className="w-full aspect-square bg-[#f8f9fb] rounded-[24px] overflow-hidden relative mb-3 flex items-center justify-center p-4">
                    <img src={item.image} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110" alt={item.name} />

                    {/* Heart Icon Overlay */}
                    <div className="absolute top-2.5 right-2.5 z-10">
                      <WishlistButton
                        item={item}
                        className="w-7 h-7 bg-white shadow-md border-none flex items-center justify-center p-0"
                      />
                    </div>

                    {/* ADD / Quantity Control Overlay */}
                    <div className="absolute bottom-2.5 right-2.5 z-10">
                      {itemInCart ? (
                        <div className="flex items-center gap-3 bg-white rounded-full border border-emerald-500/30 px-1.5 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantityByPlatform(item.id, itemQty - 1, "mogrocery");
                            }}
                            className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center active:scale-90 transition-transform"
                          >
                            <Minus size={12} strokeWidth={3} />
                          </button>
                          <span className="text-[11px] font-[900] text-emerald-900 min-w-[14px] text-center">{itemQty}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantityByPlatform(item.id, itemQty + 1, "mogrocery");
                            }}
                            className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center active:scale-90 transition-transform"
                          >
                            <Plus size={12} strokeWidth={3} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => handleAddToCart(item, e)}
                          className="bg-white border border-[#facd01] text-slate-900 text-[10px] font-black px-5 py-1.5 rounded-full shadow-sm hover:bg-[#facd01] transition-all active:scale-95"
                        >
                          ADD
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Info Section */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-3 h-3 border border-green-600 flex items-center justify-center p-[1px]">
                      <div className="w-full h-full bg-green-600 rounded-full" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500">{item.weight}</span>
                  </div>

                  <p className="text-[12px] font-bold text-slate-900 leading-tight line-clamp-2 min-h-[32px] mb-1">
                    {item.name}
                  </p>

                  {/* Time with Icon */}
                  <div className="flex items-center gap-1 mb-1.5">
                    <Clock size={10} className="text-slate-400" />
                    <span className="text-[9px] font-extrabold text-slate-500 uppercase">{item.time || "11 MINS"}</span>
                  </div>

                  {/* Price Info */}
                  <div className="mt-auto">
                    {discountVal > 0 && <p className="text-[11px] font-black text-blue-600 leading-none mb-1.5">{discountVal}% OFF</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-[900] text-slate-900 leading-none">₹{item.price}</span>
                      {item.mrp > item.price && (
                        <span className="text-[12px] text-slate-400 line-through leading-none font-medium">₹{item.mrp}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 font-medium tracking-tight">
                      {calculateUnitPrice(item.price, item.weight) || `₹${item.price}/unit`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-3 md:hidden">
        <button
          onClick={(e) => {
            if (isAddedToCart) {
              navigate("/grocery/cart");
              return;
            }
            handleAddToCart(null, e);
          }}
          className={`w-full h-12 rounded-xl text-white font-bold text-base shadow-md ${isAddedToCart ? "bg-emerald-700 hover:bg-emerald-700" : "bg-[#16a34a] hover:bg-[#15803d]"
            }`}
        >
          {isAddedToCart ? "Added to cart" : "Add to cart"}
        </button>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
