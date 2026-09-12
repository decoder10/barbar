import { useRef, useState } from 'react';
import { Archive, ArrowDownToLine, Cloud, FileJson, FolderArchive, Upload, Trash2 } from 'lucide-react';
import { download, ExportButton, Modal, PageHeading } from '../components';
import { money, today, validateData } from '../model';
import { useBar } from '../store';
import type { BarData } from '../types';

export default function Backups() {
  const { data, run, notify, busy } = useBar();
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
  return (
    <>
      <PageHeading
        eyebrow="ВАШИ ДАННЫЕ В ВАШИХ РУКАХ"
        title="Файлы и резервные копии"
        description="Скачивайте отдельные справочники или полный архив вашего бара."
      />
      <div className="backup-feature">
        <span className="backup-feature-icon">
          <Cloud size={36} />
        </span>
        <div>
          <h2>Один бар. Все ваши устройства.</h2>
          <p>
            Операции сохраняются на сервере. Войдите с тем же паролем на телефоне или компьютере — и работайте
            с общими данными.
          </p>
          <span className="backup-feature-note">
            Обновление каждые 30 секунд и при возвращении в приложение
          </span>
        </div>
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Полная резервная копия</h2>
            <p>Все напитки, рецепты, закупки и история продаж в одном файле</p>
          </div>
          <Archive size={24} />
        </div>
        <div className="backup-actions">
          <button className="button primary" onClick={() => download(`barbar-backup-${today()}.json`, data)}>
            <ArrowDownToLine size={17} /> Скачать резервную копию
          </button>
          <button className="button secondary" onClick={() => input.current?.click()} disabled={busy}>
            <Upload size={17} /> Восстановить из файла
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
                setRestore(validateData(JSON.parse(await file.text())));
                setConfirmation('');
              } catch (error) {
                notify(error instanceof Error ? error.message : 'Файл не удалось прочитать.', true);
              }
            }}
          />
        </div>
        <p className="form-help">
          Для восстановления нужен полный файл barbar-backup. Отдельные файлы ниже предназначены для
          просмотра, переноса и работы с данными.
        </p>
      </section>
      <div className="section-title">
        <div>
          <h2>Отдельные файлы</h2>
          <p>Данные разделены по назначению — как вы и привыкли</p>
        </div>
      </div>
      <div className="export-grid">
        {exports.map((item) => (
          <div className="export-card" key={item.name}>
            <span className="file-icon">
              <FileJson size={25} />
            </span>
            <code>{item.name}</code>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <ExportButton name={item.name} value={item.value}>
              Скачать файл
            </ExportButton>
          </div>
        ))}
      </div>
      <div className="help-note">
        <FolderArchive size={23} />
        <p>
          Отдельный файл конкретного дня можно скачать в «Продажах» или «Отчётах». Полную резервную копию
          удобно сохранять в конце месяца.
        </p>
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Папка ежедневных продаж</h2>
            <p>sales / год-месяц-день · скачайте отдельный день или очистите старые</p>
          </div>
          <FolderArchive size={24} />
        </div>
        <div className="daily-files">
          {Object.entries(grouped)
            .reverse()
            .map(([date, sales]) => (
              <div className="daily-file" key={date}>
                <span>
                  <code>sales/{date}.json</code>
                  <small>
                    {sales.length} записей ·{' '}
                    {money(sales.filter((s) => !s.voided).reduce((n, s) => n + s.revenue, 0))}
                  </small>
                </span>
                <ExportButton name={`${date}.json`} value={sales}>
                  Скачать
                </ExportButton>
              </div>
            ))}
        </div>
        {!data.sales.length && (
          <p className="muted">Запишите первую продажу — для её даты появится отдельный файл.</p>
        )}
        <div className="cleanup-controls">
          <label className="field">
            <span>Удалить историю раньше</span>
            <input
              type="date"
              value={cutoff}
              max={today()}
              onChange={(e) => {
                if (e.target.value && e.target.value <= today()) {
                  setCutoff(e.target.value);
                }
              }}
            />
          </label>
          <button
            className="button danger-button"
            disabled={busy || !purgeSales.length}
            onClick={() => setPurging(true)}
          >
            <Trash2 size={16} /> Удалить старые продажи
          </button>
        </div>
        <p className="cleanup-summary">
          Будет удалено: {purgeDays} дней, {purgeSales.length} записей. Текущие остатки и стоимость запасов
          сохранятся. Подробные отчёты за удалённые дни станут недоступны.
        </p>
        {data.archived && (
          <p className="form-help">
            История до {data.archived.before} уже очищена. Удалено записей: {data.archived.count}. Добавление
            операций в очищенный период закрыто.
          </p>
        )}
      </section>
      {purging && (
        <Modal
          title="Удалить старые продажи?"
          subtitle={`До ${cutoff}: ${purgeDays} дней и ${purgeSales.length} записей.`}
          close={() => setPurging(false)}
        >
          <p className="modal-text">
            История продаж и её файлы будут удалены. Остатки на складе не увеличатся: суммарный расход
            останется в учёте. Отменить очистку можно только восстановлением полной резервной копии.
          </p>
          <button
            className="button secondary full"
            onClick={() => download(`barbar-before-cleanup-${today()}.json`, data)}
          >
            <ArrowDownToLine size={17} /> Скачать копию перед удалением
          </button>
          <button
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
            Удалить {purgeSales.length} записей
          </button>
        </Modal>
      )}
      {restore && (
        <Modal
          title="Восстановить резервную копию?"
          subtitle="Текущие данные будут заменены содержимым файла."
          close={() => setRestore(null)}
        >
          <p className="modal-text">
            В файле: {restore.alcohol.length} напитков, {restore.cocktails.length} коктейлей,{' '}
            {restore.purchases.length} закупок и {restore.sales.length} продаж. Замена затронет все
            подключённые устройства.
          </p>
          <button
            className="text-link"
            onClick={() => download(`barbar-before-restore-${today()}.json`, data)}
          >
            <ArrowDownToLine size={15} /> Сначала скачать текущие данные
          </button>
          <label className="field restore-confirm">
            <span>Для подтверждения напишите ВОССТАНОВИТЬ</span>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button
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
            Восстановить данные
          </button>
        </Modal>
      )}
    </>
  );
}
