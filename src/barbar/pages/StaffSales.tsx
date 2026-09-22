import { formatMoney as money } from '../presentation/currency/format-money';
import { LoadingStatus } from '../ui/loading';
import { SalesDayToolbar } from '../features/sales/SalesDayToolbar';
import { useHistory } from '../features/sales/use-history';
import { menuQuantitySummary } from '../domain/quantity-summary';
import { ArrowDownRight, Banknote, GlassWater, Plus, ShoppingBag, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Empty, Metric } from '../ui/layout';
import { businessDayHint } from '../domain/business-day';
import { businessDayLabel } from '../presentation/format-date';
import { dayTotals } from '../domain/sales/day-totals';
import { groupReceipt, type ReceiptRow } from '../domain/orders';
import { volume } from '../domain/model';
import type { StaffSale } from '../domain/types';
import StaffCocktailForm from '../features/recipes/StaffCocktailForm';
import { SalesCatalog } from '../features/sales/SalesCatalog';
import { staffSaleLabel } from '../features/sales/StaffSaleForm';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';
import { useBusinessDate } from '../features/sales/use-business-date';
import { DayReceipt } from '../features/sales/DayReceipt';
import { useCompact } from '../ui/use-compact';

/** Worker sales: the owner's screen without costs, profit, voids, exports or the operation log. */
export default function StaffSales() {
  const { staffData } = useBar();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const compact = useCompact();
  const [date, setDate] = useBusinessDate();
  const history = useHistory<StaffSale>('sales', date);
  if (!staffData) return <p className="muted">{t('Загружаем продажи…')}</p>;
  const day = history.enabled ? history.rows : staffData.sales.filter((sale) => sale.date === date);
  const sales = history.enabled ? history.groups : day.filter((sale) => !sale.voided);
  const { revenue, menuQuantity, pouredMl: ml, operations: operationCount } = dayTotals(sales);
  // Workers see what was sold, grouped by position, not each operation.
  const summary = groupReceipt<ReceiptRow>(sales);
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
        label="Продано из меню"
        value={`${menuQuantity} ед.`}
        hint={menuQuantitySummary(sales)}
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
            <button className="button secondary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              {t('Коктейль')}
            </button>
          </>
        }
      />
      <p className="business-day-hint">{t(businessDayHint)}</p>
      {!compact && metrics}
      {t(
        staffData.archivedBefore && date < staffData.archivedBefore && (
          <p className="form-warning">{t('История за этот день очищена владельцем.')}</p>
        ),
      )}
      <div className="sales-layout">
        <SalesCatalog
          date={date}
          filterKey="worker-sales"
          onSelect={({ kind, id }) => navigate(`/orders/new?add=${kind}:${encodeURIComponent(id)}`)}
        />
        <DayReceipt
          label="Сводка продаж за день"
          dayLabel={dayLabel}
          count={summary.length}
          total={money(revenue)}
          metrics={metrics}
        >
          <div className="receipt-lines">
            {history.loading ? (
              <LoadingStatus />
            ) : history.error ? (
              <p role="alert">{t(history.error)}</p>
            ) : !summary.length ? (
              <Empty
                title={t('День только начинается')}
                text="Добавьте первую продажу — она появится здесь."
              />
            ) : (
              summary.map((item) => (
                <div className="receipt-line" key={item.key}>
                  <span className="receipt-drink">
                    <GlassWater size={18} />
                  </span>
                  <div>
                    <strong>{t(item.name)}</strong>
                    <small>
                      {t(staffSaleLabel(item.quantity, item))}
                      {t(item.servingMl ? ` · по ${item.servingMl} мл` : '')}
                    </small>
                  </div>
                  <b>{t(money(item.revenue))}</b>
                </div>
              ))
            )}
          </div>
          <div className="receipt-total">
            <span>
              {t('Итого за день')}
              <strong>{t(money(revenue))}</strong>
            </span>
            <small>
              <ShoppingBag size={14} /> {t(operationCount)}
              {t(' операций · ')}
              {t(menuQuantitySummary(sales))}
              {ml > 0 ? ` · ${volume(ml)}` : ''}
            </small>
          </div>
          <div className="receipt-note">
            <span />
            {t(' Остатки списываются автоматически')}
          </div>
          <div className="receipt-note">{t('Для исправления продажи обратитесь к владельцу.')}</div>
        </DayReceipt>
      </div>
      {t(creating && <StaffCocktailForm close={() => setCreating(false)} />)}
    </>
  );
}
