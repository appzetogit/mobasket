import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CategoryFoodsContent } from "./CategoryFoodsPage";

export default function GrocerySubcategoryProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { subcategoryId } = useParams();

  const initialCategory = String(location?.state?.categoryId || "all").trim() || "all";
  const initialSubcategoryId = String(subcategoryId || "").trim();

  return (
    <CategoryFoodsContent
      onClose={() => navigate(-1)}
      initialCategory={initialCategory}
      initialSubcategoryId={initialSubcategoryId}
    />
  );
}
