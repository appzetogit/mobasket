import mongoose from 'mongoose';

const businessSettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      default: 'MoBasket'
    },
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      default: ''
    },
    phone: {
      countryCode: {
        type: String,
        required: false,
        default: '+91'
      },
      number: {
        type: String,
        required: false,
        trim: true,
        default: ''
      }
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    state: {
      type: String,
      trim: true,
      default: ''
    },
    pincode: {
      type: String,
      trim: true,
      default: ''
    },
    logo: {
      url: {
        type: String,
        default: ''
      },
      publicId: {
        type: String,
        default: ''
      }
    },
    favicon: {
      url: {
        type: String,
        default: ''
      },
      publicId: {
        type: String,
        default: ''
      }
    },
    policyLinks: {
      termsOfServiceUrl: {
        type: String,
        trim: true,
        default: ''
      },
      privacyPolicyUrl: {
        type: String,
        trim: true,
        default: ''
      },
      contentPolicyUrl: {
        type: String,
        trim: true,
        default: ''
      }
    },
    maintenanceMode: {
      isEnabled: {
        type: Boolean,
        default: false
      },
      startDate: {
        type: Date,
        default: null
      },
      endDate: {
        type: Date,
        default: null
      }
    },
    // Global Delivery Partner cash limit (applies to all delivery partners)
    // Used for "Available cash limit" in delivery Pocket/Wallet UI.
    deliveryCashLimit: {
      type: Number,
      default: 750,
      min: 0
    },
    // Minimum amount above which delivery boy can withdraw. Withdrawal allowed only when withdrawable amount >= this.
    deliveryWithdrawalLimit: {
      type: Number,
      default: 100,
      min: 0
    },
    // Minimum wallet balance delivery partner must retain after withdrawal.
    deliveryMinimumWalletBalance: {
      type: Number,
      default: 0,
      min: 0
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes
businessSettingsSchema.index({ createdAt: -1 });

// Ensure only one document exists
businessSettingsSchema.statics.getSettings = async function() {
  try {
    let settings = await this.findOne().sort({ updatedAt: -1, createdAt: -1 });
    if (!settings) {
      settings = await this.create({
        companyName: 'MoBasket',
        email: 'info@mobasket.com',
        phone: {
          countryCode: '+91',
          number: ''
        },
        deliveryCashLimit: 750,
        deliveryWithdrawalLimit: 100,
        deliveryMinimumWalletBalance: 0
      });
    } else {
      // Backfill missing fields for legacy settings docs so delivery app doesn't get zero/undefined limits.
      let shouldSave = false;
      if (!Number.isFinite(Number(settings.deliveryCashLimit)) || Number(settings.deliveryCashLimit) < 0) {
        settings.deliveryCashLimit = 750;
        shouldSave = true;
      }
      if (!Number.isFinite(Number(settings.deliveryWithdrawalLimit)) || Number(settings.deliveryWithdrawalLimit) < 0) {
        settings.deliveryWithdrawalLimit = 100;
        shouldSave = true;
      }
      if (!Number.isFinite(Number(settings.deliveryMinimumWalletBalance)) || Number(settings.deliveryMinimumWalletBalance) < 0) {
        settings.deliveryMinimumWalletBalance = 0;
        shouldSave = true;
      }
      if (shouldSave) {
        await settings.save();
      }
    }
    return settings;
  } catch (error) {
    console.error('Error in getSettings:', error);
    // If creation fails, try to return existing or create minimal document
    let settings = await this.findOne();
    if (!settings) {
      // Create with minimal required fields
      settings = new this({
        companyName: 'MoBasket',
        email: 'info@mobasket.com',
        phone: {
          countryCode: '+91',
          number: ''
        },
        deliveryCashLimit: 750,
        deliveryWithdrawalLimit: 100,
        deliveryMinimumWalletBalance: 0
      });
      await settings.save();
    }
    return settings;
  }
};

export default mongoose.model('BusinessSettings', businessSettingsSchema);

