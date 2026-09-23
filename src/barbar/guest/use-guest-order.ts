import { barConfig } from '../config';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GuestMenu, GuestPrice } from '../domain/guest-menu';
import type { GuestRequest, GuestRequestInput } from '../domain/guest-requests';

interface CartLine {
  id: string;
  price: GuestPrice;
  name: string;
  quantity: number;
}
/** A submission whose answer is not known yet (`input`), or one the server refused as already processed. */
interface Saved {
  id: string;
  input?: GuestRequestInput;
  terminal?: boolean;
}
/** One cart line per sellable price: its product and kind. */
export const cartLineId = (price: GuestPrice) => `${price.productKind}:${price.productId}`;
const submittedLineIds = (input: GuestRequestInput) =>
  new Set(input.lines.map((l) => `${l.kind}:${l.productId}`));
async function request(path: string, input?: GuestRequestInput) {
  const response = await fetch(path, {
    method: input ? 'POST' : 'GET',
    cache: 'no-store',
    credentials: 'omit',
    headers: input ? { 'Content-Type': 'application/json' } : {},
    ...(input ? { body: JSON.stringify(input) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(body.error || 'Не удалось отправить заявку. Повторите попытку.'), {
      status: response.status,
    });
  return body;
}
const read = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch {
    /* In-memory retries still retain the same token. */
  }
};
/** Requests already confirmed by the server, newest last; the table has at most a few pending at once. */
const sentLimit = 10;
const settled = (r?: GuestRequest) => !!r && r.status !== 'pending';

/**
 * The guest's cart for one table. A confirmed request moves to the sent list, and the cart is free for
 * an addition at once; only a submission without an answer keeps the cart locked until it is retried.
 */
export function useGuestOrder(menu: GuestMenu | null) {
  const [code] = useState(() => new URLSearchParams(window.location.search).get('table') || '');
  const [table, setTable] = useState<{ id: string; name: string } | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const prices = useMemo(
    () =>
      new Map(
        (menu?.sections || []).flatMap((section) =>
          section.items.flatMap((item) => item.prices.map((price) => [cartLineId(price), price] as const)),
        ),
      ),
    [menu],
  );
  // Keep the cart's quantities and price snapshot, but read availability from the latest menu.
  const cartLines = lines.map((line) => {
    const current = prices.get(line.id);
    return menu
      ? { ...line, price: { ...line.price, available: current ? current.available : false } }
      : line;
  });
  const availableLines = cartLines.filter((line) => line.price.available !== false);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState<Saved | null>(() => read(`guest-order:${code}`, null));
  const [sent, setSent] = useState<string[]>(() => {
    const ids = read<string[]>(`guest-order-sent:${code}`, []).filter((id) => typeof id === 'string');
    // A confirmed request stored before the sent list existed carries only its id.
    const legacy = read<Saved | null>(`guest-order:${code}`, null);
    return legacy?.id && !legacy.input && !legacy.terminal && !ids.includes(legacy.id)
      ? [...ids, legacy.id]
      : ids;
  });
  const [statuses, setStatuses] = useState<Record<string, GuestRequest>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const clearSubmitted = useCallback((input: GuestRequestInput) => {
    const ids = submittedLineIds(input);
    setLines((current) => current.filter((line) => !ids.has(line.id)));
  }, []);
  const remember = useCallback(
    (value: Saved | null) => {
      setSaved(value);
      write(`guest-order:${code}`, value);
    },
    [code],
  );
  const track = useCallback(
    (update: (ids: string[]) => string[]) =>
      setSent((current) => {
        const next = update(current).slice(-sentLimit);
        write(`guest-order-sent:${code}`, next.length ? next : null);
        return next;
      }),
    [code],
  );
  // Move a legacy confirmed id into the sent list once, so the saved slot only holds open submissions.
  useEffect(() => {
    if (saved?.id && !saved.input && !saved.terminal) {
      track((ids) => (ids.includes(saved.id) ? ids : [...ids, saved.id]));
      remember(null);
    }
  }, [saved, remember, track]);
  useEffect(() => {
    if (!code) return;
    let active = true;
    void request(`/api/guest-order?code=${encodeURIComponent(code)}`)
      .then((r) => {
        if (active) setTable(r.table);
      })
      .catch(() => {
        if (active) setTable(null);
      });
    return () => {
      active = false;
    };
  }, [code]);
  // An unanswered submission: its status tells whether the lost response had in fact been saved.
  useEffect(() => {
    if (!saved?.id || !saved.input) return;
    let active = true;
    const check = async () => {
      // The submission itself is in flight: its answer settles the slot.
      if (lock.current) return;
      try {
        const r = await request(
          `/api/guest-order?code=${encodeURIComponent(code)}&id=${encodeURIComponent(saved.id)}`,
        );
        if (active) {
          setStatuses((current) => ({ ...current, [saved.id]: r.request }));
          track((ids) => (ids.includes(saved.id) ? ids : [...ids, saved.id]));
          clearSubmitted(saved.input!);
          setComment('');
          setError('');
          remember(null);
        }
      } catch {
        if (active) setError('Статус недоступен. Повторите проверку позже.');
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [code, saved, remember, track, clearSubmitted]);
  // Confirmed requests are polled until staff settle them; a settled one is not asked again.
  const waiting = sent.filter((id) => !settled(statuses[id])).join(',');
  useEffect(() => {
    if (!waiting) return;
    let active = true;
    const check = () =>
      waiting.split(',').forEach(async (id) => {
        try {
          const r = await request(
            `/api/guest-order?code=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`,
          );
          if (active) setStatuses((current) => ({ ...current, [id]: r.request }));
        } catch (e) {
          // The row was purged after its retention: there is nothing left to show.
          if (active && (e as { status?: number }).status === 404)
            track((ids) => ids.filter((x) => x !== id));
        }
      });
    check();
    const timer = window.setInterval(check, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [code, waiting, track]);
  const locked = !!saved;
  const add = (price: GuestPrice, name: string) => {
    const currentPrice = menu ? prices.get(cartLineId(price)) : price;
    if (
      lock.current ||
      locked ||
      !currentPrice?.productId ||
      !currentPrice.productKind ||
      currentPrice.available === false
    )
      return;
    setLines((current) => {
      const id = cartLineId(price);
      const existing = current.find((l) => l.id === id);
      if (existing)
        return current.map((l) =>
          l.id === id ? { ...l, quantity: Math.min(barConfig.guest.orders.maxPortions, l.quantity + 1) } : l,
        );
      return current.length >= barConfig.guest.orders.maxLines
        ? current
        : [...current, { id, price: currentPrice, name, quantity: 1 }];
    });
  };
  const submit = async () => {
    if (lock.current || !table || saved?.terminal || (!saved?.input && !availableLines.length)) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const input: GuestRequestInput = saved?.input || {
      id: crypto.randomUUID().replaceAll('-', ''),
      code,
      comment,
      lines: availableLines.map((l, i) => ({
        id: `line_${i}`,
        kind: l.price.productKind!,
        productId: l.price.productId!,
        quantity: l.quantity,
        ...(l.price.servingMl ? { servingMl: l.price.servingMl } : {}),
      })),
    };
    remember({ id: input.id, input });
    try {
      const r = await request('/api/guest-order', input);
      setStatuses((current) => ({ ...current, [input.id]: r.request }));
      track((ids) => (ids.includes(input.id) ? ids : [...ids, input.id]));
      remember(null);
      clearSubmitted(input);
      setComment('');
    } catch (e) {
      // This endpoint returns 409 only when the audit confirms that the token was
      // already processed after its status row was purged. Require an explicit
      // new request, including after reload; never silently resubmit its contents.
      if ((e as { status?: number }).status === 409) {
        remember({ id: input.id, terminal: true });
        setLines([]);
        setComment('');
        return;
      }
      // A refused request (limits, a drink that ran out) leaves the cart as it was, to edit and send again.
      if ([400, 404, 413, 429].includes((e as { status?: number }).status || 0)) remember(null);
      setError(
        e instanceof Error && 'status' in e ? e.message : 'Не удалось отправить заявку. Повторите попытку.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const quantities = new Map(lines.map((l) => [l.id, l.quantity]));
  // An uncertain submission always retries its original contents, even after availability changes.
  const submitted = saved?.input ? submittedLineIds(saved.input) : null;
  const includedLines = submitted ? cartLines.filter((l) => submitted.has(l.id)) : availableLines;
  return {
    table,
    lines: cartLines,
    canSubmit: !!saved?.input || availableLines.length > 0,
    total: includedLines.reduce((sum, l) => sum + l.price.price * l.quantity, 0),
    count: lines.reduce((sum, l) => sum + l.quantity, 0),
    canAddLine: lines.length < barConfig.guest.orders.maxLines,
    quantityOf: (price: GuestPrice) => quantities.get(cartLineId(price)) || 0,
    comment,
    setComment,
    /** Confirmed requests with a known status, oldest first. */
    requests: sent.flatMap((id) => (statuses[id] ? [statuses[id]] : [])),
    busy,
    error,
    saved,
    /** False while a submission waits for its answer or was refused as already processed. */
    open: !locked,
    add,
    submit,
    remove: (id: string) => {
      if (!locked)
        setLines((current) =>
          current.flatMap((l) =>
            l.id !== id ? [l] : l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : [],
          ),
        );
    },
    removeLine: (id: string) => {
      if (!locked) setLines((current) => current.filter((l) => l.id !== id));
    },
    /** After a refused token: start an empty cart with a new token. */
    reset: () => {
      if (!lock.current && saved?.terminal) {
        remember(null);
        setLines([]);
        setComment('');
        setError('');
      }
    },
    /** Hide a settled request from the list. */
    dismiss: (id: string) => {
      if (settled(statuses[id])) track((ids) => ids.filter((x) => x !== id));
    },
  };
}
