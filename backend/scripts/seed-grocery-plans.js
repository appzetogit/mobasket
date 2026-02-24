import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import GroceryPlan from '../modules/grocery/models/GroceryPlan.js';

dotenv.config();

const plans = [
  {
    key: 'moweek',
    name: 'MoWeek',
    description: 'Perfect starter pack for weekly essentials',
    itemsLabel: '21 items',
    productCount: 21,
    deliveries: 4,
    frequency: 'Weekly',
    price: 999,
    durationDays: 7,
    iconKey: 'zap',
    color: 'bg-emerald-500',
    headerColor: 'bg-emerald-500',
    popular: false,
    benefits: ['Free delivery on all orders', 'Save up to Rs 200', 'Weekly fresh produce'],
    products: [
      { name: 'Rice (Premium)', qty: '1 kg • weekly' },
      { name: 'Wheat Flour', qty: '1 kg • weekly' },
      { name: 'Toor Dal', qty: '500 g • weekly' },
      { name: 'Cooking Oil', qty: '1 L • biweekly' },
      { name: 'Milk', qty: '1 L • daily' },
      { name: 'Eggs', qty: '6 pcs • biweekly' },
    ],
    order: 0,
    isActive: true,
  },
  {
    key: 'mobasic',
    name: 'MoBasic',
    description: 'Monthly essentials for small families',
    itemsLabel: '31 items',
    productCount: 31,
    deliveries: 12,
    frequency: 'Bi-Weekly',
    price: 2999,
    durationDays: 30,
    iconKey: 'check',
    color: 'bg-blue-600',
    headerColor: 'bg-blue-600',
    popular: false,
    benefits: ['Free delivery on all orders', 'Save up to Rs 500', 'Priority slots available'],
    products: [
      { name: 'Rice (Premium)', qty: '5 kg • monthly' },
      { name: 'Wheat Flour', qty: '5 kg • monthly' },
      { name: 'Sugar', qty: '2 kg • monthly' },
      { name: 'Salt', qty: '1 kg • monthly' },
    ],
    order: 1,
    isActive: true,
  },
  {
    key: 'mogold',
    name: 'MoGold',
    description: 'Complete family package with premium items',
    itemsLabel: '51 items',
    productCount: 51,
    deliveries: 20,
    frequency: 'Weekly',
    price: 4999,
    durationDays: 30,
    iconKey: 'star',
    color: 'bg-amber-500',
    headerColor: 'bg-amber-500',
    popular: true,
    benefits: ['Free delivery on all orders', 'Save up to Rs 1200', 'Premium fresh produce', 'Dedicated support'],
    products: [
      { name: 'Basmati Rice', qty: '5 kg • monthly' },
      { name: 'Premium Flour', qty: '10 kg • monthly' },
      { name: 'Exotic Veggies', qty: 'Weekly basket' },
      { name: 'Dry Fruits', qty: '500g mix • monthly' },
    ],
    order: 2,
    isActive: true,
  },
  {
    key: 'movip',
    name: 'MoVIP',
    description: 'Luxury subscription for large families',
    itemsLabel: '77 items',
    productCount: 77,
    deliveries: 30,
    frequency: 'Daily',
    price: 8499,
    durationDays: 30,
    iconKey: 'crown',
    color: 'bg-purple-500',
    headerColor: 'bg-purple-500',
    popular: false,
    benefits: ['Instant delivery anytime', 'Save up to Rs 2500', 'Personal nutritionist', 'All-access pass'],
    products: [
      { name: 'Organic Rice', qty: '10 kg • monthly' },
      { name: 'Organic Flour', qty: '10 kg • monthly' },
      { name: 'Imported Cheese', qty: 'Weekly selection' },
      { name: 'Organic Milk', qty: '2 L • daily' },
    ],
    order: 3,
    isActive: true,
  },
];

async function run() {
  try {
    await connectDB();
    for (const plan of plans) {
      await GroceryPlan.findOneAndUpdate({ key: plan.key }, plan, {
        upsert: true,
        new: true,
        runValidators: true,
      });
      console.log(`Seeded plan: ${plan.name}`);
    }
    console.log('Grocery plans seeding completed.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed grocery plans:', error);
    process.exit(1);
  }
}

run();
