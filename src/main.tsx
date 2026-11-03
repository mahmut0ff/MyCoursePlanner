import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './lib/sentry'; // Initialize error tracking before anything else
import App, { preloadRoute } from './App';
import { i18nReady } from './i18n';
import './index.css';

// Quiz-screen fonts (Montserrat, Pacifico) off the critical path; files load only where used.
const quizFonts = document.createElement('link');
quizFonts.rel = 'stylesheet';
quizFonts.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400..900&family=Pacifico&display=swap';
document.head.appendChild(quizFonts);

const container = document.getElementById('root')!;
// Prerendered HTML already played the hero intro; React's re-mount must not replay it.
if (container.firstElementChild) document.documentElement.classList.add('no-intro');

// On prerendered pages the app boots on first input (scripts/prerender.mjs); a
// button tapped before that is replayed once the same markup is mounted.
const bootWindow = window as Window & { __booted?: boolean; __bootClick?: number | null };
// eslint-disable-next-line react-refresh/only-export-components -- entry file, never hot-reloaded
const ReplayBootClick = () => {
  useEffect(() => {
    bootWindow.__booted = true;
    const i = bootWindow.__bootClick;
    bootWindow.__bootClick = null;
    if (i != null) document.querySelectorAll<HTMLButtonElement>('button')[i]?.click();
  }, []);
  return null;
};

const render = () => ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
    <ReplayBootClick />
  </React.StrictMode>
);
// Wait for a lazily loaded locale (en/kg/uz) and the current public page's chunk,
// so the first commit is the finished page, not Russian text or the spinner.
Promise.all([i18nReady, preloadRoute(location.pathname)]).then(render, render);
