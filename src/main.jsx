import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@cloudscape-design/global-styles/index.css';
import { applyTheme } from '@cloudscape-design/components/theming';
import './app.css';
import App from './App.jsx';

// Approved deviation (Lisa, Oct 26): the rail and the prompt input use shadowCard, set here to the soft part of
// shadowContainerActive only, without its 1px ring, to match the live AWS Docs AI. Values copied from
// node_modules/@cloudscape-design/design-tokens/index-visual-refresh.json (design-tokens 3.0.116), token
// "shadow-container-active". In Cloudscape 3.0.1404, shadowCard is "none" and only feeds Item card and Dialog,
// which this app doesn't use.
applyTheme({
  theme: {
    tokens: {
      shadowCard: { light: '0px 6px 36px #0007161a', dark: '0px 6px 36px #00040c' },
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
