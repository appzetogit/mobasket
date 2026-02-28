import mongoose from 'mongoose';
import { sanitizePostOrderActions } from '../utils/postOrderActionsSanitizer.js';

const orderItemSchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  image: {
    type: String
  },
  description: {
    type: String
  },
  isVeg: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const pendingCartEditSchema = new mongoose.Schema({
  items: {
    type: [orderItemSchema],
    default: []
  },
  subtotal: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  additionalAmount: {
    type: Number,
    default: 0
  },
  requiresAdminReapproval: {
    type: Boolean,
    default: false
  },
  razorpayOrderId: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: null
  }
}, { _id: false });

const postOrderActionsSchema = new mongoose.Schema({
  modificationWindowStartAt: {
    type: Date,
    default: null
  },
  modificationWindowExpiresAt: {
    type: Date,
    default: null
  },
  lastCartEditedAt: {
    type: Date,
    default: null
  },
  cartEditCount: {
    type: Number,
    default: 0
  },
  pendingCartEdit: {
    type: pendingCartEditSchema,
    default: () => ({})
  }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
    // Note: unique: true automatically creates an index, so index: true is redundant
  },
  // Backward-compatibility field: some deployments still have a unique index on orderNumber.
  // Keep it synchronized with orderId to avoid duplicate-key conflicts.
  orderNumber: {
    type: String,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  restaurantId: {
    type: String,
    required: true
  },
  restaurantName: {
    type: String,
    required: true
  },
  items: {
    type: [orderItemSchema],
    required: true,
    validate: {
      validator: function (items) {
        return items && items.length > 0;
      },
      message: 'Order must have at least one item'
    }
  },
  address: {
    label: {
      type: String,
      enum: ['Home', 'Office', 'Other']
    },
    street: String,
    additionalDetails: String,
    city: String,
    state: String,
    zipCode: String,
    formattedAddress: String, // Complete formatted address from live location
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    }
  },
  pricing: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0
    },
    deliveryLayerType: {
      type: String,
      enum: ['inner', 'outer', 'outermost'],
      default: undefined
    },
    platformFee: {
      type: Number,
      default: 0,
      min: 0
    },
    tax: {
      type: Number,
      default: 0,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    couponCode: {
      type: String
    }
  },
  payment: {
    method: {
      type: String,
      enum: ['razorpay', 'cash', 'wallet', 'upi', 'card'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    razorpayOrderId: {
      type: String
    },
    razorpayPaymentId: {
      type: String
    },
    razorpaySignature: {
      type: String
    },
    transactionId: {
      type: String
    }
  },
  status: {
    type: String,
    enum: ['scheduled', 'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending',
    index: true
  },
  scheduledDelivery: {
    isScheduled: {
      type: Boolean,
      default: false,
      index: true
    },
    scheduledFor: {
      type: Date,
      default: null,
      index: true
    },
    timeSlot: {
      type: String,
      default: ''
    }
  },
  tracking: {
    confirmed: {
      status: { type: Boolean, default: false },
      timestamp: { type: Date }
    },
    preparing: {
      status: { type: Boolean, default: false },
      timestamp: { type: Date }
    },
    ready: {
      status: { type: Boolean, default: false },
      timestamp: { type: Date }
    },
    outForDelivery: {
      status: { type: Boolean, default: false },
      timestamp: { type: Date }
    },
    delivered: {
      status: { type: Boolean, default: false },
      timestamp: { type: Date }
    }
  },
  deliveryFleet: {
    type: String,
    enum: ['standard', 'fast', 'pure_veg'],
    default: 'standard'
  },
  note: {
    type: String
  },
  planSubscription: {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroceryPlan',
      default: null
    },
    planName: {
      type: String,
      default: ''
    },
    durationDays: {
      type: Number,
      default: 0
    },
    selectedOfferIds: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GroceryPlanOffer'
      }],
      default: []
    }
  },
  sendCutlery: {
    type: Boolean,
    default: true
  },
  deliveryPartnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Delivery'
  },
  estimatedDeliveryTime: {
    type: Number, // in minutes
    default: 30
  },
  // Enhanced ETA tracking
  eta: {
    min: {
      type: Number, // minimum ETA in minutes
      default: 25
    },
    max: {
      type: Number, // maximum ETA in minutes
      default: 30
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    additionalTime: {
      type: Number, // Additional time added by restaurant (in minutes)
      default: 0
    }
  },
  // Preparation time from menu items
  preparationTime: {
    type: Number, // Maximum preparation time from order items (in minutes)
    default: 0
  },
  deliveredAt: {
    type: Date
  },
  billImageUrl: {
    type: String,
    default: null
  },
  cancelledAt: {
    type: Date
  },
  cancellationReason: {
    type: String
  },
  cancelledBy: {
    type: String,
    enum: ['user', 'restaurant', 'admin'],
    default: null
  },
  adminApproval: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    reason: {
      type: String,
      default: ''
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  postOrderActions: {
    type: postOrderActionsSchema,
    default: () => ({})
  },
  stockSync: {
    grocery: {
      reduced: {
        type: Boolean,
        default: false
      },
      reducedAt: {
        type: Date,
        default: null
      },
      restored: {
        type: Boolean,
        default: false
      },
      restoredAt: {
        type: Date,
        default: null
      }
    }
  },
  // Customer Review and Rating
  review: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
      sparse: true
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    submittedAt: {
      type: Date
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    }
  },
  assignmentInfo: {
    restaurantId: String,
    distance: Number, // Distance in km
    assignedBy: {
      type: String,
      enum: ['zone_match', 'nearest_distance', 'manual', 'nearest_available', 'delivery_accept']
    },
    zoneId: String,
    zoneName: String,
    deliveryPartnerId: String,
    assignedAt: Date
  },
  deliveryState: {
    status: {
      type: String,
      enum: ['pending', 'accepted', 'reached_pickup', 'order_confirmed', 'en_route_to_delivery', 'delivered'],
      default: 'pending'
    },
    currentPhase: {
      type: String,
      enum: ['assigned', 'en_route_to_pickup', 'at_pickup', 'en_route_to_delivery', 'at_delivery', 'completed'],
      default: 'assigned'
    },
    acceptedAt: Date,
    reachedPickupAt: Date,
    orderIdConfirmedAt: Date,
    routeToPickup: {
      coordinates: [[Number]], // [[lat, lng], ...]
      distance: Number, // in km
      duration: Number, // in minutes
      calculatedAt: Date,
      method: String // 'osrm', 'dijkstra', 'haversine_fallback'
    },
    routeToDelivery: {
      coordinates: [[Number]], // [[lat, lng], ...]
      distance: Number, // in km
      duration: Number, // in minutes
      calculatedAt: Date,
      method: String // 'osrm', 'dijkstra', 'haversine'
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ 'planSubscription.planId': 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ status: 1, 'scheduledDelivery.scheduledFor': 1 });
orderSchema.index({ 'payment.razorpayOrderId': 1 });

// Generate order ID before saving (fallback if not provided)
orderSchema.pre('save', async function (next) {
  if (!this.orderId && !this.orderNumber) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const generated = `ORD-${timestamp}-${random}`;
    this.orderId = generated;
    this.orderNumber = generated;
  } else if (!this.orderId && this.orderNumber) {
    this.orderId = this.orderNumber;
  } else if (!this.orderNumber && this.orderId) {
    this.orderNumber = this.orderId;
  } else if (this.orderId && this.orderNumber && this.orderId !== this.orderNumber) {
    this.orderNumber = this.orderId;
  }
  next();
});

orderSchema.pre('validate', function (next) {
  this.postOrderActions = sanitizePostOrderActions(this.postOrderActions);
  next();
});

// Update tracking when status changes
orderSchema.pre('save', function (next) {
  const now = new Date();

  if (this.isModified('status')) {
    switch (this.status) {
      case 'confirmed':
        if (!this.tracking.confirmed.status) {
          this.tracking.confirmed = { status: true, timestamp: now };
        }
        break;
      case 'preparing':
        if (!this.tracking.preparing.status) {
          this.tracking.preparing = { status: true, timestamp: now };
        }
        break;
      case 'ready':
        if (!this.tracking.ready.status) {
          this.tracking.ready = { status: true, timestamp: now };
        }
        break;
      case 'out_for_delivery':
        if (!this.tracking.outForDelivery.status) {
          this.tracking.outForDelivery = { status: true, timestamp: now };
        }
        break;
      case 'delivered':
        if (!this.tracking.delivered.status) {
          this.tracking.delivered = { status: true, timestamp: now };
          this.deliveredAt = now;
        }
        break;
      case 'cancelled':
        if (!this.cancelledAt) {
          this.cancelledAt = now;
        }
        break;
    }
  }

  next();
});

export default mongoose.model('Order', orderSchema);

