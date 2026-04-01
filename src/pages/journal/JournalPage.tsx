import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  orgGetCourses, 
  orgGetGroups, 
  orgGetStudents, 
  orgGetJournal, 
  orgSaveJournal,
  orgBulkAttendance,
  apiAwardXP,
  apiGetLessons,
  orgGetGradeSchema,
  orgGetGrades,
  orgSaveGrade
} from '../../lib/api';
import type { Course, Group, UserProfile, JournalEntry, AttendanceStatus, ParticipationLevel, LessonPlan, GradeSchema, GradeEntry } from '../../types';
import GradeCell from '../../components/gradebook/GradeCell';
import { ClipboardList, Calendar, AlertCircle, AlertTriangle, RefreshCcw, UserCheck, CheckCircle2, XCircle, Clock, FileWarning, BookOpen, GraduationCap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const now = new Date();
const todayFormatted = now.toISOString().split('T')[0];

const yesterdayObj = new Date(now);
yesterdayObj.setDate(now.getDate() - 1);
const yesterdayFormatted = yesterdayObj.toISOString().split('T')[0];

const tomorrowObj = new Date(now);
tomorrowObj.setDate(now.getDate() + 1);
const tomorrowFormatted = tomorrowObj.toISOString().split('T')[0];

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
  const { role } = useAuth();
  const isReadOnly = role === 'admin' || role === 'manager';

  const [courses, setCourses] = useState<Course[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
  const [allLessons, setAllLessons] = useState<LessonPlan[]>([]);

  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [date, setDate] = useState<string>(todayFormatted);
  
  const [schema, setSchema] = useState<GradeSchema>(defaultSchema);
  const [entries, setEntries] = useState<Record<string, JournalEntry>>({});
  const [grades, setGrades] = useState<Record<string, GradeEntry>>({});
  const [syncStatus, setSyncStatus] = useState<Record<string, boolean>>({});
  
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [bulking, setBulking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isDateValidForEditing = useMemo(() => {
    if (isReadOnly) return false;
    // 3 day window restriction for teachers
    return date === yesterdayFormatted || date === todayFormatted || date === tomorrowFormatted;
  }, [date, isReadOnly]);

  const canEdit = !isReadOnly && isDateValidForEditing;

  // 1. Load initial static data (optimized)
  useEffect(() => {
    setLoading(true);
    Promise.all([
      orgGetCourses().catch(() => []),
      orgGetGroups().catch(() => []),
      orgGetStudents().catch(() => []),
      apiGetLessons().catch(() => [])
    ])
    .then(([coursesRes, groupsRes, studentsRes, lessonsRes]) => {
      const c = Array.isArray(coursesRes) ? coursesRes : [];
      setCourses(c);
      setAllGroups(Array.isArray(groupsRes) ? groupsRes : []);
      setAllStudents(Array.isArray(studentsRes) ? studentsRes : []);
      setAllLessons(Array.isArray(lessonsRes) ? lessonsRes : []);

      if (c.length > 0) {
        setSelectedCourseId(c[0].id);
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

  // 2. Set default group when course changes
  const courseGroups = useMemo(() => allGroups.filter(g => g.courseId === selectedCourseId), [allGroups, selectedCourseId]);
  
  useEffect(() => {
    if (courseGroups.length > 0) {
      if (!courseGroups.find(g => g.id === selectedGroupId)) {
        setSelectedGroupId(courseGroups[0].id);
      }
    } else {
      setSelectedGroupId('');
    }
  }, [courseGroups, selectedCourseId]);

  // 3. Load journal and grades when date/course changes
  const loadContentAndGrades = async () => {
    if (!selectedCourseId || !date) return;
    setLoadingData(true);
    try {
      const [journalRes, schemaRes, gradesRes] = await Promise.all([
         orgGetJournal(selectedCourseId),
         orgGetGradeSchema(selectedCourseId).catch(() => null),
         orgGetGrades(selectedCourseId)
      ]);

      setSchema(schemaRes || { ...defaultSchema, courseId: selectedCourseId });

      const dateEntries = (Array.isArray(journalRes) ? journalRes : []).filter((j: any) => j.date === date);
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

  const courseLessons = useMemo(() => {
    const course = courses.find(c => c.id === selectedCourseId);
    if (!course || !course.lessonIds) return [];
    return allLessons.filter(l => course.lessonIds.includes(l.id));
  }, [courses, selectedCourseId, allLessons]);

  const currentLessonId = useMemo(() => {
    // Find the attached lesson among the group's students for this date
    for (const s of groupStudents) {
      if (entries[s.uid]?.lessonId) return entries[s.uid].lessonId;
    }
    return null;
  }, [entries, groupStudents]);


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
      lessonId: prevEntry?.lessonId || currentLessonId || undefined,
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
        lessonId: existing?.lessonId || currentLessonId || undefined
      };
    });

    try {
      const res = await orgBulkAttendance(selectedCourseId, date, bulkData);
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

  const attachLesson = async (lessonId: string) => {
    if (!canEdit || !selectedCourseId || groupStudents.length === 0) {
      if (groupStudents.length === 0) toast.error('В группе нет студентов');
      return;
    }
    
    setBulking(true);
    const bulkData = groupStudents.map(s => {
      const existing = entries[s.uid];
      return {
        studentId: s.uid,
        attendance: existing?.attendance || 'present', // Give them 'present' default just in case
        participation: existing?.participation,
        note: existing?.note,
        lessonId
      };
    });

    try {
      const res = await orgBulkAttendance(selectedCourseId, date, bulkData);
      const newMap = { ...entries };
      (res as JournalEntry[]).forEach(e => { newMap[e.studentId] = e; });
      setEntries(newMap);
      toast.success('Урок успешно прикреплен к дате!');
    } catch(e: any) {
      toast.error(e.message || 'Ошибка прикрепления урока');
    } finally {
      setBulking(false);
    }
  };

  const removeAttachedLesson = async () => {
    if (!canEdit || !selectedCourseId || groupStudents.length === 0) return;
    
    setBulking(true);
    const bulkData = groupStudents.map(s => {
      const existing = entries[s.uid];
      return {
        studentId: s.uid,
        attendance: existing?.attendance || 'present',
        participation: existing?.participation,
        note: existing?.note,
        lessonId: '' // Clear lesson
      };
    });

    try {
      const res = await orgBulkAttendance(selectedCourseId, date, bulkData);
      const newMap = { ...entries };
      (res as JournalEntry[]).forEach(e => { newMap[e.studentId] = e; });
      setEntries(newMap);
      toast.success('Привязка урока снята');
    } catch(e: any) {
      toast.error(e.message || 'Ошибка открепления урока');
    } finally {
      setBulking(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary-500 rounded-full animate-spin border-t-transparent" /></div>;
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

  if (courses.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('journal.noCourses', 'Нет курсов')}</h2>
        <p className="text-slate-500 text-sm">{t('journal.noCoursesDesc', 'Создайте курс, чтобы начать вести переклички')}</p>
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
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
            >
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>

            <select
              className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary-500 transition-colors shadow-sm cursor-pointer"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              {courseGroups.length === 0 ? (
                <option value="">Нет групп</option>
              ) : (
                courseGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))
              )}
            </select>

            <div className="relative w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                min={!isReadOnly ? yesterdayFormatted : undefined}
                max={!isReadOnly ? tomorrowFormatted : undefined}
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
            {!isDateValidForEditing && !isReadOnly && (
               <p className="text-xs text-red-500 mt-1 font-medium">Редактирование блокировано. Можно изменять данные только за сегодня, вчера и завтра.</p>
            )}
          </div>
          {canEdit && (
            <button
              onClick={handleMarkAllPresent}
              disabled={loadingData || bulking || groupStudents.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 shadow-sm"
            >
              {bulking ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              {t('journal.markAllPresent', 'Отметить всех присутствующими')}
            </button>
          )}
        </div>

        {loadingData ? (
          <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-12">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
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
              <table className="w-full text-left text-sm whitespace-nowrap min-w-max">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-4 font-medium min-w-[200px]">Студент</th>
                    <th className="px-5 py-4 font-medium text-center w-28 bg-primary-50/50 dark:bg-primary-900/10 border-r border-l border-slate-200 dark:border-slate-700">Оценка</th>
                    <th className="px-5 py-4 font-medium text-center w-48">Присутствие</th>
                    <th className="px-5 py-4 font-medium text-center w-48">Участие</th>
                    <th className="px-5 py-4 font-medium w-full">Заметка преподавателя</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {groupStudents.map((student) => {
                    const entry = entries[student.uid];
                    const isMarked = !!entry;
                    const gradeKey = currentLessonId ? `${student.uid}_${currentLessonId}` : '';
                    const gradeEntry = currentLessonId ? grades[gradeKey] : undefined;
                    
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
                                itemId={currentLessonId || date}
                                value={grades[`${student.uid}_${currentLessonId || date}`]}
                                schema={schema}
                                isSyncing={syncStatus[`${student.uid}_${currentLessonId || date}`]}
                                onChange={(val, disp, status, comment) => handleGradeChange(student.uid, currentLessonId || date, val, disp, status, comment)}
                             />
                           ) : (
                             <div className="w-full h-full min-h-[48px] flex items-center justify-center text-slate-500 font-bold">
                                {grades[`${student.uid}_${currentLessonId || date}`]?.displayValue || grades[`${student.uid}_${currentLessonId || date}`]?.value || <span className="opacity-50">—</span>}
                             </div>
                           )}
                        </td>

                        {/* Attendance */}
                        <td className="px-5 py-3 text-center">
                          <div className={`inline-flex rounded-lg p-1 border ${!canEdit ? 'bg-transparent border-transparent' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>
                            {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(status => {
                              const isActive = isMarked && entry.attendance === status;
                              if (!canEdit && !isActive) return null; // Show only marked in read-only
                              if (!canEdit && isActive) return (
                                <div key={status} className="p-1.5 opacity-100">
                                    {attendanceIcons[status]}
                                </div>
                              );
                              return (
                                <button
                                  key={status}
                                  onClick={() => handleEntryChange(student.uid, 'attendance', status)}
                                  className={`p-1.5 rounded-md transition-all ${isActive ? 'bg-white dark:bg-slate-800 shadow-sm' : 'opacity-40 hover:opacity-100'}`}
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
                          <div className={`inline-flex rounded-lg p-1 border text-xs font-medium ${!canEdit ? 'bg-transparent border-transparent' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>
                            {(['low', 'medium', 'high'] as ParticipationLevel[]).map(level => {
                               const isActive = isMarked && entry.participation === level;
                               if (!canEdit && !isActive) return null;

                               let activeClass = '';
                               if (level === 'low') activeClass = 'bg-red-500/10 text-red-600 dark:text-red-400';
                               if (level === 'medium') activeClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
                               if (level === 'high') activeClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

                               if (!canEdit && isActive) {
                                 return (
                                   <div key={level} className={`px-3 py-1.5 rounded-md ${activeClass}`}>
                                      {level.charAt(0).toUpperCase() + level.slice(1)}
                                   </div>
                                 )
                               }

                               return (
                                <button
                                  key={level}
                                  onClick={() => handleEntryChange(student.uid, 'participation', level)}
                                  className={`px-3 py-1.5 rounded-md transition-all ${isActive ? activeClass : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                  {level.charAt(0).toUpperCase() + level.slice(1)}
                                </button>
                               )
                            })}
                          </div>
                        </td>

                        {/* Note */}
                        <td className="px-5 py-3">
                          <input
                            type="text"
                            placeholder={!canEdit ? (entry?.note ? '' : "—") : "Заметки (не видны студенту)..."}
                            readOnly={!canEdit}
                            className={`w-full px-3 py-2 rounded-xl text-sm outline-none transition-colors ${!canEdit ? 'bg-transparent border-transparent px-0' : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-primary-500'}`}
                            value={entry?.note || ''}
                            onChange={(e) => handleEntryChange(student.uid, 'note', e.target.value)}
                          />
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

      {/* ═ RIGHT COLUMN: LESSON PLANS ═ */}
      <div className="w-full xl:w-80 shrink-0 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Планы уроков
          </h2>
        </div>

        {!selectedCourseId ? (
           <p className="text-sm text-slate-500">Выберите курс для отображения уроков.</p>
        ) : courseLessons.length === 0 ? (
           <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 text-center">
             <p className="text-sm text-slate-500">К этому курсу не прикрепелены плановые уроки.</p>
           </div>
        ) : (
          <div className="space-y-3">
            {courseLessons.map(lesson => {
              const isAttached = currentLessonId === lesson.id;
              
              return (
                <div 
                  key={lesson.id} 
                  className={`p-4 rounded-xl border transition-all ${isAttached ? 'bg-primary-50/50 border-primary-200 dark:bg-primary-900/10 dark:border-primary-800' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                >
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1 leading-tight line-clamp-2">
                    {lesson.title}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3 font-medium">
                    {lesson.duration} мин • Модуль: {lesson.subject}
                  </p>
                  
                  {isAttached ? (
                    <div className="flex items-center">
                      <span className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 text-[11px] font-bold uppercase tracking-wider bg-primary-100 dark:bg-primary-900/40 px-2 py-1 rounded-md">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Пройден
                      </span>
                      {canEdit && (
                        <button 
                          onClick={removeAttachedLesson} 
                          title="Отменить"
                          className="p-1 px-1.5 ml-auto text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors font-medium text-xs"
                        >
                          Снять
                        </button>
                      )}
                    </div>
                  ) : (
                    <button 
                      onClick={() => attachLesson(lesson.id)}
                      disabled={!canEdit || groupStudents.length === 0 || bulking}
                      className="w-full py-2 bg-slate-50 dark:bg-slate-700/50 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/20 dark:hover:text-primary-400 border border-slate-200 dark:border-slate-700 hover:border-primary-200 dark:hover:border-primary-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                      Отметить как пройденный
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  );
};

export default JournalPage;
