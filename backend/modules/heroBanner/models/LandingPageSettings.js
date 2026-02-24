import mongoose from 'mongoose';

const landingPageSettingsSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ['mofood', 'mogrocery'],
    default: 'mofood',
    index: true
  },
  exploreMoreHeading: {
    type: String,
    default: 'Explore More',
    trim: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
landingPageSettingsSchema.statics.getSettings = async function(platform = 'mofood') {
  const normalizedPlatform = platform === 'mogrocery' ? 'mogrocery' : 'mofood';
  const query = normalizedPlatform === 'mofood'
    ? { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] }
    : { platform: normalizedPlatform };

  let settings = await this.findOne(query);
  if (!settings) {
    settings = new this({ platform: normalizedPlatform, exploreMoreHeading: 'Explore More' });
    await settings.save();
  } else if (!settings.platform) {
    settings.platform = normalizedPlatform;
    await settings.save();
  }
  return settings;
};

export default mongoose.model('LandingPageSettings', landingPageSettingsSchema);

