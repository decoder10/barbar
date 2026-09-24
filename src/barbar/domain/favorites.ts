import type { Sale } from './types';

/** A favourite is stored as `kind:productId`; the profile keeps at most this many. */
export const maxFavorites = 60;
export const favoriteKey = (kind: Sale['kind'], productId: string) => `${kind}:${productId}`;
const shape = /^(cocktail|alcohol):[a-zA-Z0-9_-]{1,80}$/;

/** The clean list to store: known shape, no duplicates, at most `maxFavorites`; null when the input is not a list of keys. */
export function cleanFavorites(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > maxFavorites * 2) return null;
  if (!input.every((key) => typeof key === 'string' && shape.test(key))) return null;
  const unique = [...new Set(input as string[])];
  return unique.length > maxFavorites ? null : unique;
}
