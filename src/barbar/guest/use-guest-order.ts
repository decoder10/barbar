import { barConfig } from '../config';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuestPrice } from '../domain/guest-menu';
import type { GuestRequest, GuestRequestInput } from '../domain/guest-requests';

interface CartLine {
  id: string;
  price: GuestPrice;
  name: string;
  quantity: number;
}
interface Saved {
  id: string;
  input?: GuestRequestInput;
  terminal?: boolean;
}
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
export function useGuestOrder() {
  const [code] = useState(() => new URLSearchParams(window.location.search).get('table') || '');
  const [table, setTable] = useState<{ id: string; name: string } | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<GuestRequest | null>(null);
  const [saved, setSaved] = useState<Saved | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`guest-order:${code}`) || 'null');
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const remember = useCallback(
    (value: Saved | null) => {
      setSaved(value);
      try {
        if (value) sessionStorage.setItem(`guest-order:${code}`, JSON.stringify(value));
        else sessionStorage.removeItem(`guest-order:${code}`);
      } catch {
        /* In-memory retries still retain the same token. */
      }
    },
    [code],
  );
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
  useEffect(() => {
    if (!saved?.id || saved.terminal) return;
    let active = true;
    const read = async () => {
      try {
        const r = await request(
          `/api/guest-order?code=${encodeURIComponent(code)}&id=${encodeURIComponent(saved.id)}`,
        );
        if (active) {
          setStatus(r.request);
          setLines([]);
          setComment('');
          setError('');
          if (saved.input) remember({ id: saved.id });
        }
      } catch (e) {
        if (active) {
          if ((e as { status?: number }).status === 404 && !saved.input) {
            remember(null);
            setStatus(null);
          }
          setError('Статус недоступен. Повторите проверку позже.');
        }
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [code, saved, remember]);
  const add = (price: GuestPrice, name: string) => {
    if (saved || !price.productId || !price.productKind) return;
    setLines((current) => {
      const id = `${price.productKind}:${price.productId}`;
      const existing = current.find((l) => l.id === id);
      if (existing)
        return current.map((l) =>
          l.id === id ? { ...l, quantity: Math.min(barConfig.guest.orders.maxPortions, l.quantity + 1) } : l,
        );
      return current.length >= barConfig.guest.orders.maxLines
        ? current
        : [...current, { id, price, name, quantity: 1 }];
    });
  };
  const submit = async () => {
    if (lock.current || !table || saved?.terminal || (!saved?.input && !lines.length)) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const input: GuestRequestInput = saved?.input || {
      id: crypto.randomUUID().replaceAll('-', ''),
      code,
      comment,
      lines: lines.map((l, i) => ({
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
      setStatus(r.request);
      remember({ id: input.id });
      setLines([]);
      setComment('');
    } catch (e) {
      // This endpoint returns 409 only when the audit confirms that the token was
      // already processed after its status row was purged. Require an explicit
      // new request, including after reload; never silently resubmit its contents.
      if ((e as { status?: number }).status === 409) {
        remember({ id: input.id, terminal: true });
        setStatus(null);
        setLines([]);
        setComment('');
        return;
      }
      if ([400, 404, 413].includes((e as { status?: number }).status || 0)) remember(null);
      setError(
        e instanceof Error && 'status' in e ? e.message : 'Не удалось отправить заявку. Повторите попытку.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return {
    table,
    lines,
    comment,
    setComment,
    status,
    busy,
    error,
    saved,
    add,
    submit,
    remove: (id: string) => {
      if (!saved)
        setLines((current) =>
          current.flatMap((l) =>
            l.id !== id ? [l] : l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : [],
          ),
        );
    },
    reset: () => {
      if (!lock.current && (saved?.terminal || (status && status.status !== 'pending'))) {
        setStatus(null);
        remember(null);
        setLines([]);
        setComment('');
        setError('');
      }
    },
  };
}
