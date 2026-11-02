/**
 * Токен Telegram-бота организации больше не попадает в браузер: редактор
 * получает от сервера только hasTelegramBot и @username. Поэтому вкладка шлёт
 * токен, лишь когда владелец вставил НОВЫЙ; пустую строку — только по явному
 * «Отключить»; а сохранение с пустым полем просит сервер переустановить вебхук
 * уже подключённого бота его же сохранённым токеном.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import * as api from '../../../lib/api';
import { IntegrationsTab } from '../IntegrationsTab';
import type { OrgAIManagerSettings } from '../../../types';

vi.mock('../../../lib/api', () => ({
  apiGetAIManagerOwnerSettings: vi.fn(),
  apiUpdateAIManagerSettings: vi.fn(),
}));
vi.mock('../../../contexts/PlanContext', () => ({
  usePlanGate: () => ({ canAccess: () => true }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const ORG = 'org_a';
const CONNECTED: OrgAIManagerSettings = {
  organizationId: ORG,
  isActive: true,
  greetingMessage: '',
  faq: [],
  telegramBotUsername: 'academy_sales_bot',
  aboutOrganization: '',
  enrollmentPolicy: '',
  customInstructions: '',
  hasTelegramBot: true,
  updatedAt: '',
};
const NOT_CONNECTED: OrgAIManagerSettings = { ...CONNECTED, telegramBotUsername: '', hasTelegramBot: false };

const saveButton = () => screen.getByRole('button', { name: /Сохранить и активировать Webhook/ });

async function renderTab(settings: OrgAIManagerSettings) {
  vi.mocked(api.apiGetAIManagerOwnerSettings).mockResolvedValue({ data: settings });
  vi.mocked(api.apiUpdateAIManagerSettings).mockResolvedValue({ message: 'Settings updated', data: settings });
  render(<IntegrationsTab organizationId={ORG} />);
  await waitFor(() => expect(saveButton()).toBeInTheDocument());
}

beforeEach(() => vi.clearAllMocks());

describe('IntegrationsTab — токен бота только в одну сторону', () => {
  it('у подключённого бота поле пустое, а сохранение переустанавливает вебхук без токена', async () => {
    await renderTab(CONNECTED);

    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByText('@academy_sales_bot')).toBeInTheDocument();

    fireEvent.click(saveButton());

    await waitFor(() => expect(api.apiUpdateAIManagerSettings).toHaveBeenCalledTimes(1));
    expect(api.apiUpdateAIManagerSettings).toHaveBeenCalledWith({ organizationId: ORG, reconnectTelegram: true });
  });

  it('вставленный новый токен уходит на сервер, обрезанный', async () => {
    await renderTab(CONNECTED);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  7000000002:AAH-new  ' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(api.apiUpdateAIManagerSettings).toHaveBeenCalledTimes(1));
    expect(api.apiUpdateAIManagerSettings).toHaveBeenCalledWith({ organizationId: ORG, telegramBotToken: '7000000002:AAH-new' });
  });

  it('«Отключить» шлёт пустой токен — и только после подтверждения', async () => {
    await renderTab(CONNECTED);

    fireEvent.click(screen.getByRole('button', { name: 'Отключить' }));
    const dialog = screen.getByRole('dialog');
    expect(api.apiUpdateAIManagerSettings).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Отключить' }));

    await waitFor(() => expect(api.apiUpdateAIManagerSettings).toHaveBeenCalledTimes(1));
    expect(api.apiUpdateAIManagerSettings).toHaveBeenCalledWith({ organizationId: ORG, telegramBotToken: '' });
  });

  it('без бота и без нового токена сохранять нечего', async () => {
    await renderTab(NOT_CONNECTED);

    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Отключить' })).not.toBeInTheDocument();
  });

  it('не владельцу — объяснение вместо формы', async () => {
    vi.mocked(api.apiGetAIManagerOwnerSettings).mockRejectedValue(
      Object.assign(new Error('Only organization owner can manage AI settings'), { status: 403 }),
    );
    render(<IntegrationsTab organizationId={ORG} />);

    expect(await screen.findByText(/только владелец организации/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
