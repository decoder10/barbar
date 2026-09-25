import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import './barbar/guest/guest-menu.scss';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import GuestMenu from './barbar/guest/GuestMenu';
import { guestDataId, type GuestInitial } from './barbar/guest/guest-initial';
import { setTranslations } from './barbar/presentation/i18n/runtime';

// Separate entry for the public QR menu: no workspace code, styles or session requests.
const root = document.getElementById('root')!;
const embedded = document.getElementById(guestDataId)?.textContent;
let initial: GuestInitial | undefined;
try {
  initial = embedded ? (JSON.parse(embedded) as GuestInitial) : undefined;
} catch {
  initial = undefined;
}
if (initial && Array.isArray(initial.menu?.sections) && initial.translations && root.firstElementChild) {
  // The server rendered the menu with these translations: hydrate at once, the full dictionary follows.
  setTranslations(initial.language, initial.language === 'ru' ? {} : initial.translations);
  hydrateRoot(
    root,
    <StrictMode>
      <GuestMenu initial={initial} />
    </StrictMode>,
  );
} else {
  root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      <GuestMenu />
    </StrictMode>,
  );
}
