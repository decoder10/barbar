import { ArrowDownToLine } from 'lucide-react';
import { type ReactNode } from 'react';
import { t } from '../presentation/i18n/runtime';

export function download(name: string, value: unknown, csv = false) {
  const blob = new Blob([csv ? `\uFEFF${value}` : JSON.stringify(value, null, 2)], {
    type: csv ? 'text/csv;charset=utf-8' : 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportButton({
  name,
  value,
  children = 'Скачать JSON',
}: {
  name: string;
  value: unknown;
  children?: ReactNode;
}) {
  return (
    <button className="button secondary" onClick={() => download(name, value)}>
      <ArrowDownToLine size={16} />
      {t(children)}
    </button>
  );
}
