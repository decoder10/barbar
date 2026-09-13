import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, GlassWater, Plus, X } from 'lucide-react';
import { categoryLabel, money, volume } from './model';
import { useBar } from './store';
import { menuImage, menuPhotos } from './images';
import type { Alcohol, Cocktail } from './types';

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
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <GlassWater size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
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
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id: string; 'aria-describedby'?: string }>, {
            id,
            'aria-describedby': hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  close,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { busy, notice } = useBar();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          close();
        }
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">BARBAR CAFE</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" disabled={busy} onClick={close} aria-label="Закрыть">
          <X size={20} />
        </button>
      </div>
      {notice?.error && (
        <div className="modal-error" role="alert">
          {notice.text}
        </div>
      )}
      {children}
    </dialog>
  );
}
export function Submit({
  children = 'Сохранить',
  disabled = false,
}: {
  children?: ReactNode;
  disabled?: boolean;
}) {
  const { busy } = useBar();
  return (
    <button type="submit" className="button primary full" disabled={busy || disabled}>
      {busy ? <span className="spinner" /> : <Check size={18} />} {busy ? 'Сохраняем…' : children}
    </button>
  );
}
export function CocktailArt({ image, name }: { image: number; name: string }) {
  const photo = menuPhotos.find((p) => p.id === image);
  return (
    <div
      role="img"
      aria-label={name}
      className={photo ? 'cocktail-art' : `cocktail-art sheet-${Math.floor(image / 4)} art-${image % 4}`}
      style={
        photo
          ? {
              backgroundImage: `url('/barbar/${photo.file}')`,
              backgroundSize: '400% 400%',
              backgroundPosition: `${((photo.tile % 4) * 100) / 3}% ${(Math.floor(photo.tile / 4) * 100) / 3}%`,
            }
          : undefined
      }
    />
  );
}
export function BottleArt({ drink }: { drink: Pick<Alcohol, 'name' | 'color'> }) {
  return (
    <div className="bottle-art" style={{ '--bottle-color': drink.color } as React.CSSProperties}>
      <svg viewBox="0 0 96 150" role="img" aria-label={drink.name}>
        <rect x="37" y="6" width="22" height="12" rx="3" fill="currentColor" />
        <path
          d="M39 18h18v31c0 13 20 16 20 32v51c0 7-5 12-12 12H31c-7 0-12-5-12-12V81c0-16 20-19 20-32Z"
          fill="currentColor"
          opacity=".8"
        />
        <path d="M32 80v45" stroke="white" strokeWidth="3" opacity=".35" strokeLinecap="round" />
        <rect x="25" y="82" width="46" height="41" rx="2" fill="#fff8eb" />
        <text x="48" y="102" textAnchor="middle" fill="#553f36" fontFamily="Georgia,serif" fontSize="20">
          b.
        </text>
        <text
          x="48"
          y="114"
          textAnchor="middle"
          fill="#553f36"
          fontFamily="sans-serif"
          fontSize="5"
          letterSpacing="1"
        >
          BARBAR CAFE
        </text>
      </svg>
      <span className="bottle-watermark">barbar</span>
    </div>
  );
}
export function CocktailCard({
  cocktail,
  detail,
  footer,
  action,
}: {
  cocktail: Cocktail;
  detail: string;
  footer: ReactNode;
  action: () => void;
}) {
  return (
    <button className="drink-card" onClick={action}>
      <div className="card-image">
        <CocktailArt image={menuImage(cocktail)} name={cocktail.name} />
        <span className="card-badge">{categoryLabel(cocktail.category).toLocaleUpperCase()}</span>
        <span className="card-open">
          <ArrowUpRight size={17} />
        </span>
      </div>
      <div className="card-content">
        <h3>{cocktail.name}</h3>
        <p>{detail}</p>
        <div className="card-bottom">
          <strong>{cocktail.price ? money(cocktail.price) : 'Укажите цену'}</strong>
          {footer}
        </div>
      </div>
    </button>
  );
}
export function AlcoholCard({ drink, ml, action }: { drink: Alcohol; ml: number; action: () => void }) {
  return (
    <button className="drink-card" onClick={action}>
      <div className="card-image">
        <BottleArt drink={drink} />
        <span className="card-badge">{drink.category === 'mixer' ? 'МИКСЕР' : 'АЛКОГОЛЬ'}</span>
        <span className="card-open">
          <Plus size={17} />
        </span>
      </div>
      <div className="card-content">
        <h3>{drink.name}</h3>
        <p>{ml > 0 ? `${volume(ml)} на складе` : 'Нет на складе'}</p>
        <div className="card-bottom">
          <strong>{drink.pricePerLiter ? money(drink.pricePerLiter / 20) : 'Укажите цену'}</strong>
          <small>за 50 мл</small>
        </div>
      </div>
    </button>
  );
}
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
      {children}
    </button>
  );
}
