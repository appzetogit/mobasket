import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowLeft, Star, Bookmark, Loader2 } from "lucide-react";
import AnimatedPage from "../../components/AnimatedPage";
import Footer from "../../components/Footer";
import ScrollReveal from "../../components/ScrollReveal";
import TextReveal from "../../components/TextReveal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProfile } from "../../context/ProfileContext";
import { restaurantAPI } from "@/lib/api";
import { useLocation } from "../../hooks/useLocation";
import { useZone } from "../../hooks/useZone";
import { evaluateStoreAvailability } from "@/lib/utils/storeAvailability";

export default function Restaurants() {
  const { addFavorite, removeFavorite, isFavorite } = useProfile();
  const { location } = useLocation();
  const { zoneId } = useZone(location, "mofood");
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        setLoading(true);
        setError("");

        const params = { platform: "mofood", limit: 100, onlyZone: "true" };
        if (zoneId) params.zoneId = zoneId;

        const response = await restaurantAPI.getRestaurants(params);
        const list = response?.data?.data?.restaurants || response?.data?.data || [];

        const transformed = (Array.isArray(list) ? list : [])
          .filter((restaurant) => String(restaurant?.name || "").trim())
          .map((restaurant) => {
            const coverImages = Array.isArray(restaurant?.coverImages)
              ? restaurant.coverImages.map((img) => img?.url || img).filter(Boolean)
              : [];
            const menuImages = Array.isArray(restaurant?.menuImages)
              ? restaurant.menuImages.map((img) => img?.url || img).filter(Boolean)
              : [];

            const image =
              coverImages[0] ||
              menuImages[0] ||
              restaurant?.profileImage?.url ||
              "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop";

            const slug =
              restaurant?.slug ||
              String(restaurant?.name || "")
                .toLowerCase()
                .replace(/\s+/g, "-");

            const rawPrice =
              restaurant?.priceForOne ??
              restaurant?.avgPriceForOne ??
              restaurant?.onePersonPrice ??
              restaurant?.featuredPrice ??
              null;
            const numericPrice = Number(rawPrice);
            const priceForOne =
              Number.isFinite(numericPrice) && numericPrice > 0
                ? `INR ${numericPrice} for one`
                : typeof rawPrice === "string" && rawPrice.trim()
                  ? rawPrice
                  : "";

            const rawDeliveryTime =
              restaurant?.estimatedDeliveryTime ??
              restaurant?.deliveryTime ??
              restaurant?.avgDeliveryTime ??
              "";
            const deliveryTime =
              typeof rawDeliveryTime === "string" && rawDeliveryTime.trim()
                ? rawDeliveryTime
                : Number.isFinite(Number(rawDeliveryTime)) && Number(rawDeliveryTime) > 0
                  ? `${Number(rawDeliveryTime)} min`
                  : "";

            const numericRating = Number(restaurant?.rating);
            const rating =
              Number.isFinite(numericRating) && numericRating > 0
                ? numericRating.toFixed(1)
                : "N/A";
            const availability = evaluateStoreAvailability({
              store: restaurant,
              label: "Restaurant",
            });

            return {
              id: restaurant?.restaurantId || restaurant?._id || slug,
              slug,
              name: restaurant?.name || "Restaurant",
              cuisine:
                Array.isArray(restaurant?.cuisines) && restaurant.cuisines.length > 0
                  ? restaurant.cuisines.join(", ")
                  : "Cuisine unavailable",
              rating,
              deliveryTime,
              priceForOne,
              image,
              offer: restaurant?.offer || "",
              isAvailable: availability.isAvailable,
            };
          });

        setRestaurants(transformed);
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load restaurants");
        setRestaurants([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurants();
  }, [zoneId]);

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 dark:from-[#0a0a0a] via-white dark:via-[#0a0a0a] to-orange-50/20 dark:to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 md:py-8 lg:py-10 space-y-4 sm:space-y-6 lg:space-y-8">
        <ScrollReveal>
          <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 mb-4 lg:mb-6">
            <Link to="/user">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-gray-900 dark:text-gray-100" />
              </Button>
            </Link>
            <TextReveal className="flex items-center gap-2 sm:gap-3 lg:gap-4">
              <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 dark:text-white">
                All Restaurants
              </h1>
            </TextReveal>
          </div>
        </ScrollReveal>

        {loading && (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-7 w-7 animate-spin text-orange-500" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && restaurants.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-sm text-gray-600 text-center">
            No restaurants available right now.
          </div>
        )}

        {!loading && restaurants.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 xl:gap-6 pt-2 sm:pt-3 lg:pt-4">
            {restaurants.map((restaurant, index) => {
              const restaurantSlug = restaurant.slug;
              const favorite = isFavorite(restaurantSlug);

              const handleToggleFavorite = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (favorite) {
                  removeFavorite(restaurantSlug);
                } else {
                  addFavorite({
                    slug: restaurantSlug,
                    name: restaurant.name,
                    cuisine: restaurant.cuisine,
                    rating: restaurant.rating,
                    deliveryTime: restaurant.deliveryTime,
                    priceRange: restaurant.priceForOne,
                    image: restaurant.image,
                  });
                }
              };

              return (
                <ScrollReveal key={restaurant.id} delay={index * 0.1}>
                  <Link to={`/user/restaurants/${restaurantSlug}`} className="h-full flex">
                    <Card className="overflow-hidden gap-0 cursor-pointer border border-gray-100 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] transition-all duration-300 py-0 rounded-[24px] flex flex-col h-full w-full relative shadow-sm hover:shadow-md">
                      <div className="relative aspect-[16/9] overflow-hidden rounded-t-[24px]">
                        <img
                          src={restaurant.image}
                          alt={restaurant.name}
                          className="w-full h-full object-cover transition-transform duration-500"
                        />

                        {restaurant.offer ? (
                          <div className="absolute bottom-3 left-0 bg-[#2563eb] text-white text-[10px] font-bold px-2 py-1 shadow-lg z-10 leading-none">
                            {restaurant.offer}
                          </div>
                        ) : null}

                        <motion.div
                          variants={{ rest: { scale: 1 }, hover: { scale: 1.1 } }}
                          transition={{ duration: 0.2 }}
                          className="absolute top-3 right-3 z-10"
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleToggleFavorite}
                            className={`h-8 w-8 rounded-full border flex items-center justify-center transition-all duration-300 ${
                              favorite
                                ? "border-rose-500/80 bg-rose-50 text-rose-500/80"
                                : "border-white bg-white/90 text-gray-600 hover:bg-white"
                            }`}
                          >
                            <Bookmark
                              className={`h-4 w-4 transition-all duration-300 ${
                                favorite ? "fill-rose-500/80" : ""
                              }`}
                            />
                          </Button>
                        </motion.div>
                      </div>

                      <CardContent className="p-3 sm:px-4 py-3 flex flex-col flex-grow">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0 pr-2">
                            <h3 className="text-[17px] font-bold text-neutral-900 dark:text-gray-100 line-clamp-1 leading-tight mb-0.5">
                              {restaurant.name}
                            </h3>
                            {!restaurant.isAvailable && (
                              <p className="text-[11px] font-semibold text-red-600">Offline</p>
                            )}
                            <p className="text-[12px] text-neutral-500 dark:text-gray-500 font-medium truncate">
                              {restaurant.cuisine}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <div className="bg-[#15803d] text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5 text-[11px] font-bold">
                              <span>{restaurant.rating}</span>
                              <Star className="h-2.5 w-2.5 fill-white text-white" strokeWidth={3} />
                            </div>
                            <p className="text-[11px] text-neutral-500 dark:text-gray-400 font-medium whitespace-nowrap">
                              {restaurant.priceForOne || "Price unavailable"}
                            </p>
                            <p className="text-[11px] text-neutral-500 dark:text-gray-400 font-medium">
                              {restaurant.deliveryTime || "Time unavailable"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </ScrollReveal>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </AnimatedPage>
  );
}
