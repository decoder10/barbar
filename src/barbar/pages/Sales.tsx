import { SalesDayToolbar } from '../features/sales/SalesDayToolbar';
import { BusyButton } from '../ui/loading';
import { useHistory } from '../features/sales/use-history';
import { Pagination } from '../ui/pagination';
import { menuQuantitySummary } from '../domain/quantity-summary';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  GlassWater,
  Plus,
  ShoppingBag,
  Undo2,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Empty, Metric } from '../ui/layout';
import { ExportButton } from '../ui/export';
import { Modal } from '../ui/modal';
import { formatMoney as money } from '../presentation/currency/format-money';
import { businessDayHint } from '../domain/business-day';
import { businessDayLabel } from '../presentation/format-date';
import { dayTotals } from '../domain/sales/day-totals';
import { activeSales, saleUnit, volume } from '../domain/model';
import type { Sale } from '../domain/types';
import { SalesCatalog } from '../features/sales/SalesCatalog';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
import { useBusinessDate } from '../features/sales/use-business-date';
import { DayReceipt } from '../features/sales/DayReceipt';
import { useCompact } from '../ui/use-compact';
export default function Sales() {
  const { data, run, busy } = useBar();
  const navigate = useNavigate();
  const compact = useCompact();
  const [date, setDate] = useBusinessDate();
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const history = useHistory('sales', date);
  const allDaySales = history.enabled ? history.rows : data.sales.filter((s) => s.date === date);
  const totals = history.enabled ? history.groups : activeSales(data).filter((s) => s.date === date);
  const { revenue, cost, menuQuantity: count, pouredMl: ml, operations: operationCount } = dayTotals(totals);
  const dayLabel = businessDayLabel(date);
  const metrics = (
    <section className="metrics">
      <Metric
        label="Выручка за день"
        value={money(revenue)}
        hint={dayLabel}
        icon={<Banknote size={18} />}
        accent
      />
      <Metric
        label="Валовая прибыль"
        value={money(revenue - cost)}
        hint="Выручка − стоимость ингредиентов"
        icon={<ArrowUpRight size={18} />}
      />
      <Metric
        label="Продано из меню"
        value={`${count} ед.`}
        hint={menuQuantitySummary(totals)}
        icon={<GlassWater size={18} />}
      />
      <Metric
        label="Алкоголь в розлив"
        value={volume(ml)}
        hint="Продажи без коктейлей"
        icon={<ArrowDownRight size={18} />}
      />
    </section>
  );
  return (
    <>
      <h1 className="visually-hidden">{t('Продажи за день')}</h1>
      <SalesDayToolbar
        date={date}
        onChange={setDate}
        action={
          <>
            <Link className="button primary" to="/orders/new">
              <Zap size={15} />
              {t(' Быстрая продажа')}
            </Link>
            <Link className="button secondary" to="/cocktails">
              <Plus size={15} />
              {t(' Коктейль')}
            </Link>
          </>
        }
      />
      <p className="business-day-hint">{t(businessDayHint)}</p>
      {!compact && metrics}
      <div className="sales-layout">
        <SalesCatalog
          date={date}
          filterKey="owner-sales"
          onSelect={({ kind, id }) => navigate(`/orders/new?add=${kind}:${encodeURIComponent(id)}`)}
        />
        <DayReceipt dayLabel={dayLabel} count={operationCount} total={money(revenue)} metrics={metrics}>
          <div className="receipt-lines">
            {t(
              !allDaySales.length ? (
                <Empty
                  title={t('День только начинается')}
                  text="Добавьте первую продажу — она появится здесь."
                />
              ) : (
                (history.enabled ? allDaySales : [...allDaySales].reverse()).map((s) => (
                  <div className={`receipt-line ${s.voided ? 'voided' : ''}`} key={s.id}>
                    <span className="receipt-drink">
                      <GlassWater size={18} />
                    </span>
                    <div>
                      <strong>{t(s.name)}</strong>
                      <small>
                        {t(s.quantity)} {t(saleUnit(s))}
                        {t(s.servingMl ? ` · по ${s.servingMl} мл` : '')}
                        {t(s.orderId ? ' · заказ' : '')}
                        {t(s.voided ? ' · отменена' : '')}
                      </small>
                    </div>
                    <b>{t(money(s.revenue))}</b>
                    {t(
                      !s.voided && (
                        <button
                          className="icon-button"
                          disabled={busy}
                          onClick={() => setVoiding(s)}
                          aria-label={t(`Отменить продажу ${s.name}`)}
                        >
                          <Undo2 size={14} />
                        </button>
                      ),
                    )}
                  </div>
                ))
              ),
            )}
          </div>
          <Pagination page={history} />
          <div className="receipt-total">
            <span>
              {t('Итого за день')}
              <strong>{t(money(revenue))}</strong>
            </span>
            <small>
              <ShoppingBag size={14} /> {t(operationCount)}
              {t(' операций · ')}
              {t(menuQuantitySummary(totals))}
              {ml > 0 ? ` · ${volume(ml)}` : ''}
            </small>
          </div>
          <ExportButton name={`sales-${date}.json`} value={allDaySales}>
            {t(history.enabled ? 'Скачать страницу' : 'Скачать день')}
          </ExportButton>
          <div className="receipt-note">
            <span />
            {t(' Остатки списываются автоматически')}
          </div>
        </DayReceipt>
      </div>
      {t(
        voiding && (
          <Modal
            title={t('Отменить продажу?')}
            subtitle={`${voiding.name} · ${money(voiding.revenue)}`}
            close={() => setVoiding(null)}
          >
            <p className="modal-text">
              {t(
                'Ингредиенты вернутся на склад. Запись останется в истории с отметкой об отмене и не будет учитываться в выручке.',
              )}
            </p>
            <BusyButton
              busy={busy}
              className="button primary full"
              disabled={busy}
              onClick={async () => {
                if (
                  await run({ type: 'void', saleId: voiding.id }, 'Продажа отменена. Ингредиенты возвращены.')
                ) {
                  setVoiding(null);
                }
              }}
            >
              {t('Подтвердить отмену')}
            </BusyButton>
          </Modal>
        ),
      )}
    </>
  );
}
