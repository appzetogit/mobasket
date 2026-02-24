import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  X,
  Heart,
  Clock,
  Search,
  ChevronRight,
  ArrowLeft,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useCart } from "../../user/context/CartContext";
import WishlistButton from "@/components/WishlistButton";

// Assets
import imgCoriander from "@/assets/bestseller/coriandar-removebg-preview.png";
import imgChili from "@/assets/bestseller/mirchi-removebg-preview.png";
import imgPotato from "@/assets/bestseller/aalu-removebg-preview.png";
import imgOnion from "@/assets/bestseller/onion-removebg-preview.png";
import imgFreshFruits from "@/assets/grocery&kitchen/Fruits-removebg-preview.png";
import imgOilMasala from "@/assets/grocery&kitchen/oilMasala-removebg-preview.png";
import imgIceCream from "@/assets/Beauty&PersonalCare/icecream-removebg-preview.png";
import imgBeauty from "@/assets/Beauty&PersonalCare/Beauty_Cosmetics-removebg-preview.png";
import imgTomato from "@/assets/grocery&kitchen/tomato-removebg-preview.png";
import imgCauliflower from "@/assets/grocery&kitchen/cauliflower-removebg-preview.png";
import imgPumpkin from "@/assets/grocery&kitchen/pumpkin-removebg-preview.png";
import imgDragonFruit from "@/assets/grocery&kitchen/droganfruit.jpeg";
import imgApple from "@/assets/grocery&kitchen/apple-removebg-preview.png";
import imgStrawberry from "@/assets/grocery&kitchen/strawberry2.jpeg";
import imgBanana from "@/assets/grocery&kitchen/banana.jpeg";
import imgAtta from "@/assets/bestseller/aata-removebg-preview.png";
import imgOil from "@/assets/grocery&kitchen/fortuneoil.jpeg";
import imgMilk from "@/assets/grocery&kitchen/amulmilk.jpeg";
import imgChips from "@/assets/bestseller/BlueLays-removebg-preview.png";
import imgChocolate from "@/assets/bestseller/choclate-removebg-preview.png";
import imgCoke from "@/assets/grocery&kitchen/cocacola.jpeg";
import imgMango from "@/assets/grocery&kitchen/mongo.jpeg";
import imgGinger from "@/assets/grocery&kitchen/ginger.jpeg";
import imgHousehold from "@/assets/grocery&kitchen/household.png";
import imgInstantFood from "@/assets/grocery&kitchen/noodles-removebg-preview.png";
import imgSauces from "@/assets/grocery&kitchen/sauce.png";
import imgPaan from "@/assets/grocery&kitchen/paan.png";

const sidebarCategories = [
  { id: "all", name: "All", icon: imgCoriander },
  { id: "fresh-veg", name: "Fresh Vegetables", icon: imgChili },
  {
    id: "fresh-fruit",
    name: "Fresh Fruits",
    icon: imgFreshFruits,
  },
  {
    id: "atta-rice-dal",
    name: "Atta, Rice & Dal",
    icon: imgAtta,
  },
  {
    id: "oil-masala",
    name: "Oil, Ghee & Masala",
    icon: imgOilMasala,
  },
  {
    id: "dairy-bread",
    name: "Dairy, Bread & Eggs",
    icon: imgMilk,
  },
  {
    id: "bakery-biscuits",
    name: "Bakery & Biscuits",
    icon: "https://cdn-icons-png.flaticon.com/512/2821/2821785.png",
  },
  {
    id: "chips-namkeen",
    name: "Chips & Namkeen",
    icon: imgChips,
  },
  {
    id: "sweets-choc",
    name: "Sweets & Chocolates",
    icon: imgIceCream,
  },
  {
    id: "drinks-juices",
    name: "Cold Drinks & Juices",
    icon: "https://cdn-icons-png.flaticon.com/512/2405/2405451.png",
  },
  {
    id: "tea-coffee",
    name: "Tea & Coffee",
    icon: "https://cdn-icons-png.flaticon.com/512/924/924514.png",
  },
  {
    id: "cleaning",
    name: "Cleaning & Household",
    icon: imgHousehold,
  },
  {
    id: "beauty",
    name: "Beauty & Cosmetics",
    icon: imgBeauty,
  },
  {
    id: "dry-fruits",
    name: "Dry Fruits & Cereals",
    icon: "https://cdn-icons-png.flaticon.com/512/5029/5029236.png",
  },
  {
    id: "chicken-meat",
    name: "Chicken, Meat & Fish",
    icon: "https://cdn-icons-png.flaticon.com/512/3143/3143643.png",
  },
  {
    id: "kitchenware",
    name: "Kitchenware & Appliances",
    icon: "https://cdn-icons-png.flaticon.com/512/3081/3081840.png",
  },
  {
    id: "instant-food",
    name: "Instant Food",
    icon: imgInstantFood,
  },
  {
    id: "sauces",
    name: "Sauces & Spreads",
    icon: imgSauces,
  },
  {
    id: "paan",
    name: "Paan Corner",
    icon: imgPaan,
  },
  {
    id: "ice-creams",
    name: "Ice Creams & More",
    icon: imgIceCream,
  },
];

const products = [
  {
    id: 1,
    name: "Coriander Bunch (Dhaniya Patta)",
    weight: "100 g",
    price: 1,
    mrp: 7,
    time: "8 MINS",
    image: imgCoriander,
    discount: "85% OFF",
    recipeCount: 8,
    category: "fresh-veg",
  },
  {
    id: 2,
    name: "Green Chilli (Hari Mirch)",
    weight: "100 g",
    price: 19,
    mrp: 22,
    time: "8 MINS",
    image: imgChili,
    discount: "13% OFF",
    recipeCount: 9,
    category: "fresh-veg",
  },
  {
    id: 3,
    name: "Potato - New Crop (Aloo)",
    weight: "1 kg",
    price: 18,
    mrp: 21,
    time: "8 MINS",
    image: imgPotato,
    discount: "14% OFF",
    recipeCount: 30,
    options: "2 options",
    category: "fresh-veg",
  },
  {
    id: 4,
    name: "Onion (Pyaz)",
    weight: "1 kg",
    price: 30,
    mrp: 38,
    time: "8 MINS",
    image: imgOnion,
    discount: "21% OFF",
    recipeCount: 30,
    category: "fresh-veg",
  },
  {
    id: 101,
    name: "Aashirvaad Shudh Chakki Atta",
    weight: "10 kg",
    price: 450,
    mrp: 520,
    time: "12 MINS",
    image: imgAtta,
    discount: "13% OFF",
    recipeCount: 5,
    category: "atta-rice-dal",
  },
  {
    id: 102,
    name: "Fortune Sunlite Refined Sunflower Oil",
    weight: "1 L",
    price: 145,
    mrp: 165,
    time: "12 MINS",
    image: imgOil,
    discount: "12% OFF",
    recipeCount: 15,
    category: "oil-masala",
  },
  {
    id: 103,
    name: "Amul Taaza Homogenised Toned Milk",
    weight: "1 L",
    price: 72,
    mrp: 75,
    time: "10 MINS",
    image: imgMilk,
    discount: "4% OFF",
    recipeCount: 20,
    category: "dairy-bread",
  },
  {
    id: 104,
    name: "Lays India's Magic Masala Potato Chips",
    weight: "50 g",
    price: 20,
    mrp: 20,
    time: "8 MINS",
    image: imgChips,
    discount: "",
    recipeCount: 0,
    category: "chips-namkeen",
  },
  {
    id: 105,
    name: "Cadbury Dairy Milk Silk Chocolate",
    weight: "60 g",
    price: 80,
    mrp: 80,
    time: "8 MINS",
    image: imgChocolate,
    discount: "",
    recipeCount: 0,
    category: "sweets-choc",
  },
  {
    id: 106,
    name: "Coca-Cola Soft Drink",
    weight: "750 ml",
    price: 40,
    mrp: 40,
    time: "8 MINS",
    image: imgCoke,
    discount: "",
    recipeCount: 0,
    category: "drinks-juices",
  },
  {
    id: 5,
    name: "Tomato (Tamatar)",
    weight: "500 g",
    price: 14,
    mrp: 20,
    time: "8 MINS",
    image: imgTomato,
    imageScale: 0.8,
    discount: "12% OFF",
    recipeCount: 30,
    options: "2 options",
    category: "fresh-veg",
  },
  {
    id: 6,
    name: "Ginger (Adrak)",
    weight: "100 g",
    price: 12,
    mrp: 20,
    time: "8 MINS",
    image: imgGinger,
    discount: "40% OFF",
    recipeCount: 12,
    category: "coriander",
  },

  {
    id: 202,
    name: "Banana Robusta (Kela)",
    weight: "6 pcs",
    price: 35,
    mrp: 45,
    time: "8 MINS",
    image: imgBanana,
    discount: "22% OFF",
    recipeCount: 10,
    category: "fresh-fruit",
  },
  {
    id: 203,
    name: "Portion Pumpkin (Kaddoo)",
    weight: "500 g",
    price: 60,
    mrp: 77,
    time: "17 MINS",
    image: imgPumpkin,
    imageScale: 0.8,
    discount: "22% OFF",
    recipeCount: 4,
    category: "fresh-veg",
  },
  {
    id: 204,
    name: "Alphonso Mango",
    weight: "6 pcs",
    price: 450,
    mrp: 600,
    time: "Next Day",
    image: imgMango,
    discount: "25% OFF",
    recipeCount: 20,
    category: "fresh-fruit",
  },
  {
    id: 205,
    name: "Cauliflower (Gobi)",
    weight: "1 pc",
    price: 35,
    mrp: 50,
    time: "8 MINS",
    image: imgCauliflower,
    discount: "30% OFF",
    recipeCount: 12,
    category: "fresh-veg",
  },
  {
    id: 206,
    name: "Dragon Fruit (Kamalam)",
    weight: "1 pc",
    price: 80,
    mrp: 120,
    time: "Next Day",
    image: imgDragonFruit,
    discount: "33% OFF",
    recipeCount: 5,
    category: "fresh-fruit",
  },
  {
    id: 207,
    name: "Red Delicious Apple",
    weight: "4 pcs",
    price: 120,
    mrp: 160,
    time: "10 MINS",
    image: imgApple,
    discount: "25% OFF",
    recipeCount: 15,
    category: "fresh-fruit",
  },
  {
    id: 208,
    name: "Fresh Strawberry",
    weight: "200 g",
    price: 99,
    mrp: 120,
    time: "8 MINS",
    image: imgStrawberry,
    discount: "25% OFF",
    recipeCount: 3,
    category: "fresh-fruit",
  },
];

export function CategoryFoodsContent({
  onClose,
  isModal = false,
  initialCategory = "all",
}) {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  /* End of change */
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);

  const handleProductCardClick = (item) => {
    navigate(`/food/${item.id}`, {
      state: {
        item: {
          id: item.id,
          name: item.name || "Product",
          description: item.description || "",
          weight: item.weight || "",
          price: Number(item.price || 0),
          mrp: Number(item.mrp || 0),
          image: item.image,
          categoryId: String(item?.category || selectedCategory || "").trim(),
          platform: "mogrocery",
        },
      },
    });
  };

  // Update selectedCategory when initialCategory prop changes
  useEffect(() => {
    setSelectedCategory(initialCategory);
  }, [initialCategory]);

  // Filter products based on selected sidebar category
  const filteredProducts =
    selectedCategory === "all"
      ? products
      : products.filter(
        (p) => p.category === selectedCategory || selectedCategory === "all",
      );

  return (
    <div
      className={`bg-[#f4f6fb] flex flex-col font-sans ${isModal ? "h-full rounded-t-[20px] md:max-w-md md:mx-auto" : "min-h-screen h-full w-full"}`}
    >
      <div
        className={`flex flex-col h-full ${!isModal ? "md:max-w-7xl md:mx-auto w-full bg-white md:shadow-xl md:my-4 md:rounded-2xl md:overflow-hidden" : ""}`}
      >
        {/* Header */}
        <div className="bg-white sticky top-0 z-50 px-4 py-3 flex items-center gap-3 border-b border-gray-100 shadow-sm rounded-t-[20px] relative">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-800" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-sm font-black text-slate-800 tracking-wide line-clamp-1">
              {sidebarCategories.find((c) => c.id === selectedCategory)?.name ||
                "All Products"}
            </h1>
            <span className="text-[10px] text-slate-500 font-bold">
              1285 items
            </span>
          </div>

          {/* Floating Close Button Center Top (Hidden when isModal is false or as per UI preference) */}
          {isModal && (
            <button
              onClick={onClose}
              className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#1a1a1a] p-2 rounded-full shadow-lg border border-white/20 active:scale-95 transition-transform z-[80] md:hidden"
            >
              <X size={20} className="text-white" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Main Content Area: Vertical Layout (Horizontal Menu + Grid) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Horizontal Top Menu */}
          <div className="w-full bg-white overflow-x-auto no-scrollbar z-10 flex items-center px-2 shadow-sm border-b border-gray-50 flex-shrink-0">
            {sidebarCategories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`relative flex flex-col items-center justify-center gap-1.5 py-3 px-1 cursor-pointer transition-all min-w-[76px] flex-shrink-0 ${selectedCategory === cat.id ? "bg-transparent" : "bg-white"
                  }`}
              >
                {/* Icon Container */}
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${selectedCategory === cat.id
                    ? "bg-[#fef3c7] scale-105 border-2 border-[#facd01]"
                    : "bg-slate-50 border border-transparent"
                    } ${cat.id === "fresh-fruit" ? "p-0.5" : "p-1.5"}`}
                >
                  <img
                    src={cat.icon}
                    alt={cat.name}
                    className="w-full h-full object-contain drop-shadow-sm"
                    onError={(e) =>
                    (e.target.src =
                      "https://cdn-icons-png.flaticon.com/512/2909/2909808.png")
                    }
                  />
                </div>

                <span
                  className={`text-[10px] text-center leading-tight px-0.5 font-bold line-clamp-2 max-w-[70px] ${selectedCategory === cat.id
                    ? "text-slate-900"
                    : "text-slate-500"
                    }`}
                >
                  {cat.name}
                </span>

                {/* Bottom Active Indicator */}
                {selectedCategory === cat.id && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#facd01] rounded-t-full"></div>
                )}
              </div>
            ))}
          </div>

          {/* Right Grid Content */}
          <div className="flex-1 bg-white h-full overflow-y-auto pb-24 px-3 pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {filteredProducts.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow h-full"
                  onClick={() => handleProductCardClick(item)}
                >
                  {/* Image Section */}
                  <div className="relative w-full h-40 md:h-48 p-2 bg-white">
                    {/* Discount Badge */}
                    {item.discount && (
                      <div className="absolute top-2 left-0 bg-[#f8e71d] text-[9px] font-black px-1.5 py-0.5 rounded-r text-slate-900 z-10 shadow-sm">
                        {item.discount}
                      </div>
                    )}

                    {/* Wishlist */}
                    <div className="absolute top-1 right-1 z-30">
                      <WishlistButton item={item} />
                    </div>

                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-contain drop-shadow-[0_8px_6px_rgba(0,0,0,0.15)]"
                    />

                    {/* ADD Button */}
                    <button
                      className="absolute bottom-1 right-2 bg-white border border-[#facd01] text-gray-900 text-[10px] font-black px-4 py-1 rounded shadow-sm hover:bg-[#facd01] transition-colors z-20"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!item?.storeId) {
                          toast.error("Store information missing for this product.");
                          return;
                        }
                        addToCart({
                          ...item,
                          categoryId: String(item?.category || selectedCategory || "").trim(),
                          restaurantId: String(item.storeId).trim(),
                          restaurant: "MoGrocery",
                          platform: "mogrocery",
                        });

                        // Custom React Toastify style toast
                        toast.custom(
                          (t) => (
                            <div className="bg-white border-l-4 border-yellow-400 shadow-lg rounded-lg p-4 flex flex-col gap-3 min-w-[300px] animate-in slide-in-from-right duration-300 overflow-hidden relative">
                              <div className="flex items-center gap-3">
                                <div className="bg-yellow-100 p-1.5 rounded-full">
                                  <CheckCircle className="text-yellow-600 w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-bold text-gray-900">
                                    Added to Cart!
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {item.name} is now in your basket.
                                  </p>
                                </div>
                                <button
                                  onClick={() => toast.dismiss(t)}
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              {/* Progress bar animation */}
                              <motion.div
                                initial={{ width: "100%" }}
                                animate={{ width: "0%" }}
                                transition={{ duration: 2, ease: "linear" }}
                                className="absolute bottom-0 left-0 h-1 bg-yellow-400"
                              />
                            </div>
                          ),
                          {
                            duration: 2000,
                            position: "bottom-right",
                          },
                        );
                      }}
                    >
                      ADD
                    </button>
                  </div>

                  {/* Details Section */}
                  <div className="px-2 pb-2 flex-1 flex flex-col justify-between">
                    <div>


                      {/* Name */}
                      <h3 className="text-[12px] font-bold text-slate-900 leading-tight line-clamp-2 mb-1 min-h-[2.4em]">
                        {item.name}
                      </h3>

                      {/* Weight */}
                      <p className="text-[10px] font-medium text-slate-400 mb-2">
                        {item.weight}
                      </p>

                      {/* Price */}
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-black text-slate-900">
                          ₹{item.price}
                        </span>
                        <span className="text-[10px] text-slate-400 line-through decoration-slate-400">
                          ₹{item.mrp}
                        </span>
                      </div>
                    </div>

                    {/* Recipe Link Footer */}

                  </div>
                </div>
              ))}
            </div>
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
  const { id } = useParams();
  return (
    <CategoryFoodsContent
      onClose={() => navigate(-1)}
      initialCategory={id || "all"}
    />
  );
};

export default CategoryFoodsPage;
