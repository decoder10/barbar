import { LoadingStatus, BusyButton } from '../ui/loading';
import { Archive, ArrowDownToLine, FileJson, FolderArchive, Trash2, Upload } from 'lucide-react';
import { snapshotRead } from '../services/api-client';
import { useEffect, useRef, useState } from 'react';
import { download, ExportButton } from '../ui/export';
import { Modal } from '../ui/modal';
import { DatePicker } from '../ui/date-picker';
import { PageHeading } from '../ui/layout';
import { formatMoney as money } from '../presentation/currency/format-money';
import { today, validateData } from '../domain/model';
import type { BarData } from '../domain/types';
import { t } from '../presentation/i18n/runtime';
import { useBar } from '../app/providers/BarProvider';

export default function Backups() {
  const { data: working, run, notify, busy, perform } = useBar();
  const [snapshot, setFull] = useState<{ data: BarData; source: BarData } | null>(null);
  const full = snapshot?.source === working ? snapshot.data : null;
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (!working.opening) return;
    let stopped = false;
    // Shared per-snapshot cache: a remount or a second reader does not refetch the full copy.
    void snapshotRead(working, '/api/barbar?view=full')
      .then((r) => {
        if (!stopped) setFull({ data: r.data, source: working });
      })
      .catch((e) => {
        if (!stopped) setLoadError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [working]);
  const data = working.opening ? full || working : working;
  const input = useRef<HTMLInputElement>(null);
  const [restore, setRestore] = useState<BarData | null>(null);
  const [cutoff, setCutoff] = useState(() => {
    const d = new Date(`${today()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [purging, setPurging] = useState(false);
  const purgeSales = data.sales.filter((s) => s.date < cutoff);
  const purgeDays = new Set(purgeSales.map((s) => s.date)).size;
  const [confirmation, setConfirmation] = useState('');
  const grouped = Object.fromEntries(
    [...new Set(data.sales.map((s) => s.date))]
      .sort()
      .map((date) => [date, data.sales.filter((s) => s.date === date)]),
  );
  const exports = [
    {
      name: 'alcohol.json',
      title: 'Каталог напитков',
      description: `${data.alcohol.length} видов · закупочные и продажные цены`,
      value: data.alcohol,
    },
    {
      name: 'cocktails.json',
      title: 'Рецепты коктейлей',
      description: `${data.cocktails.length} рецептов · состав, объёмы, цены`,
      value: data.cocktails,
    },
    {
      name: 'purchases.json',
      title: 'Закупки',
      description: `${data.purchases.length} поставок · даты и стоимость`,
      value: data.purchases,
    },
    {
      name: 'sales-by-day.json',
      title: 'Продажи по дням',
      description: `${data.sales.length} записей · сгруппированы по дате`,
      value: grouped,
    },
  ];
  if (working.opening && !full)
    return loadError ? <p role="alert">{t(loadError)}</p> : <LoadingStatus label="Загружаем полную копию…" />;
  return (
    <>
      <PageHeading
        eyebrow="ВАШИ ДАННЫЕ В ВАШИХ РУКАХ"
        title={t('Данные и резервные копии')}
        description="Скачивайте отдельные справочники или полный архив вашего бара."
      />
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>{t('Полная резервная копия')}</h2>
            <p>{t('Все напитки, рецепты, закупки и история продаж в одном файле')}</p>
          </div>
          <Archive size={24} />
        </div>
        <div className="backup-actions">
          <button className="button primary" onClick={() => download(`barbar-backup-${today()}.json`, data)}>
            <ArrowDownToLine size={17} />
            {t(' Скачать резервную копию')}
          </button>
          <button className="button secondary" onClick={() => input.current?.click()} disabled={busy}>
            <Upload size={17} />
            {t(' Восстановить из файла')}
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) {
                return;
              }
              try {
                if (file.size > 3_000_000) {
                  throw new Error('Максимальный размер файла — 3 МБ.');
                }
                const restored = await perform(
                  async () => validateData(JSON.parse(await file.text())),
                  'Проверяем файл…',
                );
                if (restored) {
                  setRestore(restored);
                  setConfirmation('');
                }
              } catch (error) {
                notify(error instanceof Error ? error.message : 'Файл не удалось прочитать.', true);
              }
            }}
          />
        </div>
        <p className="form-help">
          {t(
            'Для восстановления нужен полный файл barbar-backup. Отдельные файлы ниже предназначены для просмотра, переноса и работы с данными.',
          )}
        </p>
      </section>
      <div className="section-title">
        <div>
          <h2>{t('Отдельные файлы')}</h2>
          <p>{t('Данные разделены по назначению — как вы и привыкли')}</p>
        </div>
      </div>
      <div className="export-grid">
        {t(
          exports.map((item) => (
            <div className="export-card" key={item.name}>
              <span className="file-icon">
                <FileJson size={25} />
              </span>
              <code>{t(item.name)}</code>
              <h3>{t(item.title)}</h3>
              <p>{t(item.description)}</p>
              <ExportButton name={item.name} value={item.value}>
                {t('Скачать файл')}
              </ExportButton>
            </div>
          )),
        )}
      </div>
      <div className="help-note">
        <FolderArchive size={23} />
        <p>
          {t(
            'Отдельный файл конкретного дня можно скачать в «Продажах» или «Отчётах». Полную резервную копию удобно сохранять в конце месяца.',
          )}
        </p>
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>{t('Продажи по дням')}</h2>
            <p>{t('Скачайте отдельный день или очистите старую историю')}</p>
          </div>
          <FolderArchive size={24} />
        </div>
        <div className="daily-files">
          {t(
            Object.entries(grouped)
              .reverse()
              .map(([date, sales]) => (
                <div className="daily-file" key={date}>
                  <span>
                    <code>sales/{t(date)}.json</code>
                    <small>
                      {t(sales.length)}
                      {t(' записей ·')}
                      {t(' ')}
                      {t(money(sales.filter((s) => !s.voided).reduce((n, s) => n + s.revenue, 0)))}
                    </small>
                  </span>
                  <ExportButton name={`${date}.json`} value={sales}>
                    {t('Скачать')}
                  </ExportButton>
                </div>
              )),
          )}
        </div>
        {t(
          !data.sales.length && (
            <p className="muted">{t('Запишите первую продажу — её день появится в списке.')}</p>
          ),
        )}
        <div className="cleanup-controls">
          <div className="field">
            <span aria-hidden>{t('Удалить историю раньше')}</span>
            <DatePicker
              label="Удалить историю раньше"
              value={cutoff}
              max={today()}
              onChange={(value) => {
                if (value && value <= today()) {
                  setCutoff(value);
                }
              }}
            />
          </div>
          <button
            className="button danger-button"
            disabled={busy || !purgeSales.length}
            onClick={() => setPurging(true)}
          >
            <Trash2 size={16} />
            {t(' Удалить старые продажи')}
          </button>
        </div>
        <p className="cleanup-summary">
          {t('Будет удалено: ')}
          {t(purgeDays)}
          {t(' дней,')}
          {t(purgeSales.length)}
          {t(
            ' записей. Текущие остатки и стоимость запасов сохранятся. Подробные отчёты за удалённые дни станут недоступны.',
          )}
        </p>
        {t(
          data.archived && (
            <p className="form-help">
              {t('История до ')}
              {t(data.archived.before)}
              {t(' уже очищена. Удалено записей:')}
              {t(data.archived.count)}
              {t('. Добавление операций в очищенный период закрыто.')}
            </p>
          ),
        )}
      </section>
      {t(
        purging && (
          <Modal
            title={t('Удалить старые продажи?')}
            subtitle={`До ${cutoff}: ${purgeDays} дней и ${purgeSales.length} записей.`}
            close={() => setPurging(false)}
          >
            <p className="modal-text">
              {t(
                'Выбранные записи продаж будут удалены из базы. Остатки на складе не увеличатся: суммарный расход останется в учёте. Отменить очистку можно только восстановлением полной резервной копии.',
              )}
            </p>
            <button
              className="button secondary full"
              onClick={() => download(`barbar-before-cleanup-${today()}.json`, data)}
            >
              <ArrowDownToLine size={17} />
              {t(' Скачать копию перед удалением')}
            </button>
            <BusyButton
              busy={busy}
              className="button danger-button full"
              style={{ marginTop: 12 }}
              disabled={busy}
              onClick={async () => {
                if (
                  await run({ type: 'purge', before: cutoff }, 'Старые продажи удалены. Остатки сохранены.')
                ) {
                  setPurging(false);
                }
              }}
            >
              {t('Удалить ')}
              {t(purgeSales.length)}
              {t(' записей')}
            </BusyButton>
          </Modal>
        ),
      )}
      {t(
        restore && (
          <Modal
            title={t('Восстановить резервную копию?')}
            subtitle="Текущие данные будут заменены содержимым файла."
            close={() => setRestore(null)}
          >
            <p className="modal-text">
              {t('В файле: ')}
              {t(restore.alcohol.length)}
              {t(' напитков,')}
              {t(restore.cocktails.length)}
              {t(' коктейлей,')}
              {t(' ')}
              {t(restore.purchases.length)}
              {t(' закупок и')}
              {t(restore.sales.length)}
              {t(' продаж. Замена затронет все подключённые устройства.')}
            </p>
            <button
              className="text-link"
              onClick={() => download(`barbar-before-restore-${today()}.json`, data)}
            >
              <ArrowDownToLine size={15} />
              {t(' Сначала скачать текущие данные')}
            </button>
            <label className="field restore-confirm">
              <span>{t('Для подтверждения напишите ВОССТАНОВИТЬ')}</span>
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </label>
            <BusyButton
              busy={busy}
              className="button primary full"
              disabled={busy || confirmation !== 'ВОССТАНОВИТЬ'}
              onClick={async () => {
                if (
                  await run({ type: 'restore', value: restore }, 'Данные восстановлены из резервной копии.')
                ) {
                  setRestore(null);
                }
              }}
            >
              {t('Восстановить данные')}
            </BusyButton>
          </Modal>
        ),
      )}
    </>
  );
}
