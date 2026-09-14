import { t } from '../presentation/i18n/runtime';
export function Pagination({
  page,
}: {
  page: {
    enabled: boolean;
    loading: boolean;
    error: string;
    total: number;
    nextCursor: string | null;
    hasPrevious: boolean;
    next: () => void;
    first: () => void;
  };
}) {
  if (!page.enabled) return null;
  return (
    <div className="history-pagination">
      {page.error && <p role="alert">{t(page.error)}</p>}
      <small>
        {t(page.loading ? 'Загружаем…' : 'Всего записей')}
        {!page.loading && `: ${page.total}`}
      </small>
      <div className="operation-toolbar">
        <button
          className="button secondary"
          disabled={page.loading || !page.hasPrevious}
          onClick={page.first}
        >
          {t('В начало')}
        </button>
        <button className="button secondary" disabled={page.loading || !page.nextCursor} onClick={page.next}>
          {t('Далее')}
        </button>
      </div>
    </div>
  );
}
