import { Link } from 'react-router-dom';
import { CatalogImage } from '../features/catalog/media/CatalogImage';
import { brandLogo } from '../features/catalog/media/brand-logo';
import { GlassWater } from 'lucide-react';
import { type ReactNode } from 'react';
import { t } from '../presentation/i18n/runtime';

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="brand">
      <Link to="/" className="brand-home-link" aria-label={t('Столы')} onClick={onNavigate}>
        <CatalogImage photo={brandLogo} alt="BAR BAR · ART GALLERY" eager />
      </Link>
      <small>CAFE & BAR MANAGEMENT</small>
    </div>
  );
}

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{t(title)}</h1>
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
