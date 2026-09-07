/* ──────────────────────────────────────────────────────────────
   One target action for the whole marketing surface.

   Both values are placeholders waiting on the owner. While a value is
   still a placeholder the CTA keeps its previous destination (the demo
   request form) instead of pointing at a dead URL — swap the string in
   and every button on the landing switches to it at once.
   ────────────────────────────────────────────────────────────── */

/** Direct chat with the team — destination of every "Показать за 15 минут" button. */
export const TELEGRAM_LINK = '[TELEGRAM_LINK]';

/** Entry into the product for someone who already has an account. */
export const APP_LOGIN_URL = '[APP_LOGIN_URL]';

export const isPlaceholder = (value: string) => value.startsWith('[');
