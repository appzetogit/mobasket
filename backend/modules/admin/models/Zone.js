import mongoose from 'mongoose';

const coordinateSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  }
}, { _id: false });

const storeLocationSchema = new mongoose.Schema({
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  }
}, { _id: false });

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    platform: {
      type: String,
      enum: ['mofood', 'mogrocery'],
      default: 'mofood',
      index: true
    },
    serviceLocation: {
      type: String,
      required: false,
      trim: true
    },
    country: {
      type: String,
      required: true,
      trim: true,
      default: 'India'
    },
    zoneName: {
      type: String,
      required: false,
      trim: true
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: false
    },
    unit: {
      type: String,
      enum: ['kilometer', 'miles'],
      default: 'kilometer'
    },

    // Zone coordinates (polygon points) - main zone boundary (outermost)
    coordinates: {
      type: [coordinateSchema],
      required: true,
      validate: {
        validator: function(coords) {
          return coords.length >= 3; // Minimum 3 points for a polygon
        },
        message: 'Zone must have at least 3 coordinates'
      }
    },
    // Optional delivery layers: inner (center), outer (middle ring), outermost (full zone)
    // Delivery charge is applied based on which layer the delivery address falls in.
    layers: {
      type: [{
        type: {
          type: String,
          enum: ['inner', 'outer', 'outermost'],
          required: true
        },
        coordinates: {
          type: [coordinateSchema],
          required: true,
          validate: {
            validator: function(coords) {
              return Array.isArray(coords) && coords.length >= 3;
            },
            message: 'Each layer must have at least 3 coordinates'
          }
        },
        deliveryCharge: {
          type: Number,
          default: 0,
          min: 0
        }
      }],
      default: undefined,
      required: false
    },
    // Store coordinates (used by mogrocery)
    storeLocation: {
      type: storeLocationSchema,
      required: false
    },
    // GeoJSON point for store location
    storePoint: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: false
      }
    },
    // GeoJSON polygon for spatial queries
    boundary: {
      type: {
        type: String,
        enum: ['Polygon'],
        default: 'Polygon'
      },
      coordinates: {
        type: [[[Number]]],
        required: false // Will be created by pre-save hook
      }
    },
    // Peak Zone Settings (like Zomato)
    peakZoneRideCount: {
      type: Number,
      default: 0,
      min: 0
    },
    peakZoneRadius: {
      type: Number,
      default: 0,
      min: 0
    },
    peakZoneSelectionDuration: {
      type: Number,
      default: 0, // in minutes
      min: 0
    },
    peakZoneDuration: {
      type: Number,
      default: 0, // in minutes
      min: 0
    },
    peakZoneSurgePercentage: {
      type: Number,
      default: 0, // percentage
      min: 0,
      max: 100
    },
    // Status
    isActive: {
      type: Boolean,
      default: true
    },
    // Created by admin
    createdBy: {
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
zoneSchema.index({ restaurantId: 1 });
zoneSchema.index({ isActive: 1 });
zoneSchema.index({ platform: 1, isActive: 1 });
zoneSchema.index({ boundary: '2dsphere' }); // For spatial queries
zoneSchema.index({ storePoint: '2dsphere' });
zoneSchema.index({ serviceLocation: 'text', name: 'text' }); // For text search

// Pre-save middleware to create GeoJSON boundary
zoneSchema.pre('save', function(next) {
  if (this.coordinates && this.coordinates.length >= 3) {
    // Convert coordinates to GeoJSON format: [[[lng, lat], [lng, lat], ...]]
    const geoJsonCoords = this.coordinates.map(coord => [coord.longitude, coord.latitude]);
    // Close the polygon by adding the first point at the end
    geoJsonCoords.push(geoJsonCoords[0]);
    
    this.boundary = {
      type: 'Polygon',
      coordinates: [geoJsonCoords]
    };
  }

  if (
    this.storeLocation &&
    typeof this.storeLocation.latitude === 'number' &&
    typeof this.storeLocation.longitude === 'number'
  ) {
    this.storePoint = {
      type: 'Point',
      coordinates: [this.storeLocation.longitude, this.storeLocation.latitude]
    };
  } else {
    this.storePoint = undefined;
  }
  next();
});

// Method to check if a point is within the zone
zoneSchema.methods.containsPoint = function(latitude, longitude) {
  if (!this.boundary || !this.boundary.coordinates) {
    return false;
  }
  
  // Simple point-in-polygon check using ray casting algorithm
  const coords = this.boundary.coordinates[0];
  let inside = false;
  
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    // GeoJSON stores coordinates as [lng, lat]
    const xi = Number(coords[i][0]), yi = Number(coords[i][1]);
    const xj = Number(coords[j][0]), yj = Number(coords[j][1]);
    
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    const intersect = ((yi > latitude) !== (yj > latitude)) &&
      (longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
};

export default mongoose.model('Zone', zoneSchema);

