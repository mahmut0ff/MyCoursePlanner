import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

import { cronAccessError } from '../utils/cron-auth';
import { verifyAuth } from '../utils/auth';

const event = (headers: Record<string, string> = {}) => ({
  httpMethod: 'POST',
  headers,
  body: null,
  queryStringParameters: {},
} as any);

const ENV = { ...process.env };

describe('cron-auth — кто вправе запускать запланированную функцию', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyAuth as any).mockResolvedValue(null);
    process.env.CRON_ENFORCE = 'true';
    delete process.env.CRON_SECRET;
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('пропускает плановый запуск платформы', async () => {
    expect(await cronAccessError(event({ 'x-nf-event': 'schedule' }))).toBeNull();
    // Заголовки приходят в разном регистре — нормализация обязательна.
    expect(await cronAccessError(event({ 'X-NF-Event': 'schedule' }))).toBeNull();
  });

  it('пропускает по общему секрету', async () => {
    process.env.CRON_SECRET = 's3cret';
    expect(await cronAccessError(event({ 'x-cron-secret': 's3cret' }))).toBeNull();
    expect(await cronAccessError(event({ 'x-cron-secret': 'wrong' }))).not.toBeNull();
  });

  it('пустой CRON_SECRET не делает подходящим пустой заголовок', async () => {
    process.env.CRON_SECRET = '';
    const denied = await cronAccessError(event({ 'x-cron-secret': '' }));
    expect(denied).not.toBeNull();
  });

  it('пропускает суперадмина — ручной прогон из админки', async () => {
    (verifyAuth as any).mockResolvedValue({ uid: 'u1', role: 'super_admin' });
    expect(await cronAccessError(event())).toBeNull();
  });

  it('отклоняет анонимный запуск, когда защита включена', async () => {
    const denied: any = await cronAccessError(event());
    expect(denied).not.toBeNull();
    expect(denied.statusCode).toBe(403);
    expect(JSON.parse(denied.body).code).toBe('cron_forbidden');
  });

  it('обычный админ организации запускать чужие кроны не может', async () => {
    (verifyAuth as any).mockResolvedValue({ uid: 'u2', role: 'admin' });
    expect(await cronAccessError(event())).not.toBeNull();
  });

  it('без CRON_ENFORCE ведёт себя как раньше и пропускает', async () => {
    // Осознанный дефолт: ложный отказ означает не выставленные за месяц счета,
    // причём молча. Отказ включают явно, убедившись, что плановые прогоны
    // проходят.
    delete process.env.CRON_ENFORCE;
    expect(await cronAccessError(event())).toBeNull();
  });
});
