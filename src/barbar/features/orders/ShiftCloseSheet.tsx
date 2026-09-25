import { Link } from 'react-router-dom';
import { paymentMethods } from '../../domain/orders';
import { currentLanguage } from '../../presentation/i18n/runtime';
import type { Shift } from '../../domain/types';
import { useEffect, useState } from 'react';
import { useBar } from '../../app/providers/BarProvider';
import { businessToday } from '../../domain/business-day';
import { round } from '../../domain/money';
import { api } from '../../services/api-client';
import { t } from '../../presentation/i18n/runtime';
import { Sheet } from '../../ui/sheet';
import { Field } from '../../ui/fields';
import type { ShiftPreview } from '../../domain/shifts';

export function ShiftCloseSheet({ close, initialDay }: { close: () => void; initialDay?: string }) {
  const { run, busy } = useBar();
  const [day, setDay] = useState(initialDay || businessToday());
  const [cash, setCash] = useState('');
  const [result, setResult] = useState<{ preview: ShiftPreview; closed?: Shift } | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null);
    setError('');
    void api(`/api/barbar/shifts?from=${day}`)
      .then((r) => {
        if (active) setResult({ preview: r.preview, closed: r.shifts[0] });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [day, version]);
  const valid = cash.trim() !== '' && Number.isFinite(Number(cash)) && Number(cash) >= 0;
  const closable = !!result && !result.closed && !result.preview.openCount;
  return (
    <Sheet
      title="Закрыть смену"
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!result || !valid) return;
          if (
            await run(
              {
                type: 'closeShift',
                businessDay: day,
                expected: result.preview.expected,
                countedCash: round(Number(cash)),
              },
              'Смена закрыта.',
            )
          )
            close();
          else setVersion((v) => v + 1);
        }}
      >
        <fieldset disabled={busy} className="guest-request-lines">
          <Field label="День смены">
            <input
              type="date"
              required
              value={day}
              max={businessToday()}
              onChange={(e) => setDay(e.target.value)}
            />
          </Field>
          <p className="form-help">
            {t('После закрытия продажи за этот барный день запрещены. Оплаченные чеки нельзя отменять.')}
          </p>
          {error && <p role="alert">{t(error)}</p>}
          {result && (
            <>
              <p>
                {t('Оплаченных чеков')}: {result.preview.count} · {result.preview.revenue} AMD
              </p>
              <p>
                {t('Средний чек')}: {result.preview.average} AMD
              </p>
              {paymentMethods.map((m) => (
                <p key={m.id}>
                  {m.label[currentLanguage()]}: {result.preview.payments[m.id] || 0} AMD
                </p>
              ))}
              <p className="form-help">
                {t('Укажите наличную выручку по чекам без размена, внесений и изъятий.')}
              </p>
              {result.closed ? (
                <p role="status">
                  {t('Смена уже закрыта.')} {result.closed.closedBy?.fullName} · {result.closed.closedAt} ·{' '}
                  {t('Расхождение')}: {result.closed.difference} AMD
                </p>
              ) : result.preview.openCount ? (
                <div>
                  <p role="alert">{t('Сначала закройте открытые заказы смены.')}</p>
                  <ul>
                    {result.preview.openOrders.map((o) => (
                      <li key={o.id}>
                        <Link to={`/orders/${o.id}`} onClick={close}>
                          {t('Открыть заказ')} · {o.id.slice(-8)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <Field label="Пересчитанная наличная выручка, AMD">
                    <input
                      type="number"
                      min="0"
                      max="1000000000000"
                      step="0.01"
                      value={cash}
                      required
                      onChange={(e) => setCash(e.target.value)}
                    />
                  </Field>
                  {valid && (
                    <p>
                      {t('Расхождение')}: {round(Number(cash) - (result.preview.payments.cash || 0))} AMD
                    </p>
                  )}
                </>
              )}
            </>
          )}
          <div className="shift-close-actions">
            {closable && (
              <button type="submit" className="button primary" disabled={!valid}>
                {t('Подтвердить закрытие смены')}
              </button>
            )}
            <button type="button" className="button secondary" onClick={() => setVersion((v) => v + 1)}>
              {t('Обновить')}
            </button>
          </div>
        </fieldset>
      </form>
    </Sheet>
  );
}
export function ShiftCloseButton({ day }: { day?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button secondary shift-close-button" onClick={() => setOpen(true)}>
        {t('Закрыть смену')}
      </button>
      {open && <ShiftCloseSheet initialDay={day} close={() => setOpen(false)} />}
    </>
  );
}
