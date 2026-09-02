import mongoose from 'mongoose';

const mofoodProductSectionItemSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ['mofood', 'mogrocery'],
      default: 'mofood',
      index: true,
    },
    sectionName: {
      type: String,
      required: true,
      trim: true,
    },
    sectionOrder: {
      type: Number,
      default: 0,
    },
    // Food entries belong to a Restaurant; grocery entries belong to a
    // GroceryStore, which is a different collection. Forcing a store id into
    // restaurantId would populate to null and the item would be dropped on read,
    // so each platform has its own reference and neither is required outright.
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      default: null,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryStore',
      default: null,
      index: true,
    },
    // Food items are addressed by their id within the restaurant's menu.
    // Grocery entries carry productId instead, so this is validated per
    // platform in the controller rather than being required outright.
    menuItemId: {
      type: String,
      default: '',
      trim: true,
    },
    // Set for mogrocery entries.
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryProduct',
      default: null,
      index: true,
    },
    menuItemName: {
      type: String,
      default: '',
      trim: true,
    },
    menuItemImage: {
      type: String,
      default: '',
      trim: true,
    },
    menuItemPrice: {
      type: Number,
      default: 0,
    },
    menuItemOriginalPrice: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Optional scheduling window, used by sections such as Today's Offer.
    // Null on either side means unbounded in that direction.
    startsAt: {
      type: Date,
      default: null,
    },
    endsAt: {
      type: Date,
      default: null,
    },
    // Vendors may curate their own items, so record who added the entry to keep
    // vendor edits scoped to their own restaurant.
    addedByRole: {
      type: String,
      enum: ['admin', 'vendor'],
      default: 'admin',
    },
  },
  {
    timestamps: true,
  }
);

mofoodProductSectionItemSchema.index({ platform: 1, sectionOrder: 1, sectionName: 1, order: 1, isActive: 1 });

// sectionName is part of the key so one product can appear in several sections -
// Hot Deals and Today's Offer, for example. Without it a product could only ever
// belong to a single section.
mofoodProductSectionItemSchema.index(
  { platform: 1, sectionName: 1, restaurantId: 1, storeId: 1, menuItemId: 1, productId: 1 },
  { unique: true },
);

export default mongoose.model('MofoodProductSectionItem', mofoodProductSectionItemSchema);
