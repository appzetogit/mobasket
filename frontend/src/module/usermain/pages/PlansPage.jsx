import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  MapPin,
  Zap,
  Check,
  Star,
  Crown,
  ChevronDown,
  Home,
  Search,
  ShoppingBag,
  LayoutGrid,
  X,
  Package,
  Truck,
  Calendar,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { orderAPI, restaurantAPI } from "@/lib/api";
import { initRazorpayPayment } from "@/lib/utils/razorpay";
import { getCachedSettings, loadBusinessSettings } from "@/lib/utils/businessSettings";
import { evaluateStoreAvailability } from "@/lib/utils/storeAvailability";
import MOBASKETLogo from "@/assets/mobasketlogo.png";
import { useProfile } from "../../user/context/ProfileContext";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";
import { toast } from "sonner";

const PlansPage = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedMealType, setSelectedMealType] = useState("veg");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [planOffers, setPlanOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [selectedOfferIds, setSelectedOfferIds] = useState([]);
  const [subcategoryProductBuckets, setSubcategoryProductBuckets] = useState([]);
  const [selectedProductBySubcategory, setSelectedProductBySubcategory] = useState({});
  const [expandedSubcategoryIds, setExpandedSubcategoryIds] = useState({});
  const [boughtPlans, setBoughtPlans] = useState([]);
  const [boughtPlansLoading, setBoughtPlansLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState(MOBASKETLogo);
  const { getDefaultAddress, userProfile, addresses } = useProfile();
  const { location: liveLocation } = useUserLocation();
  const { zoneId } = useZone(liveLocation, "mogrocery");

  useEffect(() => {
    const loadLogo = async () => {
      try {
        const cached = getCachedSettings();
        if (cached?.logo?.url) {
          setLogoUrl(cached.logo.url);
          return;
        }

        const settings = await loadBusinessSettings();
        if (settings?.logo?.url) {
          setLogoUrl(settings.logo.url);
        }
      } catch {
        // Keep fallback logo
      }
    };

    loadLogo();

    const onBusinessSettingsUpdate = () => {
      const cached = getCachedSettings();
      if (cached?.logo?.url) {
        setLogoUrl(cached.logo.url);
      }
    };

    window.addEventListener("businessSettingsUpdated", onBusinessSettingsUpdate);
    return () => window.removeEventListener("businessSettingsUpdated", onBusinessSettingsUpdate);
  }, []);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api.get("/grocery/plans");
        const payload = Array.isArray(response?.data?.data) ? response.data.data : [];
        const normalized = payload.map((plan) => ({
          ...plan,
          id: plan._id,
          items: plan.itemsLabel || `${plan.productCount || 0} items`,
          duration: `/${plan.durationDays || 0} days`,
          durationText: `for ${plan.durationDays || 0} days`,
          priceDisplay: `Rs ${Number(plan.price || 0).toLocaleString("en-IN")}`,
          iconKey: plan.iconKey || "zap",
          color: plan.color || "bg-emerald-500",
          headerColor: plan.headerColor || plan.color || "bg-emerald-500",
          benefits: Array.isArray(plan.benefits) ? plan.benefits : [],
          products: Array.isArray(plan.products) ? plan.products : [],
          vegProducts: Array.isArray(plan.vegProducts) ? plan.vegProducts : [],
          nonVegProducts: Array.isArray(plan.nonVegProducts) ? plan.nonVegProducts : [],
        }));
        setPlans(normalized);
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load plans");
        setPlans([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const fetchBoughtPlans = useCallback(async () => {
    try {
      setBoughtPlansLoading(true);
      const response = await orderAPI.getOrders({ page: 1, limit: 200 });
      const orders =
        response?.data?.data?.orders ||
        response?.data?.orders ||
        (Array.isArray(response?.data?.data) ? response.data.data : []);

      const now = new Date();
      const normalized = (Array.isArray(orders) ? orders : [])
        .filter((order) => order?.planSubscription?.planId)
        .filter((order) => {
          const paymentStatus = String(order?.payment?.status || "").toLowerCase();
          const hasPaymentId = Boolean(order?.payment?.razorpayPaymentId);
          const paymentCompleted = paymentStatus === "completed" || hasPaymentId;
          return paymentCompleted && paymentStatus !== "failed" && paymentStatus !== "refunded";
        })
        .filter((order) => String(order?.status || "").toLowerCase() !== "cancelled")
        .map((order) => {
          const purchasedAt = order?.createdAt || order?.deliveredAt || null;
          const startDate = purchasedAt ? new Date(purchasedAt) : null;
          const durationDays = Number(order?.planSubscription?.durationDays || 0);
          const expiresAt =
            startDate && durationDays > 0
              ? new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000)
              : null;
          const isActive = expiresAt ? expiresAt > now : false;

          return {
            id: order?._id || order?.id || order?.orderId,
            orderId: order?.orderId || order?._id || order?.id,
            planId: String(order?.planSubscription?.planId || ""),
            planName: order?.planSubscription?.planName || "MoGrocery Plan",
            durationDays,
            selectedOfferCount: Array.isArray(order?.planSubscription?.selectedOfferIds)
              ? order.planSubscription.selectedOfferIds.length
              : 0,
            purchasedAt,
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
            isActive,
          };
        })
        .sort((a, b) => new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0));

      setBoughtPlans(normalized);
    } catch {
      setBoughtPlans([]);
    } finally {
      setBoughtPlansLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoughtPlans();
  }, [fetchBoughtPlans]);

  useEffect(() => {
    // Guard against stale scroll locks left by other screens/modals.
    const lockedTop = document.body.style.top;
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.width = "";
    document.body.style.top = "";

    if (lockedTop) {
      window.scrollTo(0, parseInt(lockedTop || "0", 10) * -1);
    }
  }, []);

  const renderPlanIcon = (iconKey) => {
    if (iconKey === "check") {
      return <Check size={24} className="text-white" strokeWidth={4} />;
    }
    if (iconKey === "star") {
      return <Star size={24} className="text-white fill-white" />;
    }
    if (iconKey === "crown") {
      return <Crown size={24} className="text-white fill-white" />;
    }
    return <Zap size={24} className="text-white fill-white" />;
  };

  const openPlan = (plan) => {
    setSelectedPlan(plan);
    setSelectedMealType("veg");
    setSelectedOfferIds([]);
    setSubcategoryProductBuckets([]);
    setSelectedProductBySubcategory({});
    setExpandedSubcategoryIds({});
  };

  const selectedPlanOfferIdsKey = useMemo(() => {
    const ids = Array.isArray(selectedPlan?.offerIds)
      ? selectedPlan.offerIds
        .map((offer) => offer?._id || offer?.id || offer)
        .filter(Boolean)
      : [];
    return ids.join(",");
  }, [selectedPlan?.offerIds]);
  const selectedPlanLinkedOffers = useMemo(
    () => (Array.isArray(selectedPlan?.offerIds) ? selectedPlan.offerIds.filter(Boolean) : []),
    [selectedPlan?.offerIds]
  );

  useEffect(() => {
    const fetchPlanOffers = async () => {
      if (!selectedPlan?.id) {
        setPlanOffers([]);
        return;
      }
      try {
        setOffersLoading(true);
        const response = await api.get("/grocery/plan-offers", {
          params: { planId: selectedPlan.id, activeOnly: "true" },
        });
        const payload = Array.isArray(response?.data?.data) ? response.data.data : [];
        const linkedFromPlan = selectedPlanLinkedOffers;
        const merged = [...payload];
        linkedFromPlan.forEach((offer) => {
          const offerId = offer?._id || offer?.id;
          if (!offerId) return;
          const alreadyExists = merged.some((item) => (item?._id || item?.id) === offerId);
          if (!alreadyExists) merged.push(offer);
        });
        setPlanOffers(merged);
        setSelectedOfferIds(
          merged
            .map((offer) => offer?._id || offer?.id)
            .filter(Boolean)
            .map((id) => String(id))
        );
      } catch {
        const fallback = selectedPlanLinkedOffers;
        setPlanOffers(fallback);
        setSelectedOfferIds(
          fallback
            .map((offer) => offer?._id || offer?.id)
            .filter(Boolean)
            .map((id) => String(id))
        );
      } finally {
        setOffersLoading(false);
      }
    };

    fetchPlanOffers();
  }, [selectedPlan?.id, selectedPlanLinkedOffers, selectedPlanOfferIdsKey]);

  const planLinkedSubcategories = useMemo(() => {
    const subcategoryMap = new Map();
    (Array.isArray(planOffers) ? planOffers : []).forEach((offer) => {
      const subcategories = Array.isArray(offer?.subcategoryIds) ? offer.subcategoryIds : [];
      subcategories.forEach((subcategory) => {
        const subcategoryId = String(subcategory?._id || subcategory?.id || "");
        if (!subcategoryId) return;
        if (!subcategoryMap.has(subcategoryId)) {
          subcategoryMap.set(subcategoryId, {
            id: subcategoryId,
            name: subcategory?.name || "Subcategory",
          });
        }
      });
    });
    return Array.from(subcategoryMap.values());
  }, [planOffers]);

  useEffect(() => {
    if (!selectedPlan?.id || planLinkedSubcategories.length === 0) {
      setSubcategoryProductBuckets([]);
      setSelectedProductBySubcategory({});
      setExpandedSubcategoryIds({});
      return;
    }

    const initialBuckets = planLinkedSubcategories.map((subcategory) => ({
      subcategory,
      products: null,
      loading: false,
      error: "",
    }));

    setSubcategoryProductBuckets(initialBuckets);
    setExpandedSubcategoryIds({});
    setSelectedProductBySubcategory((prev) => {
      const next = {};
      initialBuckets.forEach((bucket) => {
        const subcategoryId = bucket.subcategory.id;
        if (prev[subcategoryId]) {
          next[subcategoryId] = prev[subcategoryId];
        }
      });
      return next;
    });
  }, [selectedPlan?.id, planLinkedSubcategories, zoneId]);

  const loadProductsForSubcategory = async (subcategoryId) => {
    if (!subcategoryId) return;
    const subcategoryKey = String(subcategoryId);

    setSubcategoryProductBuckets((prev) =>
      prev.map((bucket) =>
        bucket.subcategory.id === subcategoryKey
          ? { ...bucket, loading: true, error: "" }
          : bucket
      )
    );

    try {
      const response = await api.get("/grocery/products", {
        params: {
          subcategoryId: subcategoryKey,
          activeOnly: "true",
          limit: 100,
          ...(zoneId ? { zoneId } : {}),
        },
      });
      const payload = Array.isArray(response?.data?.data) ? response.data.data : [];
      const normalizedProducts = payload
        .map((product) => ({
          id: String(product?._id || product?.id || ""),
          name: product?.name || "Product",
          image:
            (Array.isArray(product?.images) ? product.images[0] : "") ||
            product?.image ||
            "",
          unit: String(product?.unit || "").trim() || "Unit",
          price: Number(product?.price || 0),
        }))
        .filter((product) => Boolean(product.id));

      setSubcategoryProductBuckets((prev) =>
        prev.map((bucket) =>
          bucket.subcategory.id === subcategoryKey
            ? { ...bucket, products: normalizedProducts, loading: false, error: "" }
            : bucket
        )
      );
      setSelectedProductBySubcategory((prev) => {
        const selectedProductId = prev[subcategoryKey];
        if (!selectedProductId) return prev;
        const stillExists = normalizedProducts.some((product) => product.id === selectedProductId);
        if (stillExists) return prev;
        const next = { ...prev };
        delete next[subcategoryKey];
        return next;
      });
    } catch (fetchError) {
      setSubcategoryProductBuckets((prev) =>
        prev.map((bucket) =>
          bucket.subcategory.id === subcategoryKey
            ? {
              ...bucket,
              products: [],
              loading: false,
              error:
                fetchError?.response?.data?.message ||
                "Failed to load products for this subcategory",
            }
            : bucket
        )
      );
      setSelectedProductBySubcategory((prev) => {
        const next = { ...prev };
        delete next[subcategoryKey];
        return next;
      });
    }
  };

  const selectedPlanHasTypedProducts = useMemo(() => {
    if (!selectedPlan) return false;
    const vegProducts = Array.isArray(selectedPlan.vegProducts) ? selectedPlan.vegProducts : [];
    const nonVegProducts = Array.isArray(selectedPlan.nonVegProducts) ? selectedPlan.nonVegProducts : [];
    return vegProducts.length > 0 || nonVegProducts.length > 0;
  }, [selectedPlan]);

  const selectedPlanProducts = useMemo(() => {
    if (!selectedPlan) return [];

    const vegProducts = Array.isArray(selectedPlan.vegProducts) ? selectedPlan.vegProducts : [];
    const nonVegProducts = Array.isArray(selectedPlan.nonVegProducts) ? selectedPlan.nonVegProducts : [];
    const legacyProducts = Array.isArray(selectedPlan.products) ? selectedPlan.products : [];

    if (!selectedPlanHasTypedProducts) {
      return legacyProducts;
    }

    return selectedMealType === "nonVeg" ? nonVegProducts : vegProducts;
  }, [selectedPlan, selectedPlanHasTypedProducts, selectedMealType]);

  const selectedOfferProducts = useMemo(() => {
    const activeOfferIds = new Set((selectedOfferIds || []).map((id) => String(id)));
    const productMap = new Map();

    (Array.isArray(planOffers) ? planOffers : []).forEach((offer) => {
      const offerId = offer?._id || offer?.id;
      if (!offerId || !activeOfferIds.has(String(offerId))) return;

      const products = Array.isArray(offer?.productIds) ? offer.productIds : [];
      products.forEach((product, index) => {
        const productId = String(product?._id || product?.id || `${offerId}-${index}`);
        const image =
          (Array.isArray(product?.images) ? product.images[0] : "") ||
          product?.image ||
          "";
        const qty = String(product?.unit || "").trim();
        productMap.set(productId, {
          id: productId,
          name: product?.name || "Product",
          qty: qty || "From selected offer",
          image,
        });
      });
    });

    return Array.from(productMap.values());
  }, [planOffers, selectedOfferIds]);

  const displayedProducts = useMemo(() => {
    // For plans with explicit veg/non-veg product sets, keep the toggle authoritative.
    if (selectedPlanHasTypedProducts) {
      return selectedPlanProducts;
    }
    return selectedOfferProducts.length > 0 ? selectedOfferProducts : selectedPlanProducts;
  }, [selectedPlanHasTypedProducts, selectedOfferProducts, selectedPlanProducts]);

  const selectedManualProductIds = useMemo(
    () => Object.values(selectedProductBySubcategory).filter(Boolean),
    [selectedProductBySubcategory]
  );

  const getNamedItems = (items) => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item) return null;
        if (typeof item === "string") return item;
        if (typeof item === "object") return item.name || item.title || null;
        return null;
      })
      .filter(Boolean);
  };

  const selectedAddress = (() => {
    const defaultAddress = getDefaultAddress?.();
    if (defaultAddress) return defaultAddress;

    if (Array.isArray(addresses) && addresses.length > 0) {
      return addresses[0];
    }
    return null;
  })();

  const resolveGroceryRestaurant = async () => {
    const restaurantsResponse = await restaurantAPI.getRestaurants({
      limit: 200,
      ...(zoneId ? { zoneId } : {}),
    });
    const restaurants = restaurantsResponse?.data?.data?.restaurants || [];
    const groceryStores = restaurants.filter((r) => r?.platform === "mogrocery" && r?.isActive);

    if (!groceryStores.length) {
      throw new Error("No active grocery store found.");
    }

    const prioritizedStores = [
      ...groceryStores.filter((r) => /grocery|mart|basket/i.test(r?.name || "")),
      ...groceryStores.filter((r) => !/grocery|mart|basket/i.test(r?.name || "")),
    ];
    let groceryLikeStore = null;

    for (const candidate of prioritizedStores) {
      const candidateId = candidate?._id || candidate?.restaurantId;
      if (!candidateId) continue;
      try {
        const outletTimingsResponse = await api.get(`/restaurant/${String(candidateId)}/outlet-timings`);
        const outletTimings =
          outletTimingsResponse?.data?.data?.outletTimings?.timings ||
          outletTimingsResponse?.data?.outletTimings?.timings ||
          [];
        const availability = evaluateStoreAvailability({
          store: candidate,
          outletTimings,
          label: "Store",
        });
        if (availability.isAvailable) {
          groceryLikeStore = candidate;
          break;
        }
      } catch {
        // Try next store candidate.
      }
    }

    if (!groceryLikeStore) {
      throw new Error("All stores are currently offline. Please try again later.");
    }

    const restaurantId = groceryLikeStore?._id || groceryLikeStore?.restaurantId;
    if (!restaurantId) {
      throw new Error("Unable to resolve grocery store for plan purchase.");
    }

    return {
      restaurantId,
      restaurantName: groceryLikeStore?.name || "MoGrocery",
    };
  };

  const handleSubscribePlan = async () => {
    if (!selectedPlan || isSubscribing) return;
    const sanitizedPhone = String(userProfile?.phone || "").replace(/\D/g, "");
    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      toast.error("Please add your phone number in profile before ordering.");
      navigate("/profile/edit");
      return;
    }
    if (!Array.isArray(addresses) || addresses.length === 0) {
      toast.error("Please add a saved address before ordering.");
      navigate("/profile/addresses");
      return;
    }
    if (!selectedAddress) {
      toast.error("Please add/select a delivery address first.");
      navigate("/profile/addresses");
      return;
    }
    setIsSubscribing(true);
    try {
      const { restaurantId, restaurantName } = await resolveGroceryRestaurant();

      const items = [
        {
          itemId: `plan-${selectedPlan.id}`,
          name: selectedPlan.name,
          price: Number(selectedPlan.price || 0),
          quantity: 1,
          image: "",
          description: selectedPlan.description || "MoGold plan subscription",
          isVeg: selectedMealType !== "nonVeg",
        },
      ];

      const pricingResponse = await orderAPI.calculateOrder({
        items,
        restaurantId,
        deliveryAddress: selectedAddress,
        deliveryFleet: "standard",
      });
      const calculatedPricing = pricingResponse?.data?.data?.pricing;
      if (!calculatedPricing?.total) {
        throw new Error("Failed to calculate plan price.");
      }

      const selectedSubcategoryIds = Object.keys(selectedProductBySubcategory).filter(Boolean);
      const orderPayload = {
        items,
        address: selectedAddress,
        restaurantId,
        restaurantName,
        pricing: calculatedPricing,
        deliveryFleet: "standard",
        note: `[MoGold Plan] ${selectedPlan.name} (${selectedPlan.durationText || ""})`,
        sendCutlery: false,
        paymentMethod: "razorpay",
        zoneId: zoneId || undefined,
        planSubscription: {
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          durationDays: Number(selectedPlan.durationDays || 0),
          selectedOfferIds,
          selectedSubcategoryId:
            selectedSubcategoryIds.length > 0 ? selectedSubcategoryIds[0] : undefined,
          selectedSubcategoryIds,
          selectedProductIds: selectedManualProductIds,
        },
      };

      const orderResponse = await orderAPI.createOrder(orderPayload);
      const { order, razorpay } = orderResponse?.data?.data || {};
      const orderIdentifier = order?.orderId || order?.id;

      if (!razorpay?.orderId || !razorpay?.key) {
        throw new Error("Payment initialization failed.");
      }

      await new Promise((resolve, reject) => {
        initRazorpayPayment({
          key: razorpay.key,
          amount: razorpay.amount,
          currency: razorpay.currency,
          order_id: razorpay.orderId,
          name: "MoGold Plans",
          description: `Payment for ${selectedPlan.name}`,
          prefill: {
            name: userProfile?.name || "",
            email: userProfile?.email || "",
            contact: (userProfile?.phone || "").replace(/\D/g, "").slice(-10),
          },
          notes: {
            orderId: order?.orderId || order?.id || "",
            planId: selectedPlan?.id || "",
            planName: selectedPlan?.name || "",
          },
          handler: async (response) => {
            try {
              await orderAPI.verifyPayment({
                orderId: order?.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              await fetchBoughtPlans();
              toast.success("Plan purchased successfully.");
              setSelectedPlan(null);
              navigate(`/orders/${orderIdentifier}?confirmed=true`);
              resolve();
            } catch (verifyError) {
              reject(new Error(verifyError?.response?.data?.message || "Payment verification failed."));
            }
          },
          onError: (paymentError) =>
            reject(new Error(paymentError?.description || paymentError?.message || "Payment failed.")),
          onClose: () => reject(new Error("Payment cancelled.")),
        }).catch(reject);
      });
    } catch (purchaseError) {
      toast.error(purchaseError?.response?.data?.message || purchaseError?.message || "Failed to start payment.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const toggleOfferSelection = (offerId) => {
    if (!offerId) return;
    const normalizedOfferId = String(offerId);
    setSelectedOfferIds((prev) =>
      prev.includes(normalizedOfferId)
        ? prev.filter((id) => id !== normalizedOfferId)
        : [...prev, normalizedOfferId]
    );
  };

  const selectProductForSubcategory = (subcategoryId, productId) => {
    if (!subcategoryId || !productId) return;
    const subcategoryKey = String(subcategoryId);
    const productKey = String(productId);
    setSelectedProductBySubcategory((prev) => {
      if (prev[subcategoryKey] === productKey) {
        const next = { ...prev };
        delete next[subcategoryKey];
        return next;
      }
      return {
        ...prev,
        [subcategoryKey]: productKey,
      };
    });
  };

  const toggleSubcategoryExpanded = (subcategoryId) => {
    if (!subcategoryId) return;
    const subcategoryKey = String(subcategoryId);
    const isExpanded = Boolean(expandedSubcategoryIds[subcategoryKey]);
    const bucket = subcategoryProductBuckets.find((item) => item?.subcategory?.id === subcategoryKey);

    setExpandedSubcategoryIds((prev) => ({
      ...prev,
      [subcategoryKey]: !prev[subcategoryKey],
    }));

    if (!isExpanded && bucket && bucket.products === null && !bucket.loading) {
      loadProductsForSubcategory(subcategoryKey);
    }
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return "N/A";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const activeBoughtPlan = useMemo(
    () => boughtPlans.find((plan) => plan.isActive) || null,
    [boughtPlans]
  );

  const displayPlans = useMemo(() => {
    if (!activeBoughtPlan) return plans;
    const currentPlan = plans.find((plan) => String(plan.id) === String(activeBoughtPlan.planId));
    return currentPlan ? [currentPlan] : [];
  }, [plans, activeBoughtPlan]);

  return (
    <div className="bg-gray-50 min-h-screen font-sans w-full relative pb-20 overflow-x-hidden">
      <div className="bg-[#FACC15] pb-10 rounded-b-[2.5rem] shadow-sm">
        <div className="p-4 pt-6 flex justify-between items-start md:max-w-7xl md:mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/80 border border-yellow-200 shadow-sm flex items-center justify-center overflow-hidden">
              <img
                src={logoUrl}
                alt="Company logo"
                className="w-10 h-10 object-contain"
                loading="lazy"
                onError={(e) => {
                  if (e.currentTarget.src !== MOBASKETLogo) {
                    e.currentTarget.src = MOBASKETLogo;
                  }
                }}
              />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-none tracking-tight">
                MoGold
              </h1>
              <p className="text-xs font-bold text-slate-800 mt-0.5 opacity-80">
                Membership plans
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-8 md:max-w-7xl md:mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-black text-slate-900">Bought Plans</h2>
            {boughtPlans.length > 0 && (
              <span className="text-xs font-semibold text-slate-500">
                {boughtPlans.length} plan{boughtPlans.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {boughtPlansLoading ? (
            <p className="text-sm text-slate-500">Loading bought plans...</p>
          ) : boughtPlans.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-sm text-slate-500">You have not bought any plan yet.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {boughtPlans.map((plan) => (
                <div key={plan.id} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-slate-900">{plan.planName}</p>
                      <p className="text-xs text-slate-500 mt-1">Order #{plan.orderId}</p>
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2 py-1 rounded-full ${plan.isActive
                        ? "bg-green-100 text-green-700 border border-green-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                    >
                      {plan.isActive ? "Active" : "Expired"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <p>Bought: {formatDate(plan.purchasedAt)}</p>
                    <p>Valid till: {formatDate(plan.expiresAt)}</p>
                    <p>Duration: {plan.durationDays || 0} days</p>
                    <p>Offers: {plan.selectedOfferCount}</p>
                  </div>
                  <button
                    type="button"
                    className="mt-3 text-xs font-semibold text-emerald-700 hover:underline"
                    onClick={() => navigate(`/orders/${plan.orderId}`)}
                  >
                    View purchase details
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-slate-900">
              {activeBoughtPlan ? "Current Plan" : "Monthly Plans"}
            </h2>
            {!activeBoughtPlan ? (
              <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-yellow-200">
                <Zap size={10} className="fill-yellow-800" /> SAVE 40%
              </span>
            ) : null}
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading plans...</p>}
        {!loading && error && <p className="text-sm text-red-500">{error}</p>}
        {!loading && !error && displayPlans.length === 0 && (
          <p className="text-sm text-slate-500">
            {activeBoughtPlan ? "Your active plan details are not available right now." : "No plans available right now."}
          </p>
        )}

        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
          {displayPlans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl p-4 shadow-sm border cursor-pointer active:scale-95 transition-transform duration-200 ${plan.popular ? "border-yellow-400 ring-1 ring-yellow-400 relative" : "border-gray-100"} hover:shadow-md h-full flex flex-col justify-between`}
              onClick={() => openPlan(plan)}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-4 bg-yellow-400 text-yellow-950 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-sm uppercase tracking-wide">
                  Popular
                </div>
              )}

              <div className="flex items-center justify-between h-full">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl ${plan.color} flex items-center justify-center shadow-md shrink-0`}>
                    {renderPlanIcon(plan.iconKey)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-lg">{plan.name}</h3>
                      <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-1.5 py-0.5 rounded text-nowrap">
                        {plan.items}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-medium">
                      {plan.benefits?.[0] || plan.description || "Plan benefits available"}
                    </p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <div>
                    <p className="font-black text-xl text-slate-900">{plan.priceDisplay}</p>
                    <p className="text-[10px] text-gray-400 font-medium text-right">{plan.duration}</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-50 w-full pb-4">
        <div className="md:max-w-7xl md:mx-auto w-full flex justify-between items-end py-2 px-6">
          <div className="flex flex-col items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-600" onClick={() => navigate("/grocery")}>
            <Home size={24} />
            <span className="text-[10px] font-medium">Home</span>
          </div>

          <div className="flex flex-col items-center gap-1 cursor-pointer">
            <ShoppingBag size={24} className="text-slate-900 fill-current" />
            <span className="text-[10px] font-bold text-slate-900">Plan</span>
            <div className="w-8 h-1 bg-slate-900 rounded-full mt-0.5"></div>
          </div>

          <div className="flex flex-col items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-600" onClick={() => navigate("/categories")}>
            <LayoutGrid size={24} />
            <span className="text-[10px] font-medium">Categories</span>
          </div>

          <button
            className="mb-1 bg-[#EF4F5F] hover:bg-red-700 text-white px-6 py-2 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
            onClick={() => navigate("/home")}
          >
            <span className="font-black italic text-lg tracking-tighter">Mofood</span>
          </button>
        </div>
      </div>

      {selectedPlan && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-[2px]" onClick={() => setSelectedPlan(null)}></div>
          <div className="fixed bottom-0 left-0 right-0 z-[70] md:inset-0 md:flex md:items-center md:justify-center pointer-events-none">
            <div data-lenis-prevent className="bg-white w-full rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden animate-slide-in-up max-h-[85vh] overflow-y-auto pointer-events-auto md:max-w-4xl md:h-auto md:max-h-[90vh] relative md:flex md:flex-row md:overflow-hidden">
              <div className={`${selectedPlan.headerColor} p-6 pb-12 text-white relative md:w-2/5 md:pb-6 md:flex md:flex-col md:justify-center`}>
                <button
                  onClick={() => setSelectedPlan(null)}
                  className="absolute top-4 right-4 bg-white/20 p-1.5 rounded-full hover:bg-white/30 transition shadow-sm cursor-pointer md:hidden"
                >
                  <X size={20} className="text-white" />
                </button>

                <div className="flex flex-col items-center text-center mt-2">
                  <div className="bg-white/20 w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-inner backdrop-blur-sm border border-white/10">
                    {renderPlanIcon(selectedPlan.iconKey)}
                  </div>
                  <h2 className="text-3xl font-black mb-1 tracking-tight">{selectedPlan.name}</h2>
                  <p className="text-white/90 font-medium text-sm max-w-[200px] leading-snug">{selectedPlan.description}</p>
                </div>

                <div className="mt-8 flex items-baseline justify-center gap-2">
                  <span className="text-4xl font-black">{selectedPlan.priceDisplay}</span>
                  <span className="text-white/80 font-medium text-lg">{selectedPlan.durationText}</span>
                </div>

                <div className="flex justify-center gap-6 mt-6">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Package size={16} /> {selectedPlan.productCount} products
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Truck size={16} /> {selectedPlan.deliveries} deliveries
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Calendar size={16} /> {selectedPlan.frequency}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedPlan(null)}
                className="hidden md:block absolute top-4 right-4 bg-gray-100 p-1.5 rounded-full hover:bg-gray-200 transition shadow-sm cursor-pointer z-10"
              >
                <X size={20} className="text-slate-900" />
              </button>
              <div data-lenis-prevent className="bg-white -mt-6 rounded-t-[2rem] px-6 pt-8 pb-8 relative md:w-3/5 md:mt-0 md:rounded-none md:p-8 md:overflow-y-auto no-scrollbar">
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Star size={18} className="text-yellow-400 fill-yellow-400" />
                    <h3 className="font-bold text-slate-900 text-lg">Benefits</h3>
                  </div>
                  <div className="space-y-3">
                    {selectedPlan.benefits.map((benefit, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="bg-green-100 p-1 rounded-full">
                          <Check size={12} className="text-green-600 stroke-[4]" />
                        </div>
                        <span className="text-slate-700 font-medium">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <ShoppingBag size={18} className="text-yellow-500" />
                    <h3 className="font-bold text-slate-900 text-lg">Products Included</h3>
                  </div>
                  <div className="mb-4 inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                    <button
                      type="button"
                      className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition ${selectedMealType === "veg" ? "bg-green-600 text-white" : "text-slate-600"
                        }`}
                      onClick={() => setSelectedMealType("veg")}
                    >
                      Veg
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition ${selectedMealType === "nonVeg" ? "bg-rose-600 text-white" : "text-slate-600"
                        }`}
                      onClick={() => setSelectedMealType("nonVeg")}
                    >
                      Non-veg
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {displayedProducts.length > 0 ? (
                      displayedProducts.map((prod, idx) => (
                        <div key={idx} className="bg-slate-50 p-3 rounded-xl flex items-center gap-3 border border-slate-100">
                          <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                            {prod?.image ? (
                              <img
                                src={prod.image}
                                alt={prod?.name || "Product"}
                                className="w-6 h-6 object-cover rounded"
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  const fallback = e.currentTarget.nextElementSibling;
                                  if (fallback) fallback.style.display = "block";
                                }}
                              />
                            ) : null}
                            <Package
                              size={16}
                              className="text-slate-400"
                              style={{ display: prod?.image ? "none" : "block" }}
                            />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm leading-tight">{prod.name}</p>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">{prod.qty}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500 col-span-2">No products configured for this meal type.</p>
                    )}
                  </div>
                </div>

                <div className="mt-8 border-t border-slate-100 pt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <LayoutGrid size={18} className="text-emerald-600" />
                    <h3 className="font-bold text-slate-900 text-lg">Build Your Plan Box</h3>
                  </div>
                  {planLinkedSubcategories.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No subcategory-linked products configured in plan offers.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 mb-4">
                        Optional: pick products by subcategory. You can skip and continue.
                      </p>
                      <div className="space-y-4">
                        {subcategoryProductBuckets.map((bucket) => {
                          const subcategoryId = bucket.subcategory.id;
                          const selectedProductId = selectedProductBySubcategory[subcategoryId] || "";
                          const isExpanded = Boolean(expandedSubcategoryIds[subcategoryId]);
                          return (
                            <div key={subcategoryId} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
                              <button
                                type="button"
                                onClick={() => toggleSubcategoryExpanded(subcategoryId)}
                                className="w-full flex items-center justify-between gap-3"
                              >
                                <h4 className="font-bold text-slate-900 text-sm text-left">{bucket.subcategory.name}</h4>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${selectedProductId
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-700"
                                      }`}
                                  >
                                    {selectedProductId ? "1 selected" : "Select 1"}
                                  </span>
                                  <ChevronDown
                                    size={16}
                                    className={`text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  />
                                </div>
                              </button>

                              {isExpanded ? (
                                <div className="mt-3">
                                  {bucket.loading ? (
                                    <p className="text-sm text-slate-500">Loading products...</p>
                                  ) : bucket.error ? (
                                    <p className="text-sm text-rose-600">{bucket.error}</p>
                                  ) : !Array.isArray(bucket.products) || bucket.products.length === 0 ? (
                                    <p className="text-sm text-slate-500">No active products in this subcategory.</p>
                                  ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {bucket.products.map((product) => {
                                        const isSelected = selectedProductId === product.id;
                                        return (
                                          <button
                                            key={product.id}
                                            type="button"
                                            onClick={() => selectProductForSubcategory(subcategoryId, product.id)}
                                            className={`text-left rounded-xl border p-2.5 transition ${isSelected
                                              ? "border-emerald-400 bg-emerald-50 shadow-sm"
                                              : "border-slate-200 bg-white hover:border-emerald-200"
                                              }`}
                                          >
                                            <div className="flex items-center gap-2.5">
                                              <div className="w-10 h-10 rounded-md bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                                                {product.image ? (
                                                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                                                ) : (
                                                  <Package size={16} className="text-slate-400" />
                                                )}
                                              </div>
                                              <div className="min-w-0">
                                                <p className="text-sm font-semibold text-slate-900 truncate">{product.name}</p>
                                                <p className="text-[11px] text-slate-500">
                                                  {product.unit}
                                                  {product.price > 0 ? ` · Rs ${product.price}` : ""}
                                                </p>
                                              </div>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 mt-2">Tap to view products</p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <p className="text-xs text-slate-500 mt-3">
                        Completed: {selectedManualProductIds.length}/{planLinkedSubcategories.length} subcategories
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100">
                  <button
                    onClick={handleSubscribePlan}
                    disabled={isSubscribing}
                    className="w-full bg-[#fec007] hover:bg-[#eeb100] disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-black font-black text-lg py-4 rounded-2xl shadow-lg shadow-yellow-200"
                  >
                    {isSubscribing ? "Opening Razorpay..." : `Subscribe for ${selectedPlan.priceDisplay}`}
                  </button>
                  <p className="text-center text-xs text-slate-400 font-medium mt-2">Cancel anytime - No hidden charges</p>
                </div>

                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap size={18} className="text-amber-500" />
                    <h3 className="font-bold text-slate-900 text-lg">Plan Offers</h3>
                  </div>
                  {planOffers.length > 0 && (
                    <p className="text-xs text-slate-500 mb-3">Select offers to activate with this plan.</p>
                  )}
                  {offersLoading ? (
                    <p className="text-sm text-slate-500">Loading offers...</p>
                  ) : planOffers.length === 0 ? (
                    <p className="text-sm text-slate-500">No additional offers for this plan.</p>
                  ) : (
                    <div className="space-y-3">
                      {planOffers.map((offer, idx) => {
                        const offerId = offer?._id || offer?.id;
                        const normalizedOfferId = offerId ? String(offerId) : "";
                        const isSelected = !!normalizedOfferId && selectedOfferIds.includes(normalizedOfferId);
                        return (
                          <button
                            key={normalizedOfferId || `offer-${idx}`}
                            type="button"
                            onClick={() => toggleOfferSelection(normalizedOfferId)}
                            className={`w-full text-left rounded-xl border p-3 transition ${isSelected
                              ? "border-amber-300 bg-amber-50"
                              : "border-slate-200 bg-white hover:border-amber-200"
                              }`}
                          >
                            <p className="font-semibold text-slate-900">{offer.name}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{offer.description || "Exclusive offer for this plan"}</p>
                            <p className={`text-[11px] font-semibold mt-2 ${isSelected ? "text-amber-700" : "text-slate-500"}`}>
                              {isSelected ? "Selected" : "Tap to select"}
                            </p>

                            <div className="flex gap-2 mt-2 flex-wrap">
                              {offer.discountType !== "none" && Number(offer.discountValue || 0) > 0 && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-amber-200 text-amber-700">
                                  {offer.discountType === "percentage" ? `${offer.discountValue}% off` : `Rs ${offer.discountValue} off`}
                                </span>
                              )}
                              {offer.freeDelivery && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-amber-200 text-amber-700">
                                  Free delivery
                                </span>
                              )}
                              {offer.validFrom && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-amber-200 text-amber-700">
                                  Starts: {new Date(offer.validFrom).toLocaleDateString("en-IN")}
                                </span>
                              )}
                              {offer.validTill && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-amber-200 text-amber-700">
                                  Ends: {new Date(offer.validTill).toLocaleDateString("en-IN")}
                                </span>
                              )}
                            </div>

                            {(() => {
                              const linkedProducts = getNamedItems(offer.productIds);
                              const linkedCategories = getNamedItems(offer.categoryIds);
                              const linkedSubcategories = getNamedItems(offer.subcategoryIds);
                              const linkedPlans = getNamedItems(offer.planIds);
                              const hasDetails =
                                linkedProducts.length > 0 ||
                                linkedCategories.length > 0 ||
                                linkedSubcategories.length > 0 ||
                                linkedPlans.length > 0;
                              if (!hasDetails) return null;

                              return (
                                <div className="mt-3 space-y-2">
                                  {linkedProducts.length > 0 && (
                                    <div>
                                      <p className="text-[11px] font-semibold text-slate-700 mb-1">Products</p>
                                      <div className="flex flex-wrap gap-1">
                                        {linkedProducts.map((name, idx) => (
                                          <span key={`p-${idx}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-amber-200 text-slate-700">
                                            {name}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {linkedCategories.length > 0 && (
                                    <div>
                                      <p className="text-[11px] font-semibold text-slate-700 mb-1">Categories</p>
                                      <div className="flex flex-wrap gap-1">
                                        {linkedCategories.map((name, idx) => (
                                          <span key={`c-${idx}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-amber-200 text-slate-700">
                                            {name}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {linkedSubcategories.length > 0 && (
                                    <div>
                                      <p className="text-[11px] font-semibold text-slate-700 mb-1">Subcategories</p>
                                      <div className="flex flex-wrap gap-1">
                                        {linkedSubcategories.map((name, idx) => (
                                          <span key={`s-${idx}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-amber-200 text-slate-700">
                                            {name}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {linkedPlans.length > 0 && (
                                    <div>
                                      <p className="text-[11px] font-semibold text-slate-700 mb-1">Applicable Plans</p>
                                      <div className="flex flex-wrap gap-1">
                                        {linkedPlans.map((name, idx) => (
                                          <span key={`l-${idx}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-amber-200 text-slate-700">
                                            {name}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
                @keyframes slide-in-up {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-slide-in-up {
                    animation: slide-in-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
    </div>
  );
};

export default PlansPage;



