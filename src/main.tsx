import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/500.css';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './barbar/app/App';
import { DatabaseBanner } from './barbar/app/DatabaseBanner';
import { SettingsProvider } from './barbar/presentation/SettingsProvider';
import { BarProvider } from './barbar/app/providers/BarProvider';
import './barbar/styles/index.scss';

// The public guest menu never loads the authenticated workspace or asks for a session.
const GuestMenu = lazy(() => import('./barbar/guest/GuestMenu'));
const guest = /^\/menu\/?$/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {guest ? (
      <Suspense fallback={null}>
        <GuestMenu />
      </Suspense>
    ) : (
      <>
        <DatabaseBanner />
        <BrowserRouter>
          <BarProvider>
            <SettingsProvider>
              <App />
            </SettingsProvider>
          </BarProvider>
        </BrowserRouter>
      </>
    )}
  </StrictMode>,
);
