import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {applyThemeClass, getInitialDarkMode} from './lib/theme';
import './index.css';

// Antes de pintar, para no enseñar un instante el tema equivocado.
applyThemeClass(getInitialDarkMode());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
