import { useEffect, useMemo, useState } from "react";
import { adminAPI, restaurantAPI } from "@/lib/api";
import { Loader2, Pencil, Plus, Store } from "lucide-react";
import { toast } from "sonner";

function normalizeImage(value) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return "";

    const lowered = normalized.toLowerCase();
    if (lowered === "null" || lowered === "undefined" || lowered === "nan") return "";

    return normalized;
  }
  if (value && typeof value === "object") {
    const nested = value.url || value.image || value.imageUrl || value.secure_url;
    return normalizeImage(nested);
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

function MenuImage({ src, alt, className, fallback }) {
  const normalizedSrc = normalizeImage(src);
  const [hasError, setHasError] = useState(false);

  if (!normalizedSrc || hasError) {
    return fallback;
  }

  return (
    <img
      key={normalizedSrc}
      src={normalizedSrc}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}

function SuggestionChips({ values = [], onSelect }) {
  const visibleValues = Array.isArray(values) ? values.slice(0, 6) : [];
  if (visibleValues.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {visibleValues.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
        >
          {value}
        </button>
      ))}
    </div>
  );
}

export default function FoodMenuManager() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [categories, setCategories] = useState([]);
  const [menu, setMenu] = useState({ sections: [] });
  const [menuSuggestionSource, setMenuSuggestionSource] = useState({ sections: [] });
  const [addons, setAddons] = useState([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [addonsRequested, setAddonsRequested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", image: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [selectedSectionViewKey, setSelectedSectionViewKey] = useState("");

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

  const refreshCategories = async (restaurantId) => {
    const response = await adminAPI.getRestaurantMenuCategories(restaurantId);
    const rows = response?.data?.data?.categories || response?.data?.categories || [];
    setCategories(Array.isArray(rows) ? rows : []);
  };

  const refreshMenuForSection = async (restaurantId, sectionKey) => {
    if (!restaurantId || !sectionKey) {
      setMenu({ sections: [] });
      return;
    }

    const matchedCategory = categories.find(
      (category) => String(category?.id || category?.key || "") === String(sectionKey),
    );
    const sectionId = String(matchedCategory?.id || "");
    const fallbackSectionKey = String(matchedCategory?.key || sectionKey || "");

    const response = await adminAPI.getRestaurantMenu(restaurantId, {
      sectionId: sectionId || undefined,
      sectionKey: sectionId ? undefined : fallbackSectionKey,
      includeImages: true,
    });
    const menuData = response?.data?.data?.menu || response?.data?.menu || { sections: [] };
    setMenu({
      sections: Array.isArray(menuData.sections) ? menuData.sections : [],
    });
  };

  const refreshCurrentMenuState = async (restaurantId) => {
    await refreshCategories(restaurantId);
    if (selectedSectionViewKey) {
      await refreshMenuForSection(restaurantId, selectedSectionViewKey);
    } else {
      setMenu({ sections: [] });
    }
  };

  useEffect(() => {
    const fetchCategories = async () => {
      if (!selectedRestaurantId) {
        setCategories([]);
        setMenu({ sections: [] });
        setMenuSuggestionSource({ sections: [] });
        setSelectedSectionViewKey("");
        return;
      }
      try {
        setLoadingCategories(true);
        setMenu({ sections: [] });
        const fullMenuResponse = await adminAPI.getRestaurantMenu(selectedRestaurantId, {
          includeImages: true,
        });
        const fullMenuData =
          fullMenuResponse?.data?.data?.menu ||
          fullMenuResponse?.data?.menu ||
          { sections: [] };
        setMenuSuggestionSource({
          sections: Array.isArray(fullMenuData.sections) ? fullMenuData.sections : [],
        });
        await refreshCategories(selectedRestaurantId);
      } catch (error) {
        console.error("Failed to load menu categories:", error);
        toast.error("Failed to load restaurant categories");
        setCategories([]);
        setMenu({ sections: [] });
        setMenuSuggestionSource({ sections: [] });
      } finally {
        setLoadingCategories(false);
      }
    };

    fetchCategories();
  }, [selectedRestaurantId]);

  useEffect(() => {
    const fetchSectionMenu = async () => {
      if (!selectedRestaurantId || !selectedSectionViewKey) {
        setMenu({ sections: [] });
        return;
      }

      try {
        setLoadingMenu(true);
        await refreshMenuForSection(selectedRestaurantId, selectedSectionViewKey);
      } catch (error) {
        console.error("Failed to load section menu:", error);
        toast.error("Failed to load category foods");
        setMenu({ sections: [] });
      } finally {
        setLoadingMenu(false);
      }
    };

    fetchSectionMenu();
  }, [selectedRestaurantId, selectedSectionViewKey]);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setSelectedSectionViewKey("");
      return;
    }

    if (!selectedSectionViewKey) return;
    const hasSelected = (categories || []).some(
      (category) =>
        String(category?.id || category?.key || "") === String(selectedSectionViewKey),
    );
    if (!hasSelected) {
      setSelectedSectionViewKey("");
    }
  }, [categories, selectedRestaurantId, selectedSectionViewKey]);

  useEffect(() => {
    const fetchAddons = async () => {
      if (!selectedRestaurantId || !addonsRequested) {
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
  }, [selectedRestaurantId, addonsRequested]);

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

  const visibleSections = useMemo(() => {
    if (!selectedSectionViewKey) return [];
    return Array.isArray(menu.sections) ? menu.sections : [];
  }, [menu.sections, selectedSectionViewKey]);

  const suggestionData = useMemo(() => {
    const suggestionSections = Array.isArray(menuSuggestionSource?.sections)
      ? menuSuggestionSource.sections
      : [];

    const sectionNameSet = new Set();
    const subsectionNameSet = new Set();
    const itemNameSet = new Set();
    const priceSet = new Set();
    const descriptionSet = new Set();

    suggestionSections.forEach((section) => {
      const sectionName = String(section?.name || "").trim();
      if (sectionName) sectionNameSet.add(sectionName);

      (Array.isArray(section?.items) ? section.items : []).forEach((item) => {
        const itemName = String(item?.name || "").trim();
        const itemDescription = String(item?.description || "").trim();
        const itemPrice = Number(item?.price);

        if (itemName) itemNameSet.add(itemName);
        if (itemDescription) descriptionSet.add(itemDescription);
        if (Number.isFinite(itemPrice)) priceSet.add(itemPrice.toFixed(2));
      });

      (Array.isArray(section?.subsections) ? section.subsections : []).forEach((subsection) => {
        const subsectionName = String(subsection?.name || "").trim();
        if (subsectionName) subsectionNameSet.add(subsectionName);

        (Array.isArray(subsection?.items) ? subsection.items : []).forEach((item) => {
          const itemName = String(item?.name || "").trim();
          const itemDescription = String(item?.description || "").trim();
          const itemPrice = Number(item?.price);

          if (itemName) itemNameSet.add(itemName);
          if (itemDescription) descriptionSet.add(itemDescription);
          if (Number.isFinite(itemPrice)) priceSet.add(itemPrice.toFixed(2));
        });
      });
    });

    const activeSectionId = String(form.sectionId || "");
    const activeSection = categories.find(
      (category) => String(category?.id || category?.key || "") === activeSectionId
    );
    const activeSectionName = String(activeSection?.name || form.sectionName || "").trim().toLowerCase();
    const subsectionSuggestions = activeSectionName
      ? suggestionSections
          .filter((section) => String(section?.name || "").trim().toLowerCase() === activeSectionName)
          .flatMap((section) => Array.isArray(section?.subsections) ? section.subsections : [])
          .map((subsection) => String(subsection?.name || "").trim())
          .filter(Boolean)
      : Array.from(subsectionNameSet);

    return {
      sectionNames: Array.from(sectionNameSet).sort((a, b) => a.localeCompare(b)),
      subsectionNames: Array.from(new Set(subsectionSuggestions)).sort((a, b) => a.localeCompare(b)),
      itemNames: Array.from(itemNameSet).sort((a, b) => a.localeCompare(b)),
      prices: Array.from(priceSet).sort((a, b) => Number(a) - Number(b)),
      descriptions: Array.from(descriptionSet).sort((a, b) => a.localeCompare(b)),
    };
  }, [categories, form.sectionId, form.sectionName, menuSuggestionSource]);

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
      await refreshCurrentMenuState(selectedRestaurantId);
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
      await refreshCurrentMenuState(selectedRestaurantId);
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
          <MenuImage
            src={getEntityImage(item)}
            alt={item.name}
            className="h-full w-full object-cover"
            fallback={<span className="text-[9px] font-medium uppercase text-slate-400">No image</span>}
          />
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
                setSelectedSectionViewKey("");
                setAddonsRequested(false);
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
                  <MenuImage
                    src={selectedRestaurantImage}
                    alt={selectedRestaurant?.name || "Restaurant"}
                    className="h-full w-full object-cover"
                    fallback={<span className="text-[10px] font-medium uppercase text-slate-500">No image</span>}
                  />
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

            {selectedRestaurantId ? (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Select Category To Load Foods
                </label>
                <select
                  value={selectedSectionViewKey}
                  onChange={(event) => setSelectedSectionViewKey(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  disabled={loadingCategories || categories.length === 0}
                >
                  <option value="">
                    {loadingCategories
                      ? "Loading categories..."
                      : categories.length > 0
                        ? "Choose category"
                        : "No categories found"}
                  </option>
                  {categories.map((category) => {
                    const sectionKey = String(category?.id || category?.key || "");
                    return (
                      <option key={sectionKey} value={sectionKey}>
                        {category?.name || "Unnamed Section"}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={form.sectionId}
              onChange={(event) => {
                const nextSectionId = event.target.value;
                setForm((prev) => ({ ...prev, sectionId: nextSectionId }));
                if (nextSectionId) {
                  const matchedCategory = categories.find(
                    (category) =>
                      String(category?.id || category?.key || "") === String(nextSectionId),
                  );
                  setSelectedSectionViewKey(String(matchedCategory?.id || matchedCategory?.key || ""));
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">New Section</option>
              {categories.map((category) => (
                <option key={String(category?.id || category?.key)} value={String(category?.id || "")}>
                  {category?.name || "Unnamed Section"}
                </option>
              ))}
            </select>
            <div>
              <input
                type="text"
                placeholder="Section name (if new)"
                value={form.sectionName}
                onChange={(event) => setForm((prev) => ({ ...prev, sectionName: event.target.value }))}
                list="food-menu-section-suggestions"
                disabled={!!form.sectionId}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-100"
              />
              <SuggestionChips
                values={form.sectionId ? [] : suggestionData.sectionNames}
                onSelect={(value) => setForm((prev) => ({ ...prev, sectionName: value }))}
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Subsection (optional)"
                value={form.subsectionName}
                onChange={(event) => setForm((prev) => ({ ...prev, subsectionName: event.target.value }))}
                list="food-menu-subsection-suggestions"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <SuggestionChips
                values={suggestionData.subsectionNames}
                onSelect={(value) => setForm((prev) => ({ ...prev, subsectionName: value }))}
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Item name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                list="food-menu-item-name-suggestions"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <SuggestionChips
                values={suggestionData.itemNames}
                onSelect={(value) => setForm((prev) => ({ ...prev, name: value }))}
              />
            </div>
            <div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                value={form.price}
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                list="food-menu-price-suggestions"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <SuggestionChips
                values={suggestionData.prices}
                onSelect={(value) => setForm((prev) => ({ ...prev, price: value }))}
              />
            </div>
            <select
              value={form.foodType}
              onChange={(event) => setForm((prev) => ({ ...prev, foodType: event.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="Veg">Veg</option>
              <option value="Non-Veg">Non-Veg</option>
            </select>
            <div>
              <input
                type="text"
                placeholder="Image URL (optional)"
                value={form.image}
                onChange={(event) => setForm((prev) => ({ ...prev, image: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div className="md:col-span-2">
              <textarea
                placeholder="Description (optional)"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <SuggestionChips
                values={suggestionData.descriptions}
                onSelect={(value) => setForm((prev) => ({ ...prev, description: value }))}
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Item
            </button>
            <datalist id="food-menu-section-suggestions">
              {suggestionData.sectionNames.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <datalist id="food-menu-subsection-suggestions">
              {suggestionData.subsectionNames.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <datalist id="food-menu-item-name-suggestions">
              {suggestionData.itemNames.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <datalist id="food-menu-price-suggestions">
              {suggestionData.prices.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <datalist id="food-menu-description-suggestions">
              {suggestionData.descriptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {selectedRestaurant?.name ? `${selectedRestaurant.name} Menu` : "Menu Items"}
          </h2>
        </div>

        {loadingMenu ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
          </div>
        ) : !selectedRestaurantId ? (
          <p className="text-sm text-slate-500">Select a restaurant to view menu.</p>
        ) : loadingCategories ? (
          <p className="text-sm text-slate-500">Loading categories...</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-slate-500">No menu sections yet.</p>
        ) : !selectedSectionViewKey ? (
          <p className="text-sm text-slate-500">Select a category to load foods.</p>
        ) : (
          <div className="space-y-5">
            {visibleSections.map((section, sectionIndex) => (
              <div key={section.id || section.name} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-800">{section.name || "Unnamed Section"}</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {(section.items || []).map(renderItemRow)}
                  {(section.subsections || []).map((subsection, subsectionIndex) => (
                    <div key={subsection.id || `${sectionIndex}-${subsectionIndex}`} className="px-4 py-2.5 bg-slate-50/40">
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
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {selectedRestaurant?.name ? `${selectedRestaurant.name} Add-ons` : "Add-ons"}
          </h2>
          {selectedRestaurantId ? (
            <button
              type="button"
              onClick={() => setAddonsRequested(true)}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {addonsRequested ? "Refresh Add-ons" : "Load Add-ons"}
            </button>
          ) : null}
        </div>

        {loadingAddons ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
          </div>
        ) : !selectedRestaurantId ? (
          <p className="text-sm text-slate-500">Select a restaurant to view add-ons.</p>
        ) : !addonsRequested ? (
          <p className="text-sm text-slate-500">Click "Load Add-ons" to fetch add-ons.</p>
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
                <MenuImage
                  src={imagePreview}
                  alt={editForm.name || "Dish preview"}
                  className="h-full w-full object-cover"
                  fallback={<span className="text-sm text-slate-400">No image</span>}
                />
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
