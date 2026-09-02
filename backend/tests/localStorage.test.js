import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

// MEDIA_ROOT is read at module load, so it must be set before the import.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mobasket-media-'));
process.env.MEDIA_ROOT = ROOT;
process.env.MEDIA_BASE_URL = 'https://api.example.test/uploads';

const { uploadBufferToLocal, deleteLocalFile } = await import('../config/localStorage.js');

const jpeg = (w = 800, h = 400) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .toBuffer();

const absolute = (result) => path.join(ROOT, result.fileId);

describe('uploadBufferToLocal', () => {
  it('rejects empty or non-buffer input instead of writing a broken file', async () => {
    await expect(uploadBufferToLocal(null, {})).rejects.toThrow(/Invalid buffer/);
    await expect(uploadBufferToLocal(Buffer.alloc(0), {})).rejects.toThrow(/Empty buffer/);
  });

  it('converts raster images to webp and returns a public URL', async () => {
    const result = await uploadBufferToLocal(await jpeg(), {
      folder: 'mobasket/products',
      fileName: 'photo.jpg',
    });

    expect(result.fileType).toBe('webp');
    expect(result.fileId).toMatch(/^mobasket\/products\/photo-\d+-[0-9a-f]{12}\.webp$/);
    expect(result.url).toBe(`https://api.example.test/uploads/${result.fileId}`);
    expect(fs.existsSync(absolute(result))).toBe(true);

    const meta = await sharp(fs.readFileSync(absolute(result))).metadata();
    expect(meta.format).toBe('webp');
  });

  it('caps width at 1600px without enlarging smaller images', async () => {
    const big = await uploadBufferToLocal(await jpeg(2400, 1200), { folder: 'f', fileName: 'b.jpg' });
    expect((await sharp(fs.readFileSync(absolute(big))).metadata()).width).toBe(1600);

    const small = await uploadBufferToLocal(await jpeg(320, 160), { folder: 'f', fileName: 's.jpg' });
    expect((await sharp(fs.readFileSync(absolute(small))).metadata()).width).toBe(320);
  });

  it('gives each upload a unique name so identical filenames cannot collide', async () => {
    const a = await uploadBufferToLocal(await jpeg(), { folder: 'f', fileName: 'same.jpg' });
    const b = await uploadBufferToLocal(await jpeg(), { folder: 'f', fileName: 'same.jpg' });
    expect(a.fileId).not.toBe(b.fileId);
    expect(fs.existsSync(absolute(a))).toBe(true);
    expect(fs.existsSync(absolute(b))).toBe(true);
  });

  it('stores non-image payloads untouched', async () => {
    const pdf = Buffer.from('%PDF-1.4 not really a pdf');
    const result = await uploadBufferToLocal(pdf, { folder: 'docs', fileName: 'id.pdf' });
    expect(result.fileType).toBe('pdf');
    expect(fs.readFileSync(absolute(result))).toEqual(pdf);
  });

  it('keeps the original when the payload is not decodable', async () => {
    const junk = Buffer.from('this is not an image');
    const result = await uploadBufferToLocal(junk, { folder: 'f', fileName: 'broken.png' });
    expect(result.fileType).toBe('png');
    expect(fs.readFileSync(absolute(result))).toEqual(junk);
  });

  it('contains path traversal inside MEDIA_ROOT', async () => {
    const result = await uploadBufferToLocal(await jpeg(), {
      folder: '../../etc/evil',
      fileName: '../../passwd.jpg',
    });
    const resolved = path.resolve(absolute(result));
    expect(resolved.startsWith(path.resolve(ROOT) + path.sep)).toBe(true);
    expect(result.fileId).not.toContain('..');
  });

  it('strips characters that would be unsafe in a URL path', async () => {
    const result = await uploadBufferToLocal(await jpeg(), {
      folder: 'f',
      fileName: 'My Photo (final)!.jpg',
    });
    expect(path.basename(result.fileId)).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe('deleteLocalFile', () => {
  it('removes a stored file and is safe to call twice', async () => {
    const result = await uploadBufferToLocal(await jpeg(), { folder: 'f', fileName: 'gone.jpg' });
    expect(await deleteLocalFile(result.fileId)).toEqual({ result: 'ok' });
    expect(fs.existsSync(absolute(result))).toBe(false);
    expect(await deleteLocalFile(result.fileId)).toEqual({ result: 'not_found' });
  });

  it('refuses to delete outside MEDIA_ROOT', async () => {
    expect(await deleteLocalFile('../../../etc/passwd')).toEqual({ result: 'not_found' });
    expect(await deleteLocalFile('')).toEqual({ result: 'not_found' });
  });
});

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});
