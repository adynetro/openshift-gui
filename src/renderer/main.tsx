import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './styles/global.css';
import { applyTheme, getStoredTheme } from './utils/themes.js';

// Apply saved theme immediately before initial render
applyTheme(getStoredTheme().id);

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
