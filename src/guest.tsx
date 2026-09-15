import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/playfair-display/500.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import GuestMenu from './barbar/guest/GuestMenu';

// Separate entry for the public QR menu: no workspace code, styles or session requests.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GuestMenu />
  </StrictMode>,
);
