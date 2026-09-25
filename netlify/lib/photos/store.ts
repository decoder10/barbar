import { getStore } from '@netlify/blobs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DeployInfo } from '../barbar-mongo';

/** File storage for the owner's photos. The ledger keeps only the photo name, never the bytes. */
export interface PhotoFiles {
  get(file: string): Promise<Uint8Array | null>;
  put(file: string, bytes: Uint8Array): Promise<void>;
}

/** Netlify Blobs; previews write to their own store, so a test upload never reaches the live menu. */
export function blobPhotoFiles(deploy?: DeployInfo): PhotoFiles {
  const store = getStore({
    name: deploy?.context === 'production' ? 'barbar-photos' : 'barbar-photos-preview',
    consistency: 'strong',
  });
  return {
    get: async (file) => {
      const value = await store.get(file, { type: 'arrayBuffer' });
      return value ? new Uint8Array(value) : null;
    },
    put: async (file, bytes) => {
      await store.set(file, new Uint8Array(bytes).buffer as ArrayBuffer);
    },
  };
}

/** The local server keeps files next to its data, in the Git-ignored `.barbar-data/photos`. */
export function folderPhotoFiles(folder: string): PhotoFiles {
  return {
    get: async (file) => {
      try {
        return new Uint8Array(await readFile(resolve(folder, file)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    put: async (file, bytes) => {
      await mkdir(folder, { recursive: true });
      await writeFile(resolve(folder, file), bytes);
    },
  };
}
