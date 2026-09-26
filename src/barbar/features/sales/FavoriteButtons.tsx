import { Star } from 'lucide-react';
import { t } from '../../presentation/i18n/runtime';

/**
 * The favourite mark of a card, next to it and never inside it (a button cannot hold buttons): the star is
 * the user's own favourite.
 */
export function FavoriteButtons({
  name,
  personal,
  busy,
  onPersonal,
}: {
  name: string;
  personal: boolean;
  busy: boolean;
  onPersonal: () => void;
}) {
  const personalLabel = t(personal ? 'Убрать из моего избранного' : 'Добавить в моё избранное');
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
    </div>
  );
}
