import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/500.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './barbar/App';
import { SettingsProvider } from './barbar/settings';
import { BarProvider } from './barbar/store';
import './barbar/styles/index.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <BarProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </BarProvider>
    </BrowserRouter>
  </StrictMode>,
);
