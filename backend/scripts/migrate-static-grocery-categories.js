import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import GroceryCategory from '../modules/grocery/models/GroceryCategory.js';
import GrocerySubcategory from '../modules/grocery/models/GrocerySubcategory.js';

dotenv.config();

const slugify = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const staticCategoryDirectory = [
  {
    categoryName: 'Grocery & Kitchen',
    subcategories: [
      'Vegetables & Fruits',
      'Atta, Rice & Dal',
      'Oil, Ghee & Masala',
      'Dairy, Bread & Eggs',
    ],
  },
  {
    categoryName: 'Snacks & Drinks',
    subcategories: [
      'Bakery & Biscuits',
      'Dry Fruits & Cereals',
      'Chicken, Meat & Fish',
      'Kitchenware & Appliances',
      'Chips & Namkeen',
      'Sweets & Chocolates',
      'Drinks & Juices',
      'Tea, Coffee & Milk Drinks',
      'Instant Food',
      'Sauces & Spreads',
      'Paan Corner',
      'Ice Creams & More',
    ],
  },
  {
    categoryName: 'Beauty & Personal Care',
    subcategories: ['Beauty & Cosmetics', 'Cleaning & Household'],
  },
];

async function migrateStaticDirectoryToDb() {
  try {
    await connectDB();

    let categoryCount = 0;
    let subcategoryCount = 0;

    for (let categoryOrder = 0; categoryOrder < staticCategoryDirectory.length; categoryOrder += 1) {
      const entry = staticCategoryDirectory[categoryOrder];
      const categorySlug = slugify(entry.categoryName);

      const category = await GroceryCategory.findOneAndUpdate(
        { slug: categorySlug },
        {
          name: entry.categoryName,
          slug: categorySlug,
          section: entry.categoryName,
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

      categoryCount += 1;

      for (let subcategoryOrder = 0; subcategoryOrder < entry.subcategories.length; subcategoryOrder += 1) {
        const subcategoryName = entry.subcategories[subcategoryOrder];
        const subcategorySlug = slugify(subcategoryName);

        await GrocerySubcategory.findOneAndUpdate(
          {
            category: category._id,
            slug: subcategorySlug,
          },
          {
            category: category._id,
            name: subcategoryName,
            slug: subcategorySlug,
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

        subcategoryCount += 1;
      }
    }

    console.log(`Migration complete. Categories upserted: ${categoryCount}, subcategories upserted: ${subcategoryCount}`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to migrate static grocery categories:', error);
    process.exit(1);
  }
}

migrateStaticDirectoryToDb();
