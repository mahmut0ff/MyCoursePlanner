import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import { PresenceBadge } from '../PresenceBadge';

beforeAll(async () => {
  await i18n.changeLanguage('ru');
});

describe('PresenceBadge', () => {
  it('renders the online label when online', () => {
    render(<PresenceBadge online lastSeenMs={Date.now()} />);
    expect(screen.getByText('В сети')).toBeInTheDocument();
  });

  it('renders a localized relative "last seen" when offline with a timestamp', () => {
    render(<PresenceBadge online={false} lastSeenMs={Date.now() - 5 * 60_000} />);
    // "был(а) в сети {{time}}" wrapping a date-fns ru relative time ("... назад")
    const el = screen.getByText(/был\(а\) в сети/i);
    expect(el.textContent).toMatch(/назад/);
  });

  it('renders the plain offline label when there is no last-seen timestamp', () => {
    render(<PresenceBadge online={false} lastSeenMs={null} />);
    expect(screen.getByText('Не в сети')).toBeInTheDocument();
  });
});
