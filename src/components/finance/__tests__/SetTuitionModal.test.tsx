import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Окно «Сумма оплаты»: что именно уходит на сервер.
 *
 * Это форма, которая назначает цену обучения пачке студентов и может переписать
 * уже выставленные счета. Ошибка в собранном теле запроса стоит денег и видна
 * только постфактум, поэтому проверяем полезную нагрузку, а не разметку.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Подставляем русский дефолт и раскрываем интерполяцию, как настоящий i18n:
    // иначе подписи с {{month}} нельзя было бы отличить друг от друга.
    t: (_k: string, fb?: any, opts?: any) => {
      const text = typeof fb === 'string' ? fb : _k;
      const vars = typeof fb === 'object' ? fb : opts;
      return vars ? text.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? '')) : text;
    },
    i18n: { language: 'ru' },
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../lib/api', () => ({
  apiSetStudentTuition: vi.fn(),
  orgGetCourses: vi.fn(),
}));

import SetTuitionModal from '../SetTuitionModal';
import * as api from '../../../lib/api';

const apiMock = api as unknown as {
  apiSetStudentTuition: ReturnType<typeof vi.fn>;
  orgGetCourses: ReturnType<typeof vi.fn>;
};

const COURSES = [
  { id: 'c1', title: 'Английский', price: 5000, status: 'published' },
  { id: 'c2', title: 'Математика', price: 4000, status: 'published' },
];

const OK = { saved: 1, cleared: 0, skippedStudents: 0, updatedPlans: 0, skippedPlans: 0 };

const setup = (props: Partial<React.ComponentProps<typeof SetTuitionModal>> = {}) => {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(
    <SetTuitionModal
      studentIds={['s1', 's2']}
      period="2026-08"
      periodLabel="август 2026"
      onClose={onClose}
      onSuccess={onSuccess}
      {...props}
    />
  );
  return { onSuccess, onClose };
};

const amountInput = () => screen.getByPlaceholderText('0');
const saveButton = () => screen.getByRole('button', { name: 'Сохранить' });

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.orgGetCourses.mockResolvedValue(COURSES);
  apiMock.apiSetStudentTuition.mockResolvedValue(OK);
});

describe('SetTuitionModal', () => {
  it('sends every selected student with the chosen course and amount', async () => {
    const { onSuccess } = setup();
    await waitFor(() => expect(apiMock.orgGetCourses).toHaveBeenCalled());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c1' } });
    fireEvent.change(amountInput(), { target: { value: '3500' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(apiMock.apiSetStudentTuition).toHaveBeenCalledWith({
      studentIds: ['s1', 's2'],
      courseId: 'c1',
      amount: 3500,
      // Галочка «применить к неоплаченным» включена по умолчанию: менеджер,
      // назначивший цену 15-го, ждёт увидеть её в текущем месяце.
      applyToUnpaid: true,
      // ...и по ВСЕМ неоплаченным месяцам: долг состоит из счетов разных
      // месяцев, и починка одного оставляла остальной долг по цене курса.
      applyScope: 'all',
      period: '2026-08',
    }));
    expect(onSuccess).toHaveBeenCalled();
  });

  it('honours unticking «apply to unpaid» — the rate then looks only forward', async () => {
    setup({ courseId: 'c1' });
    fireEvent.change(amountInput(), { target: { value: '3500' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(saveButton());

    await waitFor(() => expect(apiMock.apiSetStudentTuition).toHaveBeenCalledWith(
      expect.objectContaining({ applyToUnpaid: false })
    ));
  });

  it('can narrow the rewrite to the selected month', async () => {
    // Цена может начать действовать с сентября, а долг за июль — остаться
    // прежним. Это сужение, поэтому его выбирают явно.
    setup({ courseId: 'c1' });
    fireEvent.change(amountInput(), { target: { value: '3500' } });
    fireEvent.click(screen.getByRole('radio', { name: /Только за август 2026/ }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(apiMock.apiSetStudentTuition).toHaveBeenCalledWith(
      expect.objectContaining({ applyScope: 'period', period: '2026-08' })
    ));
  });

  it('hides the scope choice when nothing will be rewritten', async () => {
    // При снятой галочке выбор месяца ни на что не влияет: живой орган
    // управления, который ничего не меняет, — ложь о том, что делает форма.
    setup({ courseId: 'c1' });
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('sends zero as a real price, not as an empty field', async () => {
    // Ноль — стипендиат. Если бы форма сочла его пустым, такой студент и дальше
    // получал бы счета по цене курса.
    setup({ courseId: 'c1' });
    fireEvent.change(amountInput(), { target: { value: '0' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(apiMock.apiSetStudentTuition).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0 })
    ));
  });

  it('clears the rate with null and never applies a clear to existing charges', async () => {
    setup({ courseId: 'c1', initialAmount: 3500 });
    fireEvent.click(screen.getByRole('button', { name: /По цене курса/ }));

    await waitFor(() => expect(apiMock.apiSetStudentTuition).toHaveBeenCalledWith(
      expect.objectContaining({ amount: null, applyToUnpaid: false })
    ));
  });

  it('cannot be submitted without a course — the pair is student × course', async () => {
    setup();
    fireEvent.change(amountInput(), { target: { value: '3500' } });
    expect(saveButton()).toBeDisabled();
  });

  it('shows the gap against the course price so a cut is deliberate, not a typo', async () => {
    setup();
    await waitFor(() => expect(apiMock.orgGetCourses).toHaveBeenCalled());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c1' } });
    fireEvent.change(amountInput(), { target: { value: '3500' } });
    await waitFor(() => expect(screen.getByText(/Скидка/)).toBeInTheDocument());

    fireEvent.change(amountInput(), { target: { value: '6000' } });
    await waitFor(() => expect(screen.getByText(/Выше прайса/)).toBeInTheDocument());
  });

  it('keeps the form open when the server refuses, so the input is not lost', async () => {
    apiMock.apiSetStudentTuition.mockRejectedValue(new Error('Недостаточно прав'));
    const { onClose, onSuccess } = setup({ courseId: 'c1' });
    fireEvent.change(amountInput(), { target: { value: '3500' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(apiMock.apiSetStudentTuition).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(amountInput()).toHaveValue(3500);
  });
});
