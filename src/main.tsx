import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LayerProvider } from '@astryxdesign/core';
import '@fontsource-variable/fustat';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '@astryxdesign/theme-gothic/theme.css';
import '@astryxdesign/theme-stone/theme.css';
import '@astryxdesign/theme-chocolate/theme.css';
import '@astryxdesign/theme-matcha/theme.css';
import '@astryxdesign/theme-butter/theme.css';
import '@astryxdesign/theme-y2k/theme.css';
import './styles/global.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Toasts are rendered by the layer system, and useToast has to be called
        below its provider — so the provider sits above App, not inside it. */}
    <LayerProvider toast={{ position: 'bottomEnd' }}>
      <App />
    </LayerProvider>
  </StrictMode>,
);
