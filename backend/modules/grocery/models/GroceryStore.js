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

const normalizeRatingStats = (rating, totalRatings) => {
  const normalizedRating = Number.isFinite(Number(rating))
    ? Math.max(0, Math.min(5, Number(rating)))
    : 0;
  const normalizedTotalRatings = Number.isFinite(Number(totalRatings))
    ? Math.max(0, Math.floor(Number(totalRatings)))
    : 0;

  return {
    rating: normalizedRating,
    totalRatings: normalizedTotalRatings
  };
};

const isPointInZone = (zone, lat, lng) => {
  if (!zone.boundary || !zone.boundary.coordinates || !zone.boundary.coordinates[0]) {
    return false;
  }
  const coords = zone.boundary.coordinates[0];
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = Number(coords[i][0]), yi = Number(coords[i][1]);
    const xj = Number(coords[j][0]), yj = Number(coords[j][1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

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
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    default: null,
    index: true
  },
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

const canHardDeleteBusinessEntities = () => process.env.ALLOW_HARD_DELETE_BUSINESS_ENTITIES === 'true';

const blockGroceryStoreHardDelete = function blockGroceryStoreHardDelete(next) {
  if (canHardDeleteBusinessEntities()) return next();
  const error = new Error(
    'Hard delete blocked for GroceryStore. Use soft delete (isActive=false) or set ALLOW_HARD_DELETE_BUSINESS_ENTITIES=true explicitly.'
  );
  error.code = 'GROCERY_STORE_HARD_DELETE_BLOCKED';
  return next(error);
};

groceryStoreSchema.pre('find', applyPlatformGuard);
groceryStoreSchema.pre('findOne', applyPlatformGuard);
groceryStoreSchema.pre('findOneAndUpdate', applyPlatformGuard);
groceryStoreSchema.pre('findOneAndDelete', applyPlatformGuard);
groceryStoreSchema.pre('countDocuments', applyPlatformGuard);
groceryStoreSchema.pre('exists', applyPlatformGuard);
groceryStoreSchema.pre('updateOne', applyPlatformGuard);
groceryStoreSchema.pre('updateMany', applyPlatformGuard);
groceryStoreSchema.pre('deleteOne', applyPlatformGuard);
groceryStoreSchema.pre('deleteMany', applyPlatformGuard);

groceryStoreSchema.pre('deleteOne', { document: true, query: false }, blockGroceryStoreHardDelete);
groceryStoreSchema.pre('deleteOne', { document: false, query: true }, blockGroceryStoreHardDelete);
groceryStoreSchema.pre('deleteMany', blockGroceryStoreHardDelete);
groceryStoreSchema.pre('findOneAndDelete', blockGroceryStoreHardDelete);
groceryStoreSchema.pre('findByIdAndDelete', blockGroceryStoreHardDelete);

const normalizeStoreRatingInUpdate = function normalizeStoreRatingInUpdate(next) {
  const update = this.getUpdate ? this.getUpdate() : null;
  if (!update || typeof update !== 'object') return next();

  const directHasRating = Object.prototype.hasOwnProperty.call(update, 'rating');
  const directHasTotalRatings = Object.prototype.hasOwnProperty.call(update, 'totalRatings');
  const setPayload = update.$set && typeof update.$set === 'object' ? update.$set : null;
  const setHasRating = !!setPayload && Object.prototype.hasOwnProperty.call(setPayload, 'rating');
  const setHasTotalRatings = !!setPayload && Object.prototype.hasOwnProperty.call(setPayload, 'totalRatings');

  if (!directHasRating && !directHasTotalRatings && !setHasRating && !setHasTotalRatings) {
    return next();
  }

  const currentRating = setHasRating ? setPayload.rating : (directHasRating ? update.rating : undefined);
  const currentTotalRatings = setHasTotalRatings ? setPayload.totalRatings : (directHasTotalRatings ? update.totalRatings : undefined);
  const normalized = normalizeRatingStats(currentRating, currentTotalRatings);

  const nextSetPayload = {
    ...(setPayload || {}),
    rating: normalized.rating,
    totalRatings: normalized.totalRatings
  };
  this.setUpdate({
    ...update,
    $set: nextSetPayload
  });

  if (directHasRating) delete this.getUpdate().rating;
  if (directHasTotalRatings) delete this.getUpdate().totalRatings;

  return next();
};

groceryStoreSchema.pre('findOneAndUpdate', normalizeStoreRatingInUpdate);
groceryStoreSchema.pre('updateOne', normalizeStoreRatingInUpdate);
groceryStoreSchema.pre('updateMany', normalizeStoreRatingInUpdate);

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

  const normalizedRatingStats = normalizeRatingStats(this.rating, this.totalRatings);
  this.rating = normalizedRatingStats.rating;
  this.totalRatings = normalizedRatingStats.totalRatings;

  // Auto-detect zoneId if coordinates are present and zoneId is missing or location changed
  if ((this.isModified('location') || !this.zoneId) && this.location?.latitude && this.location?.longitude) {
    try {
      const Zone = mongoose.model('Zone');
      const activeZones = await Zone.find({ isActive: true, platform: GROCERY_PLATFORM }).lean();
      let matchedZoneId = null;
      for (const zone of activeZones) {
        if (isPointInZone(zone, this.location.latitude, this.location.longitude)) {
          matchedZoneId = zone._id;
          break;
        }
      }
      if (matchedZoneId) {
        this.zoneId = matchedZoneId;
      }
    } catch (err) {
      console.error('Error auto-detecting zone for grocery store:', err.message);
    }
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
