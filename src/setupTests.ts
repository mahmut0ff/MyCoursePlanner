import '@testing-library/jest-dom';
import 'vitest';

/**
 * Global mocks and setup for React Testing Environment
 */

// jsdom implements neither of these, but every real browser does — any
// component that scrolls a message list or an anchor into view would otherwise
// throw during render in tests only.
// Детектор языка i18n смотрит localStorage, затем navigator (в jsdom — en-US):
// без этого компоненты, импортирующие src/i18n, рендерили даты и тексты по-английски.
try { localStorage.setItem('lang', 'ru'); } catch { /* jsdom без storage */ }

Element.prototype.scrollIntoView = () => {};
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
