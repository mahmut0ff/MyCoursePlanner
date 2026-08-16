import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * «Зарплата» целиком — дымовой прогон экрана и контракт выборочной выплаты.
 *
 * Сборка типов ловит только несходящиеся сигнатуры: экран из шапки месяца,
 * карточек преподавателей, баланса и истории выплат может собраться и упасть
 * на первом же рендере. Поэтому тест поднимает СТРАНИЦУ, а не её части, и
 * проверяет то, что видит директор.
 *
 * Главное здесь — не разметка, а один вызов: кнопка «Выплатить» в строке
 * человека обязана уйти на сервер списком из ОДНОГО id. Пропажа `teacherIds`
 * превращает выплату одному в выплату всем, и заметить это можно только по
 * кассе — то есть уже после того, как деньги ушли.
 */

vi.mock('react-i18next', () => {
  // Раскрываем интерполяцию, как настоящий i18n: без неё подписи с {{name}}
  // и {{amount}} невозможно отличить друг от друга, а именно они и несут
  // сумму в подтверждении выплаты.
  const t = (key: string, fb?: any, opts?: any) => {
    const text = typeof fb === 'string' ? fb : key;
    const vars = typeof fb === 'object' ? fb : opts;
    return vars ? text.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => String(vars[k] ?? '')) : text;
  };
  // Возвращаем ОДИН И ТОТ ЖЕ объект: настоящий react-i18next держит `t`
  // стабильным между рендерами, и страница на это опирается — её `load`
  // пересоздаётся вместе с `t` и висит в зависимостях useEffect. Новый `t`
  // на каждый вызов превращает загрузку в бесконечный цикл, и тест не падает,
  // а зависает намертво.
  const value = { t, i18n: { language: 'ru' } };
  return { useTranslation: () => value };
});

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../contexts/PermissionsContext', () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock('../../../lib/api', () => ({
  apiGetPayrollOverview: vi.fn(),
  apiGetPayrollBalance: vi.fn(),
  apiGetPayrollPayouts: vi.fn(),
  apiPayPayroll: vi.fn(),
  apiApprovePayroll: vi.fn(),
  apiCalculatePayroll: vi.fn(),
  apiDeletePayrollLine: vi.fn(),
  // Ими пользуются модальные окна раздела; в моке они нужны, чтобы импорт
  // страницы не спотыкался об отсутствующий экспорт.
  apiSetPayrollLine: vi.fn(),
  apiSaveCompensationRule: vi.fn(),
  apiDeleteCompensationRule: vi.fn(),
  // Карточка «Ставка по умолчанию» ходит за ними при каждом открытии раздела.
  // Без них она весь прогон стоит в состоянии ошибки загрузки — тесты при этом
  // зелёные, потому что молча проверяют экран без неё.
  apiGetPayrollDefaultRate: vi.fn(),
  apiSetPayrollDefaultRate: vi.fn(),
  apiApplyPayrollDefaultRate: vi.fn(),
}));

import PayrollPage from '../PayrollPage';
import * as api from '../../../lib/api';
import type { OverviewTeacher } from '../components/TeacherRow';
import type { PayComponent, PayrollLine, PayrollPayout, PayrollPeriod } from '../../../types';

const apiMock = api as unknown as {
  apiGetPayrollOverview: ReturnType<typeof vi.fn>;
  apiGetPayrollBalance: ReturnType<typeof vi.fn>;
  apiGetPayrollPayouts: ReturnType<typeof vi.fn>;
  apiPayPayroll: ReturnType<typeof vi.fn>;
  apiGetPayrollDefaultRate: ReturnType<typeof vi.fn>;
  apiSetPayrollDefaultRate: ReturnType<typeof vi.fn>;
  apiApplyPayrollDefaultRate: ReturnType<typeof vi.fn>;
};

const PERIOD = '2026-08';
const SHEET_ID = 'sheet-2026-08';

const SHEET: PayrollPeriod = {
  id: SHEET_ID,
  organizationId: 'org1',
  period: PERIOD,
  state: 'approved',
  windowStart: '2026-07-31T18:00:00.000Z',
  windowEnd: '2026-08-31T17:59:59.999Z',
  totalMinor: 4_200_000,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
};

/** Строка ведомости с замороженным «как посчитали» — как её отдаёт сервер. */
const ruleLine = (
  id: string,
  teacherId: string,
  teacherName: string,
  finalMinor: number,
  computed: unknown[],
): PayrollLine => ({
  id,
  organizationId: 'org1',
  periodId: SHEET_ID,
  period: PERIOD,
  teacherId,
  teacherName,
  ruleId: `rule-${teacherId}`,
  ruleSnapshot: { computed },
  source: 'rule',
  isManual: false,
  originPeriodId: null,
  computedMinor: finalMinor,
  overrideMinor: null,
  overrideReason: null,
  finalMinor,
  createdAt: '2026-08-14T00:00:00.000Z',
});

const AZIZA_LINE = ruleLine('line-aziza', 'aziza', 'Азиза', 3_200_000, [
  {
    kind: 'percent_revenue',
    earnedMinor: 3_200_000,
    basis: { percentBp: 2000, revenueBaseMinor: 16_000_000, grossMinor: 16_000_000, refundMinor: 0 },
  },
]);

const BAKYT_LINE = ruleLine('line-bakyt', 'bakyt', 'Бакыт', 1_000_000, [
  { kind: 'salary', earnedMinor: 1_000_000 },
]);

/** Всё выдано, деньги заработаны в двух филиалах. */
const AZIZA: OverviewTeacher = {
  teacherId: 'aziza',
  teacherName: 'Азиза',
  rule: { id: 'rule-aziza', components: [{ kind: 'percent_revenue', percentBp: 2000, base: 'collected' }] },
  groups: [{
    groupId: 'g1',
    name: 'Английский A1',
    courseId: 'c1',
    courseName: 'Английский',
    branchId: 'b1',
    branchName: 'Алай',
    studentCount: 1,
    collectedMinor: 16_000_000,
    students: [{ studentId: 's1', studentName: 'Айдана', paidMinor: 16_000_000, former: false }],
  }],
  byBranch: [
    { branchId: 'b1', branchName: 'Алай', amountMinor: 2_000_000, groupIds: ['g1'] },
    { branchId: 'b2', branchName: 'Центр', amountMinor: 1_200_000, groupIds: ['g2'] },
  ],
  studentCount: 1,
  collectedMinor: 16_000_000,
  refundMinor: 0,
  baseMinor: 16_000_000,
  previewMinor: 3_200_000,
  previewComponents: [{ kind: 'percent_revenue', earnedMinor: 3_200_000 }],
  payableMinor: 3_200_000,
  paidMinor: 3_200_000,
  remainingMinor: 0,
  line: AZIZA_LINE,
  manualLines: [],
};

/** Не получал ничего: ему и адресована кнопка выплаты в строке. */
const BAKYT: OverviewTeacher = {
  teacherId: 'bakyt',
  teacherName: 'Бакыт',
  rule: { id: 'rule-bakyt', components: [{ kind: 'salary', amountMinor: 1_000_000 }] },
  groups: [],
  byBranch: [{ branchId: 'b1', branchName: 'Алай', amountMinor: 1_000_000, groupIds: [] }],
  studentCount: 0,
  collectedMinor: 0,
  refundMinor: 0,
  baseMinor: 0,
  previewMinor: 1_000_000,
  previewComponents: [{ kind: 'salary', earnedMinor: 1_000_000 }],
  payableMinor: 1_000_000,
  paidMinor: 0,
  remainingMinor: 1_000_000,
  line: BAKYT_LINE,
  manualLines: [],
};

const PAYOUTS: PayrollPayout[] = [
  {
    id: 'payout-1',
    date: '2026-08-14',
    teacherId: 'aziza',
    teacherName: 'Азиза',
    amountMinor: 3_200_000,
    periodId: SHEET_ID,
    period: PERIOD,
    branchId: 'b1',
    branchName: 'Алай',
    paymentMethod: 'cash',
    manual: false,
    description: 'Зарплата: Азиза',
  },
  {
    // Расход по зарплате, заведённый руками в кассе: ведомости за ним нет.
    id: 'payout-2',
    date: '2026-08-05',
    teacherId: null,
    teacherName: 'Гульнара',
    amountMinor: 500_000,
    periodId: null,
    period: null,
    branchId: null,
    branchName: '',
    paymentMethod: 'cash',
    manual: true,
    description: 'Аванс наличными',
  },
];

const BALANCE = [
  { teacherId: 'aziza', teacherName: 'Азиза', accruedMinor: 3_200_000, paidMinor: 3_200_000, balanceMinor: 0 },
  { teacherId: 'bakyt', teacherName: 'Бакыт', accruedMinor: 1_000_000, paidMinor: 0, balanceMinor: 1_000_000 },
];

/** Умолчание организации: «двадцать процентов с оплат студентов». */
const DEFAULT_RATE_COMPONENTS: PayComponent[] = [
  { kind: 'percent_revenue', percentBp: 2000, base: 'collected' },
];

/**
 * Ответ GET ?action=default целиком.
 *
 * Оба числа СЕРВЕРНЫЕ: «скольким назначит раздача» и «у скольких ставка мёртвая»
 * считает тот же код, что и раздаёт, — экран их только показывает. Поэтому они
 * живут в сиде ответа, а не выводятся из списка преподавателей ниже.
 */
const DEFAULT_RATE_RESPONSE = {
  default: {
    components: DEFAULT_RATE_COMPONENTS,
    updatedAt: '2026-08-10T00:00:00.000Z',
    updatedBy: 'director',
  },
  withoutRate: 2,
  legacyRates: 1,
};

/** Преподаватель на экране, которому ставку так и не назначили. */
const noRateTeacher = (teacherId: string, teacherName: string): OverviewTeacher => ({
  teacherId,
  teacherName,
  rule: null,
  groups: [],
  byBranch: [],
  studentCount: 0,
  collectedMinor: 0,
  refundMinor: 0,
  baseMinor: 0,
  previewMinor: 0,
  previewComponents: [],
  payableMinor: 0,
  paidMinor: 0,
  remainingMinor: 0,
  line: null,
  manualLines: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  // Месяц экран берёт с часов машины. Отдаём ведомость на ЗАПРОШЕННЫЙ месяц:
  // иначе тест начал бы падать первого числа следующего месяца — страница
  // отказывается платить по ведомости чужого месяца, и это правильно.
  apiMock.apiGetPayrollOverview.mockImplementation(async (filters?: { period?: string }) => {
    const period = filters?.period || PERIOD;
    return {
      period,
      windowStart: SHEET.windowStart,
      windowEnd: SHEET.windowEnd,
      sheet: { ...SHEET, period },
      lines: [AZIZA_LINE, BAKYT_LINE],
      diagnostics: [],
      teachers: [AZIZA, BAKYT],
    };
  });
  apiMock.apiGetPayrollBalance.mockResolvedValue(BALANCE);
  apiMock.apiGetPayrollPayouts.mockResolvedValue(PAYOUTS);
  apiMock.apiPayPayroll.mockResolvedValue({
    written: 1,
    failed: [],
    warnings: [],
    fullyPaid: false,
    remainingTeacherIds: ['aziza'],
  });
  apiMock.apiGetPayrollDefaultRate.mockResolvedValue(DEFAULT_RATE_RESPONSE);
  apiMock.apiSetPayrollDefaultRate.mockResolvedValue({ default: DEFAULT_RATE_RESPONSE.default });
  // Первый проход раздачи: мёртвых ставок не нашёл — тест про них ставит свой ответ.
  apiMock.apiApplyPayrollDefaultRate.mockResolvedValue({
    created: 2,
    teacherIds: ['t1', 't2'],
    skipped: 1,
    legacyRates: 0,
    replacedLegacy: false,
  });
});

/** Отрисовать экран и дождаться, пока приедут данные месяца. */
const setup = async () => {
  render(
    <MemoryRouter>
      <PayrollPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getAllByText('Бакыт').length).toBeGreaterThan(0));
};

/**
 * Кнопка разовой раздачи. Ждём именно её: карточка умолчания грузится СВОИМ
 * запросом и приезжает не вместе с месяцем.
 */
const findApplyButton = () => screen.findByRole('button', { name: /Назначить всем без ставки/ });

/**
 * Карточка умолчания целиком. Скоуп обязателен: ту же ставку словами показывает
 * и строка Азизы, а «20% с оплат студентов» на всей странице ничего не доказывает.
 */
const defaultRateCard = (): HTMLElement =>
  screen
    .getByRole('heading', { level: 3, name: 'Ставка по умолчанию' })
    .closest('div.space-y-3') as HTMLElement;

/** Кликнуть по шапке карточки преподавателя — это и есть раскрытие. */
const expandTeacher = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
};

describe('PayrollPage', () => {
  it('рисует месяц целиком: оба преподавателя, заголовок и статус расчёта', async () => {
    await setup();

    expect(screen.getByRole('heading', { level: 1, name: 'Зарплата' })).toBeInTheDocument();
    expect(screen.getAllByText('Азиза').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Бакыт').length).toBeGreaterThan(0);
    // Ведомость приехала и прочиталась: состояние подписано словом, а не кодом.
    expect(screen.getByText('Утверждено')).toBeInTheDocument();
  });

  it('называет выплату месяца «Выплатить всем» — рядом есть выплата поштучно', async () => {
    await setup();

    const payAll = screen.getByRole('button', { name: 'Выплатить всем' });
    expect(payAll).toBeInTheDocument();
    expect(payAll).toBeEnabled();
  });

  it('показывает историю выплат обеими строками и метит ручной расход', async () => {
    await setup();

    expect(screen.getByText('История выплат')).toBeInTheDocument();

    const history = screen.getByRole('list');
    // Проведённая выплата: имя, сумма и месяц НАЧИСЛЕНИЯ (выдали в августе за август).
    expect(within(history).getByText('Азиза')).toBeInTheDocument();
    expect(within(history).getByText('32 000 с.')).toBeInTheDocument();
    expect(within(history).getByText(/за август 2026/)).toBeInTheDocument();
    // Ручной расход виден как деньги, но не выдаёт себя за проведённую выплату.
    expect(within(history).getByText('Гульнара')).toBeInTheDocument();
    expect(within(history).getByText('5 000 с.')).toBeInTheDocument();
    expect(within(history).getByText('заведено вручную в кассе')).toBeInTheDocument();
  });

  it('в карточке должника даёт остаток и кнопку выплаты', async () => {
    await setup();
    expandTeacher('Бакыт');

    const remaining = screen.getByText('Осталось выдать');
    expect(remaining.parentElement).toHaveTextContent('10 000 с.');
    // Именно «Выплатить», а не «Выплатить всем»: это разные деньги.
    expect(screen.getByRole('button', { name: 'Выплатить' })).toBeEnabled();
  });

  it('выплата одному уходит на сервер списком ровно из его id', async () => {
    await setup();
    expandTeacher('Бакыт');
    fireEvent.click(screen.getByRole('button', { name: 'Выплатить' }));

    // Спрашиваем до, а не после: шаг необратим и называет, кому и сколько.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Бакыт получит 10 000 с\./)).toBeInTheDocument();
    expect(apiMock.apiPayPayroll).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Выплатить и записать в расходы' }));

    await waitFor(() => expect(apiMock.apiPayPayroll).toHaveBeenCalledWith({
      periodId: SHEET_ID,
      teacherIds: ['bakyt'],
    }));
    // Без teacherIds сервер платит ВСЕМ — лишнего вызова здесь быть не может.
    expect(apiMock.apiPayPayroll).toHaveBeenCalledTimes(1);
  });

  it('разбивку по филиалам показывает только там, где филиалов больше одного', async () => {
    await setup();

    expandTeacher('Азиза');
    // Смотрим внутрь самого блока: филиал называют и группа, и история выплат,
    // и по имени «Алай» на всей странице нельзя понять, откуда оно.
    const byBranch = screen.getByText('Где заработано').parentElement!;
    expect(byBranch).toHaveTextContent('Алай');
    expect(byBranch).toHaveTextContent('20 000 с.');
    expect(byBranch).toHaveTextContent('Центр');
    expect(byBranch).toHaveTextContent('12 000 с.');

    // У Бакыта запись одна: строка повторила бы итог карточки слово в слово.
    expandTeacher('Бакыт');
    expect(screen.queryByText('Где заработано')).toBeNull();
  });

  /**
   * Ставка по умолчанию — настройка раздела, а не месяца.
   *
   * Здесь проверяется не разметка, а происхождение чисел. Раздача идёт молча по
   * ВСЕЙ организации, и единственное, что директор видит до нажатия, — число на
   * кнопке. Считать его по списку экрана нельзя: список шире (уволенные со
   * строками прошлых месяцев, люди без роли преподавателя) и живёт в выбранном
   * месяце, тогда как раздача смотрит на членства сегодня. Разошедшиеся числа
   * означают, что кнопка обещает одно, а сервер делает другое.
   */
  describe('ставка по умолчанию', () => {
    it('рассказывает про текущее умолчание словами, а не молчит', async () => {
      await setup();
      await findApplyButton();

      const card = defaultRateCard();
      expect(within(card).getByText('20% с оплат студентов')).toBeInTheDocument();
      // Карточка не в состоянии ошибки: «Повторить» вместо ставки означает, что
      // экран проверяется не весь — так и жил этот тест, пока в моке не было
      // трёх экспортов умолчания.
      expect(within(card).queryByRole('button', { name: 'Повторить' })).toBeNull();
    });

    it('число на кнопке раздачи берёт с сервера, а не считает по преподавателям экрана', async () => {
      // На экране ТРОЕ без ставки, сервер отвечает «двое». Числа разведены
      // намеренно: клиентский подсчёт дал бы 3 и тест бы упал.
      apiMock.apiGetPayrollOverview.mockImplementation(async (filters?: { period?: string }) => {
        const period = filters?.period || PERIOD;
        return {
          period,
          windowStart: SHEET.windowStart,
          windowEnd: SHEET.windowEnd,
          sheet: { ...SHEET, period },
          lines: [],
          diagnostics: [],
          teachers: [
            noRateTeacher('t1', 'Азиза'),
            noRateTeacher('t2', 'Бакыт'),
            noRateTeacher('t3', 'Гульнара'),
          ],
        };
      });

      render(
        <MemoryRouter>
          <PayrollPage />
        </MemoryRouter>,
      );
      const apply = await findApplyButton();

      // Ловушка на месте: экран действительно показывает трёх без ставки.
      await waitFor(() => expect(screen.getAllByText('Ставка не задана')).toHaveLength(3));

      expect(within(apply).getByText('2')).toBeInTheDocument();
      expect(within(apply).queryByText('3')).toBeNull();
    });

    it('раздаёт умолчание только после подтверждения и ровно одним запросом', async () => {
      await setup();
      fireEvent.click(await findApplyButton());

      // Спрашиваем до: шаг назначает людям деньги и называет, скольким и сколько.
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/без ставки: 2/)).toBeInTheDocument();
      expect(within(dialog).getByText('20% с оплат студентов')).toBeInTheDocument();
      expect(apiMock.apiApplyPayrollDefaultRate).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить' }));

      // Пустое тело — первый проход НЕ трогает устаревшие ставки.
      await waitFor(() => expect(apiMock.apiApplyPayrollDefaultRate).toHaveBeenCalledWith({}));
      expect(apiMock.apiApplyPayrollDefaultRate).toHaveBeenCalledTimes(1);
    });

    it('после раздачи предлагает заменить устаревшие ставки — вторым проходом', async () => {
      apiMock.apiApplyPayrollDefaultRate.mockResolvedValue({
        created: 2,
        teacherIds: ['t1', 't2'],
        skipped: 1,
        legacyRates: 1,
        replacedLegacy: false,
      });

      await setup();
      fireEvent.click(await findApplyButton());
      const apply = await screen.findByRole('dialog');
      fireEvent.click(within(apply).getByRole('button', { name: 'Подтвердить' }));

      // Мёртвая ставка — чужое решение, пусть и переставшее работать: её
      // заменяют отдельным «да», а не заодно с раздачей.
      await waitFor(() => expect(screen.getByText('Устаревшие ставки')).toBeInTheDocument());
      const legacy = screen.getByRole('dialog');
      // Ту же фразу носит и полоска-напоминание, поэтому смотрим внутрь диалога.
      expect(within(legacy).getByText(/Ещё у 1 преподавателей/)).toBeInTheDocument();

      fireEvent.click(within(legacy).getByRole('button', { name: 'Подтвердить' }));

      await waitFor(() => expect(apiMock.apiApplyPayrollDefaultRate)
        .toHaveBeenLastCalledWith({ replaceLegacy: true }));
      expect(apiMock.apiApplyPayrollDefaultRate).toHaveBeenCalledTimes(2);
    });
  });
});
