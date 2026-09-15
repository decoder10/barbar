import { barConfig } from '../config';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottleArt, CocktailArt } from '../features/catalog/art';
import { CatalogImage } from '../features/catalog/media/CatalogImage';
import { photos } from '../features/catalog/media/photo-catalog';
import { menuImage } from '../domain/catalog/legacy-images';
import type { GuestMenu, GuestMenuItem, GuestSectionId } from '../domain/guest-menu';
import type { Language } from '../domain/identity/preferences';
import type { MenuCategory } from '../domain/types';
import { setTranslations, t } from '../presentation/i18n/runtime';
import './guest-menu.scss';

const { copy, languages, pouredAlcohol } = barConfig.guest;
/** Section titles: menu categories from config; poured spirits show their portion. */
const title = (id: GuestSectionId, language: Language) =>
  id === 'alcohol'
    ? pouredAlcohol.title[language].replace('{ml}', String(pouredAlcohol.portionMl))
    : barConfig.menu.categories.find((c) => c.id === id)?.guestTitle[language] || id;
const storageKey = 'barbar-guest-language';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'en' || saved === 'ru' || saved === 'hy') return saved;
  } catch {
    // Private mode or blocked storage: fall back to the browser language.
  }
  const browser = navigator.language.slice(0, 2);
  return browser === 'ru' || browser === 'hy' ? browser : 'en';
}

function Card({ item, language }: { item: GuestMenuItem; language: Language }) {
  const number = new Intl.NumberFormat(language === 'en' ? 'en-US' : language === 'hy' ? 'hy-AM' : 'ru-RU');
  const single = item.prices.length === 1 && item.prices[0].kind === 'portion';
  return (
    <article className="menu-card">
      <div className="menu-card-photo">
        {item.category === 'alcohol' ? (
          <BottleArt drink={{ name: item.photoName, color: '#8c775b', category: 'alcohol' }} />
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
          />
        )}
      </div>
      <div className="menu-card-body">
        <h3>{item.name}</h3>
        {single && item.prices[0].portion && <p className="menu-card-portion">{t(item.prices[0].portion)}</p>}
        <div className={`menu-card-prices${single ? ' single' : ''}`}>
          {item.prices.map((price) => (
            <span key={price.kind} className="menu-price">
              {!single && (
                <small>
                  {price.kind === 'portion' ? t(price.portion || '') : copy[price.kind][language]}
                  {price.kind !== 'portion' && price.portion ? ` · ${t(price.portion)}` : ''}
                </small>
              )}
              <b>
                {number.format(price.price)}
                <span aria-hidden="true"> ֏</span>
              </b>
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function GuestMenuPage() {
  const [language, setLanguage] = useState(initialLanguage);
  const [dictionary, setDictionary] = useState<Language | null>(null);
  const [menu, setMenu] = useState<GuestMenu | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<GuestSectionId | null>(null);
  const chips = useRef(new Map<string, HTMLAnchorElement>());
  useEffect(() => {
    let alive = true;
    const messages =
      language === 'ru'
        ? Promise.resolve({})
        : (language === 'hy'
            ? import('../presentation/i18n/hy.json')
            : import('../presentation/i18n/en.json')
          ).then((module) => module.default as Record<string, string>);
    void messages.then((value) => {
      if (!alive) return;
      setTranslations(language, value);
      setDictionary(language);
    });
    try {
      localStorage.setItem(storageKey, language);
    } catch {
      // The choice simply is not remembered.
    }
    document.title = `BAR BAR · ${language === 'ru' ? 'Меню' : language === 'hy' ? 'Ճաշացանկ' : 'Menu'}`;
    return () => {
      alive = false;
    };
  }, [language]);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/menu', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Menu unavailable');
      const value = (await response.json()) as GuestMenu;
      if (!Array.isArray(value.sections)) throw new Error('Invalid menu');
      setMenu(value);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void load();
    // Guests keep the tab open: refresh prices when they come back to it.
    const visible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [load]);
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
  // Highlight the section in view and keep its chip visible in the horizontal bar.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id as GuestSectionId);
      },
      { rootMargin: '-35% 0px -60% 0px' },
    );
    document.querySelectorAll('[data-menu-section]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections, dictionary]);
  useEffect(() => {
    if (active) chips.current.get(active)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);
  const ready = menu && dictionary === language;
  return (
    <div className="guest-menu">
      <header className="menu-hero">
        <div className="menu-container menu-hero-row">
          <CatalogImage
            photo={photos['brand-logo']}
            alt="BAR BAR · Art Gallery"
            className="menu-logo"
            eager
          />
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
        <p className="menu-container menu-tagline">{copy.tagline[language]}</p>
      </header>
      {ready ? (
        <>
          <div className="menu-toolbar">
            <div className="menu-container">
              <label className="menu-search">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  placeholder={copy.search[language]}
                  aria-label={copy.search[language]}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <nav className="menu-chips" aria-label={copy.sections[language]}>
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    ref={(node) => {
                      if (node) chips.current.set(section.id, node);
                      else chips.current.delete(section.id);
                    }}
                    aria-current={active === section.id ? 'true' : undefined}
                  >
                    {title(section.id, language)}
                  </a>
                ))}
              </nav>
            </div>
          </div>
          <main className="menu-container menu-sections">
            {sections.map((section) => (
              <section key={section.id} id={section.id} data-menu-section className="menu-section">
                <div className="menu-section-head">
                  <h2>{title(section.id, language)}</h2>
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
                    <div key={`${group.group || ''}-${index}`} className="menu-group">
                      {group.group && <h3>{group.group}</h3>}
                      <div className="menu-grid">
                        {group.items.map((item) => (
                          <Card key={item.id} item={item} language={language} />
                        ))}
                      </div>
                    </div>
                  ))}
              </section>
            ))}
            {!sections.length && <p className="menu-status">{copy.nothing[language]}</p>}
          </main>
          <footer className="menu-container menu-footer">
            <strong>{copy.service[language]}</strong>
            <span>
              {copy.prices[language]} · {copy.photos[language]}
            </span>
          </footer>
        </>
      ) : error ? (
        <div className="menu-status" role="alert">
          <p>{copy.error[language]}</p>
          <button type="button" onClick={() => void load()}>
            {copy.retry[language]}
          </button>
        </div>
      ) : (
        <p className="menu-status" role="status">
          {copy.loading[language]}
        </p>
      )}
    </div>
  );
}
