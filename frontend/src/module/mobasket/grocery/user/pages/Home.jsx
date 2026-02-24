import { useEffect, useMemo, useState } from "react";
import HeroSection from "../components/HeroSection";
import SectionTitle from "../components/SectionTitle";
import CategoryGrid from "../components/CategoryGrid";
import { API_BASE_URL } from "@/lib/api/config";

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const fetchCategories = async () => {
      try {
        setIsLoading(true);
        setError("");

        const response = await fetch(`${API_BASE_URL}/grocery/categories`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        const payload = await response.json();
        setCategories(Array.isArray(payload?.data) ? payload.data : []);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError("Failed to load grocery categories.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();

    return () => {
      controller.abort();
    };
  }, []);

  const groupedCategories = useMemo(() => {
    const grouped = {};
    categories.forEach((category) => {
      const section = category.section || "Grocery & Kitchen";
      if (!grouped[section]) {
        grouped[section] = [];
      }
      grouped[section].push({
        title: category.name,
        image: category.image || "https://via.placeholder.com/80",
      });
    });
    return grouped;
  }, [categories]);

  return (
    <div className="pb-24 bg-white min-h-screen">
      <HeroSection />

      {isLoading && <p className="px-4 pb-4 text-sm text-gray-500">Loading categories...</p>}
      {!isLoading && error && <p className="px-4 pb-4 text-sm text-red-500">{error}</p>}
      {!isLoading && !error && Object.keys(groupedCategories).length === 0 && (
        <p className="px-4 pb-4 text-sm text-gray-500">No categories available.</p>
      )}

      {Object.entries(groupedCategories).map(([section, items]) => (
        <div key={section}>
          <SectionTitle title={section} />
          <CategoryGrid items={items} />
        </div>
      ))}
    </div>
  );
}
