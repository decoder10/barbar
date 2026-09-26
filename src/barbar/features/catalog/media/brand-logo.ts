import manifest from './brand-logo.json';
import { expandPhotos } from './photo-entries';

// The header logo is on every workspace screen. `scripts/photo-manifest.mjs` writes its entry to a file
// of its own, so the first screen does not download the full photo manifest and `photo-catalog`.
export const brandLogo = expandPhotos(manifest)['brand-logo'];
