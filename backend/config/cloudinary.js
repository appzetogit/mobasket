import { v2 as cloudinary } from 'cloudinary';
import {
  getCloudinaryCredentials,
  getImageKitCredentials,
  getMediaProvider,
} from '../shared/utils/envService.js';
import { initializeImageKit, reinitializeImageKit } from './imagekit.js';

// Normalize env values (trim quotes if present)
function cleanEnv(value) {
  if (!value || typeof value !== 'string') return value;
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

// Initialize Cloudinary with database credentials
let cloudinaryInitialized = false;

async function initializeCloudinary() {
  const preferredProvider = String(await getMediaProvider() || '').trim().toLowerCase();
  const imageKitCredentials = await getImageKitCredentials();
  const hasImageKitCredentials = Boolean(
    String(imageKitCredentials.publicKey || '').trim() &&
      String(imageKitCredentials.privateKey || '').trim() &&
      String(imageKitCredentials.urlEndpoint || '').trim(),
  );
  const activeProvider =
    preferredProvider === 'cloudinary'
      ? 'cloudinary'
      : preferredProvider === 'imagekit' || hasImageKitCredentials
        ? 'imagekit'
        : 'cloudinary';

  if (activeProvider === 'imagekit') {
    await initializeImageKit();
    cloudinaryInitialized = true;
    return cloudinary;
  }

  if (cloudinaryInitialized) {
    return cloudinary;
  }

  try {
    const credentials = await getCloudinaryCredentials();
    const cloudName = cleanEnv(credentials.cloudName);
    const apiKey = cleanEnv(credentials.apiKey);
    const apiSecret = cleanEnv(credentials.apiSecret);

    console.log('🔧 Cloudinary initialization check:', {
      hasCloudName: !!cloudName,
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      cloudNameLength: cloudName?.length || 0,
      apiKeyLength: apiKey?.length || 0,
      apiSecretLength: apiSecret?.length || 0
    });

    if (!cloudName || !apiKey || !apiSecret) {
      const missing = [];
      if (!cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
      if (!apiKey) missing.push('CLOUDINARY_API_KEY');
      if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');
      
      console.error(
        `❌ Cloudinary is not fully configured. Missing: ${missing.join(', ')}. Set these in Admin > ENV Setup`
      );
      throw new Error(`Cloudinary configuration incomplete. Missing: ${missing.join(', ')}`);
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });

    cloudinaryInitialized = true;
    console.log('✅ Cloudinary initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Cloudinary:', {
      message: error.message,
      stack: error.stack
    });
    cloudinaryInitialized = false;
    throw error; // Re-throw to let caller handle
  }

  return cloudinary;
}


// Reinitialize function (call after updating env variables)
export async function reinitializeCloudinary() {
  cloudinaryInitialized = false;
  reinitializeImageKit();
  return await initializeCloudinary();
}

export { cloudinary, initializeCloudinary };



