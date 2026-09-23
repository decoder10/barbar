import { barConfig } from '../config';
import { guestMenu } from './guest-menu';
import { applyCommand } from './model';
import { openOrderAt } from './orders';
import { businessToday } from './business-day';
import type { BarData, CommandContext, Sale } from './types';

export const guestOrderLimits = barConfig.guest.orders;

export interface GuestRequestLine {
  id: string;
  productId: string;
  kind: Sale['kind'];
  quantity: number;
  servingMl?: number;
  name: string;
  unitPrice: number;
}
export interface GuestRequest {
  id: string;
  tableId: string;
  tableName: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  lines: GuestRequestLine[];
  comment: string;
  acceptedLineIds?: string[];
  orderId?: string;
}
export interface GuestRequestInput {
  id: string;
  code: string;
  comment: string;
  lines: { id: string; kind: Sale['kind']; productId: string; quantity: number; servingMl?: number }[];
}
export const guestTokenValid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32,64}$/.test(value);
const bad = () => {
  throw new Error('Проверьте заявку: до 20 строк, 1–10 порций и комментарий до 200 символов.');
};
/** With `balances` a line the menu shows as out of stock is refused, the same rule as on the menu card. */
export function quoteGuestRequest(
  data: Pick<BarData, 'alcohol' | 'cocktails'>,
  input: GuestRequestInput,
  balances?: Map<string, number>,
): GuestRequestLine[] {
  if (
    !input ||
    !guestTokenValid(input.id) ||
    typeof input.code !== 'string' ||
    !/^[a-zA-Z0-9]{6,32}$/.test(input.code) ||
    typeof input.comment !== 'string' ||
    input.comment.length > guestOrderLimits.maxCommentLength ||
    !Array.isArray(input.lines) ||
    !input.lines.length ||
    input.lines.length > guestOrderLimits.maxLines
  )
    return bad();
  if (new Set(input.lines.map((l) => l?.id)).size !== input.lines.length) return bad();
  const prices = new Map(
    guestMenu(data, '', balances)
      .sections.flatMap((s) => s.items)
      .flatMap((i) => i.prices.map((p) => [`${p.productKind}:${p.productId}`, p] as const)),
  );
  return input.lines.map((line) => {
    if (
      !line ||
      typeof line.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(line.id) ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > guestOrderLimits.maxPortions
    )
      return bad();
    const price = prices.get(`${line.kind}:${line.productId}`);
    if (!price || price.servingMl !== line.servingMl)
      throw new Error('Позиция или объём больше недоступны в меню.');
    const product = (line.kind === 'alcohol' ? data.alcohol : data.cocktails).find(
      (p) => p.id === line.productId,
    )!;
    if (price.available === false) throw new Error(`Позиция закончилась: ${product.name}`);
    return {
      id: line.id,
      kind: line.kind,
      productId: line.productId,
      quantity: line.quantity,
      ...(price.servingMl ? { servingMl: price.servingMl } : {}),
      name: product.name,
      unitPrice: price.price,
    };
  });
}
export const guestRequestStatus = (request: GuestRequest, now = Date.now()): GuestRequest['status'] =>
  request.status === 'pending' && Date.parse(request.expiresAt) <= now ? 'expired' : request.status;
/** A selection is final: unselected lines are rejected, and can never be accepted later. */
export function acceptGuestRequest(
  data: BarData,
  request: GuestRequest,
  lineIds: string[],
  context: CommandContext,
) {
  if (guestRequestStatus(request) !== 'pending') throw new Error('Заявка уже обработана или истекла.');
  if (
    !Array.isArray(lineIds) ||
    !lineIds.length ||
    new Set(lineIds).size !== lineIds.length ||
    lineIds.some((id) => !request.lines.some((l) => l.id === id))
  )
    throw new Error('Выберите позиции заявки.');
  const table = data.tables?.find((t) => t.id === request.tableId && t.active);
  if (!table) throw new Error('Стол недоступен.');
  const selected = request.lines.filter((l) => lineIds.includes(l.id));
  const quote = quoteGuestRequest(data, {
    id: request.id,
    code: table.code,
    comment: request.comment,
    lines: selected,
  });
  if (quote.some((l, i) => l.unitPrice !== selected[i].unitPrice))
    throw new Error('Цены изменились. Отклоните заявку и попросите гостя отправить новую.');
  let next = data;
  let order = openOrderAt(data.orders, table.id);
  if (!order) {
    next = applyCommand(next, { id: `guest_${request.id}`, type: 'openOrder', tableId: table.id }, context);
    order = next.orders!.find((o) => o.id === `guest_${request.id}`)!;
  }
  for (const line of quote) {
    // The server controls quantities in the units required by the existing sale path.
    next = applyCommand(
      next,
      {
        id: `guest_${request.id}_${request.lines.findIndex((l) => l.id === line.id)}`,
        type: 'sale',
        value: {
          kind: line.kind,
          productId: line.productId,
          quantity:
            line.kind === 'alcohol' ? line.quantity * barConfig.guest.pouredAlcohol.portionMl : line.quantity,
          ...(line.kind === 'cocktail' && line.servingMl ? { servingMl: line.servingMl } : {}),
          orderId: order.id,
          date: businessToday(),
          businessDay: true,
        },
      },
      context,
    );
  }
  return {
    data: next,
    request: { ...request, status: 'accepted' as const, acceptedLineIds: [...lineIds], orderId: order.id },
  };
}
/** Pending requests per table, each list oldest first, tables in the order they first asked. */
export function requestsByTable(requests: GuestRequest[]) {
  const groups = new Map<string, GuestRequest[]>();
  for (const r of [...requests].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
    groups.set(r.tableId, [...(groups.get(r.tableId) || []), r]);
  return groups;
}
