import { cloudinary } from '../../config/cloudinary.js';
import {
  deleteImageKitFile,
  initializeImageKit,
  reinitializeImageKit,
  uploadBufferToImageKit,
} from '../../config/imagekit.js';
import {
  getCloudinaryCredentials,
  getImageKitCredentials,
  getMediaProvider,
} from './envService.js';

const IMAGEKIT_PUBLIC_ID_PREFIX = 'imagekit:';

const cleanValue = (value) => String(value || '').trim();

const hasCloudinaryCredentials = async () => {
  const credentials = await getCloudinaryCredentials();
  return Boolean(
    cleanValue(credentials.cloudName) &&
      cleanValue(credentials.apiKey) &&
      cleanValue(credentials.apiSecret),
  );
};

const hasImageKitCredentials = async () => {
  const credentials = await getImageKitCredentials();
  return Boolean(
    cleanValue(credentials.publicKey) &&
      cleanValue(credentials.privateKey) &&
      cleanValue(credentials.urlEndpoint),
  );
};

export const normalizeMediaProvider = async () => {
  const preferredProvider = cleanValue(await getMediaProvider()).toLowerCase();

  if (preferredProvider === 'imagekit') return 'imagekit';
  if (preferredProvider === 'cloudinary') return 'cloudinary';

  if (await hasImageKitCredentials()) return 'imagekit';
  if (await hasCloudinaryCredentials()) return 'cloudinary';

  return 'imagekit';
};

export const initializeActiveMediaProvider = async () => {
  const provider = await normalizeMediaProvider();

  if (provider === 'imagekit') {
    await initializeImageKit();
  }

  return provider;
};

export const reinitializeMediaProvider = async () => {
  reinitializeImageKit();
  return initializeActiveMediaProvider();
};

export const toProviderPublicId = (provider, rawId) => {
  const normalizedProvider = cleanValue(provider).toLowerCase();
  const normalizedId = cleanValue(rawId);
  if (!normalizedId) return '';
  if (normalizedProvider === 'imagekit') {
    return normalizedId.startsWith(IMAGEKIT_PUBLIC_ID_PREFIX)
      ? normalizedId
      : `${IMAGEKIT_PUBLIC_ID_PREFIX}${normalizedId}`;
  }
  return normalizedId;
};

export const parseProviderPublicId = (publicId) => {
  const normalizedPublicId = cleanValue(publicId);
  if (!normalizedPublicId) {
    return { provider: '', assetId: '' };
  }
  if (normalizedPublicId.startsWith(IMAGEKIT_PUBLIC_ID_PREFIX)) {
    return {
      provider: 'imagekit',
      assetId: normalizedPublicId.slice(IMAGEKIT_PUBLIC_ID_PREFIX.length),
    };
  }
  return {
    provider: 'cloudinary',
    assetId: normalizedPublicId,
  };
};

export const uploadMediaBuffer = async (buffer, options = {}) => {
  const provider = await normalizeMediaProvider();

  if (provider === 'imagekit') {
    const result = await uploadBufferToImageKit(buffer, options);
    const fileId = cleanValue(result?.fileId);
    return {
      provider: 'imagekit',
      public_id: toProviderPublicId('imagekit', fileId),
      secure_url: cleanValue(result?.url),
      url: cleanValue(result?.url),
      bytes: Number(result?.size || 0),
      format: cleanValue(result?.fileType || ''),
      resource_type: options.resource_type || 'auto',
      original_response: result,
    };
  }

  throw new Error('Cloudinary upload should be handled by cloudinaryService directly');
};

export const deleteMediaAsset = async (publicId) => {
  const { provider, assetId } = parseProviderPublicId(publicId);
  if (!provider || !assetId) {
    return { result: 'not_found' };
  }

  if (provider === 'imagekit') {
    return deleteImageKitFile(assetId);
  }

  const canUseCloudinary = await hasCloudinaryCredentials();
  if (!canUseCloudinary) {
    return {
      result: 'skipped',
      reason: 'cloudinary_not_configured',
    };
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(assetId, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};
