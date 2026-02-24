import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useCart } from "../../user/context/CartContext";
import AddToCartAnimation from "../../user/components/AddToCartAnimation";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";

export default function GroceryBestSellerProductsPage() {
  const navigate = useNavigate();
  const { itemType, itemId } = useParams();
  const { addToCart, isInCart } = useCart();
  const { location } = useUserLocation();
  const { zoneId } = useZone(location, "mogrocery");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("Products");
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        if (!itemType || !itemId) {
          throw new Error("Invalid best seller selection");
        }

        if (itemType === "category") {
          const [categoryRes, productsRes] = await Promise.all([
            api.get(`/grocery/categories/${itemId}`),
            api.get("/grocery/products", { params: { categoryId: itemId, ...(zoneId ? { zoneId } : {}) } }),
          ]);
          setTitle(categoryRes?.data?.data?.name || "Category Products");
          setProducts(Array.isArray(productsRes?.data?.data) ? productsRes.data.data : []);
        } else if (itemType === "subcategory") {
          const [subcategoryRes, productsRes] = await Promise.all([
            api.get(`/grocery/subcategories/${itemId}`),
            api.get("/grocery/products", { params: { subcategoryId: itemId, ...(zoneId ? { zoneId } : {}) } }),
          ]);
          setTitle(subcategoryRes?.data?.data?.name || "Subcategory Products");
          setProducts(Array.isArray(productsRes?.data?.data) ? productsRes.data.data : []);
        } else if (itemType === "product") {
          const productRes = await api.get(`/grocery/products/${itemId}`, {
            params: zoneId ? { zoneId } : {}
          });
          const product = productRes?.data?.data;
          setTitle(product?.name || "Product");
          setProducts(product ? [product] : []);
        } else {
          throw new Error("Unsupported item type");
        }
      } catch {
        setError("Failed to load products.");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [itemId, itemType, zoneId]);

  const headerTitle = useMemo(() => title || "Products", [title]);

  const getSourcePosition = (event, itemId) => {
    if (!event) return null;
    let buttonElement = event.currentTarget;
    if (!buttonElement && event.target) {
      buttonElement = event.target.closest("button") || event.target;
    }
    if (!buttonElement) return null;

    const rect = buttonElement.getBoundingClientRect();
    const scrollX = window.pageXOffset || window.scrollX || 0;
    const scrollY = window.pageYOffset || window.scrollY || 0;

    return {
      viewportX: rect.left + rect.width / 2,
      viewportY: rect.top + rect.height / 2,
      scrollX,
      scrollY,
      itemId,
    };
  };

  const handleAddToCart = (product, event) => {
    try {
      const image =
        Array.isArray(product?.images) && product.images[0]
          ? product.images[0]
          : "https://via.placeholder.com/200";
      const storeId = String(product?.storeId?._id || product?.storeId?.id || product?.storeId || "").trim();
      const storeName = String(product?.storeId?.name || product?.storeName || "").trim();
      const storeAddress = String(
        product?.storeAddress ||
        product?.storeId?.address ||
        product?.storeId?.location?.formattedAddress ||
        product?.storeId?.location?.address ||
        ""
      ).trim();
      const storeLocation = product?.storeLocation || product?.storeId?.location || null;

      if (!storeId) {
        toast.error("Store information missing for this product.");
        return;
      }

      const sourcePosition = getSourcePosition(event, product?._id || product?.id);
      addToCart({
        id: product?._id || product?.id,
        name: product?.name || "Product",
        price: Number(product?.sellingPrice || 0),
        mrp: Number(product?.mrp || 0),
        weight: product?.unit || "",
        image,
        categoryId: String(
          product?.category?._id ||
          product?.category?.id ||
          product?.category ||
          ""
        ).trim(),
        subcategoryId: String(
          product?.subcategory?._id ||
          product?.subcategory?.id ||
          product?.subcategory ||
          ""
        ).trim(),
        storeId,
        storeName,
        storeAddress,
        storeLocation,
        restaurantId: storeId,
        restaurant: storeName || "MoGrocery",
        restaurantAddress: storeAddress,
        restaurantLocation: storeLocation,
        platform: "mogrocery",
      }, sourcePosition);
      toast.success("Added to cart");
    } catch (err) {
      toast.error(err?.message || "Failed to add to cart");
    }
  };

  const handleProductCardClick = (product) => {
    const productId = product?._id || product?.id;
    if (!productId) return;

    const image =
      Array.isArray(product?.images) && product.images[0]
        ? product.images[0]
        : "https://via.placeholder.com/200";

    navigate(`/food/${productId}`, {
      state: {
        item: {
          id: productId,
          name: product?.name || "Product",
          description: product?.description || "",
          weight: product?.unit || "",
          price: Number(product?.sellingPrice || 0),
          mrp: Number(product?.mrp || 0),
          image,
          categoryId: String(
            product?.category?._id ||
            product?.category?.id ||
            product?.category ||
            ""
          ).trim(),
          subcategoryId: String(
            product?.subcategory?._id ||
            product?.subcategory?.id ||
            product?.subcategory ||
            ""
          ).trim(),
          storeId: String(product?.storeId?._id || product?.storeId?.id || product?.storeId || "").trim(),
          storeName: String(product?.storeId?.name || product?.storeName || "").trim(),
          storeAddress: String(
            product?.storeAddress ||
            product?.storeId?.address ||
            product?.storeId?.location?.formattedAddress ||
            product?.storeId?.location?.address ||
            ""
          ).trim(),
          storeLocation: product?.storeLocation || product?.storeId?.location || null,
          platform: "mogrocery",
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/grocery")}
          className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold text-slate-900 line-clamp-1">{headerTitle}</h1>
      </div>

      {loading && <p className="px-4 py-6 text-sm text-slate-500">Loading products...</p>}
      {!loading && error && <p className="px-4 py-6 text-sm text-red-500">{error}</p>}
      {!loading && !error && products.length === 0 && (
        <p className="px-4 py-6 text-sm text-slate-500">No products found.</p>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-2 gap-3 px-4 py-4 md:grid-cols-3">
          {products.map((product) => (
            <div
              key={product._id}
              className="rounded-2xl border border-slate-200 p-3 bg-white shadow-sm flex flex-col min-h-[240px] cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleProductCardClick(product)}
            >
              <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden mb-2 flex items-center justify-center">
                <img
                  src={Array.isArray(product.images) && product.images[0] ? product.images[0] : "https://via.placeholder.com/200"}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-sm font-semibold text-slate-900 line-clamp-2">{product.name}</p>
              <p className="text-xs text-slate-500 mt-1">{product.unit || "Unit not specified"}</p>
              <div className="mt-auto pt-3">
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">Rs {product.sellingPrice ?? 0}</p>
                  {product.mrp && Number(product.mrp) > Number(product.sellingPrice) && (
                    <p className="text-xs text-slate-400 line-through">Rs {product.mrp}</p>
                  )}
                    {isInCart(product?._id || product?.id) && (
                      <p className="text-[10px] font-semibold text-emerald-700 mt-1">Added to cart</p>
                    )}
                  </div>
                <button
                  type="button"
                    onClick={(event) => handleAddToCart(product, event)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                    isInCart(product?._id || product?.id)
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-emerald-600 text-white"
                  }`}
                >
                  <ShoppingCart size={14} />
                  {isInCart(product?._id || product?.id) ? "Added" : "Add"}
                </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddToCartAnimation
        bottomOffset={24}
        pillClassName="scale-105"
        linkTo="/grocery/cart"
        platform="mogrocery"
        hideOnPages={true}
      />
    </div>
  );
}
