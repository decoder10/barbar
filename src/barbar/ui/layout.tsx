import { GlassWater } from 'lucide-react';
import { type ReactNode } from 'react';
import { t } from '../i18n/runtime';

export function Brand() {
  return (
    <div className="brand">
      <img src="/barbar/logo.png" alt="BAR BAR · ART GALLERY" />
      <small>CAFE & BAR MANAGEMENT</small>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{t(eyebrow)}</div>
        <h1>{t(title)}</h1>
        <p>{t(description)}</p>
      </div>
      <div className="heading-actions">{t(children)}</div>
    </div>
  );
}

export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <GlassWater size={26} />
      </span>
      <h3>{t(title)}</h3>
      <p>{t(text)}</p>
      {t(children)}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? 'accent' : ''}`}>
      <div className="metric-label">
        {t(label)}
        <span>{t(icon)}</span>
      </div>
      <strong>{t(value)}</strong>
      <small>{t(hint)}</small>
    </div>
  );
}
