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

const catalog = groceryDemoCatalog;

async function fetchWikiImage(query) {
  const title = encodeURIComponent(query.trim());
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MoBasketSeedScript/1.0 (Grocery catalog seed)' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return '';
    }

    const data = await response.json();
    return data?.originalimage?.source || data?.thumbnail?.source || '';
  } catch {
    return '';
  }
}

async function upsertCatalog() {
  let categoriesUpserted = 0;
  let subcategoriesUpserted = 0;
  let productsUpserted = 0;

  for (let categoryOrder = 0; categoryOrder < catalog.length; categoryOrder += 1) {
    const categoryData = catalog[categoryOrder];
    const categorySlug = slugify(categoryData.name);
    const categoryImage = await fetchWikiImage(categoryData.imageQuery || categoryData.name);

    const category = await GroceryCategory.findOneAndUpdate(
      { slug: categorySlug },
      {
        name: categoryData.name,
        slug: categorySlug,
        section: categoryData.section || 'Grocery & Kitchen',
        image: categoryImage,
        order: categoryOrder,
        isActive: true,
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );
    categoriesUpserted += 1;

    const subcategoryMap = new Map();
    const subcategoryList = Array.isArray(categoryData.subcategories) ? categoryData.subcategories : [];
    for (let subcategoryOrder = 0; subcategoryOrder < subcategoryList.length; subcategoryOrder += 1) {
      const subcategoryData = subcategoryList[subcategoryOrder];
      const subcategorySlug = slugify(subcategoryData.name);
      const subcategoryImage = await fetchWikiImage(subcategoryData.imageQuery || subcategoryData.name);

      const subcategory = await GrocerySubcategory.findOneAndUpdate(
        { category: category._id, slug: subcategorySlug },
        {
          category: category._id,
          name: subcategoryData.name,
          slug: subcategorySlug,
          image: subcategoryImage,
          order: subcategoryOrder,
          isActive: true,
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

      subcategoryMap.set(subcategoryData.name, subcategory);
      subcategoriesUpserted += 1;
    }

    const productList = Array.isArray(categoryData.products) ? categoryData.products : [];
    for (let productOrder = 0; productOrder < productList.length; productOrder += 1) {
      const productData = productList[productOrder];
      const productSlug = slugify(productData.name);
      const productImage = await fetchWikiImage(productData.imageQuery || productData.name);
      const subcategoryDoc = subcategoryMap.get(productData.subcategory);
      const subcategoryIds = subcategoryDoc?._id ? [subcategoryDoc._id] : [];

      await GroceryProduct.findOneAndUpdate(
        { slug: productSlug },
        {
          category: category._id,
          subcategory: subcategoryDoc?._id || null,
          subcategories: subcategoryIds,
          name: productData.name,
          slug: productSlug,
          images: productImage ? [productImage] : [],
          mrp: Number(productData.mrp),
          sellingPrice: Number(productData.sellingPrice),
          unit: productData.unit || '',
          isActive: true,
          inStock: true,
          stockQuantity: Number(productData.stockQuantity || 0),
          order: productOrder,
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );
      productsUpserted += 1;
    }
  }

  return {
    categoriesUpserted,
    subcategoriesUpserted,
    productsUpserted,
  };
}

async function run() {
  try {
    await connectDB();
    const result = await upsertCatalog();
    console.log('Grocery demo catalog seeded successfully.');
    console.log(
      `Categories: ${result.categoriesUpserted}, Subcategories: ${result.subcategoriesUpserted}, Products: ${result.productsUpserted}`
    );
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed grocery demo catalog:', error);
    process.exit(1);
  }
}

run();
