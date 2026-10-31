/**
 * Логин, который выдал центр (`…@student.sabakhub.app`, `…@tg.sabakhub.app` и т.п.),
 * а не личная почта человека. Зеркало серверного isIssuedLoginEmail
 * (netlify/functions/utils/onboarding.ts): такому входу пароль может сменить и
 * преподаватель, а личную почту — только тот, кто ведёт весь контингент.
 */
export const isIssuedLoginEmail = (email?: string | null): boolean =>
  /@[a-z]+\.sabakhub\.app$/i.test(email || '');
