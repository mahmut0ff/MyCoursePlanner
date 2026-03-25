import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  orgGetCourses, 
  orgGetGroups, 
  orgGetStudents, 
  orgGetJournal, 
  orgSaveJournal,
  orgBulkAttendance,
  apiAwardXP
} from '../../lib/api';
import type { Course, Group, UserProfile, JournalEntry, AttendanceStatus, ParticipationLevel } from '../../types';
import { ClipboardList, Calendar, AlertCircle, RefreshCcw, UserCheck, CheckCircle2, XCircle, Clock, FileWarning } from 'lucide-react';
import toast from 'react-hot-toast';

const now = new Date();
const todayFormatted = now.toISOString().split('T')[0];

const attendanceIcons: Record<AttendanceStatus, React.ReactNode> = {
  present: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  absent: <XCircle className="w-5 h-5 text-red-500" />,
  late: <Clock className="w-5 h-5 text-amber-500" />,
  excused: <FileWarning className="w-5 h-5 text-slate-400" />
};

const JournalPage: React.FC = () => {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [date, setDate] = useState<string>(todayFormatted);
  
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [entries, setEntries] = useState<Record<string, JournalEntry>>({}); // Key: studentId
  
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [bulking, setBulking] = useState(false);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    orgGetCourses()
      .then((data: Course[]) => {
        setCourses(data);
        if (data.length > 0) {
          setSelectedCourseId(data[0].id);
        }
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadData = async (courseId: string, targetDate: string) => {
    setLoadingData(true);
    try {
      const [allGroups, allStudents, journalRes] = await Promise.all([
        orgGetGroups(),
        orgGetStudents(),
        orgGetJournal(courseId)
      ]);

      const courseGroups = (allGroups as Group[]).filter(g => g.courseId === courseId);
      const studentIds = new Set<string>();
      courseGroups.forEach(g => g.studentIds.forEach(id => studentIds.add(id)));
      
      const enrolledStudents = (allStudents as UserProfile[]).filter(s => studentIds.has(s.uid));
      setStudents(enrolledStudents);

      const entriesMap: Record<string, JournalEntry> = {};
      
      // Filter journal by date client-side to avoid composite indexes if missing
      const dateEntries = (journalRes as JournalEntry[]).filter(j => j.date === targetDate);
      dateEntries.forEach(j => {
        entriesMap[j.studentId] = j;
      });
      
      setEntries(entriesMap);
    } catch (e: any) {
      toast.error(e.message || 'Ошибка загрузки журнала');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (selectedCourseId && courses.length > 0) {
      loadData(selectedCourseId, date);
    }
  }, [selectedCourseId, date, courses]);

  const handleEntryChange = (studentId: string, field: keyof JournalEntry, value: any) => {
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
      flags: prevEntry?.flags || [],
      version: (prevEntry?.version || 0) + 1,
      organizationId: '', 
      createdBy: '',
      createdAt: '',
      updatedAt: ''
    };

    // Apply specific field change
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

        // Award gamification for attendance
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
        // Rollback
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
    }, field === 'note' ? 500 : 50); // fast for toggles, slower for text
  };

  const handleMarkAllPresent = async () => {
    if (!selectedCourseId || students.length === 0) return;
    setBulking(true);
    
    // Prepare bulk entries
    const bulkData = students.map(s => {
      const existing = entries[s.uid];
      return {
        studentId: s.uid,
        attendance: 'present' as AttendanceStatus,
        participation: existing?.participation,
        note: existing?.note
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

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary-500 rounded-full animate-spin border-t-transparent" /></div>;
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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('nav.journal', 'Журнал')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('journal.subtitle', 'Ежедневная перекличка и заметки')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary-500 transition-colors shadow-sm cursor-pointer"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
          >
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>

          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              className="pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary-500 transition-colors shadow-sm cursor-pointer"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <button
            onClick={() => loadData(selectedCourseId, date)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-transparent dark:hover:border-slate-700"
            title="Refresh"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Студентов в группе: <span className="font-bold">{students.length}</span>
        </p>
        <button
          onClick={handleMarkAllPresent}
          disabled={loadingData || bulking || students.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          {bulking ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
          {t('journal.markAllPresent', 'Отметить всех присутствующими')}
        </button>
      </div>

      {loadingData ? (
        <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-12">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-slate-500 animate-pulse">Загрузка переклички...</p>
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-medium text-slate-900 dark:text-white mb-1">Студентов нет</p>
          <p className="text-sm text-slate-500">В этом курсе пока нет студентов для переклички.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-4 font-medium min-w-[200px]">Студент</th>
                  <th className="px-5 py-4 font-medium text-center w-48">Присутствие</th>
                  <th className="px-5 py-4 font-medium text-center w-48">Участие</th>
                  <th className="px-5 py-4 font-medium w-full">Заметка преподавателя</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {students.map((student) => {
                  const entry = entries[student.uid];
                  // if no entry, give it a visual state of "not marked" 
                  const isMarked = !!entry;
                  
                  return (
                    <tr key={student.uid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-sm shrink-0 border border-slate-200 dark:border-slate-700">
                            {student.displayName?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className="overflow-hidden">
                            <p className="font-bold text-slate-900 dark:text-white truncate" title={student.displayName}>{student.displayName}</p>
                            <p className="text-[11px] text-slate-500 truncate" title={student.email}>{student.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="inline-flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
                          {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(status => (
                            <button
                              key={status}
                              onClick={() => handleEntryChange(student.uid, 'attendance', status)}
                              className={`p-1.5 rounded-md transition-all ${isMarked && entry.attendance === status ? 'bg-white dark:bg-slate-800 shadow-sm' : 'opacity-40 hover:opacity-100'}`}
                              title={status}
                            >
                              {attendanceIcons[status]}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="inline-flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-700 text-xs font-medium">
                          <button
                            onClick={() => handleEntryChange(student.uid, 'participation', 'low')}
                            className={`px-3 py-1.5 rounded-md transition-all ${isMarked && entry.participation === 'low' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                          >
                            Low
                          </button>
                          <button
                            onClick={() => handleEntryChange(student.uid, 'participation', 'medium')}
                            className={`px-3 py-1.5 rounded-md transition-all ${isMarked && entry.participation === 'medium' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                          >
                            Med
                          </button>
                          <button
                            onClick={() => handleEntryChange(student.uid, 'participation', 'high')}
                            className={`px-3 py-1.5 rounded-md transition-all ${isMarked && entry.participation === 'high' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                          >
                            High
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="text"
                          placeholder="Заметки (не видны студенту)..."
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-primary-500 transition-colors"
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
  );
};

export default JournalPage;
