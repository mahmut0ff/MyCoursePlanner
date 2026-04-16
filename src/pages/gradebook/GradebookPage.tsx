import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  orgGetCourses, 
  orgGetGroups, 
  orgGetStudents, 
  orgGetGradeSchema, 
  orgGetGrades, 
  orgSaveGrade,
  apiAwardXP 
} from '../../lib/api';
// We need apiGetLessons for the lessons list. Let me import it.
import { apiGetLessons } from '../../lib/api';
import type { Course, Group, UserProfile, GradeSchema, GradeEntry, LessonPlan } from '../../types';
import GradebookGrid from '../../components/gradebook/GradebookGrid';
import GradeSchemaConfig from '../../components/gradebook/GradeSchemaConfig';
import { BookOpen, Settings, AlertCircle, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

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

const GradebookPage: React.FC = () => {
  const { t } = useTranslation();
  const { role, profile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [grades, setGrades] = useState<Record<string, GradeEntry>>({});
  const [schema, setSchema] = useState<GradeSchema>(defaultSchema);
  const [syncStatus, setSyncStatus] = useState<Record<string, boolean>>({});
  
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    Promise.all([
      orgGetCourses(),
      role === 'teacher' ? orgGetGroups().catch(() => []) : Promise.resolve([])
    ])
      .then(([coursesData, groupsData]) => {
        let filteredCourses = coursesData;
        if (role === 'teacher' && profile?.uid) {
          const teacherGroups = (groupsData as Group[]).filter(g => g.teacherIds?.includes(profile.uid));
          const groupCourseIds = new Set(teacherGroups.map(g => g.courseId));
          filteredCourses = coursesData.filter((c: Course) => 
            c.teacherIds?.includes(profile.uid) || groupCourseIds.has(c.id)
          );
        }
        setCourses(filteredCourses);
        if (filteredCourses.length > 0) {
          setSelectedCourseId(filteredCourses[0].id);
        }
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoadingCourses(false));
  }, [role, profile?.uid]);

  const loadData = async (courseId: string) => {
    setLoadingData(true);
    try {
      const course = courses.find((c) => c.id === courseId);
      if (!course) return;

      // Parallel fetch
      const [allGroups, allStudents, allLessons, schemaRes, gradesRes] = await Promise.all([
        orgGetGroups(),
        orgGetStudents(),
        apiGetLessons().catch(() => []), // some staff might not have full lesson read access? they should.
        orgGetGradeSchema(courseId),
        orgGetGrades(courseId)
      ]);

      // Filter groups for this course
      let courseGroups = (allGroups as Group[]).filter(g => g.courseId === courseId);
      
      if (role === 'teacher' && profile?.uid) {
         courseGroups = courseGroups.filter((g: Group) => g.teacherIds?.includes(profile.uid));
      }

      const studentIds = new Set<string>();
      courseGroups.forEach(g => g.studentIds.forEach(id => studentIds.add(id)));
      
      const enrolledStudents = (allStudents as UserProfile[]).filter(s => studentIds.has(s.uid));
      setStudents(enrolledStudents);

      // Lessons linked to any group in this course
      const courseGroupIds = new Set(courseGroups.map(g => g.id));
      const courseLessons = (allLessons as LessonPlan[]).filter(l =>
        (l.groupIds || []).some(gid => courseGroupIds.has(gid))
      );
      setLessons(courseLessons);

      setSchema(schemaRes || { ...defaultSchema, courseId });

      const gradesMap: Record<string, GradeEntry> = {};
      (gradesRes as GradeEntry[]).forEach(g => {
        gradesMap[`${g.studentId}_${g.lessonId || g.assignmentId}`] = g;
      });
      setGrades(gradesMap);

    } catch (e: any) {
      toast.error(e.message || 'Ошибка загрузки данных');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (selectedCourseId && courses.length > 0) {
      loadData(selectedCourseId);
    }
  }, [selectedCourseId, courses]);

  const handleGradeChange = (studentId: string, itemId: string, value: number | null, displayValue: string | undefined, status: any, comment?: string) => {
    const key = `${studentId}_${itemId}`;
    const prevEntry = grades[key];
    
    const newEntry: GradeEntry = {
      ...(prevEntry || {}),
      id: prevEntry?.id || '',
      studentId,
      courseId: selectedCourseId,
      lessonId: itemId, // Assuming itemId maps to lessonId for now
      value,
      displayValue,
      status,
      comment,
      type: schema.gradingType,
      maxValue: schema.scale.max,
      version: (prevEntry?.version || 0) + 1,
      organizationId: '', // placeholder, Backend ignores this
      createdBy: '',
      createdAt: '',
      updatedAt: ''
    };

    // Optimistic Update
    setGrades(prev => ({ ...prev, [key]: newEntry }));
    setSyncStatus(prev => ({ ...prev, [key]: true }));

    // Debounce save
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(async () => {
      try {
        const result = await orgSaveGrade(newEntry);
        setGrades(prev => ({ ...prev, [key]: result as GradeEntry }));

        // Fire gamification event for numerical grades
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
        toast.error('Failed to save grade');
        // Rollback
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

  const columns = useMemo(() => {
    const cols = lessons.map(l => ({
      id: l.id,
      title: l.title,
      type: 'lesson' as const
    }));

    const uniqueDates = new Set<string>();
    Object.values(grades).forEach(g => {
      if (g.lessonId && /^\d{4}-\d{2}-\d{2}$/.test(g.lessonId)) {
        uniqueDates.add(g.lessonId);
      }
    });

    const dateCols = Array.from(uniqueDates).sort().map(date => ({
       id: date,
       title: date.split('-').reverse().join('.'),
       type: 'date' as const
    }));

    return [...cols, ...dateCols];
  }, [lessons, grades]);

  if (loadingCourses) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary-500 rounded-full animate-spin border-t-transparent" /></div>;
  }

  if (courses.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('gradebook.noCourses', 'Нет курсов')}</h2>
        <p className="text-slate-500 text-sm">{t('gradebook.noCoursesDesc', 'Создайте курс, чтобы начать вести журнал')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto overflow-hidden flex flex-col h-[calc(100vh-80px)]">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('nav.gradebook', 'Журнал оценок')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('gradebook.subtitle', 'Smart Journal + Universal Gradebook')}
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

          <button
            onClick={() => loadData(selectedCourseId)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-transparent dark:hover:border-slate-700"
            title="Refresh"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 shadow-sm transition-colors"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">{t('gradebook.schemaBtn', 'Настройка шкалы')}</span>
          </button>
        </div>
      </div>

      {loadingData ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl min-h-[400px]">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-slate-500 animate-pulse">Загрузка журнала...</p>
        </div>
      ) : columns.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl min-h-[400px]">
          <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-medium text-slate-900 dark:text-white mb-1">Нет столбцов для оценки</p>
          <p className="text-sm text-slate-500">Добавьте уроки в курс, чтобы оценивать студентов.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <GradebookGrid
            students={students}
            columns={columns}
            grades={grades}
            schema={schema}
            onGradeChange={handleGradeChange}
            syncStatus={syncStatus}
          />
        </div>
      )}

      <GradeSchemaConfig
        courseId={selectedCourseId}
        schema={schema}
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        onSaved={setSchema}
      />
    </div>
  );
};

export default GradebookPage;
