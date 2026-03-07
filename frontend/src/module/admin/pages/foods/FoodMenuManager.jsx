import { useEffect, useMemo, useState } from "react";
import { adminAPI, restaurantAPI } from "@/lib/api";
import { Loader2, Pencil, Plus, Store } from "lucide-react";
import { toast } from "sonner";

function normalizeImage(value) {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const nested = value.url || value.image || value.imageUrl || value.secure_url;
    if (typeof nested === "string" && nested.trim()) return nested;
  }
  return "";
}

function getEntityImage(entity = {}) {
  const direct = normalizeImage(entity?.image) || normalizeImage(entity?.profileImage);
  if (direct) return direct;

  if (Array.isArray(entity?.images)) {
    const image = entity.images.map(normalizeImage).find(Boolean);
    if (image) return image;
  }

  if (Array.isArray(entity?.coverImages)) {
    const image = entity.coverImages.map(normalizeImage).find(Boolean);
    if (image) return image;
  }

  if (Array.isArray(entity?.menuImages)) {
    const image = entity.menuImages.map(normalizeImage).find(Boolean);
    if (image) return image;
  }

  return "";
}

export default function FoodMenuManager() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [menu, setMenu] = useState({ sections: [] });
  const [addons, setAddons] = useState([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", image: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState("");

  const [form, setForm] = useState({
    sectionId: "",
    sectionName: "",
    subsectionName: "",
    name: "",
    price: "",
    foodType: "Veg",
    description: "",
    image: "",
  });

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        setLoadingRestaurants(true);
        const response = await adminAPI.getRestaurants({ limit: 1000 });
        const rows =
          response?.data?.data?.restaurants ||
          response?.data?.data ||
          response?.data?.restaurants ||
          [];
        const mofoodRestaurants = rows.filter(
          (restaurant) =>
            !restaurant?.platform || String(restaurant.platform).toLowerCase() === "mofood",
        );
        setRestaurants(mofoodRestaurants);
      } catch (error) {
        console.error("Failed to load restaurants:", error);
        toast.error("Failed to load restaurants");
        setRestaurants([]);
      } finally {
        setLoadingRestaurants(false);
      }
    };

    fetchRestaurants();
  }, []);

  const refreshMenu = async (restaurantId) => {
    const response = await adminAPI.getRestaurantMenu(restaurantId);
    const menuData = response?.data?.data?.menu || response?.data?.menu || { sections: [] };
    setMenu({
      sections: Array.isArray(menuData.sections) ? menuData.sections : [],
    });
  };

  useEffect(() => {
    const fetchMenu = async () => {
      if (!selectedRestaurantId) {
        setMenu({ sections: [] });
        return;
      }
      try {
        setLoadingMenu(true);
        await refreshMenu(selectedRestaurantId);
      } catch (error) {
        console.error("Failed to load menu:", error);
        toast.error("Failed to load restaurant menu");
        setMenu({ sections: [] });
      } finally {
        setLoadingMenu(false);
      }
    };

    fetchMenu();
  }, [selectedRestaurantId]);

  useEffect(() => {
    const fetchAddons = async () => {
      if (!selectedRestaurantId) {
        setAddons([]);
        return;
      }

      try {
        setLoadingAddons(true);
        const response = await restaurantAPI.getAddonsByRestaurantId(selectedRestaurantId);
        const addonRows = response?.data?.data?.addons || response?.data?.addons || [];
        setAddons(Array.isArray(addonRows) ? addonRows : []);
      } catch (error) {
        console.error("Failed to load addons:", error);
        toast.error("Failed to load restaurant add-ons");
        setAddons([]);
      } finally {
        setLoadingAddons(false);
      }
    };

    fetchAddons();
  }, [selectedRestaurantId]);

  const selectedRestaurant = useMemo(
    () =>
      restaurants.find(
        (restaurant) =>
          String(restaurant?._id || restaurant?.restaurantId || "") === selectedRestaurantId,
      ),
    [restaurants, selectedRestaurantId],
  );

  const selectedRestaurantImage = useMemo(
    () => getEntityImage(selectedRestaurant),
    [selectedRestaurant],
  );

  const resetForm = () => {
    setForm((prev) => ({
      ...prev,
      subsectionName: "",
      name: "",
      price: "",
      description: "",
      image: "",
    }));
  };

  const handleAddItem = async (event) => {
    event.preventDefault();

    if (!selectedRestaurantId) {
      toast.error("Please select a restaurant");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Item name is required");
      return;
    }
    if (!form.price || Number.isNaN(Number(form.price))) {
      toast.error("Valid price is required");
      return;
    }
    if (!form.sectionId && !form.sectionName.trim()) {
      toast.error("Select a section or enter a new section name");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        sectionId: form.sectionId || undefined,
        sectionName: form.sectionId ? undefined : form.sectionName.trim(),
        subsectionName: form.subsectionName.trim() || undefined,
        item: {
          name: form.name.trim(),
          price: Number(form.price),
          foodType: form.foodType,
          description: form.description.trim(),
          image: form.image.trim(),
          isAvailable: true,
        },
      };

      await adminAPI.addRestaurantMenuItem(selectedRestaurantId, payload);
      toast.success("Menu item added");
      resetForm();
      await refreshMenu(selectedRestaurantId);
    } catch (error) {
      console.error("Failed to add menu item:", error);
      toast.error(error?.response?.data?.message || "Failed to add menu item");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (item) => {
    const initialImage = getEntityImage(item);
    setEditingItem(item);
    setEditForm({
      name: item?.name || "",
      image: initialImage,
    });
    setImagePreview(initialImage);
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
    if (!selectedRestaurantId || !editingItem?.id) {
      toast.error("Unable to identify the dish.");
      return;
    }
    if (!String(editForm.name || "").trim()) {
      toast.error("Dish name is required.");
      return;
    }

    try {
      setEditSaving(true);
      await adminAPI.updateRestaurantMenuItem(selectedRestaurantId, editingItem.id, {
        item: {
          ...editingItem,
          name: String(editForm.name || "").trim(),
          image: String(editForm.image || "").trim(),
          images: String(editForm.image || "").trim() ? [String(editForm.image || "").trim()] : [],
        },
      });
      await refreshMenu(selectedRestaurantId);
      toast.success("Dish updated successfully");
      setEditingItem(null);
      setImagePreview("");
    } catch (error) {
      console.error("Failed to update menu item:", error);
      toast.error(error?.response?.data?.message || "Failed to update dish");
    } finally {
      setEditSaving(false);
    }
  };

  const renderItemRow = (item) => (
    <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          {getEntityImage(item) ? (
            <img
              src={getEntityImage(item)}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Store className="w-4 h-4 text-slate-400" />
          )}
        </div>
        <span className="text-slate-800 truncate">{item.name}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-medium text-slate-700">Rs {Number(item.price || 0).toFixed(2)}</span>
        <button
          type="button"
          onClick={() => openEditModal(item)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white hover:bg-slate-800"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Restaurant Menu Manager</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Restaurant</label>
            <select
              value={selectedRestaurantId}
              onChange={(event) => {
                setSelectedRestaurantId(event.target.value);
                setForm((prev) => ({ ...prev, sectionId: "" }));
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              disabled={loadingRestaurants}
            >
              <option value="">Choose restaurant</option>
              {restaurants.map((restaurant) => {
                const value = String(restaurant?._id || restaurant?.restaurantId || "");
                return (
                  <option key={value} value={value}>
                    {restaurant?.name || "Unnamed Restaurant"}
                  </option>
                );
              })}
            </select>

            {selectedRestaurant ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                  {selectedRestaurantImage ? (
                    <img
                      src={selectedRestaurantImage}
                      alt={selectedRestaurant?.name || "Restaurant"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Store className="w-6 h-6 text-slate-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {selectedRestaurant?.name || "Unnamed Restaurant"}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {selectedRestaurant?.restaurantId || selectedRestaurant?._id || "-"}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={form.sectionId}
              onChange={(event) => setForm((prev) => ({ ...prev, sectionId: event.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">New Section</option>
              {(menu.sections || []).map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Section name (if new)"
              value={form.sectionName}
              onChange={(event) => setForm((prev) => ({ ...prev, sectionName: event.target.value }))}
              disabled={!!form.sectionId}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100"
            />
            <input
              type="text"
              placeholder="Subsection (optional)"
              value={form.subsectionName}
              onChange={(event) => setForm((prev) => ({ ...prev, subsectionName: event.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <input
              type="text"
              placeholder="Item name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Price"
              value={form.price}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <select
              value={form.foodType}
              onChange={(event) => setForm((prev) => ({ ...prev, foodType: event.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="Veg">Veg</option>
              <option value="Non-Veg">Non-Veg</option>
            </select>
            <input
              type="text"
              placeholder="Image URL (optional)"
              value={form.image}
              onChange={(event) => setForm((prev) => ({ ...prev, image: event.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={2}
              className="md:col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <button
              type="submit"
              disabled={saving}
              className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Item
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          {selectedRestaurant?.name ? `${selectedRestaurant.name} Menu` : "Menu Items"}
        </h2>

        {loadingMenu ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
          </div>
        ) : !selectedRestaurantId ? (
          <p className="text-sm text-slate-500">Select a restaurant to view menu.</p>
        ) : menu.sections.length === 0 ? (
          <p className="text-sm text-slate-500">No menu sections yet.</p>
        ) : (
          <div className="space-y-5">
            {menu.sections.map((section) => (
              <div key={section.id || section.name} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-800">{section.name || "Unnamed Section"}</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {(section.items || []).map(renderItemRow)}
                  {(section.subsections || []).map((subsection) => (
                    <div key={subsection.id} className="px-4 py-2.5 bg-slate-50/40">
                      <p className="text-xs font-semibold text-slate-600 mb-2">{subsection.name}</p>
                      <div className="space-y-1">
                        {(subsection.items || []).map(renderItemRow)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          {selectedRestaurant?.name ? `${selectedRestaurant.name} Add-ons` : "Add-ons"}
        </h2>

        {loadingAddons ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
          </div>
        ) : !selectedRestaurantId ? (
          <p className="text-sm text-slate-500">Select a restaurant to view add-ons.</p>
        ) : addons.length === 0 ? (
          <p className="text-sm text-slate-500">No add-ons found for this restaurant.</p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {addons.map((addon, index) => {
              const addonId = addon.id || addon._id || `${addon.name || "addon"}-${index}`;
              return (
                <div
                  key={String(addonId)}
                  className="px-4 py-3 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{addon.name || "Unnamed Add-on"}</p>
                    {addon.description ? (
                      <p className="text-xs text-slate-500 truncate">{addon.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        addon.isAvailable === false
                          ? "bg-slate-100 text-slate-500"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {addon.isAvailable === false ? "Unavailable" : "Available"}
                    </span>
                    <span className="font-semibold text-slate-700">
                      Rs {Number(addon.price || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingItem ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Edit Dish</h3>
              <p className="text-sm text-slate-500 mt-1">Update dish name and image.</p>
            </div>
            <div className="p-5 space-y-3">
              <input
                type="text"
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Dish name"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <input
                type="text"
                value={editForm.image}
                onChange={(event) => {
                  setEditForm((prev) => ({ ...prev, image: event.target.value }));
                  setImagePreview(event.target.value);
                }}
                placeholder="Image URL"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <div className="flex items-center gap-3">
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
              <div className="h-40 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt={editForm.name || "Dish preview"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm text-slate-400">No image preview</span>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
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
