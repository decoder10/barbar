import type { ClientSession, Db } from 'mongodb';
import type { UserProfile } from '../../../src/barbar/domain/identity/user';
import type { AuditEvent } from '../../../src/barbar/domain/identity/audit';
export type { AuditEvent } from '../../../src/barbar/domain/identity/audit';
/** Only server-constructed, allowlisted metadata. Never persist request bodies or passwords. */
export async function appendAudit(db: Db, session: ClientSession, event: AuditEvent) {
  await db
    .collection<AuditEvent & { _id: string }>('auditEvents')
    .insertOne({ ...event, _id: event.id }, { session });
}
export const actorProfile = (user: UserProfile) => ({
  id: user.id,
  fullName: user.fullName,
  role: user.role,
});

export function commandAudit(
  command: import('../../../src/barbar/domain/types').Command,
  next: import('../../../src/barbar/domain/types').BarData,
  actor: UserProfile,
  /** The state before the command, for summaries of what was removed. */
  before: Pick<import('../../../src/barbar/domain/types').BarData, 'tables' | 'suppliers'>,
): AuditEvent {
  let targetId = command.id,
    summary: string = command.type;
  const name = (id: string) => next.alcohol.find((a) => a.id === id)?.name || id;
  const tableLabel = (orderId: string) => {
    const order = next.orders?.find((o) => o.id === orderId);
    const table = order?.tableId ? next.tables?.find((t) => t.id === order.tableId) : undefined;
    return table ? `стол «${table.name}»` : 'без стола';
  };
  switch (command.type) {
    case 'closeShift':
      summary = `Закрытие смены ${command.businessDay}: наличные ${command.countedCash} AMD`;
      break;
    case 'acceptGuestRequest':
    case 'rejectGuestRequest':
      targetId = command.requestId;
      summary = `${command.type === 'acceptGuestRequest' ? 'Принята' : 'Отклонена'} гостевая заявка ${command.requestId}`;
      break;
    case 'sale':
      summary = `Продажа: ${next.sales.find((s) => s.id === command.id)?.name || ''}${command.value?.orderId ? ` · ${tableLabel(command.value.orderId)}` : ''}`;
      break;
    case 'addLines':
      targetId = command.orderId || command.id;
      summary = `Повтор заказа: ${command.lines?.length || 0} поз. · ${command.expectedTotal} AMD · ${tableLabel(targetId)}`;
      break;
    case 'correctBatchYield':
      targetId = command.batchId;
      summary = `Партия ${command.batchId}: выход ${command.expected} → ${command.actual}. ${command.reason}`;
      break;
    case 'setFavorite':
      targetId = command.productId;
      summary = `${command.favorite ? 'Избранное' : 'Не избранное'}: ${(command.kind === 'alcohol' ? next.alcohol : next.cocktails).find((p) => p.id === command.productId)?.name || command.productId}`;
      break;
    case 'saveSupplier':
      targetId = command.value.id;
      summary = `Поставщик «${command.value.name}»${command.value.leadDays === undefined ? '' : `, срок ${command.value.leadDays} дн.`}`;
      break;
    case 'removeSupplier':
      targetId = command.supplierId;
      summary = `Поставщик удалён: ${before.suppliers?.find((x) => x.id === command.supplierId)?.name || command.supplierId}`;
      break;
    case 'saveTable':
      targetId = command.value.id;
      summary = `Стол «${command.value.name}»${command.value.active ? '' : ' отключён'}`;
      break;
    case 'removeTable':
      targetId = command.tableId;
      summary = `Стол удалён: ${before.tables?.find((t) => t.id === command.tableId)?.name || command.tableId}`;
      break;
    case 'openOrder':
      summary = `Открыт заказ: ${tableLabel(command.id)}`;
      break;
    case 'payOrder': {
      targetId = command.orderId;
      const order = next.orders?.find((o) => o.id === command.orderId);
      summary = `Оплата заказа: ${order?.total ?? command.expectedTotal} AMD · ${(order?.payments || command.payments).map((p) => `${p.method} ${p.amount}`).join(', ')} · ${tableLabel(command.orderId)}`;
      break;
    }
    case 'cancelOrder':
      targetId = command.orderId;
      summary = `Отмена заказа: ${tableLabel(command.orderId)}`;
      break;
    case 'void':
    case 'removeLine':
      targetId = command.saleId;
      summary = `${command.type === 'void' ? 'Отмена продажи' : 'Позиция убрана из заказа'}: ${next.sales.find((s) => s.id === command.saleId)?.name || command.saleId}`;
      break;
    case 'purchase':
      targetId = command.value.id;
      summary = `Закупка: ${name(command.value.alcoholId)}, ${command.value.ml}`;
      break;
    case 'alcohol':
    case 'cocktail':
      targetId = command.value.id;
      summary = command.value.name;
      break;
    case 'createCocktail':
      summary = command.value.name;
      break;
    case 'updateRecipe':
      targetId = command.cocktailId;
      summary = `${next.cocktails.find((c) => c.id === targetId)?.name || targetId}: ${command.ingredients.map((i) => `${name(i.alcoholId)} ${i.ml}`).join(', ')}`;
      break;
    case 'correctPurchase':
      targetId = command.purchaseId;
      summary = `${command.purchaseId}: ${command.expectedMl} → ${command.ml}`;
      break;
    case 'resetStock':
      targetId = command.alcoholId;
      summary = `${name(command.alcoholId)}: ${command.expectedMl} → 0`;
      break;
    case 'count':
      summary = `${command.reason}: ${command.lines.map((l) => `${name(l.alcoholId)} ${l.expected} → ${l.actual}`).join(', ')}`;
      break;
    case 'writeoff':
      summary = `${name(command.alcoholId)}: −${command.quantity}${command.batchId ? ` (партия ${command.batchId})` : ''}. ${command.reason}`;
      break;
    case 'prepare':
      summary = `${name(command.outputId)}: +${command.quantity}${command.plannedQuantity ? ` (план ${command.plannedQuantity})` : ''}. ${command.reason}`;
      break;
    case 'expense':
      summary = `${command.value.description}: ${command.value.amount} AMD`;
      break;
    case 'voidExpense':
      targetId = command.expenseId;
      summary = next.expenses?.find((e) => e.id === targetId)?.description || targetId;
      break;
    case 'purge':
      summary = `Архивация продаж до ${command.before}`;
      break;
    case 'restore':
      summary = 'Восстановление данных из файла';
      break;
  }
  return {
    id: command.id,
    createdAt: new Date().toISOString(),
    actor: actorProfile(actor),
    action: command.type,
    targetId,
    summary: summary.slice(0, 6000),
  };
}
