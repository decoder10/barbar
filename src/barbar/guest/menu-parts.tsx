import {
  Beer,
  Milk,
  ChevronRight,
  Coffee,
  Cookie,
  CupSoda,
  GlassWater,
  Heart,
  Martini,
  Minus,
  Plus,
  Wine,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { barConfig } from '../config';
import type { GuestMenu, GuestMenuItem, GuestSectionId, GuestPrice } from '../domain/guest-menu';
import type { Language } from '../domain/identity/preferences';
import type { MenuCategory } from '../domain/types';
import { BottleArt, CocktailArt } from '../features/catalog/art';
import { menuImage } from '../domain/catalog/legacy-images';
import { t } from '../presentation/i18n/runtime';
import { useModalDialog } from '../ui/use-modal-dialog';

const { copy, pouredAlcohol } = barConfig.guest;
export const sectionTitle = (id: GuestSectionId, language: Language) =>
  id === 'alcohol'
    ? pouredAlcohol.title[language].replace('{ml}', String(pouredAlcohol.portionMl))
    : barConfig.menu.categories.find((c) => c.id === id)?.guestTitle[language] || id;

function SectionIcon({ id }: { id: GuestSectionId }) {
  const Icon =
    id === 'cocktail'
      ? Martini
      : id === 'wine'
        ? Wine
        : id === 'beer'
          ? Beer
          : id === 'hot'
            ? Coffee
            : id === 'soft'
              ? CupSoda
              : id === 'snack'
                ? Cookie
                : id === 'shot'
                  ? GlassWater
                  : Milk;
  return <Icon size={22} strokeWidth={1.5} aria-hidden="true" />;
}
export function MenuPhoto({ item, priority }: { item: GuestMenuItem; priority?: boolean }) {
  return (
    <div className="menu-card-photo">
      {item.category === 'alcohol' ? (
        <BottleArt
          drink={{ name: item.photoName, color: '#8c775b', category: 'alcohol', photo: item.photo }}
          priority={priority}
        />
      ) : (
        <CocktailArt
          image={menuImage({
            name: item.photoName,
            image: item.image,
            category: item.category as MenuCategory,
          })}
          name={item.photoName}
          category={item.category}
          serving={item.serving}
          photo={item.photo}
          priority={priority}
        />
      )}
    </div>
  );
}
export const menuLocale = (language: Language) =>
  language === 'en' ? 'en-US' : language === 'hy' ? 'hy-AM' : 'ru-RU';
export const menuNumber = (language: Language) => new Intl.NumberFormat(menuLocale(language));
export function MenuPrices({ item, language }: { item: GuestMenuItem; language: Language }) {
  const number = menuNumber(language);
  return (
    <div className={`menu-card-prices${item.prices.length === 1 ? ' single' : ''}`}>
      {item.prices.map((price, index) => (
        <span
          key={`${price.kind}-${index}`}
          className={`menu-price${price.available === false ? ' unavailable' : ''}`}
        >
          {(price.kind !== 'portion' || price.portion) && (
            <small>
              {price.kind === 'portion' ? t(price.portion || '') : copy[price.kind][language]}
              {price.kind !== 'portion' && price.portion ? ` · ${t(price.portion)}` : ''}
            </small>
          )}
          <b>{number.format(price.price)} ֏</b>
        </span>
      ))}
    </div>
  );
}
/** Cart actions of a table guest; absent on the read-only menu. */
export interface MenuCartControls {
  quantity: (price: GuestPrice) => number;
  add: (price: GuestPrice, name: string) => void;
  remove: (price: GuestPrice) => void;
  canAddLine: boolean;
}
/** «− N +» for one cart line: the same control on the card and in the cart. */
export function QuantityStepper({
  name,
  quantity,
  decrease,
  increase,
  canIncrease = true,
}: {
  name: string;
  quantity: number;
  decrease: () => void;
  increase: () => void;
  canIncrease?: boolean;
}) {
  return (
    <div className="guest-stepper" role="group" aria-label={`${t('Количество')}: ${name}`}>
      <button
        type="button"
        aria-label={`${t('Уменьшить количество')}: ${name}`}
        title={t('Уменьшить количество')}
        onClick={decrease}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <output aria-live="polite">{quantity}</output>
      <button
        type="button"
        aria-label={`${t('Увеличить количество')}: ${name}`}
        title={t('Увеличить количество')}
        disabled={!canIncrease || quantity >= barConfig.guest.orders.maxPortions}
        onClick={increase}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
export function MenuCard({
  item,
  language,
  saved,
  toggle,
  cart,
  priority,
}: {
  item: GuestMenuItem;
  language: Language;
  saved: boolean;
  toggle: (item: GuestMenuItem) => void;
  cart?: MenuCartControls;
  /** One of the first cards on screen: its photo is the page's largest paint. */
  priority?: boolean;
}) {
  const sellable = item.prices.filter((p) => p.productId);
  // A portion name is needed only to tell several prices of one drink apart.
  const portion = (p: GuestPrice) =>
    sellable.length > 1 ? t(p.portion || copy[p.kind === 'portion' ? 'menu' : p.kind][language]) : undefined;
  // Without stock data (an older response) the card simply shows no availability.
  const known = sellable.filter((p) => p.available !== undefined);
  const soldOut = known.length > 0 && known.every((p) => !p.available);
  return (
    <article className={`menu-card${soldOut ? ' sold-out' : ''}`}>
      <MenuPhoto item={item} priority={priority} />
      <div className="menu-card-body">
        <h3>{item.name}</h3>
        {known.length > 0 && (
          <span className={`menu-stock ${soldOut ? 'out' : 'in'}`}>
            {t(soldOut ? 'Нет в наличии' : 'В наличии')}
          </span>
        )}
        <MenuPrices item={item} language={language} />
        {cart && (
          <div className="guest-add">
            {sellable.map((p) => {
              const quantity = cart.quantity(p);
              const label = portion(p);
              return (
                <div className="guest-add-row" key={p.productId}>
                  {quantity > 0 ? (
                    <>
                      {label && <small>{label}</small>}
                      <QuantityStepper
                        name={label ? `${item.name} · ${label}` : item.name}
                        quantity={quantity}
                        canIncrease={p.available !== false}
                        decrease={() => cart.remove(p)}
                        increase={() => cart.add(p, item.name)}
                      />
                    </>
                  ) : p.available === false ? (
                    <button type="button" disabled>
                      <span>
                        {t('Нет в наличии')}
                        {label ? ` · ${label}` : ''}
                      </span>
                    </button>
                  ) : (
                    <button type="button" disabled={!cart.canAddLine} onClick={() => cart.add(p, item.name)}>
                      <Plus size={17} aria-hidden="true" />
                      <span>
                        {t('В корзину')}
                        {label ? ` · ${label}` : ''}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        className="menu-heart"
        aria-pressed={saved}
        aria-label={`${(saved ? copy.removeFavorite : copy.addFavorite)[language]}: ${item.name}`}
        onClick={() => toggle(item)}
      >
        <Heart size={21} fill={saved ? 'currentColor' : 'none'} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </article>
  );
}
export function SectionLinks({
  sections,
  active,
  language,
  select,
}: {
  sections: GuestMenu['sections'];
  active: GuestSectionId | null;
  language: Language;
  select: (id: GuestSectionId) => void;
}) {
  return (
    <nav className="menu-category-list" aria-label={copy.sections[language]}>
      {sections.map((section) => (
        <a
          href={`#${section.id}`}
          key={section.id}
          aria-current={active === section.id ? 'true' : undefined}
          onClick={(event) => {
            event.preventDefault();
            select(section.id);
          }}
        >
          <SectionIcon id={section.id} />
          <span>{sectionTitle(section.id, language)}</span>
          <small>{section.items.length}</small>
          <ChevronRight className="menu-category-arrow" size={16} aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}
export function CategoryDialog({
  close,
  children,
  language,
}: {
  close: () => void;
  children: ReactNode;
  language: Language;
}) {
  const ref = useModalDialog();
  return (
    <dialog
      ref={ref}
      className="menu-category-dialog"
      aria-label={copy.allSections[language]}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="menu-dialog-body">
        <header>
          <h2>{copy.allSections[language]}</h2>
          <button type="button" className="menu-icon" aria-label={copy.close[language]} onClick={close}>
            <X size={25} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Favorites({
  items,
  language,
  remove,
  clear,
}: {
  items: GuestMenuItem[];
  language: Language;
  remove: (item: GuestMenuItem) => void;
  clear: () => void;
}) {
  return (
    <>
      <div className="menu-favorites-heading">
        <Heart size={25} aria-hidden="true" />
        <h2>{copy.favorites[language]}</h2>
        <span>{items.length}</span>
      </div>
      <p className="menu-favorites-hint">{copy.favoritesHint[language]}</p>
      {!items.length && <p className="menu-favorites-empty">{copy.favoritesEmpty[language]}</p>}
      <ul className="menu-favorites-list">
        {items.map((item) => (
          <li key={`${item.category}:${item.id}`}>
            <MenuPhoto item={item} />
            <div>
              <h3>{item.name}</h3>
              <MenuPrices item={item} language={language} />
            </div>
            <button
              type="button"
              className="menu-icon"
              aria-label={`${copy.removeFavorite[language]}: ${item.name}`}
              onClick={() => remove(item)}
            >
              <X size={19} />
            </button>
          </li>
        ))}
      </ul>
      {!!items.length && (
        <button type="button" className="menu-text-button" onClick={clear}>
          {copy.clearFavorites[language]}
        </button>
      )}
      <p className="menu-saved-note">{copy.savedLocally[language]}</p>
    </>
  );
}
