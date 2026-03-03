import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';
import Restaurant from '../../restaurant/models/Restaurant.js';

const GROCERY_PLATFORM = 'mogrocery';
const GROCERY_STORE_COLLECTION = process.env.GROCERY_STORE_COLLECTION || 'grocery_stores';

const withGroceryPlatform = (query = {}) => ({
  ...query,
  platform: GROCERY_PLATFORM
});

const locationSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  coordinates: {
    type: [Number],
    default: undefined
  },
  formattedAddress: String,
  address: String,
  addressLine1: String,
  addressLine2: String,
  area: String,
  city: String,
  state: String,
  landmark: String,
  zipCode: String,
  pincode: String,
  postalCode: String,
  street: String
}, { _id: false });

const deliveryTimingsSchema = new mongoose.Schema({
  openingTime: String,
  closingTime: String
}, { _id: false });

const groceryStoreSchema = new mongoose.Schema({
  restaurantId: {
    type: String,
    unique: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    required: function requiredEmail() {
      return !this.phone && !this.googleId;
    }
  },
  phone: {
    type: String,
    trim: true,
    required: function requiredPhone() {
      return !this.email && !this.googleId;
    }
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    select: false
  },
  googleId: String,
  googleEmail: {
    type: String,
    sparse: true
  },
  fcmTokenWeb: {
    type: String,
    trim: true,
    default: ''
  },
  fcmTokenMobile: {
    type: String,
    trim: true,
    default: ''
  },
  signupMethod: {
    type: String,
    enum: ['google', 'phone', 'email'],
    default: null
  },
  ownerName: {
    type: String,
    required: true
  },
  ownerEmail: {
    type: String,
    default: ''
  },
  ownerPhone: {
    type: String,
    required: function requiredOwnerPhone() {
      return !!this.phone;
    }
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  platform: {
    type: String,
    enum: [GROCERY_PLATFORM],
    default: GROCERY_PLATFORM,
    immutable: true,
    index: true
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  primaryContactNumber: String,
  location: locationSchema,
  profileImage: {
    url: String,
    publicId: String
  },
  menuImages: [
    {
      url: String,
      publicId: String
    }
  ],
  cuisines: [String],
  deliveryTimings: deliveryTimingsSchema,
  openDays: [String],
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isAcceptingOrders: {
    type: Boolean,
    default: true
  },
  onboarding: {
    step1: mongoose.Schema.Types.Mixed,
    step2: mongoose.Schema.Types.Mixed,
    step3: mongoose.Schema.Types.Mixed,
    step4: mongoose.Schema.Types.Mixed,
    completedSteps: {
      type: Number,
      default: 0
    },
    storeImage: mongoose.Schema.Types.Mixed,
    additionalImages: [mongoose.Schema.Types.Mixed]
  },
  rejectionReason: {
    type: String,
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  businessModel: {
    type: String,
    enum: ['Commission Base', 'Subscription Base'],
    default: 'Commission Base'
  }
}, {
  timestamps: true,
  collection: GROCERY_STORE_COLLECTION
});

// Always scope GroceryStore model queries to mogrocery.
const applyPlatformGuard = function applyPlatformGuard() {
  const current = this.getQuery() || {};
  this.setQuery(withGroceryPlatform(current));
};

groceryStoreSchema.pre('find', applyPlatformGuard);
groceryStoreSchema.pre('findOne', applyPlatformGuard);
groceryStoreSchema.pre('findOneAndUpdate', applyPlatformGuard);
groceryStoreSchema.pre('findOneAndDelete', applyPlatformGuard);
groceryStoreSchema.pre('countDocuments', applyPlatformGuard);
groceryStoreSchema.pre('exists', applyPlatformGuard);
groceryStoreSchema.pre('updateOne', applyPlatformGuard);
groceryStoreSchema.pre('updateMany', applyPlatformGuard);

groceryStoreSchema.pre('save', async function onSave(next) {
  if (!this.restaurantId) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    this.restaurantId = `GST-${timestamp}-${random}`;
  }

  this.platform = GROCERY_PLATFORM;

  if (this.isModified('phone') && this.phone) {
    const normalized = normalizePhoneNumber(this.phone);
    if (normalized) this.phone = normalized;
  }

  if (this.isModified('ownerPhone') && this.ownerPhone) {
    const normalized = normalizePhoneNumber(this.ownerPhone);
    if (normalized) this.ownerPhone = normalized;
  }

  if (this.isModified('primaryContactNumber') && this.primaryContactNumber) {
    const normalized = normalizePhoneNumber(this.primaryContactNumber);
    if (normalized) this.primaryContactNumber = normalized;
  }

  if (this.name && !this.slug) {
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    if (!baseSlug) {
      baseSlug = `grocery-store-${this.restaurantId || Date.now()}`;
    }
    this.slug = baseSlug;
  }

  if (this.phone && !this.email && (this.signupMethod === 'phone' || !this.signupMethod)) {
    if (this.email === null || this.email === undefined) {
      this.$unset = this.$unset || {};
      this.$unset.email = '';
    }
  }

  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  if (!this.ownerEmail && this.phone && !this.email) {
    this.ownerEmail = `${this.phone.replace(/\D/g, '')}@store.mobasket.com`;
  }

  if (this.email && !this.ownerEmail) {
    this.ownerEmail = this.email;
  }

  next();
});

groceryStoreSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

const GroceryStore = mongoose.model('GroceryStore', groceryStoreSchema);

const toHydratableDoc = (legacyDoc) => {
  if (!legacyDoc) return null;
  const plain = legacyDoc.toObject ? legacyDoc.toObject() : { ...legacyDoc };
  delete plain.__v;
  plain.platform = GROCERY_PLATFORM;
  return plain;
};

const hydrateOneFromLegacy = async (legacyQuery = {}, projection = null) => {
  const query = withGroceryPlatform(legacyQuery);
  const legacyDoc = await Restaurant.findOne(query).select('+password').lean();
  if (!legacyDoc) return null;

  const normalized = toHydratableDoc(legacyDoc);
  const { _id, ...rest } = normalized;
  await GroceryStore.updateOne(
    { _id },
    { $set: rest },
    { upsert: true, setDefaultsOnInsert: true }
  );

  const doc = await GroceryStore.findById(_id, projection);
  return doc;
};

export const hydrateGroceryStoreFromLegacy = async (legacyQuery = {}, projection = null) =>
  hydrateOneFromLegacy(legacyQuery, projection);

export const hydrateGroceryStoreByIdFromLegacy = async (id, projection = null) =>
  hydrateOneFromLegacy({ _id: id }, projection);

export { GROCERY_PLATFORM, withGroceryPlatform };
export default GroceryStore;
