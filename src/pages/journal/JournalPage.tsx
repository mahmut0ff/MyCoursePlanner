import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  orgGetCourses,
  orgGetGroups,
  orgGetStudents,
  orgGetTeachers,
  orgGetJournal,
  orgSaveJournal,
  orgBulkAttendance,
  apiAwardXP,
  orgGetGradeSchema,
  orgGetGrades,
  orgSaveGrade,
  apiGetLessons
} from '../../lib/api';
import type { Course, Group, UserProfile, JournalEntry, AttendanceStatus, ParticipationLevel, GradeSchema, GradeEntry } from '../../types';
import GradeCell from '../../components/gradebook/GradeCell';
import { ClipboardList, Calendar, AlertCircle, AlertTriangle, RefreshCcw, UserCheck, CheckCircle2, XCircle, Clock, FileWarning, Trophy, TrendingUp, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';


function getLocalISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const now = new Date();
const todayFormatted = getLocalISODate(now);

const minDateObj = new Date(now);
minDateObj.setDate(now.getDate() - 14);
const minDateFormatted = getLocalISODate(minDateObj);

const maxDateObj = new Date(now);
maxDateObj.setDate(now.getDate() + 14);
const maxDateFormatted = getLocalISODate(maxDateObj);

const attendanceIcons: Record<AttendanceStatus, React.ReactNode> = {
  present: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  absent: <XCircle className="w-5 h-5 text-red-500" />,
  late: <Clock className="w-5 h-5 text-amber-500" />,
  excused: <FileWarning className="w-5 h-5 text-slate-400" />
};

const defaultSchema: GradeSchema = {
  id: '',
  courseId: '',
  organizationId: '',
  gradingType: 'points',
  scale: { min: 0, max: 100 },
  passThreshold: 50,
  createdAt: '',
  updatedAt: '',
};



const JournalPage: React.FC = () => {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const { canWrite } = usePermissions();
  // Read-only is driven by the resolved gradebook grant, not the base role — a manager
  // (or custom role) with gradebook:write can mark attendance/grades, matching the backend.
  const isReadOnly = !canWrite('gradebook');

  const [courses, setCourses] = useState<Course[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
  const [allTeachers, setAllTeachers] = useState<UserProfile[]>([]);

  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [date, setDate] = useState<string>(todayFormatted);
  // Фактическая длительность занятия (мин) для payroll-сессии. Пусто = неизвестно (null),
  // движок расчёта не начислит по per_hour, но per_lesson/per_student честно посчитаются.
  const [sessionDuration, setSessionDuration] = useState<string>('');
  // Явный выбор «кто вёл занятие» — нужен ТОЛЬКО когда у группы несколько преподавателей.
  // Пусто = не указан (сервер запишет teacherId: null, а не угадает по отметившему журнал).
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  
  const [schema, setSchema] = useState<GradeSchema>(defaultSchema);
  const [entries, setEntries] = useState<Record<string, JournalEntry>>({});
  const [allJournalEntries, setAllJournalEntries] = useState<JournalEntry[]>([]);
  const [courseJournalDates, setCourseJournalDates] = useState<string[]>([]);
  const [grades, setGrades] = useState<Record<string, GradeEntry>>({});
  const [courseLessons, setCourseLessons] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<Record<string, boolean>>({});
  const [entrySyncStatus, setEntrySyncStatus] = useState<Record<string, boolean>>({});
  
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [bulking, setBulking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isDateValidForEditing = useMemo(() => {
    if (isReadOnly) return false;
    // 14 day window restriction for teachers (2 weeks back, 2 weeks forward)
    return date >= minDateFormatted && date <= maxDateFormatted;
  }, [date, isReadOnly]);

  const canEdit = !isReadOnly && isDateValidForEditing;

  const quickDates = useMemo(() => {
    const datesSet = new Set<string>();
    datesSet.add(todayFormatted); // always include today

    courseJournalDates.forEach(d => datesSet.add(d));

    const sorted = Array.from(datesSet).sort((a, b) => b.localeCompare(a));
    const top5 = sorted.slice(0, 5).reverse();

    return top5.map(val => {
      const d = new Date(val);
      let label = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' });
      if (val === todayFormatted) label = 'Сегодня';
      return { val, label };
    });
  }, [courseJournalDates]);

  // 1. Load initial static data (optimized)
  useEffect(() => {
    setLoading(true);
    Promise.all([
      orgGetCourses().catch(() => []),
      orgGetGroups().catch(() => []),
      orgGetStudents().catch(() => []),
      // Преподаватели группы — для селектора «Кто вёл занятие?» (нужны имена по uid).
      orgGetTeachers().catch(() => []),
    ])
    .then(([coursesRes, groupsRes, studentsRes, teachersRes]) => {
      let c = Array.isArray(coursesRes) ? coursesRes : [];
      let g = Array.isArray(groupsRes) ? groupsRes : [];
      const s = Array.isArray(studentsRes) ? studentsRes : [];
      const tch = Array.isArray(teachersRes) ? teachersRes : [];

      if (role === 'teacher' && profile?.uid) {
        g = g.filter((group: Group) => group.teacherIds?.includes(profile.uid));
        const groupCourseIds = new Set(g.map(group => group.courseId));
        c = c.filter((course: Course) => course.teacherIds?.includes(profile.uid) || groupCourseIds.has(course.id));
      }

      setCourses(c);
      setAllGroups(g);
      setAllStudents(s);
      setAllTeachers(tch);

      if (g.length > 0) {
        setSelectedGroupId(g[0].id);
      }
    })
    .catch((e: any) => {
      if (e.message?.includes('403') || e.message?.includes('Forbidden')) {
        setError(t('common.accessDenied', 'Нет доступа к данным'));
      } else {
        toast.error(e.message);
      }
    })
    .finally(() => setLoading(false));
  }, []);

  // 2. Курс больше не выбирается вручную — он выводится из выбранной группы.
  const selectedCourseId = useMemo(
    () => allGroups.find(g => g.id === selectedGroupId)?.courseId || '',
    [allGroups, selectedGroupId]
  );

  // В селекторе группы разложены по курсам через <optgroup>: курс остаётся виден
  // как контекст, но фильтровать по нему больше не нужно.
  const groupsByCourse = useMemo(() => {
    const buckets = new Map<string, { title: string; groups: Group[] }>();
    allGroups.forEach(g => {
      const key = g.courseId || '';
      if (!buckets.has(key)) {
        buckets.set(key, { title: courses.find(c => c.id === key)?.title || 'Без курса', groups: [] });
      }
      buckets.get(key)!.groups.push(g);
    });
    return Array.from(buckets.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [allGroups, courses]);

  // 3. Load journal and grades when date/course changes
  const loadContentAndGrades = async () => {
    if (!selectedCourseId || !date) return;
    setLoadingData(true);
    try {
      const [journalRes, schemaRes, gradesRes, lessonsRes] = await Promise.all([
         orgGetJournal(selectedCourseId),
         orgGetGradeSchema(selectedCourseId).catch(() => null),
         orgGetGrades(selectedCourseId),
         apiGetLessons().catch(() => [])
      ]);

      setSchema(schemaRes || { ...defaultSchema, courseId: selectedCourseId });

      const allLessons = Array.isArray(lessonsRes) ? lessonsRes : [];
      setCourseLessons(allLessons.filter(l => l.courseId === selectedCourseId));

      const allEntries = Array.isArray(journalRes) ? journalRes : [];
      const dateEntries = allEntries.filter((j: any) => j.date === date);
      
      const uniqueDates = Array.from(new Set(allEntries.map((j: any) => j.date as string))).sort((a, b) => b.localeCompare(a));
      setCourseJournalDates(uniqueDates);
      setAllJournalEntries(allEntries as JournalEntry[]);

      const entriesMap: Record<string, JournalEntry> = {};
      dateEntries.forEach((j: any) => {
        entriesMap[j.studentId] = j;
      });
      setEntries(entriesMap);

      const gradesMap: Record<string, GradeEntry> = {};
      (gradesRes as GradeEntry[]).forEach(g => {
         if (g.lessonId) gradesMap[`${g.studentId}_${g.lessonId}`] = g;
      });
      setGrades(gradesMap);
    } catch (e: any) {
      if (e.message?.includes('403') || e.message?.includes('Forbidden')) {
        setError(t('common.accessDenied', 'Нет доступа к данным'));
      } else {
        toast.error(e.message || t('journal.loadError', 'Ошибка загрузки журнала'));
      }
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadContentAndGrades();
  }, [selectedCourseId, date]);

  // 4. Derived Data
  const groupStudents = useMemo(() => {
    if (!selectedGroupId) return [];
    const group = allGroups.find(g => g.id === selectedGroupId);
    if (!group) return [];
    return allStudents.filter(s => group.studentIds.includes(s.uid));
  }, [selectedGroupId, allGroups, allStudents]);

  // Преподаватели выбранной группы (uid → профиль) для селектора «Кто вёл занятие?».
  const groupTeachers = useMemo<UserProfile[]>(() => {
    const group = allGroups.find(g => g.id === selectedGroupId);
    const teacherIds = group?.teacherIds || [];
    return teacherIds.map(id => {
      const found = allTeachers.find(tt => tt.uid === id);
      // Фолбэк, если препод не пришёл в списке (напр. роль manager+teacher): показываем uid.
      return found || ({ uid: id, displayName: '', email: '' } as UserProfile);
    });
  }, [allGroups, selectedGroupId, allTeachers]);

  // У группы больше одного преподавателя → нужен явный выбор, кто реально вёл.
  const isMultiTeacher = groupTeachers.length > 1;

  // При смене группы задаём дефолт селектора: если у группы несколько преподов и текущий
  // пользователь — один из них, предлагаем его (частый кейс: препод отмечает своё занятие);
  // иначе оставляем «не указан». Для групп с 0/1 преподом селектор не нужен — очищаем.
  useEffect(() => {
    const group = allGroups.find(g => g.id === selectedGroupId);
    const teacherIds = group?.teacherIds || [];
    if (teacherIds.length > 1) {
      setSelectedTeacherId(profile?.uid && teacherIds.includes(profile.uid) ? profile.uid : '');
    } else {
      setSelectedTeacherId('');
    }
  }, [selectedGroupId, allGroups, profile?.uid]);

  // Кто вёл занятие (для lessonSessions → payroll). НИКОГДА не угадываем по отметившему:
  // единственный препод группы → он автоматически; несколько → явный выбор пользователя;
  // ноль/не выбран → undefined (сервер честно запишет teacherId: null).
  const resolvedTeacherId = useMemo<string | undefined>(() => {
    const group = allGroups.find(g => g.id === selectedGroupId);
    const teacherIds = group?.teacherIds || [];
    if (teacherIds.length === 1) return teacherIds[0];
    if (teacherIds.length > 1) return selectedTeacherId || undefined;
    return undefined;
  }, [allGroups, selectedGroupId, selectedTeacherId]);

  // Общие поля payroll-сессии для всех вызовов orgBulkAttendance (одна точка правды).
  const buildSessionOpts = () => ({
    groupId: selectedGroupId || undefined,
    teacherId: resolvedTeacherId,
    durationMinutes: sessionDuration.trim() ? Number(sessionDuration) : undefined,
  });


  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  useEffect(() => {
    let found: string | null = null;
    for (const s of groupStudents) {
      if (entries[s.uid]?.lessonId) {
        found = entries[s.uid].lessonId || null;
        break;
      }
    }
    setSelectedLessonId(found);
  }, [selectedCourseId, selectedGroupId, date, groupStudents.length]);

  const handleAttachLesson = async (lessonId: string) => {
    const finalLessonId = lessonId || null;
    setSelectedLessonId(finalLessonId);
    
    const updates = groupStudents.map(s => entries[s.uid]).filter(e => !!e);
    if (updates.length === 0) return;
    
    setBulking(true);
    try {
      const bulkData = updates.map(e => ({
        studentId: e.studentId,
        attendance: e.attendance,
        participation: e.participation,
        note: e.note,
        lessonId: finalLessonId || undefined
      }));
      const res = await orgBulkAttendance(selectedCourseId, date, bulkData, buildSessionOpts());
      const newEntries = { ...entries };
      (res as JournalEntry[]).forEach(e => {
        newEntries[e.studentId] = e;
      });
      setEntries(newEntries);
      toast.success(t('journal.lessonAttached', 'Урок прикреплен'));
    } catch(e: any) {
      toast.error(e.message || 'Ошибка прикрепления урока');
    } finally {
      setBulking(false);
    }
  };


  // 5. Handlers
  const handleEntryChange = (studentId: string, field: keyof JournalEntry, value: any) => {
    if (!canEdit) return;

    const prevEntry = entries[studentId];
    
    const newEntry: JournalEntry = {
      ...(prevEntry || {}),
      id: prevEntry?.id || '',
      studentId,
      courseId: selectedCourseId,
      date,
      attendance: prevEntry?.attendance || 'present',
      participation: prevEntry?.participation || undefined,
      note: prevEntry?.note || '',
      lessonId: prevEntry?.lessonId || selectedLessonId || undefined,
      flags: prevEntry?.flags || [],
      version: (prevEntry?.version || 0) + 1,
      organizationId: '', 
      createdBy: '',
      createdAt: '',
      updatedAt: ''
    };

    if (field === 'attendance') newEntry.attendance = value as AttendanceStatus;
    if (field === 'participation') newEntry.participation = value as ParticipationLevel | undefined;
    if (field === 'note') newEntry.note = value as string;

    // Optimistic Update
    setEntries(prev => ({ ...prev, [studentId]: newEntry }));
    setEntrySyncStatus(prev => ({ ...prev, [studentId]: true }));

    // Debounce save
    if (timersRef.current[studentId]) clearTimeout(timersRef.current[studentId]);
    timersRef.current[studentId] = setTimeout(async () => {
      try {
        const result = await orgSaveJournal(newEntry);
        setEntries(prev => ({ ...prev, [studentId]: result as JournalEntry }));

        if (field === 'attendance') {
          apiAwardXP({
            type: 'attendance',
            studentId,
            status: value,
            sourceType: 'attendance',
            sourceId: (result as JournalEntry).id
          }).catch(console.error);
        }
      } catch (err: any) {
        toast.error('Failed to save entry');
        if (prevEntry) {
          setEntries(prev => ({ ...prev, [studentId]: prevEntry }));
        } else {
          setEntries(prev => {
            const next = { ...prev };
            delete next[studentId];
            return next;
          });
        }
      } finally {
        setEntrySyncStatus(prev => ({ ...prev, [studentId]: false }));
      }
    }, field === 'note' ? 500 : 50);
  };

  const handleGradeChange = (studentId: string, itemId: string, value: number | null, displayValue: string | undefined, status: any, comment?: string) => {
    if (!canEdit) return;

    const key = `${studentId}_${itemId}`;
    const prevEntry = grades[key];
    
    const newEntry: GradeEntry = {
      ...(prevEntry || {}),
      id: prevEntry?.id || '',
      studentId,
      courseId: selectedCourseId,
      lessonId: itemId,
      value,
      displayValue,
      status,
      comment,
      type: schema.gradingType,
      maxValue: schema.scale.max,
      version: (prevEntry?.version || 0) + 1,
      organizationId: '',
      createdBy: '',
      createdAt: '',
      updatedAt: ''
    };

    setGrades(prev => ({ ...prev, [key]: newEntry }));
    setSyncStatus(prev => ({ ...prev, [key]: true }));

    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(async () => {
      try {
        const result = await orgSaveGrade(newEntry);
        setGrades(prev => ({ ...prev, [key]: result as GradeEntry }));

        if (typeof newEntry.value === 'number' && schema.gradingType === 'points' && schema.scale.max > 0) {
          apiAwardXP({
            type: 'grade',
            studentId,
            scorePct: (newEntry.value / schema.scale.max) * 100,
            sourceType: 'grade',
            sourceId: result.id
          }).catch(console.error);
        }
      } catch (err: any) {
        toast.error('Ошибка сохранения оценки');
        if (prevEntry) {
          setGrades(prev => ({ ...prev, [key]: prevEntry }));
        } else {
          setGrades(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      } finally {
        setSyncStatus(prev => ({ ...prev, [key]: false }));
      }
    }, 400);
  };

  const handleMarkAllPresent = async () => {
    if (!canEdit || !selectedCourseId || groupStudents.length === 0) return;
    setBulking(true);
    
    const bulkData = groupStudents.map(s => {
      const existing = entries[s.uid];
      return {
        studentId: s.uid,
        attendance: 'present' as AttendanceStatus,
        participation: existing?.participation,
        note: existing?.note,
        lessonId: existing?.lessonId || selectedLessonId || undefined
      };
    });

    try {
      const res = await orgBulkAttendance(selectedCourseId, date, bulkData, buildSessionOpts());
      const newEntries = { ...entries };
      (res as JournalEntry[]).forEach(e => {
        newEntries[e.studentId] = e;
      });
      setEntries(newEntries);
      toast.success(t('journal.allMarkedPresent', 'Все студенты отмечены присутствующими'));
    } catch(e: any) {
      toast.error(e.message || 'Ошибка массовой отметки');
    } finally {
      setBulking(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-400 rounded-full animate-spin border-t-transparent" /></div>;
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('common.error', 'Ошибка')}</h2>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  if (allGroups.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('journal.noGroups', 'Нет групп')}</h2>
        <p className="text-slate-500 text-sm">{t('journal.noGroupsDesc', 'Создайте группу, чтобы начать вести переклички')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 max-w-[1600px] mx-auto">
      {/* ═ LEFT COLUMN: MAIN JOURNAL ═ */}
      <div className="flex-1 space-y-6 min-w-0">
        
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {t('nav.journal', 'Журнал')}
                {!isDateValidForEditing && !isReadOnly && (
                   <span className="text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-lg font-bold">Архивный режим</span>
                )}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isReadOnly 
                  ? 'Режим только для чтения' 
                  : t('journal.subtitle', 'Ежедневная перекличка и заметки')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary-500 transition-colors shadow-sm cursor-pointer"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              {groupsByCourse.map(bucket => (
                <optgroup key={bucket.title} label={bucket.title}>
                  {bucket.groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Quick Dates */}
            <div className="hidden xl:flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {quickDates.map(qd => (
                <button
                  key={qd.val}
                  onClick={() => setDate(qd.val)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${date === qd.val ? 'bg-primary-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50'}`}
                >
                  {qd.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                min={!isReadOnly ? minDateFormatted : undefined}
                max={!isReadOnly ? maxDateFormatted : undefined}
                className={`w-full sm:w-auto pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary-500 transition-colors shadow-sm cursor-pointer ${!isDateValidForEditing && !isReadOnly ? 'border-red-300 text-red-600 bg-red-50 dark:border-red-900/50 dark:bg-red-900/10' : ''}`}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <button
              onClick={loadContentAndGrades}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-transparent dark:hover:border-slate-700"
              title="Refresh"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Студентов в группе: <span className="font-bold">{groupStudents.length}</span>
            </p>
            {canEdit && courseLessons.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                 <span className="text-xs font-medium text-slate-500">Прикреплённый урок:</span>
                 <select 
                    className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900"
                    value={selectedLessonId || ''}
                    onChange={(e) => handleAttachLesson(e.target.value)}
                 >
                    <option value="">— Без урока —</option>
                    {courseLessons.map(l => (
                      <option key={l.id} value={l.id}>{l.title}</option>
                    ))}
                 </select>
              </div>
            )}
            {!canEdit && selectedLessonId && (
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                 Прикреплённый урок: <span className="font-medium">{courseLessons.find(l => l.id === selectedLessonId)?.title || selectedLessonId}</span>
              </div>
            )}
            {!isDateValidForEditing && !isReadOnly && (
               <p className="text-xs text-red-500 mt-1 font-medium">Редактирование блокировано. Можно изменять данные только в пределах последних 14-ти дней.</p>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* «Кто вёл» — только для групп с несколькими преподами: сервер больше не
                  угадывает по отметившему журнал, поэтому атрибуцию задаёт страница. */}
              {isMultiTeacher && (
                <div className="flex items-center gap-2">
                  <label htmlFor="session-teacher" className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {t('journal.sessionTeacher', 'Кто вёл')}
                  </label>
                  <select
                    id="session-teacher"
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    title={t('journal.sessionTeacherHint', 'Преподаватель, который провёл занятие — для расчёта зарплаты')}
                    className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary-500 transition-colors shadow-sm"
                  >
                    <option value="">{t('journal.sessionTeacherUnset', 'Не указан')}</option>
                    {groupTeachers.map(tt => (
                      <option key={tt.uid} value={tt.uid}>
                        {tt.displayName || tt.email || tt.uid}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* Длительность занятия → payroll (per_hour). Пусто = длительность неизвестна. */}
              <div className="flex items-center gap-2">
                <label htmlFor="session-duration" className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {t('journal.sessionDuration', 'Длительность (мин)')}
                </label>
                <input
                  id="session-duration"
                  type="number"
                  min={0}
                  step={5}
                  inputMode="numeric"
                  placeholder="—"
                  value={sessionDuration}
                  onChange={(e) => setSessionDuration(e.target.value)}
                  title={t('journal.sessionDurationHint', 'Фактическая длительность занятия для расчёта зарплаты по часам')}
                  className="w-20 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary-500 transition-colors shadow-sm"
                />
              </div>
              <button
                onClick={handleMarkAllPresent}
                disabled={loadingData || bulking || groupStudents.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 shadow-sm"
              >
                {bulking ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                {t('journal.markAllPresent', 'Отметить всех присутствующими')}
              </button>
            </div>
          )}
        </div>

        {loadingData ? (
          <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-12">
            <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-500 animate-pulse">Загрузка переклички...</p>
          </div>
        ) : groupStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center shadow-sm">
            <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="font-medium text-slate-900 dark:text-white mb-1">Нет студентов</p>
            <p className="text-sm text-slate-500">В выбранной группе пока нет студентов для переклички.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[850px]">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-4 font-medium w-[250px]">Студент</th>
                    <th className="px-5 py-4 font-medium text-center w-28 bg-primary-50/50 dark:bg-primary-900/10 border-r border-l border-slate-200 dark:border-slate-700">
                      <div className="flex flex-col items-center">
                        <span>Оценка</span>
                        {schema && (
                          <span className="text-[10px] bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 px-1.5 py-0.5 rounded mt-1 font-semibold" title={`Макс балл: ${schema.scale.max}`}>
                             М: {schema.scale.max}
                          </span>
                        )}
                      </div>
                    </th>
                    <th className="px-5 py-4 font-medium text-center w-48">Присутствие</th>
                    <th className="px-5 py-4 font-medium text-center w-56">Участие</th>
                    <th className="px-5 py-4 font-medium min-w-[200px]">Заметки</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {groupStudents.map((student) => {
                    const entry = entries[student.uid];
                    const isMarked = !!entry;
                    
                    return (
                      <tr key={student.uid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        {/* Student Info */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            {student.avatarUrl ? (
                              <img src={student.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-sm shrink-0 border border-slate-200 dark:border-slate-700">
                                {student.displayName?.charAt(0).toUpperCase() || '?'}
                              </div>
                            )}
                            <div className="overflow-hidden">
                              <p className="font-bold text-slate-900 dark:text-white truncate" title={student.displayName}>{student.displayName}</p>
                              <p className="text-[11px] text-slate-500 truncate" title={student.email}>{student.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Grade */}
                        <td className="p-0 border-r border-l border-slate-200 dark:border-slate-700 bg-primary-50/30 dark:bg-primary-900/10 min-w-[112px] relative z-10">
                           {canEdit ? (
                             <GradeCell
                                studentId={student.uid}
                                itemId={selectedLessonId || date}
                                value={grades[`${student.uid}_${selectedLessonId || date}`]}
                                schema={schema}
                                isSyncing={syncStatus[`${student.uid}_${selectedLessonId || date}`]}
                                onChange={(val, disp, status, comment) => handleGradeChange(student.uid, selectedLessonId || date, val, disp, status, comment)}
                             />
                           ) : (
                             <div className="w-full h-full min-h-[48px] flex items-center justify-center text-slate-500 font-bold">
                                {grades[`${student.uid}_${selectedLessonId || date}`]?.displayValue || grades[`${student.uid}_${selectedLessonId || date}`]?.value || <span className="opacity-50">—</span>}
                             </div>
                           )}
                        </td>

                        {/* Attendance */}
                        <td className="px-5 py-3 text-center">
                          <div className={`inline-flex gap-1 rounded-xl p-1 border ${!canEdit ? 'bg-transparent border-transparent' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>
                            {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(status => {
                              const isActive = isMarked && entry.attendance === status;
                              if (!canEdit && !isActive) return null; // Show only marked in read-only
                              if (!canEdit && isActive) return (
                                <div key={status} className="p-2 opacity-100">
                                    {attendanceIcons[status]}
                                </div>
                              );
                              return (
                                <button
                                  key={status}
                                  onClick={() => handleEntryChange(student.uid, 'attendance', status)}
                                  className={`p-2 rounded-lg transition-all ${isActive ? 'bg-white dark:bg-slate-800 shadow-sm' : 'opacity-40 hover:opacity-100 hover:bg-slate-200/50 dark:hover:bg-slate-800'}`}
                                  title={status}
                                >
                                  {attendanceIcons[status]}
                                </button>
                              )
                            })}
                          </div>
                        </td>

                        {/* Participation */}
                        <td className="px-5 py-3 text-center">
                          <div className={`inline-flex gap-1 rounded-xl p-1 border text-xs font-medium ${!canEdit ? 'bg-transparent border-transparent' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>
                            {(['low', 'medium', 'high'] as ParticipationLevel[]).map(level => {
                               const isActive = isMarked && entry.participation === level;
                               if (!canEdit && !isActive) return null;

                               let activeClass = '';
                               if (level === 'low') activeClass = 'bg-red-500/10 text-red-600 dark:text-red-400';
                               if (level === 'medium') activeClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
                               if (level === 'high') activeClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

                               if (!canEdit && isActive) {
                                 return (
                                   <div key={level} className={`px-4 py-2 rounded-lg ${activeClass}`}>
                                      {level.charAt(0).toUpperCase() + level.slice(1)}
                                   </div>
                                 )
                               }

                               return (
                                <button
                                  key={level}
                                  onClick={() => handleEntryChange(student.uid, 'participation', level)}
                                  className={`px-4 py-2 rounded-lg transition-all ${isActive ? activeClass : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 dark:hover:bg-slate-800 dark:hover:text-slate-300'}`}
                                >
                                  {level.charAt(0).toUpperCase() + level.slice(1)}
                                </button>
                               )
                            })}
                          </div>
                        </td>

                        {/* Note */}
                        <td className="px-5 py-3 relative">
                          <input
                            type="text"
                            placeholder={!canEdit ? (entry?.note ? '' : "—") : "Заметки (не видны студенту)..."}
                            readOnly={!canEdit}
                            className={`w-full px-3 py-2 pr-8 rounded-xl text-sm outline-none transition-colors ${!canEdit ? 'bg-transparent border-transparent px-0' : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-primary-500'}`}
                            value={entry?.note || ''}
                            onChange={(e) => handleEntryChange(student.uid, 'note', e.target.value)}
                          />
                          {entrySyncStatus[student.uid] && (
                            <div className="absolute right-8 top-1/2 -translate-y-1/2 text-primary-500 bg-white/80 dark:bg-slate-800/80 p-0.5 rounded-full z-10">
                               <Loader2 className="w-4 h-4 animate-spin" />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═ RIGHT COLUMN: STUDENT RANKING ═ */}
      <div className="w-full xl:w-80 shrink-0 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Рейтинг студентов
          </h2>
        </div>

        {groupStudents.length === 0 ? (
          <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 text-center">
            <p className="text-sm text-slate-500">Выберите группу со студентами.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(() => {
              // Compute ranking for group students
              const totalDates = courseJournalDates.length || 1;
              
              const ranked = groupStudents.map(student => {
                // Attendance: count present/late across ALL dates
                const studentEntries = allJournalEntries.filter(e => e.studentId === student.uid);
                const presentCount = studentEntries.filter(e => e.attendance === 'present' || e.attendance === 'late').length;
                const attendancePct = Math.round((presentCount / totalDates) * 100);

                // Average grade
                const studentGrades = Object.entries(grades)
                  .filter(([key]) => key.startsWith(`${student.uid}_`))
                  .map(([, g]) => g.value)
                  .filter((v): v is number => typeof v === 'number');
                  
                const avgGrade = studentGrades.length > 0
                  ? Math.round(studentGrades.reduce((sum, v) => sum + v, 0) / studentGrades.length)
                  : 0;
                const maxGrade = schema.scale.max || 100;
                const gradePct = maxGrade > 0 ? Math.round((avgGrade / maxGrade) * 100) : 0;

                // Overall score: 40% attendance + 60% grade
                const overallScore = Math.round(attendancePct * 0.4 + gradePct * 0.6);

                return { student, attendancePct, avgGrade, maxGrade, gradePct, overallScore, totalEntries: studentEntries.length };
              })
              .sort((a, b) => b.overallScore - a.overallScore);

              const medalColors = [
                'from-amber-400 to-yellow-500',   // gold
                'from-slate-300 to-slate-400',     // silver 
                'from-amber-600 to-orange-700',    // bronze
              ];

              return ranked.map((r, i) => (
                <div key={r.student.uid} className={`p-3.5 rounded-xl border transition-all ${
                  i === 0 ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200 dark:from-amber-900/10 dark:to-yellow-900/10 dark:border-amber-800/50' :
                  'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}>
                  <div className="flex items-center gap-3">
                    {/* Rank */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-extrabold ${
                      i < 3 
                        ? `bg-gradient-to-br ${medalColors[i]} text-white shadow-sm`
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      {i + 1}
                    </div>

                    {/* Avatar + Name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {r.student.displayName}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          r.attendancePct >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          r.attendancePct >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {r.attendancePct}% посещ.
                        </span>
                        {r.avgGrade > 0 && (
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            {r.avgGrade}/{r.maxGrade}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-extrabold ${
                        r.overallScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                        r.overallScore >= 50 ? 'text-amber-600 dark:text-amber-400' :
                        'text-red-500 dark:text-red-400'
                      }`}>
                        {r.overallScore}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">балл</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2.5 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        r.overallScore >= 80 ? 'bg-emerald-500' :
                        r.overallScore >= 50 ? 'bg-amber-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(r.overallScore, 100)}%` }}
                    />
                  </div>
                </div>
              ));
            })()}

            {/* Legend */}
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Формула рейтинга
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                40% посещаемость + 60% ср.оценка
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default JournalPage;
