import mongoose from 'mongoose';

const pushTokenSubSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      trim: true,
      required: true,
    },
    platform: {
      type: String,
      enum: ['web', 'mobile'],
      required: true,
    },
    deviceId: {
      type: String,
      trim: true,
      default: '',
    },
    deviceType: {
      type: String,
      trim: true,
      default: '',
    },
    appContext: {
      type: String,
      trim: true,
      default: '',
    },
    userAgent: {
      type: String,
      trim: true,
      default: '',
    },
    source: {
      type: String,
      trim: true,
      default: '',
    },
    isWebView: {
      type: Boolean,
      default: false,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

export default pushTokenSubSchema;
