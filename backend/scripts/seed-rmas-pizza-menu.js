import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';

dotenv.config();

const TARGET_RESTAURANT_ID = 'REST000063';

const normalize = (value) => String(value || '').trim().toLowerCase();
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createItem = (name, price, sectionName, foodType, description = '') => ({
  id: generateId('item'),
  name,
  nameArabic: '',
  image: '',
  images: [],
  category: sectionName,
  rating: 0,
  reviews: 0,
  price: Number(price),
  stock: 'Unlimited',
  discount: null,
  originalPrice: null,
  foodType,
  availabilityTimeStart: '12:01 AM',
  availabilityTimeEnd: '11:57 PM',
  description,
  discountType: 'Percent',
  discountAmount: 0,
  isAvailable: true,
  isRecommended: false,
  variations: [],
  tags: [],
  nutrition: [],
  allergies: [],
  photoCount: 0,
  subCategory: '',
  servesInfo: '',
  itemSize: '',
  itemSizeQuantity: '',
  itemSizeUnit: 'piece',
  gst: 0,
  preparationTime: '',
  approvalStatus: 'approved',
  rejectionReason: '',
  requestedAt: new Date(),
  approvedAt: new Date(),
  rejectedAt: null,
});

const seedSections = [
  {
    name: 'CHICKEN',
    items: [
      createItem('Fried Chicken 2 pcs', 170, 'CHICKEN', 'Non-Veg'),
      createItem('Fried Chicken 5 pcs', 390, 'CHICKEN', 'Non-Veg'),
      createItem('Fried Chicken 9 pcs', 720, 'CHICKEN', 'Non-Veg'),
      createItem('Grilled Chicken 2 pcs', 170, 'CHICKEN', 'Non-Veg'),
      createItem('Grilled Chicken 5 pcs', 390, 'CHICKEN', 'Non-Veg'),
      createItem('Grilled Chicken 9 pcs', 720, 'CHICKEN', 'Non-Veg'),
      createItem('Fried Chicken Lollipop 4 pcs', 240, 'CHICKEN', 'Non-Veg'),
      createItem('Fried Chicken Lollipop 6 pcs', 360, 'CHICKEN', 'Non-Veg'),
      createItem('Chicken Wings 4 pcs', 150, 'CHICKEN', 'Non-Veg'),
      createItem('Chicken Wings 6 pcs', 220, 'CHICKEN', 'Non-Veg'),
    ],
  },
  {
    name: 'GARLIC BREADS',
    items: [
      createItem('Garlic Bread With Cheese (2 pcs)', 80, 'GARLIC BREADS', 'Veg'),
      createItem('Garlic Bread With Cheese (4 pcs)', 150, 'GARLIC BREADS', 'Veg'),
      createItem('Garlic Bread Supreme (2 pcs)', 90, 'GARLIC BREADS', 'Veg'),
      createItem('Garlic Bread Supreme (4 pcs)', 160, 'GARLIC BREADS', 'Veg'),
      createItem('Chicken Garlic Bread With Cheese (2 pcs)', 90, 'GARLIC BREADS', 'Non-Veg'),
      createItem('Chicken Garlic Bread With Cheese (4 pcs)', 160, 'GARLIC BREADS', 'Non-Veg'),
      createItem('Chicken Garlic Bread Supreme (2 pcs)', 100, 'GARLIC BREADS', 'Non-Veg'),
      createItem('Chicken Garlic Bread Supreme (4 pcs)', 170, 'GARLIC BREADS', 'Non-Veg'),
    ],
  },
  {
    name: 'MOMOS',
    items: [
      createItem('Veg Momos (4 pcs)', 120, 'MOMOS', 'Veg'),
      createItem('Veg Momos (6 pcs)', 180, 'MOMOS', 'Veg'),
      createItem('Chicken Momos (4 pcs)', 140, 'MOMOS', 'Non-Veg'),
      createItem('Chicken Momos (6 pcs)', 210, 'MOMOS', 'Non-Veg'),
      createItem('Spring Rolls (4 pcs)', 100, 'MOMOS', 'Veg'),
      createItem('Spring Rolls (6 pcs)', 150, 'MOMOS', 'Veg'),
    ],
  },
  {
    name: 'APPETIZERS',
    items: [
      createItem('French Fries', 100, 'APPETIZERS', 'Veg'),
      createItem('Masala French Fries', 110, 'APPETIZERS', 'Veg'),
      createItem('Cheese French Fries', 140, 'APPETIZERS', 'Veg'),
      createItem('Chilli Potato Balls (8 pcs)', 110, 'APPETIZERS', 'Veg'),
      createItem('Veg Nuggets', 120, 'APPETIZERS', 'Veg'),
      createItem('Paneer Popcorn (8 pcs)', 150, 'APPETIZERS', 'Veg'),
      createItem('Chicken Popcorn (8 pcs)', 170, 'APPETIZERS', 'Non-Veg'),
      createItem('Chicken Nuggets', 185, 'APPETIZERS', 'Non-Veg'),
    ],
  },
  {
    name: 'WRAPS',
    items: [
      createItem('Potato Wraps', 120, 'WRAPS', 'Veg'),
      createItem('Paneer Wraps', 150, 'WRAPS', 'Veg'),
      createItem('Chicken Wraps', 160, 'WRAPS', 'Non-Veg'),
      createItem("Ram's Special Chicken Wraps", 170, 'WRAPS', 'Non-Veg'),
    ],
  },
  {
    name: 'VEG PIZZA',
    items: [
      createItem('Margherita Pizza (Small)', 100, 'VEG PIZZA', 'Veg'),
      createItem('Margherita Pizza (Large)', 150, 'VEG PIZZA', 'Veg'),
      createItem('Classic Pizza (Small)', 130, 'VEG PIZZA', 'Veg', 'Onion, tomato, capsicum'),
      createItem('Classic Pizza (Large)', 180, 'VEG PIZZA', 'Veg', 'Onion, tomato, capsicum'),
      createItem('Spicy Paneer Pizza (Small)', 150, 'VEG PIZZA', 'Veg', 'Green chilli, onion, tomato, capsicum'),
      createItem('Spicy Paneer Pizza (Large)', 210, 'VEG PIZZA', 'Veg', 'Green chilli, onion, tomato, capsicum'),
      createItem('Paneer Pepper Pizza (Small)', 150, 'VEG PIZZA', 'Veg', 'Paneer, onion, tomato, capsicum'),
      createItem('Paneer Pepper Pizza (Large)', 210, 'VEG PIZZA', 'Veg', 'Paneer, onion, tomato, capsicum'),
      createItem('Veg Corn Pizza (Small)', 170, 'VEG PIZZA', 'Veg', 'Corn, black olives, onion, tomato, capsicum'),
      createItem('Veg Corn Pizza (Large)', 230, 'VEG PIZZA', 'Veg', 'Corn, black olives, onion, tomato, capsicum'),
      createItem('Mushroom Corn Pizza (Small)', 180, 'VEG PIZZA', 'Veg', 'Mushroom, corn, onion, red paprika'),
      createItem('Mushroom Corn Pizza (Large)', 240, 'VEG PIZZA', 'Veg', 'Mushroom, corn, onion, red paprika'),
      createItem("Ram's Special Pizza (Small)", 200, 'VEG PIZZA', 'Veg', 'Onion, tomato, capsicum, jalapeno, mushroom, corn'),
      createItem("Ram's Special Pizza (Large)", 260, 'VEG PIZZA', 'Veg', 'Onion, tomato, capsicum, jalapeno, mushroom, corn'),
      createItem("Ram's Special Double Cheese Burst Pizza (Small)", 220, 'VEG PIZZA', 'Veg', 'Cheese, corn, paprika, jalapeno'),
      createItem("Ram's Special Double Cheese Burst Pizza (Large)", 280, 'VEG PIZZA', 'Veg', 'Cheese, corn, paprika, jalapeno'),
      createItem('Extra Cheese Topping', 30, 'VEG PIZZA', 'Veg'),
    ],
  },
  {
    name: 'VEG BURGERS',
    items: [
      createItem('Veg Surprise Burger', 100, 'VEG BURGERS', 'Veg'),
      createItem('Cheese Veg Burger', 110, 'VEG BURGERS', 'Veg'),
      createItem('Crunchy Corn Burger', 110, 'VEG BURGERS', 'Veg'),
      createItem('Chilli Lava Burger', 120, 'VEG BURGERS', 'Veg'),
      createItem("Ram's Special Burger", 150, 'VEG BURGERS', 'Veg'),
      createItem('Premium Paneer Burger', 170, 'VEG BURGERS', 'Veg'),
    ],
  },
  {
    name: 'SANDWICH (VEG)',
    items: [
      createItem('Veg Grilled Sandwich', 100, 'SANDWICH (VEG)', 'Veg'),
      createItem('Paneer Tikka Sandwich', 120, 'SANDWICH (VEG)', 'Veg'),
      createItem('Italian Veg Sandwich', 140, 'SANDWICH (VEG)', 'Veg'),
    ],
  },
  {
    name: 'DRINKS',
    items: [
      createItem('Water (1/2 Ltr)', 15, 'DRINKS', 'Veg'),
      createItem('Water (1 Ltr)', 25, 'DRINKS', 'Veg'),
      createItem('Cool Drinks', 40, 'DRINKS', 'Veg'),
    ],
  },
  {
    name: 'MOCKTAILS',
    items: [
      createItem('Mint Mojito', 100, 'MOCKTAILS', 'Veg'),
      createItem('Blue Curacao', 100, 'MOCKTAILS', 'Veg'),
      createItem('Green Apple', 100, 'MOCKTAILS', 'Veg'),
      createItem('Black Currant', 100, 'MOCKTAILS', 'Veg'),
      createItem('Blue Berry', 100, 'MOCKTAILS', 'Veg'),
      createItem('Strawberry Blast', 100, 'MOCKTAILS', 'Veg'),
      createItem('Mango', 100, 'MOCKTAILS', 'Veg'),
      createItem('Pine Apple', 100, 'MOCKTAILS', 'Veg'),
    ],
  },
  {
    name: 'MILK SHAKES',
    items: [
      createItem('Vanilla Milk Shake', 105, 'MILK SHAKES', 'Veg'),
      createItem('Chocolate Milk Shake', 120, 'MILK SHAKES', 'Veg'),
      createItem('Strawberry Milk Shake', 110, 'MILK SHAKES', 'Veg'),
      createItem('Oreo Milk Shake', 130, 'MILK SHAKES', 'Veg'),
      createItem('Kitkat Milk Shake', 130, 'MILK SHAKES', 'Veg'),
      createItem('Butterscotch Milk Shake', 120, 'MILK SHAKES', 'Veg'),
      createItem('Black Currant Milk Shake', 150, 'MILK SHAKES', 'Veg'),
      createItem('American Nuts Milk Shake', 140, 'MILK SHAKES', 'Veg'),
      createItem('Cold Coffee', 110, 'MILK SHAKES', 'Veg'),
    ],
  },
  {
    name: 'COMBOS',
    items: [
      createItem('Veg Classic Pizza (Small) + French Fries + Coke', 240, 'COMBOS', 'Veg'),
      createItem('Chicken Classic Pizza (Small) + Chicken Popcorn + Coke', 330, 'COMBOS', 'Non-Veg'),
      createItem('Veg Classic Pizza (Small) + Veg Nuggets + Coke', 260, 'COMBOS', 'Veg'),
      createItem('Chicken Classic Pizza (Small) + Chicken Nuggets + Coke', 350, 'COMBOS', 'Non-Veg'),
      createItem('Veg Surprise Burger + French Fries + Coke', 210, 'COMBOS', 'Veg'),
      createItem('Veg Surprise Burger + Veg Nuggets + Coke', 240, 'COMBOS', 'Veg'),
      createItem('Cheese Corn Burger + Paneer Balls + Coke', 280, 'COMBOS', 'Veg'),
      createItem('Fried Chicken Burger + Chicken Pop Corn + Coke', 270, 'COMBOS', 'Non-Veg'),
    ],
  },
];

const upsertSectionItems = (menu, sectionSeed) => {
  const sectionName = sectionSeed.name;
  const sectionNameNorm = normalize(sectionName);

  let section = (menu.sections || []).find((s) => normalize(s.name) === sectionNameNorm);
  if (!section) {
    section = {
      id: generateId('section'),
      name: sectionName,
      items: [],
      subsections: [],
      isEnabled: true,
      order: (menu.sections || []).length,
    };
    menu.sections.push(section);
  }

  const currentItems = Array.isArray(section.items) ? section.items : [];
  const byName = new Map(currentItems.map((item) => [normalize(item.name), item]));

  for (const seedItem of sectionSeed.items) {
    const key = normalize(seedItem.name);
    const existing = byName.get(key);

    if (existing) {
      existing.price = seedItem.price;
      existing.foodType = seedItem.foodType;
      existing.description = seedItem.description || '';
      existing.category = sectionName;
      existing.isAvailable = true;
      existing.image = '';
      existing.images = [];
      existing.photoCount = 0;
      existing.approvalStatus = 'approved';
      existing.rejectionReason = '';
      existing.approvedAt = new Date();
      existing.rejectedAt = null;
      existing.requestedAt = existing.requestedAt || new Date();
    } else {
      currentItems.push(seedItem);
    }
  }

  section.items = currentItems;
};

const run = async () => {
  await connectDB();

  const restaurant = await Restaurant.findOne({
    $or: [{ restaurantId: TARGET_RESTAURANT_ID }, { slug: TARGET_RESTAURANT_ID }],
  });

  if (!restaurant) {
    throw new Error(`Restaurant not found for identifier: ${TARGET_RESTAURANT_ID}`);
  }

  let menu = await Menu.findOne({ restaurant: restaurant._id });
  if (!menu) {
    menu = new Menu({
      restaurant: restaurant._id,
      sections: [],
      addons: [],
      isActive: true,
    });
  }

  for (const sectionSeed of seedSections) {
    upsertSectionItems(menu, sectionSeed);
  }

  menu.markModified('sections');
  await menu.save();

  const totalSeedNames = new Set(
    seedSections.flatMap((section) => section.items.map((item) => normalize(item.name))),
  );
  const totalItemsNow = (menu.sections || []).reduce(
    (sum, section) => sum + (Array.isArray(section.items) ? section.items.length : 0),
    0,
  );

  console.log('Seed completed successfully.');
  console.log(`Restaurant: ${restaurant.name} (${restaurant.restaurantId})`);
  console.log(`Seeded/updated unique item names: ${totalSeedNames.size}`);
  console.log(`Menu sections touched: ${seedSections.length}`);
  console.log(`Total direct section items in menu now: ${totalItemsNow}`);
};

run()
  .catch((error) => {
    console.error('Failed to seed RMA\'S PIZZA menu:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors
    }
  });
