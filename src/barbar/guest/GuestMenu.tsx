import { cartLineId, useGuestOrder } from './use-guest-order';
import { GuestCart } from './GuestCart';
import { Grid2X2, Heart, LayoutGrid, List, Moon, Search, ShoppingBag, Sun, Utensils, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { barConfig } from '../config';
import type { GuestMenuItem, GuestSectionId } from '../domain/guest-menu';
import { CatalogImage } from '../features/catalog/media/CatalogImage';
import { photos } from '../features/catalog/media/photo-catalog';
import {
  CategoryDialog,
  Favorites,
  MenuCard,
  SectionLinks,
  sectionTitle,
  type MenuCartControls,
} from './menu-parts';
import { t } from '../presentation/i18n/runtime';
import { useGuestMenu } from './use-guest-menu';
import { favoriteKey, useGuestPreferences } from './use-guest-preferences';
import './guest-menu.scss';

const { copy, languages } = barConfig.guest;
const wideQuery = '(min-width: 1280px)';
export default function GuestMenuPage() {
  const { menu, error, reload } = useGuestMenu();
  const preferences = useGuestPreferences();
  const guestOrder = useGuestOrder(menu);
  const { language, setLanguage, theme, setTheme, view, setView, favorites, toggleFavorite, clearFavorites } =
    preferences;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<GuestSectionId | null>(null);
  const [target, setTarget] = useState<GuestSectionId | null>(null);
  const [tab, setTab] = useState<'menu' | 'favorites' | 'cart'>('menu');
  // The cart lives in the right column on wide screens and in its own tab below: render it once.
  const [wide, setWide] = useState(() => window.matchMedia(wideQuery).matches);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const chips = useRef<HTMLDivElement>(null);
  const ready = !!menu && preferences.ready;
  const sections = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (menu?.sections || [])
      .map((section) => ({
        ...section,
        items: term
          ? section.items.filter((item) =>
              `${item.group || ''} ${item.name}`.toLocaleLowerCase().includes(term),
            )
          : section.items,
      }))
      .filter((section) => section.items.length);
  }, [menu, query]);
  const saved = new Set(favorites);
  // Store only IDs. Names, photos and prices always come from the latest public menu.
  const favoriteItems = (menu?.sections || [])
    .flatMap((section) => section.items)
    .filter((item) => saved.has(favoriteKey(item)));
  const currentSection = active || sections[0]?.id || null;
  useEffect(() => {
    const query = window.matchMedia(wideQuery);
    const resize = () => {
      setWide(query.matches);
      if (query.matches) setTab('menu');
    };
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, []);
  const selectSection = (id: GuestSectionId) => {
    setQuery('');
    setTab('menu');
    setCategoriesOpen(false);
    setActive(id);
    setTarget(id);
  };
  useEffect(() => {
    if (!ready || tab !== 'menu' || !target) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'instant' });
      setTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, target, tab]);
  useEffect(() => {
    if (!ready || tab !== 'menu' || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id as GuestSectionId);
      },
      { rootMargin: '-25% 0px -65% 0px' },
    );
    document.querySelectorAll('[data-menu-section]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections, ready, tab]);
  useEffect(() => {
    const bar = chips.current;
    const chip = bar?.querySelector<HTMLElement>('[aria-current="true"]');
    // Scroll only the chip strip: scrollIntoView also moved the page itself.
    if (bar && chip)
      bar.scrollTo({
        left:
          bar.scrollLeft +
          chip.getBoundingClientRect().left -
          bar.getBoundingClientRect().left -
          (bar.clientWidth - chip.clientWidth) / 2,
      });
  }, [currentSection]);
  const showMenu = () => {
    setTab('menu');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const showFavorites = () => {
    setTab('favorites');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const showCart = () => {
    setTab('cart');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  // The cart stays open after a request: a guest can add more while staff consider the first one.
  const cart: MenuCartControls | undefined =
    guestOrder.table && guestOrder.open
      ? {
          quantity: guestOrder.quantityOf,
          add: guestOrder.add,
          remove: (price) => guestOrder.remove(cartLineId(price)),
          canAddLine: guestOrder.canAddLine,
        }
      : undefined;
  const cartContent = <GuestCart order={guestOrder} language={language} />;
  const favoriteContent = (
    <Favorites items={favoriteItems} language={language} remove={toggleFavorite} clear={clearFavorites} />
  );
  return (
    <div className="guest-menu" data-menu-theme={theme}>
      <header className="menu-header">
        <a
          className="menu-brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            showMenu();
          }}
          aria-label={`BAR BAR · ${copy.menu[language]}`}
        >
          <CatalogImage
            photo={photos['brand-logo']}
            alt="BAR BAR · Art Gallery"
            className="menu-logo"
            eager
          />
        </a>
        <label className="menu-search">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={copy.search[language]}
            aria-label={copy.search[language]}
            onChange={(event) => {
              setQuery(event.target.value);
              setTab('menu');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          />
          {query && (
            <button
              type="button"
              className="menu-icon"
              aria-label={copy.clearSearch[language]}
              onClick={() => setQuery('')}
            >
              <X size={18} />
            </button>
          )}
        </label>
        <div className="menu-preferences">
          <button
            type="button"
            className="menu-icon menu-theme-toggle"
            aria-label={(theme === 'dark' ? copy.lightTheme : copy.darkTheme)[language]}
            title={(theme === 'dark' ? copy.lightTheme : copy.darkTheme)[language]}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <nav className="menu-languages" aria-label="Language">
            {languages.map((value) => (
              <button
                key={value}
                type="button"
                lang={value}
                aria-pressed={value === language}
                onClick={() => setLanguage(value)}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>
        {ready && (
          <div className="menu-mobile-categories">
            <button
              type="button"
              className="menu-all-sections"
              aria-haspopup="dialog"
              onClick={() => setCategoriesOpen(true)}
            >
              <Grid2X2 size={17} />
              {copy.allSections[language]}
            </button>
            <div className="menu-chips" ref={chips}>
              <nav aria-label={copy.sections[language]}>
                {(menu?.sections || []).map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    aria-current={currentSection === section.id ? 'true' : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      selectSection(section.id);
                    }}
                  >
                    {sectionTitle(section.id, language)}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        )}
      </header>
      {ready ? (
        <div className={`menu-layout${tab !== 'menu' ? ` showing-${tab}` : ''}`}>
          <aside className="menu-sidebar">
            <h2>{copy.menu[language]}</h2>
            <SectionLinks
              sections={menu!.sections}
              active={currentSection}
              language={language}
              select={selectSection}
            />
            <div className="menu-sidebar-foot">
              <span>{copy.prices[language]}</span>
              <span>{copy.service[language]}</span>
            </div>
          </aside>
          <main className="menu-main">
            <div className="menu-mobile-favorites">{tab === 'favorites' && favoriteContent}</div>
            {!wide && tab === 'cart' && <div className="menu-mobile-cart">{cartContent}</div>}
            <div className="menu-browse" hidden={tab !== 'menu'}>
              <div className="menu-page-tools">
                <p>
                  {copy.menu[language]}
                  <span>
                    {' '}
                    /{' '}
                    {query.trim()
                      ? copy.found[language]
                      : sectionTitle(currentSection || 'cocktail', language)}
                  </span>
                </p>
                <div className="menu-view-toggle">
                  <button
                    type="button"
                    aria-label={copy.gridView[language]}
                    aria-pressed={view === 'grid'}
                    onClick={() => setView('grid')}
                  >
                    <LayoutGrid size={20} />
                  </button>
                  <button
                    type="button"
                    aria-label={copy.listView[language]}
                    aria-pressed={view === 'list'}
                    onClick={() => setView('list')}
                  >
                    <List size={22} />
                  </button>
                </div>
              </div>
              {error && (
                <div className="menu-refresh-error" role="alert">
                  <p>{copy.stale[language]}</p>
                  <button type="button" onClick={() => void reload()}>
                    {copy.retry[language]}
                  </button>
                </div>
              )}
              {sections.map((section) => (
                <section key={section.id} id={section.id} data-menu-section className="menu-section">
                  <div className="menu-section-head">
                    <h1>{sectionTitle(section.id, language)}</h1>
                    <span>{section.items.length}</span>
                  </div>
                  {section.items
                    .reduce<{ group?: string; items: GuestMenuItem[] }[]>((groups, item) => {
                      const last = groups.at(-1);
                      if (last && last.group === item.group) last.items.push(item);
                      else groups.push({ group: item.group, items: [item] });
                      return groups;
                    }, [])
                    .map((group, index) => (
                      <div className="menu-group" key={`${group.group || ''}-${index}`}>
                        {group.group && <h2>{group.group}</h2>}
                        <div
                          className={`menu-grid${view === 'list' ? ' menu-list' : ''}${section.id === 'wine' ? ' menu-wine' : ''}`}
                        >
                          {group.items.map((item) => (
                            <MenuCard
                              key={item.id}
                              item={item}
                              language={language}
                              saved={saved.has(favoriteKey(item))}
                              toggle={toggleFavorite}
                              cart={cart}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </section>
              ))}
              {!sections.length && (
                <div className="menu-status" role="status">
                  <p>{copy.nothing[language]}</p>
                  <button type="button" onClick={() => setQuery('')}>
                    {copy.clearSearch[language]}
                  </button>
                </div>
              )}
            </div>
            <footer className="menu-footer">
              <span>{copy.service[language]}</span>
              <span>
                {copy.prices[language]} · {copy.photos[language]}
              </span>
            </footer>
          </main>
          <aside className="menu-favorites" aria-label={copy.favorites[language]}>
            {wide && cartContent}
            {favoriteContent}
          </aside>
          <nav className="menu-bottom-nav" aria-label={copy.menu[language]}>
            <button type="button" aria-current={tab === 'menu' ? 'page' : undefined} onClick={showMenu}>
              <Utensils size={21} />
              {copy.menu[language]}
            </button>
            <button
              type="button"
              aria-current={tab === 'favorites' ? 'page' : undefined}
              onClick={showFavorites}
            >
              <Heart size={21} />
              <span>
                {copy.favorites[language]}
                {favoriteItems.length > 0 && <b>{favoriteItems.length}</b>}
              </span>
            </button>
            {guestOrder.table && (
              <button type="button" aria-current={tab === 'cart' ? 'page' : undefined} onClick={showCart}>
                <ShoppingBag size={21} />
                <span>
                  {t('Корзина')}
                  {guestOrder.count > 0 && <b>{guestOrder.count}</b>}
                </span>
              </button>
            )}
          </nav>
        </div>
      ) : (
        <div className="menu-status" role={error || preferences.translationError ? 'alert' : 'status'}>
          <p>{(error || preferences.translationError ? copy.error : copy.loading)[language]}</p>
          {(error || preferences.translationError) && (
            <button
              type="button"
              onClick={() => {
                void reload();
                preferences.retryTranslations();
              }}
            >
              {copy.retry[language]}
            </button>
          )}
        </div>
      )}
      {categoriesOpen && (
        <CategoryDialog language={language} close={() => setCategoriesOpen(false)}>
          <SectionLinks
            sections={menu?.sections || []}
            active={currentSection}
            language={language}
            select={selectSection}
          />
        </CategoryDialog>
      )}
    </div>
  );
}
