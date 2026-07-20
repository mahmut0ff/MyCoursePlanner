/**
 * Категории расходов.
 *
 * Общий модуль, а не константа внутри вкладки: те же цвета и подписи нужны
 * разбивке расходов на «Обзоре», иначе одна и та же «Аренда» окажется в двух
 * местах разного цвета.
 */
export interface ExpenseCategory {
  id: string;
  labelKey: string;
  fallback: string;
  color: string;
  /** Заводится только системой — руками такой расход создать нельзя. */
  systemOnly?: boolean;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'salary', labelKey: 'finances.catSalary', fallback: 'Зарплата', color: '#6366f1' },
  { id: 'rent', labelKey: 'finances.catRent', fallback: 'Аренда', color: '#f59e0b' },
  { id: 'marketing', labelKey: 'finances.catMarketing', fallback: 'Маркетинг', color: '#10b981' },
  { id: 'supplies', labelKey: 'finances.catSupplies', fallback: 'Канцтовары', color: '#06b6d4' },
  { id: 'utilities', labelKey: 'finances.catUtilities', fallback: 'Коммунальные', color: '#ef4444' },
  { id: 'transport', labelKey: 'finances.catTransport', fallback: 'Транспорт', color: '#8b5cf6' },
  { id: 'equipment', labelKey: 'finances.catEquipment', fallback: 'Оборудование', color: '#f97316' },
  { id: 'other', labelKey: 'finances.catOther', fallback: 'Прочее', color: '#64748b' },
  // Возвраты заводятся только из истории оплат студента: там расход
  // привязывается к счёту и снимает долг. Руками такой расход создать нельзя —
  // он бы ушёл в никуда, не тронув ни один счёт, поэтому в форме его нет.
  { id: 'refund', labelKey: 'finances.catRefund', fallback: 'Возврат', color: '#e11d48', systemOnly: true },
  // Оплаты студентов приходят с этой категорией — в расходах не встречается,
  // но нужна, чтобы разбивка доходов и журнал платежей знали её подпись.
  { id: 'course_fee', labelKey: 'finances.catCourseFee', fallback: 'Оплата курса', color: '#10b981', systemOnly: true },
];

/** Категории, доступные для выбора руками. */
export const PICKABLE_CATEGORIES = EXPENSE_CATEGORIES.filter(c => !c.systemOnly);

const BY_ID = new Map(EXPENSE_CATEGORIES.map(c => [c.id, c]));

export const getCategory = (id?: string): ExpenseCategory | undefined => (id ? BY_ID.get(id) : undefined);

export const getCategoryColor = (id?: string): string => getCategory(id)?.color || '#64748b';

/**
 * Подпись категории. Незнакомый id возвращаем как есть — расход мог быть
 * заведён кодом, которого здесь ещё нет, и показать сырой id честнее, чем
 * молча подменить его на «Прочее».
 */
export const getCategoryLabel = (
  id: string | undefined,
  t: (key: string, fallback: string) => string
): string => {
  const cat = getCategory(id);
  return cat ? t(cat.labelKey, cat.fallback) : id || '—';
};

/** Способы оплаты — единый список для форм, журнала и разбивки по кассе. */
export const PAYMENT_METHODS: { id: string; labelKey: string; fallback: string; icon: string }[] = [
  { id: 'cash', labelKey: 'finances.methodCash', fallback: 'Наличные', icon: '💵' },
  { id: 'card', labelKey: 'finances.methodCard', fallback: 'Карта', icon: '💳' },
  { id: 'transfer', labelKey: 'finances.methodTransfer', fallback: 'Перевод', icon: '🏦' },
];

export const getMethodLabel = (
  id: string | undefined,
  t: (key: string, fallback: string) => string
): string => {
  const m = PAYMENT_METHODS.find(x => x.id === id);
  return m ? `${m.icon} ${t(m.labelKey, m.fallback)}` : t('finances.methodUnknown', 'Не указан');
};
