import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Pencil } from "lucide-react";
import { adminAPI } from "@/lib/api";
import { buildImageFallback } from "@/lib/utils/imageFallback";
import { toast } from "sonner";

function normalizeImage(item = {}) {
  if (typeof item?.image === "string" && item.image.trim()) return item.image;
  if (item?.image && typeof item.image === "object") {
    const objectImage = item.image.url || item.image.image || item.image.imageUrl;
    if (typeof objectImage === "string" && objectImage.trim()) return objectImage;
  }
  if (Array.isArray(item?.images)) {
    const firstImage = item.images
      .map((image) => {
        if (typeof image === "string") return image.trim();
        if (image && typeof image === "object") {
          return String(image.url || image.image || image.imageUrl || "").trim();
        }
        return "";
      })
      .find(Boolean);
    if (firstImage) return firstImage;
  }
  return buildImageFallback(40, "FOO");
}

function flattenApprovedItems(menuSections = [], restaurant = {}) {
  const rows = [];

  const pushItem = (item, sectionName, subsectionName = "", section = null, subsection = null) => {
    const isApproved = !item?.approvalStatus || item.approvalStatus === "approved";
    const isAvailable = item?.isAvailable !== false;
    if (!isApproved || !isAvailable) return;

    rows.push({
      id:
        item?.id ||
        item?._id ||
        `${restaurant?._id || restaurant?.restaurantId || restaurant?.name}-${sectionName}-${subsectionName}-${item?.name}`,
      itemName: item?.name || "-",
      foodType: item?.foodType || item?.category || "-",
      restaurantName: restaurant?.name || "-",
      restaurantId: restaurant?.restaurantId || restaurant?._id || "-",
      restaurantMongoId: String(restaurant?._id || ""),
      sectionName: sectionName || "-",
      subsectionName: subsectionName || "",
      sectionId: section?.id || "",
      subsectionId: subsection?.id || "",
      price: Number(item?.price || 0),
      description: item?.description || "",
      image: normalizeImage(item),
      rawImages: Array.isArray(item?.images) ? item.images : [],
      isAvailable,
      approvalStatus: item?.approvalStatus || "approved",
      approvedAt: item?.approvedAt || null,
      updatedAt: item?.updatedAt || null,
    });
  };

  (Array.isArray(menuSections) ? menuSections : []).forEach((section) => {
    (Array.isArray(section?.items) ? section.items : []).forEach((item) =>
      pushItem(item, section?.name || "Unnamed Section", "", section, null),
    );

    (Array.isArray(section?.subsections) ? section.subsections : []).forEach((subsection) => {
      (Array.isArray(subsection?.items) ? subsection.items : []).forEach((item) =>
        pushItem(item, section?.name || "Unnamed Section", subsection?.name || "", section, subsection),
      );
    });
  });

  return rows;
}

export default function FoodsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    price: "",
    foodType: "Veg",
    description: "",
    image: "",
    isAvailable: true,
  });
  const [imagePreview, setImagePreview] = useState("");

  useEffect(() => {
    const fetchApprovedFoods = async () => {
      try {
        setLoading(true);

        const restaurantResponse = await adminAPI.getRestaurants({ limit: 1000, status: "active" });
        const restaurants =
          restaurantResponse?.data?.data?.restaurants ||
          restaurantResponse?.data?.data ||
          restaurantResponse?.data?.restaurants ||
          [];

        const mofoodRestaurants = (Array.isArray(restaurants) ? restaurants : []).filter((restaurant) => {
          const platform = String(restaurant?.platform || "mofood").toLowerCase();
          return platform === "mofood" && restaurant?.isActive !== false;
        });

        const menuResponses = await Promise.all(
          mofoodRestaurants.map(async (restaurant) => {
            try {
              const response = await adminAPI.getRestaurantMenu(
                String(restaurant?._id || restaurant?.restaurantId || ""),
              );
              const menu = response?.data?.data?.menu || response?.data?.menu || { sections: [] };
              return flattenApprovedItems(menu?.sections, restaurant);
            } catch (error) {
              console.error("Failed to load restaurant menu:", restaurant?.name, error);
              return [];
            }
          }),
        );

        const allFoods = menuResponses
          .flat()
          .sort((a, b) => {
            const aTime = new Date(a.approvedAt || a.updatedAt || 0).getTime();
            const bTime = new Date(b.approvedAt || b.updatedAt || 0).getTime();
            return bTime - aTime;
          });

        setFoods(allFoods);
      } catch (error) {
        console.error("Error fetching approved foods:", error);
        toast.error("Failed to load approved foods");
        setFoods([]);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovedFoods();
  }, []);

  const openEditModal = (food) => {
    const initialImage = food?.image === buildImageFallback(40, "FOO") ? "" : food?.image || "";
    setSelectedFood(food);
    setEditForm({
      name: food?.itemName || "",
      price: String(food?.price ?? ""),
      foodType: food?.foodType === "Veg" ? "Veg" : "Non-Veg",
      description: food?.description || "",
      image: initialImage,
      isAvailable: food?.isAvailable !== false,
    });
    setImagePreview(initialImage);
    setEditOpen(true);
  };

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setEditForm((prev) => ({ ...prev, image: result }));
      setImagePreview(result);
    };
    reader.onerror = () => {
      toast.error("Failed to read the selected image.");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEdit = async () => {
    if (!selectedFood?.restaurantMongoId || !selectedFood?.id) {
      toast.error("Unable to identify this food item.");
      return;
    }
    if (!String(editForm.name || "").trim()) {
      toast.error("Food name is required.");
      return;
    }
    if (editForm.price === "" || Number.isNaN(Number(editForm.price))) {
      toast.error("Valid price is required.");
      return;
    }

    try {
      setEditSaving(true);
      await adminAPI.updateRestaurantMenuItem(selectedFood.restaurantMongoId, selectedFood.id, {
        item: {
          name: String(editForm.name || "").trim(),
          price: Number(editForm.price),
          foodType: editForm.foodType === "Veg" ? "Veg" : "Non-Veg",
          description: String(editForm.description || "").trim(),
          image: String(editForm.image || "").trim(),
          images: String(editForm.image || "").trim() ? [String(editForm.image || "").trim()] : [],
          isAvailable: editForm.isAvailable,
          category: selectedFood.sectionName || undefined,
        },
      });

      setFoods((prev) =>
        prev.map((food) =>
          String(food.id) === String(selectedFood.id) &&
          String(food.restaurantMongoId) === String(selectedFood.restaurantMongoId)
            ? {
                ...food,
                itemName: String(editForm.name || "").trim(),
                price: Number(editForm.price),
                foodType: editForm.foodType,
                description: String(editForm.description || "").trim(),
                image: String(editForm.image || "").trim() || food.image,
                isAvailable: editForm.isAvailable,
              }
            : food,
        ),
      );

      toast.success("Food updated successfully");
      setEditOpen(false);
      setSelectedFood(null);
      setImagePreview("");
    } catch (error) {
      console.error("Error updating food:", error);
      toast.error(error?.response?.data?.message || "Failed to update food");
    } finally {
      setEditSaving(false);
    }
  };

  const filteredFoods = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return foods;

    return foods.filter((food) =>
      food.itemName?.toLowerCase().includes(query) ||
      food.restaurantName?.toLowerCase().includes(query) ||
      String(food.restaurantId || "").toLowerCase().includes(query) ||
      food.sectionName?.toLowerCase().includes(query) ||
      food.subsectionName?.toLowerCase().includes(query) ||
      food.foodType?.toLowerCase().includes(query),
    );
  }, [foods, searchQuery]);

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Approved Foods</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Available approved food items</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700">
              {filteredFoods.length}
            </span>
          </div>
          <div className="relative flex-1 sm:flex-initial min-w-[220px]">
            <input
              type="text"
              placeholder="Search by food, restaurant, section"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SL</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Image</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Food</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Section</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Approved</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading approved foods...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredFoods.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <p className="text-lg font-semibold text-slate-700 mb-1">No approved foods found</p>
                    <p className="text-sm text-slate-500">Only available approved mofood items are shown here</p>
                  </td>
                </tr>
              ) : (
                filteredFoods.map((food, index) => (
                  <tr key={String(food.id)} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={food.image}
                          alt={food.itemName || "food"}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = buildImageFallback(40, "FOO");
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">{food.itemName}</span>
                        <span className="text-xs text-slate-500">{food.foodType}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-900">{food.restaurantName}</span>
                        <span className="text-xs text-slate-500">{food.restaurantId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {food.subsectionName ? `${food.sectionName} / ${food.subsectionName}` : food.sectionName}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">
                      Rs {Number(food.price || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {food.approvedAt ? new Date(food.approvedAt).toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => openEditModal(food)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                        title="Edit food"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editOpen && selectedFood ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Edit Food</h3>
              <p className="text-sm text-slate-500 mt-1">
                {selectedFood.itemName} at {selectedFood.restaurantName}
              </p>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Food name"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.price}
                onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="Price"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={editForm.foodType}
                onChange={(e) => setEditForm((prev) => ({ ...prev, foodType: e.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Veg">Veg</option>
                <option value="Non-Veg">Non-Veg</option>
              </select>
              <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.isAvailable}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, isAvailable: e.target.checked }))}
                />
                Available
              </label>
              <input
                type="text"
                            value={editForm.image}
                onChange={(e) => {
                  setEditForm((prev) => ({ ...prev, image: e.target.value }));
                  setImagePreview(e.target.value);
                }}
                placeholder="Image URL"
                className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="md:col-span-2 flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageFileChange}
                  />
                </label>
                <span className="text-xs text-slate-500">Choose an image to preview and save.</span>
              </div>
              <div className="md:col-span-2 h-40 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt={editForm.name || "Food preview"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm text-slate-400">No image preview</span>
                )}
              </div>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={4}
                placeholder="Description"
                className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setSelectedFood(null);
                  setImagePreview("");
                }}
                className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
