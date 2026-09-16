import { barConfig } from '../../config';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardPage, CardQuery, CardResource } from '../../domain/catalog/cards';
import type { CatalogSort } from '../../domain/catalog/sort';
import { api } from '../../services/api-client';

export const cardPageSize = barConfig.presets.cardPageSize;
export interface CardItem {
  resource: CardResource;
  id: string;
}
interface Buffer {
  ids: string[];
  next: number | null;
  total: number;
}
/** In-memory pages for a fully loaded ledger (legacy data or tests); `key` changes when that data changes. */
export interface LocalPages {
  /** A primitive (string) key: pages reload only when it changes. */
  key: string;
  page: (resource: CardResource, query: CardQuery) => CardPage;
}

/**
 * Server pages of catalog cards. Search and order cover the whole catalog, while the full reference catalog
 * stays loaded for recipes, stock and forms. Resources are shown in order: the next starts after the previous.
 */
export function useCardPages({
  resources,
  category,
  search,
  sort,
  date,
  local,
  revision,
}: {
  resources: CardResource[];
  category: string;
  search: string;
  sort: CatalogSort;
  date?: string;
  local?: LocalPages;
  /** Reloads the loaded number of cards when stock or catalog changes. */
  revision?: unknown;
}) {
  const [term, setTerm] = useState(search.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const resourceKey = resources.join(',');
  const key = JSON.stringify([resourceKey, category, term, sort, date || '', local ? 'local' : 'server']);
  const localRef = useRef(local);
  localRef.current = local;
  /** First pages of every shown resource in one request: the server reads stock and popularity once. */
  const firstPages = useCallback(
    async (list: CardResource[], offset: number, limit: number): Promise<CardPage[]> => {
      if (localRef.current)
        return list.map((resource) =>
          localRef.current!.page(resource, { resource, category, search: term, sort, offset, limit }),
        );
      const params = new URLSearchParams({
        [list.length > 1 ? 'resources' : 'resource']: list.join(','),
        category,
        q: term,
        sort,
        offset: String(offset),
        limit: String(limit),
        ...(date ? { date } : {}),
      });
      const result: { pages?: CardPage[] } & CardPage = await api(`/api/barbar/catalog/cards?${params}`);
      return list.length > 1 ? result.pages! : [result];
    },
    [category, term, sort, date],
  );
  const request = useCallback(
    async (resource: CardResource, offset: number, limit: number): Promise<CardPage> => {
      const query = { resource, category, search: term, sort, offset, limit };
      if (localRef.current) return localRef.current.page(resource, query);
      return (await firstPages([resource], offset, limit))[0];
    },
    [category, term, sort, firstPages],
  );
  const [state, setState] = useState<{ key: string; buffers: Buffer[]; error: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const loaded = useRef<{ key: string; counts: number[] }>({ key: '', counts: [] });
  const localKey = local?.key;
  // First pages of every resource at once, so totals are known. A revision reloads as many cards as shown.
  useEffect(() => {
    const current = ++sequence.current;
    const counts = loaded.current.key === key ? loaded.current.counts : [];
    const list = resourceKey.split(',') as CardResource[];
    setLoading(true);
    void firstPages(list, 0, Math.min(200, Math.max(cardPageSize, ...counts.map((n) => n || 0))))
      .then((pages) => {
        if (current !== sequence.current) return;
        loaded.current = { key, counts: pages.map((p) => p.ids.length) };
        setState({
          key,
          error: '',
          buffers: pages.map((p) => ({ ids: p.ids, next: p.nextOffset, total: p.total })),
        });
      })
      .catch((error) => {
        if (current === sequence.current)
          setState({
            key,
            buffers: [],
            error: error instanceof Error ? error.message : 'Не удалось загрузить каталог.',
          });
      })
      .finally(() => {
        if (current === sequence.current) setLoading(false);
      });
  }, [key, resourceKey, firstPages, revision, localKey]);
  const buffers = state?.key === key ? state.buffers : [];
  const list = resourceKey.split(',') as CardResource[];
  const items: CardItem[] = [];
  for (const [index, buffer] of buffers.entries()) {
    items.push(...buffer.ids.map((id) => ({ resource: list[index], id })));
    if (buffer.next !== null) break;
  }
  const more = useCallback(() => {
    if (loading || !state || state.key !== key) return;
    const index = state.buffers.findIndex((b) => b.next !== null);
    if (index < 0) return;
    const current = ++sequence.current;
    setLoading(true);
    void request(resourceKey.split(',')[index] as CardResource, state.buffers[index].next!, cardPageSize)
      .then((page) => {
        if (current !== sequence.current) return;
        setState((previous) => {
          if (!previous || previous.key !== key) return previous;
          const next = previous.buffers.map((b, i) =>
            i === index ? { ids: [...b.ids, ...page.ids], next: page.nextOffset, total: page.total } : b,
          );
          loaded.current = { key, counts: next.map((b) => b.ids.length) };
          return { ...previous, buffers: next };
        });
      })
      .catch((error) => {
        if (current === sequence.current)
          setState(
            (previous) =>
              previous && { ...previous, error: error instanceof Error ? error.message : 'Ошибка' },
          );
      })
      .finally(() => {
        if (current === sequence.current) setLoading(false);
      });
  }, [loading, state, key, request, resourceKey]);
  const total = buffers.reduce((sum, b) => sum + b.total, 0);
  return {
    items,
    total,
    remaining: Math.max(0, total - items.length),
    hasMore: buffers.some((b) => b.next !== null),
    loading,
    ready: state?.key === key,
    error: state?.key === key ? state.error : '',
    more,
  };
}
