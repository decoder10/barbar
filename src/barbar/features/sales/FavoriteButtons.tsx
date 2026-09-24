import { Pin, Star } from 'lucide-react';
import { t } from '../../presentation/i18n/runtime';

/**
 * The favourite marks of a card, next to it and never inside it (a button cannot hold buttons): the star is
 * the user's own favourite, the pin is the bar's favourite that the owner sets for everyone.
 */
export function FavoriteButtons({
  name,
  personal,
  bar,
  canPinBar,
  busy,
  onPersonal,
  onBar,
}: {
  name: string;
  personal: boolean;
  bar: boolean;
  canPinBar: boolean;
  busy: boolean;
  onPersonal: () => void;
  onBar: () => void;
}) {
  const personalLabel = t(personal ? 'Убрать из моего избранного' : 'Добавить в моё избранное');
  const barLabel = t(bar ? 'Убрать из избранного заведения' : 'Добавить в избранное заведения');
  return (
    <div className="card-favorites">
      <button
        type="button"
        className={`card-favorite${personal ? ' active' : ''}`}
        aria-pressed={personal}
        aria-label={personalLabel}
        aria-description={name}
        title={personalLabel}
        disabled={busy}
        onClick={onPersonal}
      >
        <Star size={15} fill={personal ? 'currentColor' : 'none'} />
      </button>
      {canPinBar ? (
        <button
          type="button"
          className={`card-favorite bar${bar ? ' active' : ''}`}
          aria-pressed={bar}
          aria-label={barLabel}
          aria-description={name}
          title={barLabel}
          disabled={busy}
          onClick={onBar}
        >
          <Pin size={15} fill={bar ? 'currentColor' : 'none'} />
        </button>
      ) : (
        bar && (
          <span
            className="card-favorite bar active static"
            title={t('Избранное заведения')}
            role="img"
            aria-label={t('Избранное заведения')}
          >
            <Pin size={15} fill="currentColor" />
          </span>
        )
      )}
    </div>
  );
}
