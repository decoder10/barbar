import { barConfig } from '../config';
import { t } from '../presentation/i18n/runtime';
import type { useGuestOrder } from './use-guest-order';

export function GuestCart({ order }: { order: ReturnType<typeof useGuestOrder> }) {
  if (!order.table) return null;
  const statusText = {
    pending: 'Заявка отправлена. Ожидайте сотрудника.',
    accepted: 'Заявка принята. Отмеченные позиции добавлены в чек.',
    rejected: 'Заявка отклонена. Обратитесь к сотруднику.',
    expired: 'Срок заявки истёк. Отправьте новую.',
  };
  return (
    <section className="guest-cart" aria-label={t('Корзина')}>
      <h2>
        {t('Стол')} {order.table.name} · {t('Корзина')}
      </h2>
      <p>{t('Заявка не является оплатой. Сотрудник подтвердит наличие.')}</p>
      {order.saved?.terminal ? (
        <>
          <p role="status">{t('Заявка уже обработана или истекла.')}</p>
          <button type="button" onClick={order.reset}>
            {t('Новая заявка')}
          </button>
        </>
      ) : order.status ? (
        <>
          <p role="status">{t(statusText[order.status.status])}</p>
          <ul>
            {order.status.lines.map((l) => (
              <li key={l.id}>
                {l.name} × {l.quantity}{' '}
                {order.status?.status === 'accepted'
                  ? t(order.status.acceptedLineIds?.includes(l.id) ? 'Принято' : 'Отклонено')
                  : ''}
              </li>
            ))}
          </ul>
          {order.status.status !== 'pending' && (
            <button type="button" onClick={order.reset}>
              {t('Новая заявка')}
            </button>
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void order.submit();
          }}
        >
          <fieldset disabled={order.busy || !!order.saved}>
            <ul>
              {order.lines.map((l) => (
                <li key={l.id}>
                  <span>
                    {l.name} · {t(l.price.portion || '')} × {l.quantity}
                  </span>
                  <strong>{l.price.price * l.quantity} AMD</strong>
                  <button
                    type="button"
                    onClick={() => order.remove(l.id)}
                    aria-label={`${t('Убрать')}: ${l.name}`}
                  >
                    −
                  </button>
                </li>
              ))}
            </ul>
            <label>
              {t('Комментарий к заявке')}
              <textarea
                maxLength={barConfig.guest.orders.maxCommentLength}
                value={order.comment}
                onChange={(e) => order.setComment(e.target.value)}
              />
            </label>
          </fieldset>
          <button type="submit" disabled={order.busy || (!order.lines.length && !order.saved?.input)}>
            {t(order.saved?.input ? 'Повторить отправку' : 'Отправить заявку')}
          </button>
        </form>
      )}
      {order.error && <p role="alert">{t(order.error)}</p>}
    </section>
  );
}
