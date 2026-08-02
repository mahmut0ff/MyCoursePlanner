import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  orgGetTeachers, orgGetGroups, orgUpdateGroup,
  apiGetTeacherActivity, apiGetTeacherTimeline,
} from '../../lib/api';
import {
  ArrowLeft, MessageCircle, Mail, Copy, Plus, X, AlertTriangle,
  Pencil, RotateCcw, Briefcase, GraduationCap, CalendarCheck, CheckSquare,
  FilePlus2, BookOpen, Gamepad2, ClipboardList, LogIn, UserPlus, UserCheck,
  UserMinus, FolderPlus, FolderMinus, ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserProfile, Group } from '../../types';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useBranch } from '../../contexts/BranchContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useOrgPresence } from '../../hooks/useOrgPresence';
import { PresenceDot } from '../../components/presence/PresenceBadge';
import MemberRolesEditor from '../../components/shared/MemberRolesEditor';
import EditTeacherModal from '../../components/teachers/EditTeacherModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import RowMenu, { type RowMenuItem } from '../../components/ui/RowMenu';

/**
 * Карточка преподавателя — экран НАГРУЗКИ И АКТИВНОСТИ.
 *
 * Раньше страница была резюме: «О себе», «Опыт работы», «Образование»,
 * «Сертификаты» — четыре текстовых блока, которые преподаватель заполнял сам и
 * которые почти всегда были пусты. Резюме удалено из продукта целиком, и это
 * обнажило настоящий вопрос администратора о преподавателе: сколько он ведёт,
 * что он делает в системе и когда его последний раз видели. Ровно на него
 * страница теперь и отвечает — из уже существующих teacherActivity и KPI,
 * тех же, что питают раздел «Активность».
 *
 * Оформление намеренно то же, что на карточке студента: одна колонка, пол 14px,
 * tabular-nums, цвет только как код состояния, заголовок секции над контейнером.
 */

// Те же ключи и подписи, что в разделе «Активность» — две поверхности об одном
// и том же действии обязаны говорить одинаково.
const TYPE_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  grade_set: { label: 'Оценки', icon: GraduationCap, color: 'text-blue-500' },
  attendance_marked: { label: 'Посещаемость', icon: CalendarCheck, color: 'text-emerald-500' },
  homework_checked: { label: 'Проверка ДЗ', icon: CheckSquare, color: 'text-violet-500' },
  homework_created: { label: 'Создание ДЗ', icon: FilePlus2, color: 'text-fuchsia-500' },
  lesson_created: { label: 'Уроки', icon: BookOpen, color: 'text-amber-500' },
  quiz_created: { label: 'Квизы', icon: Gamepad2, color: 'text-cyan-500' },
  exam_created: { label: 'Экзамены', icon: ClipboardList, color: 'text-rose-500' },
  login: { label: 'Входы', icon: LogIn, color: 'text-slate-400' },
  student_created: { label: 'Заведено студентов', icon: UserPlus, color: 'text-teal-500' },
  student_enrolled: { label: 'Зачислено в группы', icon: UserCheck, color: 'text-sky-500' },
  student_removed: { label: 'Отчислено', icon: UserMinus, color: 'text-orange-500' },
  group_created: { label: 'Создано групп', icon: FolderPlus, color: 'text-indigo-500' },
  group_deleted: { label: 'Удалено групп', icon: FolderMinus, color: 'text-slate-400' },
};

const PERIODS: { id: string; label: string }[] = [
  { id: 'current_month', label: 'Этот месяц' },
  { id: 'last_month', label: 'Прошлый месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
  { id: 'all', label: 'Всё время' },
];

/**
 * Карточка открывается на КВАРТАЛЕ, а не на «этом месяце».
 *
 * «Этот месяц» — правильный дефолт для раздела «Активность», где преподавателей
 * сравнивают друг с другом в одном окне. На личной карточке он врёт: первого
 * числа окно шириной в один день, а если месяц начался с выходных — в один
 * уикенд, и самый активный преподаватель академии открывается с нулями и
 * красным KPI. Скользящий квартал никогда не бывает пустым по календарю.
 */
const DEFAULT_PERIOD = 'quarter';

interface KpiRow {
  teacherId: string;
  name: string;
  counts: Record<string, number>;
  totalActions: number;
  activeDays: number;
  engagementPoints: number;
  consistencyPct: number;
  kpiScore: number;
  lastActivityAt: string | null;
}

interface TimelineEvent {
  id: string;
  type: string;
  count: number;
  entityId: string | null;
  entityLabel: string | null;
  createdAt: string | null;
  meta: Record<string, unknown> | null;
}

const scoreTone = (s: number) =>
  s >= 70 ? 'text-emerald-600 dark:text-emerald-400'
    : s >= 40 ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400';

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};

/** Короткие номера без кода страны wa.me не откроет — то же правило, что в списках. */
const toWhatsappNumber = (phone?: string) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
};

const relativeDay = (iso: string | null): string => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
};

const TeacherDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const { t } = useTranslation();
  const { role, organizationId } = useAuth();
  const { activeBranchId, setActiveBranch, branches } = useBranch();
  const { loaded: permsLoaded, canRead, canWrite } = usePermissions();
  const presence = useOrgPresence(organizationId);

  const isOrgAdmin = role === 'admin' || role === 'super_admin';
  const canEditTeachers = permsLoaded && canWrite('teachers');
  // Активность и KPI — отдельное право: его специально выдают тем, кто следит за
  // работой преподавателей, и оно не должно протекать всем, кто видит карточку.
  const canSeeActivity = permsLoaded && canRead('teacher_activity');

  const [teacher, setTeacher] = useState<UserProfile | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [kpi, setKpi] = useState<KpiRow | null>(null);
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<{ groups?: boolean; activity?: boolean }>({});

  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [unassign, setUnassign] = useState<{ id: string; name: string } | null>(null);
  const [unassignBusy, setUnassignBusy] = useState(false);

  const groups = useMemo(
    () => allGroups.filter(g => g.teacherIds?.includes(uid!)),
    [allGroups, uid],
  );

  const studentCount = useMemo(
    // Один ученик может быть в двух группах одного преподавателя — считаем людей, а не места.
    () => new Set(groups.flatMap(g => g.studentIds || [])).size,
    [groups],
  );

  const courseCount = useMemo(
    () => new Set(groups.map(g => g.courseId || g.courseName).filter(Boolean)).size,
    [groups],
  );

  const loadActivity = useCallback(async () => {
    const [kpiRes, tl] = await Promise.all([
      apiGetTeacherActivity({ period }),
      apiGetTeacherTimeline(uid!, { period }),
    ]);
    setKpi((kpiRes?.rows || []).find((r: KpiRow) => r.teacherId === uid) || null);
    setEvents(tl?.events || []);
  }, [uid, period]);

  useEffect(() => {
    if (!uid || !permsLoaded) return;
    setLoading(true);
    setFailed({});
    Promise.allSettled([
      orgGetTeachers().then((all: UserProfile[]) => setTeacher(all.find(u => u.uid === uid) || null)),
      orgGetGroups().then(setAllGroups),
      canSeeActivity ? loadActivity() : Promise.resolve(),
    ]).then(([, grp, act]) => {
      setFailed({
        groups: grp.status === 'rejected',
        activity: canSeeActivity && act.status === 'rejected',
      });
      if (grp.status === 'rejected') setAllGroups([]);
    }).finally(() => setLoading(false));
    // activeBranchId: api-слой штампует филиал на GET — переключение это перезагрузка.
  }, [uid, activeBranchId, permsLoaded, canSeeActivity, loadActivity]);

  const retryActivity = useCallback(() => {
    loadActivity()
      .then(() => setFailed(f => ({ ...f, activity: false })))
      .catch(() => setFailed(f => ({ ...f, activity: true })));
  }, [loadActivity]);

  const handleAssign = async () => {
    if (!selectedGroupId || !uid) return;
    const target = allGroups.find(g => g.id === selectedGroupId);
    if (!target) return;
    setAssigning(true);
    try {
      const ids = target.teacherIds || [];
      if (!ids.includes(uid)) {
        await orgUpdateGroup({ id: target.id, teacherIds: [...ids, uid] });
        setAllGroups(prev => prev.map(g => (g.id === target.id ? { ...g, teacherIds: [...ids, uid] } : g)));
        toast.success('Преподаватель назначен на группу');
      }
      setShowAssign(false);
      setSelectedGroupId('');
    } catch (e: any) {
      toast.error(e.message || 'Не удалось назначить');
    } finally {
      setAssigning(false);
    }
  };

  const runUnassign = async () => {
    if (!unassign || !uid) return;
    setUnassignBusy(true);
    try {
      const target = allGroups.find(g => g.id === unassign.id);
      if (target) {
        const ids = (target.teacherIds || []).filter(id => id !== uid);
        await orgUpdateGroup({ id: target.id, teacherIds: ids });
        setAllGroups(prev => prev.map(g => (g.id === target.id ? { ...g, teacherIds: ids } : g)));
        toast.success('Преподаватель откреплён от группы');
      }
      setUnassign(null);
    } catch (e: any) {
      toast.error(e.message || 'Не удалось открепить');
    } finally {
      setUnassignBusy(false);
    }
  };

  if (loading) return <DetailSkeleton />;

  if (!teacher) {
    const branchScoped = !!activeBranchId && branches.length > 1;
    return (
      <div className="max-w-2xl mx-auto py-10">
        <EmptyState
          icon={Briefcase}
          title={branchScoped ? 'Преподавателя нет в выбранном филиале' : 'Преподаватель не найден'}
          description={branchScoped
            ? 'Запись может относиться к другому филиалу — покажите все филиалы, чтобы её увидеть.'
            : 'Запись удалена или ссылка устарела.'}
          actionLabel={branchScoped ? 'Показать все филиалы' : 'К списку преподавателей'}
          {...(branchScoped
            ? { onAction: () => setActiveBranch(null) }
            : { actionLink: '/teachers' })}
        />
      </div>
    );
  }

  const online = presence.isOnline(teacher.uid);
  // ВАЖНО: kpi.lastActivityAt считается ТОЛЬКО по событиям внутри выбранного
  // периода (teacher-kpi.ts), поэтому «последняя активность» из него не может
  // быть раньше начала окна и в первые дни месяца всегда пуста. Присутствие —
  // абсолютное, и на вопрос «когда его последний раз видели» отвечает честно.
  const lastSeenMs = presence.lastSeenMs(teacher.uid);
  const waNumber = toWhatsappNumber(teacher.phone);

  const menuItems: RowMenuItem[] = [];
  if (waNumber) {
    menuItems.push({
      label: t('common.writeWhatsapp', 'Написать в WhatsApp'),
      icon: MessageCircle,
      onSelect: () => window.open(`https://wa.me/${waNumber}`, '_blank', 'noopener,noreferrer'),
    });
  }
  if (teacher.email) {
    menuItems.push({
      label: t('common.writeEmail', 'Написать на почту'),
      icon: Mail,
      onSelect: () => { window.location.href = `mailto:${teacher.email}`; },
    });
  }
  if (teacher.phone) {
    menuItems.push({
      label: t('common.copyPhone', 'Скопировать телефон'),
      icon: Copy,
      onSelect: () => { navigator.clipboard.writeText(teacher.phone!); toast.success('Скопировано'); },
    });
  }
  if (canEditTeachers) {
    menuItems.push({
      label: t('common.edit', 'Редактировать'),
      icon: Pencil,
      separated: menuItems.length > 0,
      onSelect: () => setShowEdit(true),
    });
  }
  if (canSeeActivity) {
    menuItems.push({
      label: 'Открыть в «Активности»',
      icon: ExternalLink,
      separated: menuItems.length > 0,
      onSelect: () => { window.location.href = '/teacher-activity'; },
    });
  }

  const breakdown = Object.keys(TYPE_META)
    .map(type => ({ type, ...TYPE_META[type], value: kpi?.counts[type] || 0 }))
    .filter(b => b.value > 0);

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <Link
        to="/teachers"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
      >
        <ArrowLeft className="w-4 h-4" />{t('nav.teachers', 'Преподаватели')}
      </Link>

      {/* ═══ Идентичность ═══ */}
      <header className="flex items-start gap-4 mb-6">
        <div className="relative shrink-0">
          {teacher.avatarUrl ? (
            <img src={teacher.avatarUrl} alt="" className="w-14 h-14 rounded-2xl object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              {teacher.displayName?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <PresenceDot
            online={online}
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 ring-2 ring-white dark:ring-slate-900 rounded-full"
            title={online ? 'В сети' : undefined}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{teacher.displayName}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{online ? 'В сети' : lastSeenMs ? `Был(а) в сети ${relativeDay(new Date(lastSeenMs).toISOString())}` : 'Не в сети'}</span>
            {teacher.email && <><Dot />{teacher.email}</>}
            {teacher.phone && (
              <>
                <Dot />
                <a
                  href={`tel:${teacher.phone}`}
                  className="font-medium text-slate-700 hover:text-primary-600 dark:text-slate-200 dark:hover:text-primary-400 transition-colors"
                >
                  {teacher.phone}
                </a>
                {waNumber && (
                  <a
                    href={`https://wa.me/${waNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Написать ${teacher.displayName} в WhatsApp`}
                    className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}
              </>
            )}
            {(teacher as any).city && <><Dot />{(teacher as any).city}</>}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {canEditTeachers && (
            <button
              onClick={() => setShowEdit(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
            >
              <Pencil className="w-4 h-4" />{t('common.edit', 'Редактировать')}
            </button>
          )}
          <RowMenu items={menuItems} />
        </div>
      </header>

      {/* ═══ Полоса нагрузки ═══
          Только то, что НЕ зависит от выбранного периода. KPI, активные дни и
          стабильность отсюда убраны намеренно: это величины за окно, и наверху,
          вдали от переключателя периода, их ноль читался как приговор
          преподавателю, а не как факт о двух выходных днях. */}
      <dl className="grid grid-cols-2 md:grid-cols-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-x divide-y md:divide-y-0 divide-slate-200 dark:divide-slate-700 overflow-hidden mb-8">
        <Metric label="Групп" value={String(groups.length)} />
        <Metric label="Курсов" value={String(courseCount)} />
        <Metric
          label="Учеников"
          value={String(studentCount)}
          hint={groups.length > 1 ? 'без повторов' : undefined}
        />
        <Metric
          label="Был(а) в сети"
          value={online ? 'сейчас' : lastSeenMs ? relativeDay(new Date(lastSeenMs).toISOString()) : '—'}
        />
      </dl>

      {/* ═══ Нагрузка: группы ═══ */}
      <section className="mb-8">
        <SectionHeading title="Группы" meta={groups.length > 0 ? `${groups.length}` : undefined} />
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          {failed.groups ? (
            <div className="p-4"><LoadError onRetry={() => window.location.reload()} /></div>
          ) : groups.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
              Преподаватель не ведёт ни одной группы
              {canEditTeachers && (
                <> · <button onClick={() => setShowAssign(true)} className="font-medium text-primary-600 dark:text-primary-400 hover:underline">назначить</button></>
              )}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {groups.map(g => (
                <li key={g.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <Link to={`/groups/${g.id}`} className="min-w-0 flex-1 group">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      {g.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {g.courseName || 'Без курса'} · <span className="tabular-nums">{(g.studentIds || []).length}</span> {plural((g.studentIds || []).length, 'ученик', 'ученика', 'учеников')}
                    </p>
                  </Link>
                  {canEditTeachers && (
                    <button
                      onClick={() => setUnassign({ id: g.id, name: g.name })}
                      aria-label={`Открепить от группы ${g.name}`}
                      // Видно всегда, а не по hover: действие только по наведению
                      // недоступно с клавиатуры и с телефона. slate-500, а не 400:
                      // иконка — графический объект, ему нужен контраст ≥3:1.
                      className="shrink-0 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-900/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEditTeachers && groups.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setShowAssign(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-primary-600 hover:border-primary-400 dark:hover:text-primary-400 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />Назначить группу
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ═══ Активность ═══ */}
      {canSeeActivity && (
        <section className="mb-8">
          <SectionHeading
            title="Активность"
            action={{ label: 'Весь раздел', to: '/teacher-activity' }}
          />
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex flex-wrap gap-1.5">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  aria-pressed={period === p.id}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    period === p.id
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* KPI живёт здесь, вплотную к переключателю периода, потому что это
                величина ЗА ОКНО, а не свойство преподавателя. И он относительный:
                вовлечённость нормируется на самого активного коллегу в этом же
                окне (teacher-kpi.ts, engagement = points / cohortMax), поэтому
                «0» значит «в этом окне действий нет», а не «плохо работает». */}
            {!failed.activity && (
              <dl className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700 border-b border-slate-100 dark:border-slate-700">
                <Metric
                  label="KPI за период"
                  value={kpi ? String(kpi.kpiScore) : '—'}
                  valueClass={kpi && kpi.totalActions > 0 ? scoreTone(kpi.kpiScore) : undefined}
                  hint="относительно коллег"
                />
                <Metric label="Активных дней" value={kpi ? String(kpi.activeDays) : '—'} />
                <Metric
                  label="Действий"
                  value={kpi ? String(kpi.totalActions) : '—'}
                  hint={kpi ? `стабильность ${kpi.consistencyPct}%` : undefined}
                />
              </dl>
            )}

            {failed.activity ? (
              <div className="p-4"><LoadError onRetry={retryActivity} /></div>
            ) : breakdown.length === 0 && (events?.length ?? 0) === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  За выбранный период действий не зафиксировано
                </p>
                {period !== 'all' && (
                  <button
                    onClick={() => setPeriod('all')}
                    className="mt-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Посмотреть за всё время
                  </button>
                )}
              </div>
            ) : (
              <>
                {breakdown.length > 0 && (
                  <ul className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-slate-100 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-700">
                    {breakdown.map(b => (
                      <li key={b.type} className="bg-white dark:bg-slate-800 px-4 py-3 flex items-center gap-2.5">
                        <b.icon className={`w-4 h-4 shrink-0 ${b.color}`} aria-hidden />
                        <div className="min-w-0">
                          <p className="text-base font-semibold tabular-nums text-slate-900 dark:text-white leading-tight">{b.value}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{t(`teacherActivity.type.${b.type}`, b.label)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {events && events.length > 0 && (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700 max-h-80 overflow-y-auto">
                    {events.slice(0, 30).map(ev => {
                      const meta = TYPE_META[ev.type];
                      const Icon = meta?.icon || CalendarCheck;
                      return (
                        <li key={ev.id} className="px-4 py-2.5 flex items-start gap-3">
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta?.color || 'text-slate-400'}`} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-900 dark:text-white">
                              {t(`teacherActivity.type.${ev.type}`, meta?.label || ev.type)}
                              {ev.count > 1 && <span className="ml-1.5 text-slate-500 dark:text-slate-400 tabular-nums">×{ev.count}</span>}
                            </p>
                            {ev.entityLabel && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{ev.entityLabel}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {ev.createdAt ? new Date(ev.createdAt).toLocaleDateString('ru-RU') : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* ═══ Роли ═══ */}
      {isOrgAdmin && organizationId && (
        <section>
          <SectionHeading title="Роли и доступ" />
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3.5">
            <MemberRolesEditor uid={teacher.uid} orgId={organizationId} />
          </div>
        </section>
      )}

      {/* ═══ Модальные окна ═══ */}
      {showEdit && (
        <EditTeacherModal
          teacher={teacher as any}
          onClose={() => setShowEdit(false)}
          onSaved={patch => setTeacher({ ...teacher, ...patch } as UserProfile)}
        />
      )}

      {showAssign && (
        <ConfirmDialog
          open
          title="Назначить группу"
          confirmLabel={assigning ? 'Назначаем…' : 'Назначить'}
          busy={assigning || !selectedGroupId}
          onConfirm={handleAssign}
          onClose={() => { setShowAssign(false); setSelectedGroupId(''); }}
          message={
            <div>
              <p className="mb-3">
                Выберите группу для <b>{teacher.displayName}</b>. Преподаватель получит доступ к материалам курса.
              </p>
              {allGroups.filter(g => !(g.teacherIds || []).includes(uid!)).length === 0 ? (
                <p className="text-amber-700 dark:text-amber-300">Свободных групп нет — во всех уже есть этот преподаватель.</p>
              ) : (
                <select
                  value={selectedGroupId}
                  onChange={e => setSelectedGroupId(e.target.value)}
                  aria-label="Группа"
                  className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white outline-none focus:border-primary-500"
                >
                  <option value="">— Выберите группу —</option>
                  {allGroups.filter(g => !(g.teacherIds || []).includes(uid!)).map(g => (
                    <option key={g.id} value={g.id}>{g.name}{g.courseName ? ` (${g.courseName})` : ''}</option>
                  ))}
                </select>
              )}
            </div>
          }
        />
      )}

      <ConfirmDialog
        open={!!unassign}
        busy={unassignBusy}
        title="Открепить от группы?"
        confirmLabel="Открепить"
        message={<>Преподаватель перестанет вести группу <b>{unassign?.name}</b> и потеряет доступ к её материалам. Журнал и оценки сохранятся.</>}
        onConfirm={runUnassign}
        onClose={() => setUnassign(null)}
      />
    </div>
  );
};

/* ─── Мелкие части ─── */

const Dot: React.FC = () => <span aria-hidden className="text-slate-300 dark:text-slate-600">·</span>;

const SectionHeading: React.FC<{
  title: string;
  meta?: string;
  action?: { label: string; to: string };
}> = ({ title, meta, action }) => (
  // Заголовок над контейнером, а не внутри: иначе получается карточка в карточке.
  <div className="flex items-baseline justify-between gap-3 mb-2.5">
    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
      {title}
      {meta && <span className="ml-2 font-normal text-slate-500 dark:text-slate-400 tabular-nums">{meta}</span>}
    </h2>
    {action && (
      <Link to={action.to} className="shrink-0 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
        {action.label}
      </Link>
    )}
  </div>
);

const Metric: React.FC<{
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}> = ({ label, value, hint, valueClass }) => (
  <div className="px-4 py-3">
    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${valueClass || 'text-slate-900 dark:text-white'}`}>{value}</dd>
    {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
  </div>
);

const LoadError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-hidden />
    Не удалось загрузить
    <button onClick={onRetry} className="inline-flex items-center gap-1 font-medium text-primary-600 dark:text-primary-400 hover:underline">
      <RotateCcw className="w-3.5 h-3.5" />Повторить
    </button>
  </p>
);

/** Скелет вместо спиннера: экран сразу показывает свою форму. */
const DetailSkeleton: React.FC = () => (
  <div className="max-w-5xl mx-auto" aria-busy="true" aria-label="Загрузка карточки преподавателя">
    <Skeleton className="h-5 w-32 mb-5" />
    <div className="flex items-start gap-4 mb-6">
      <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-7 w-52 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>
    </div>
    <Skeleton className="h-20 w-full rounded-2xl mb-8" />
    <Skeleton className="h-4 w-16 mb-2.5" />
    <Skeleton className="h-32 w-full rounded-2xl mb-8" />
    <Skeleton className="h-4 w-24 mb-2.5" />
    <Skeleton className="h-48 w-full rounded-2xl" />
  </div>
);

export default TeacherDetailPage;
