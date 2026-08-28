import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Where files land on disk, and the public base nginx serves them from.
const MEDIA_ROOT = process.env.MEDIA_ROOT || '/var/www/uploads';
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || 'https://api.mobasket.in/uploads').replace(/\/+$/, '');

const WEBP_QUALITY = Number(process.env.MEDIA_WEBP_QUALITY || 82);
const WEBP_MAX_WIDTH = Number(process.env.MEDIA_WEBP_MAX_WIDTH || 1600);

// Formats worth re-encoding to webp. Anything else is stored untouched.
const CONVERTIBLE = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp']);

let sharpModule;
let sharpUnavailable = false;

// sharp is optional: if it is missing the originals still upload, just unconverted.
async function loadSharp() {
  if (sharpModule) return sharpModule;
  if (sharpUnavailable) return null;
  try {
    ({ default: sharpModule } = await import('sharp'));
    return sharpModule;
  } catch {
    sharpUnavailable = true;
    console.warn('[localStorage] sharp not installed - storing originals without webp conversion');
    return null;
  }
}

function cleanValue(value) {
  return String(value || '').trim();
}

// Strip anything that could climb out of MEDIA_ROOT.
function safeSegment(value) {
  return cleanValue(value)
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '-'))
    .join('/');
}

function normalizeFolder(folder = '') {
  const safe = safeSegment(folder);
  return safe || 'mobasket';
}

function buildFileName(options = {}) {
  const provided = safeSegment(options?.fileName).split('/').pop() || '';
  const base = provided
    ? path.parse(provided).name
    : (normalizeFolder(options?.folder).split('/').pop() || 'asset');

  const unique = crypto.randomBytes(6).toString('hex');
  return `${base}-${Date.now()}-${unique}`;
}

function extensionFor(options = {}) {
  const fromName = path.extname(safeSegment(options?.fileName)).toLowerCase();
  if (fromName) return fromName;

  const mime = cleanValue(options?.mimeType || options?.contentType).toLowerCase();
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('svg')) return '.svg';
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  return '.jpg';
}

/**
 * Persist a buffer under MEDIA_ROOT and return an ImageKit-shaped result so
 * mediaProvider can normalize both providers through one code path.
 */
export async function uploadBufferToLocal(buffer, options = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid buffer provided');
  }
  if (buffer.length === 0) {
    throw new Error('Empty buffer provided');
  }

  const folder = normalizeFolder(options.folder);
  const baseName = buildFileName(options);
  const sourceExt = extensionFor(options);

  let outputBuffer = buffer;
  let extension = sourceExt;

  if (CONVERTIBLE.has(sourceExt)) {
    const sharp = await loadSharp();
    if (sharp) {
      try {
        outputBuffer = await sharp(buffer)
          .rotate() // honour EXIF orientation before stripping metadata
          .resize({ width: WEBP_MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        extension = '.webp';
      } catch (error) {
        // Corrupt or unsupported payload - keep the original rather than fail the upload.
        console.warn(`[localStorage] webp conversion failed, storing original: ${error.message}`);
        outputBuffer = buffer;
        extension = sourceExt;
      }
    }
  }

  const relativePath = `${folder}/${baseName}${extension}`;
  const absolutePath = path.join(MEDIA_ROOT, relativePath);

  // Guard against traversal even after sanitising.
  const resolvedRoot = path.resolve(MEDIA_ROOT);
  if (!path.resolve(absolutePath).startsWith(resolvedRoot + path.sep)) {
    throw new Error('Resolved upload path escapes MEDIA_ROOT');
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, outputBuffer);

  return {
    fileId: relativePath,
    url: `${MEDIA_BASE_URL}/${relativePath}`,
    size: outputBuffer.length,
    fileType: extension.replace('.', ''),
  };
}

export async function deleteLocalFile(relativePath) {
  const safeRelative = safeSegment(relativePath);
  if (!safeRelative) {
    return { result: 'not_found' };
  }

  const absolutePath = path.join(MEDIA_ROOT, safeRelative);
  const resolvedRoot = path.resolve(MEDIA_ROOT);
  if (!path.resolve(absolutePath).startsWith(resolvedRoot + path.sep)) {
    return { result: 'not_found' };
  }

  try {
    await fs.unlink(absolutePath);
    return { result: 'ok' };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { result: 'not_found' };
    }
    throw error;
  }
}

export function getLocalMediaConfig() {
  return { mediaRoot: MEDIA_ROOT, baseUrl: MEDIA_BASE_URL };
}
