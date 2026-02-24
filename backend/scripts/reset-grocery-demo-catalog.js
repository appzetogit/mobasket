import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import GroceryCategory from '../modules/grocery/models/GroceryCategory.js';
import GrocerySubcategory from '../modules/grocery/models/GrocerySubcategory.js';
import GroceryProduct from '../modules/grocery/models/GroceryProduct.js';
import { groceryDemoCatalog } from './data/grocery-demo-catalog-data.js';

dotenv.config();

const slugify = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

function collectSlugs() {
  const categorySlugs = [];
  const subcategorySlugs = [];
  const productSlugs = [];

  groceryDemoCatalog.forEach((category) => {
    categorySlugs.push(slugify(category.name));
    (category.subcategories || []).forEach((subcategory) => {
      subcategorySlugs.push(slugify(subcategory.name));
    });
    (category.products || []).forEach((product) => {
      productSlugs.push(slugify(product.name));
    });
  });

  return {
    categorySlugs: Array.from(new Set(categorySlugs)),
    subcategorySlugs: Array.from(new Set(subcategorySlugs)),
    productSlugs: Array.from(new Set(productSlugs)),
  };
}

async function run() {
  try {
    await connectDB();
    const { categorySlugs, subcategorySlugs, productSlugs } = collectSlugs();

    const categories = await GroceryCategory.find({ slug: { $in: categorySlugs } }, { _id: 1 }).lean();
    const categoryIds = categories.map((item) => item._id);

    const deletedProducts = await GroceryProduct.deleteMany({
      $or: [{ category: { $in: categoryIds } }, { slug: { $in: productSlugs } }],
    });

    const deletedSubcategories = await GrocerySubcategory.deleteMany({
      $or: [
        { category: { $in: categoryIds } },
        { slug: { $in: subcategorySlugs }, category: { $in: categoryIds } },
      ],
    });

    const deletedCategories = await GroceryCategory.deleteMany({
      _id: { $in: categoryIds },
    });

    console.log('Grocery demo catalog reset completed.');
    console.log(
      `Deleted -> Categories: ${deletedCategories.deletedCount}, Subcategories: ${deletedSubcategories.deletedCount}, Products: ${deletedProducts.deletedCount}`
    );
    process.exit(0);
  } catch (error) {
    console.error('Failed to reset grocery demo catalog:', error);
    process.exit(1);
  }
}

run();

