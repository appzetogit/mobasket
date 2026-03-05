import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

let legacyAdminIndexCleanupPromise = null;

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    select: false // Don't return password by default
  },
  phone: {
    type: String,
    sparse: true,
    trim: true
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  profileImage: {
    type: String
  },
  permissions: {
    type: [String],
    enum: [
      'dashboard_view',
      'admin_manage',
      'restaurant_manage',
      'delivery_manage',
      'order_manage',
      'user_manage',
      'report_view',
      'settings_manage',
      'payment_manage',
      'campaign_manage'
    ],
    default: ['dashboard_view'] // Default permission
  },
  sidebarAccess: {
    type: [String],
    default: [],
    validate: {
      validator: function (value) {
        return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
      },
      message: 'sidebarAccess must be an array of strings'
    }
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator'],
    default: 'admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  loginCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
adminSchema.index({ email: 1 }, { unique: true });
adminSchema.index({ role: 1 });
adminSchema.index({ isActive: 1 });

// Hash password before saving
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  
  next();
});

// Method to compare password
adminSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to update last login
adminSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  this.loginCount = (this.loginCount || 0) + 1;
  await this.save();
};

// One-time cleanup for stale indexes from older schemas (e.g., unique mobile index).
adminSchema.statics.ensureLegacyIndexesCleaned = async function() {
  if (legacyAdminIndexCleanupPromise) {
    return legacyAdminIndexCleanupPromise;
  }

  legacyAdminIndexCleanupPromise = (async () => {
    try {
      const indexes = await this.collection.indexes();
      const mobileUniqueIndexes = indexes.filter((idx) => {
        const key = idx?.key || {};
        return idx?.unique === true && (Object.prototype.hasOwnProperty.call(key, 'mobile') || String(idx?.name || '').includes('mobile'));
      });

      for (const idx of mobileUniqueIndexes) {
        const indexName = idx?.name;
        if (!indexName || indexName === '_id_') continue;
        await this.collection.dropIndex(indexName);
      }
    } catch {
      // Ignore cleanup errors; create/update handlers will still return DB errors if any remain.
    }
  })();

  return legacyAdminIndexCleanupPromise;
};

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;

