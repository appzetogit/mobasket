import axios from 'axios';
import { getImageKitCredentials } from '../shared/utils/envService.js';

const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const IMAGEKIT_DELETE_URL_BASE = 'https://api.imagekit.io/v1/files';

let imageKitInitialized = false;
let imageKitConfig = null;

function cleanEnv(value) {
  if (!value || typeof value !== 'string') return value;
  let normalized = value.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function buildBasicAuthHeader(privateKey) {
  return `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`;
}

function normalizeFolder(folder = '') {
  const trimmed = String(folder || '').trim().replace(/\\/g, '/');
  if (!trimmed) return '/mobasket';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function inferFileExtension(options = {}) {
  const mimeType = String(options?.mimeType || '').toLowerCase().trim();
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  if (mimeType.includes('svg')) return '.svg';
  if (mimeType.includes('heic')) return '.heic';
  if (mimeType.includes('heif')) return '.heif';
  if (mimeType.includes('mp4')) return '.mp4';
  if (mimeType.includes('quicktime')) return '.mov';
  if (mimeType.includes('avi')) return '.avi';
  if (mimeType.includes('matroska')) return '.mkv';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  return '';
}

function buildFileName(options = {}) {
  const provided = String(options?.fileName || '').trim();
  if (provided) return provided;

  const folderLeaf = normalizeFolder(options?.folder)
    .split('/')
    .filter(Boolean)
    .pop() || 'asset';
  const extension = inferFileExtension(options);

  return `${folderLeaf}-${Date.now()}${extension}`;
}

export async function initializeImageKit() {
  if (imageKitInitialized && imageKitConfig) {
    return imageKitConfig;
  }

  const credentials = await getImageKitCredentials();
  const publicKey = cleanEnv(credentials.publicKey);
  const privateKey = cleanEnv(credentials.privateKey);
  const urlEndpoint = cleanEnv(credentials.urlEndpoint);

  if (!publicKey || !privateKey || !urlEndpoint) {
    const missing = [];
    if (!publicKey) missing.push('IMAGEKIT_PUBLIC_KEY');
    if (!privateKey) missing.push('IMAGEKIT_PRIVATE_KEY');
    if (!urlEndpoint) missing.push('IMAGEKIT_URL_ENDPOINT');
    throw new Error(`ImageKit configuration incomplete. Missing: ${missing.join(', ')}`);
  }

  imageKitConfig = {
    publicKey,
    privateKey,
    urlEndpoint,
  };
  imageKitInitialized = true;

  return imageKitConfig;
}

export async function uploadBufferToImageKit(buffer, options = {}) {
  const config = await initializeImageKit();

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid buffer provided');
  }

  if (buffer.length === 0) {
    throw new Error('Empty buffer provided');
  }

  const folder = normalizeFolder(options.folder);
  const fileName = buildFileName(options);
  const form = new FormData();

  form.append('file', new Blob([buffer]), fileName);
  form.append('fileName', fileName);
  form.append('folder', folder);
  form.append('useUniqueFileName', 'true');

  const tags = Array.isArray(options.tags)
    ? options.tags.filter(Boolean).join(',')
    : String(options.tags || '').trim();
  if (tags) {
    form.append('tags', tags);
  }

  const customMetadata = options.customMetadata && typeof options.customMetadata === 'object'
    ? JSON.stringify(options.customMetadata)
    : '';
  if (customMetadata) {
    form.append('customMetadata', customMetadata);
  }

  const response = await axios.post(IMAGEKIT_UPLOAD_URL, form, {
    headers: {
      Authorization: buildBasicAuthHeader(config.privateKey),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return response.data;
}

export async function deleteImageKitFile(fileId) {
  const config = await initializeImageKit();
  const normalizedFileId = String(fileId || '').trim();
  if (!normalizedFileId) {
    return { result: 'not_found' };
  }

  const response = await axios.delete(
    `${IMAGEKIT_DELETE_URL_BASE}/${encodeURIComponent(normalizedFileId)}`,
    {
      headers: {
        Authorization: buildBasicAuthHeader(config.privateKey),
      },
    },
  );

  return response.data || { result: 'deleted' };
}

export function reinitializeImageKit() {
  imageKitInitialized = false;
  imageKitConfig = null;
}
