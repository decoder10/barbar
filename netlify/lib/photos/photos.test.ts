import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { uploadedPhotoPattern } from '../../../src/barbar/domain/catalog/uploaded-photos';
import type { IdentityStore } from '../barbar-users';
import { handlePhotoFile } from './serve';
import type { PhotoFiles } from './store';
import { handlePhotoUpload, maxUploadBytes } from './upload';

const users = {
  resolve: async (token: string) =>
    token === 'owner-token'
      ? { id: 'owner', role: 'owner', active: true }
      : token === 'worker-token'
        ? { id: 'worker', role: 'worker', active: true }
        : null,
} as unknown as IdentityStore;
function memory() {
  const files = new Map<string, Uint8Array>();
  const store: PhotoFiles = {
    get: async (file) => files.get(file) ?? null,
    put: async (file, bytes) => void files.set(file, bytes),
  };
  return { files, store };
}
const upload = (
  body: Uint8Array | string,
  { token = 'owner-token', origin = 'https://barbar.test', method = 'POST' } = {},
) =>
  new Request('https://barbar.test/api/barbar/photos', {
    method,
    headers: { cookie: `barbar_session=${token}`, origin, 'content-type': 'image/jpeg' },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : new Uint8Array(body) } : {}),
  });
const file = (path: string, method = 'GET') =>
  new Request(`https://barbar.test/api/photos/${path}`, { method });
// A landscape phone photo stored sideways with EXIF orientation 6, as cameras do.
const phonePhoto = () =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 40, g: 90, b: 120 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

describe('owner photo upload', () => {
  it('is for the owner only, from the site itself', async () => {
    const { store, files } = memory();
    const bytes = await phonePhoto();
    expect((await handlePhotoUpload(upload(bytes, { token: '' }), users, store)).status).toBe(401);
    expect((await handlePhotoUpload(upload(bytes, { token: 'worker-token' }), users, store)).status).toBe(
      403,
    );
    expect(
      (await handlePhotoUpload(upload(bytes, { origin: 'https://evil.test' }), users, store)).status,
    ).toBe(403);
    expect((await handlePhotoUpload(upload(bytes, { method: 'GET' }), users, store)).status).toBe(405);
    expect(files.size).toBe(0);
  });

  it('stores upright WebP card sizes without metadata and returns only their name', async () => {
    const { store, files } = memory();
    const bytes = await phonePhoto();
    expect((await sharp(bytes).metadata()).exif).toBeDefined();
    const response = await handlePhotoUpload(upload(bytes), users, store);
    expect(response.status).toBe(201);
    const { photo } = await response.json();
    // Turned upright: 800×1200, stored at most 640 wide.
    expect(photo).toMatch(uploadedPhotoPattern);
    expect(photo).toMatch(/-640x960$/);
    expect([...files.keys()].sort()).toEqual([160, 320, 640].map((width) => `${photo}-${width}.webp`).sort());
    for (const [name, output] of files) {
      const meta = await sharp(output).metadata();
      expect(meta.format).toBe('webp');
      expect(`${photo}-${meta.width}.webp`).toBe(name);
      expect(meta.height).toBe(Math.round((meta.width! * 960) / 640));
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
    }
    // The same file gives the same name: re-uploading does not multiply stored photos.
    const again = await (await handlePhotoUpload(upload(bytes), users, store)).json();
    expect(again.photo).toBe(photo);
    expect(files.size).toBe(3);
  });

  it('refuses what is not a usable image', async () => {
    const { store, files } = memory();
    const status = async (body: Uint8Array | string) =>
      (await handlePhotoUpload(upload(body), users, store)).status;
    expect(await status('<svg onload="alert(1)"></svg>')).toBe(415);
    expect(await status(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]))).toBe(415);
    expect(await status(new Uint8Array(maxUploadBytes + 1))).toBe(413);
    const tiny = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    expect(await status(tiny)).toBe(400);
    // Tiny to send, huge to decode: a PNG header that claims 7000×6000 pixels.
    const chunk = (type: string, data: Buffer) => {
      const body = Buffer.concat([Buffer.from(type), data]);
      const frame = Buffer.alloc(8 + body.length);
      frame.writeUInt32BE(data.length, 0);
      body.copy(frame, 4);
      frame.writeUInt32BE(crc32(body), 4 + body.length);
      return frame;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(7000, 0);
    header.writeUInt32BE(6000, 4);
    header.set([8, 2, 0, 0, 0], 8);
    const bomb = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(Buffer.alloc(64))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    expect(await status(bomb)).toBe(413);
    expect(files.size).toBe(0);
  });
});

describe('owner photo files', () => {
  it('are public, immutable WebP files of the stored card sizes only', async () => {
    const { store } = memory();
    const { photo } = await (await handlePhotoUpload(upload(await phonePhoto()), users, store)).json();
    const response = await handlePhotoFile(file(`${photo}-320.webp`), store);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await sharp(new Uint8Array(await response.arrayBuffer())).metadata()).width).toBe(320);
    const head = await handlePhotoFile(file(`${photo}-320.webp`, 'HEAD'), store);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    for (const path of [
      `${photo}-500.webp`,
      'u-000000000000-640x960-320.webp',
      `${photo}-320.png`,
      `..%2F..%2F${photo}-320.webp`,
      'data.json',
    ])
      expect((await handlePhotoFile(file(path), store)).status, path).toBe(404);
    expect((await handlePhotoFile(file(`${photo}-320.webp`, 'POST'), store)).status).toBe(405);
  });
});
