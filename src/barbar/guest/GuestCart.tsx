import { ShoppingBag, Trash2, X } from 'lucide-react';
import { barConfig } from '../config';
import type { Language } from '../domain/identity/preferences';
import { t } from '../presentation/i18n/runtime';
import { menuLocale, menuNumber, QuantityStepper } from './menu-parts';
import type { useGuestOrder } from './use-guest-order';

/**
 * The table's cart: requests already sent with their status, then a cart that stays open for an
 * addition. Only a submission still waiting for its answer locks it until it is retried.
 */
export function GuestCart({
  order,
  language,
}: {
  order: ReturnType<typeof useGuestOrder>;
  language: Language;
}) {
  if (!order.table) return null;
  const number = menuNumber(language);
  const statusText = {
    pending: 'Заявка отправлена. Ожидайте сотрудника.',
    accepted: 'Заявка принята. Отмеченные позиции добавлены в чек.',
    rejected: 'Заявка отклонена. Обратитесь к сотруднику.',
    expired: 'Срок заявки истёк. Отправьте новую.',
  };
  const hasUnavailable = order.lines.some((l) => l.price.available === false);
  const time = new Intl.DateTimeFormat(menuLocale(language), { hour: '2-digit', minute: '2-digit' });
  // After a request that staff took or still consider, the cart is an addition to the same table.
  const adding = order.requests.some((r) => r.status === 'pending' || r.status === 'accepted');
  return (
    <section className="guest-cart" aria-label={t('Корзина')}>
      <div className="guest-cart-heading">
        <ShoppingBag size={23} aria-hidden="true" />
        <h2>{t('Корзина')}</h2>
        <span>
          {t('Стол')} {order.table.name}
        </span>
      </div>
      <p className="guest-cart-note">{t('Заявка не является оплатой. Сотрудник подтвердит наличие.')}</p>
      {order.requests.length > 0 && (
        <section className="guest-sent" aria-label={t('Ваши заявки')}>
          <h3>{t('Ваши заявки')}</h3>
          <ul>
            {order.requests.map((r) => (
              <li key={r.id} className={`guest-sent-request ${r.status}`}>
                <div className="guest-sent-heading">
                  <strong>
                    {t('Заявка')} · <time dateTime={r.createdAt}>{time.format(new Date(r.createdAt))}</time>
                  </strong>
                  {r.status !== 'pending' && (
                    <button
                      type="button"
                      className="guest-sent-dismiss"
                      onClick={() => order.dismiss(r.id)}
                      aria-label={`${t('Скрыть заявку')} · ${time.format(new Date(r.createdAt))}`}
                      title={t('Скрыть заявку')}
                    >
                      <X size={17} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <p role="status">{t(statusText[r.status])}</p>
                <ul className="guest-cart-lines">
                  {r.lines.map((l) => (
                    <li key={l.id}>
                      <span>
                        {l.name} × {l.quantity}
                      </span>
                      {r.status === 'accepted' && (
                        <small>{t(r.acceptedLineIds?.includes(l.id) ? 'Принято' : 'Отклонено')}</small>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      {order.saved?.terminal ? (
        <>
          <p role="status">{t('Заявка уже обработана или истекла.')}</p>
          <button type="button" className="guest-cart-submit" onClick={order.reset}>
            {t('Новая заявка')}
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void order.submit();
          }}
        >
          {order.requests.length > 0 && (
            <h3 className="guest-cart-subheading">{t(adding ? 'Добавить к заказу' : 'Новая заявка')}</h3>
          )}
          <fieldset disabled={order.busy || !order.open}>
            {!order.lines.length && !order.saved?.input && (
              <p className="guest-cart-empty">{t('Корзина пуста. Добавьте напитки из меню.')}</p>
            )}
            <ul className="guest-cart-lines">
              {order.lines.map((l) => {
                const name = l.price.portion ? `${l.name} · ${t(l.price.portion)}` : l.name;
                const unavailable = l.price.available === false;
                return (
                  <li key={l.id} className={unavailable ? 'guest-cart-unavailable' : undefined}>
                    <span>
                      {name}
                      {unavailable && <small className="guest-cart-stock">{t('Нет в наличии')}</small>}
                    </span>
                    <strong>{number.format(l.price.price * l.quantity)} ֏</strong>
                    <QuantityStepper
                      name={name}
                      quantity={l.quantity}
                      canIncrease={!unavailable}
                      decrease={() => order.remove(l.id)}
                      increase={() => order.add(l.price, l.name)}
                    />
                    <button
                      type="button"
                      className="guest-cart-remove"
                      onClick={() => order.removeLine(l.id)}
                      aria-label={`${t('Убрать')}: ${name}`}
                      title={t('Убрать')}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {hasUnavailable && order.open && (
              <p className="guest-cart-availability" role="status">
                {t('Недоступные позиции не войдут в заявку и останутся в корзине.')}
              </p>
            )}
            {!!order.lines.length && (
              <p className="guest-cart-total">
                <span>{t('Итого')}</span>
                <strong>{number.format(order.total)} ֏</strong>
              </p>
            )}
            <label className="guest-cart-comment">
              {t('Комментарий к заявке')}
              <textarea
                maxLength={barConfig.guest.orders.maxCommentLength}
                value={order.comment}
                onChange={(e) => order.setComment(e.target.value)}
              />
            </label>
          </fieldset>
          <button type="submit" className="guest-cart-submit" disabled={order.busy || !order.canSubmit}>
            {t(order.saved?.input ? 'Повторить отправку' : 'Отправить заявку')}
          </button>
        </form>
      )}
      {order.error && <p role="alert">{t(order.error)}</p>}
    </section>
  );
}
