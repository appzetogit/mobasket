import multer from 'multer';
import { Readable } from 'stream';
import { cloudinary, initializeCloudinary } from '../../config/cloudinary.js';
import {
  deleteMediaAsset,
  normalizeMediaProvider,
  uploadMediaBuffer,
} from './mediaProvider.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/x-png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/svg+xml',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ];

  const allowedExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.heic',
    '.heif',
    '.svg',
    '.mp4',
    '.mov',
    '.avi',
    '.mkv'
  ];

  const mimeType = String(file?.mimetype || '').toLowerCase().trim();
  const fileName = String(file?.originalname || '').toLowerCase().trim();
  const hasAllowedMime = allowedMimeTypes.includes(mimeType);
  const hasAllowedExtension = allowedExtensions.some((ext) => fileName.endsWith(ext));
  const isGenericMime = mimeType === '' || mimeType === 'application/octet-stream';

  if (hasAllowedMime || (isGenericMime && hasAllowedExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Please upload an image or video.'));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

export async function uploadToCloudinary(buffer, options = {}) {
  const provider = await normalizeMediaProvider();
  await initializeCloudinary();

  if (provider === 'imagekit') {
    return uploadMediaBuffer(buffer, options);
  }

  return new Promise((resolve, reject) => {
    try {
      if (!buffer || !Buffer.isBuffer(buffer)) {
        return reject(new Error('Invalid buffer provided'));
      }

      if (buffer.length === 0) {
        return reject(new Error('Empty buffer provided'));
      }

      const uploadOptions = {
        resource_type: options.resource_type || 'auto',
        folder: options.folder || 'mobasket'
      };

      Object.keys(options).forEach((key) => {
        if (key !== 'folder' && key !== 'resource_type') {
          uploadOptions[key] = options[key];
        }
      });

      const stream = Readable.from(buffer);
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Upload failed: No result returned from Cloudinary'));
          }
          resolve(result);
        }
      );

      uploadStream.on('error', (streamError) => {
        reject(streamError);
      });

      stream.pipe(uploadStream);
    } catch (error) {
      reject(error);
    }
  });
}

export function deleteFromCloudinary(publicId) {
  return deleteMediaAsset(publicId);
}
