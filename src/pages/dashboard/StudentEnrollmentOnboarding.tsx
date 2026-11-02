import React, { useState, useEffect } from 'react';
import { BookOpen, Users, CheckCircle2, ChevronRight, GraduationCap } from 'lucide-react';
import { orgGetCourses, orgGetGroups, orgEnrollInGroup, apiAwardXP } from '../../lib/api';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { showGamificationToasts } from '../../components/gamification/GamificationToasts';

interface Props {
  onComplete: () => void;
}

const StudentEnrollmentOnboarding: React.FC<Props> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [courses, setCourses] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      setLoading(true);
      const data = await orgGetCourses();
      // Only show published courses that a student can join
      setCourses(data.filter((c: any) => c.status === 'published' || c.status === 'active' || !c.status));
    } catch (e: any) {
      toast.error(e.message || t('enrollment.loadCoursesError', 'Ошибка загрузки курсов'));
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async (courseId: string) => {
    try {
      setLoading(true);
      const data = await orgGetGroups(courseId);
      setGroups(data);
    } catch (e: any) {
      toast.error(e.message || t('enrollment.loadGroupsError', 'Ошибка загрузки групп'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCourse = (course: any) => {
    setSelectedCourse(course);
    setStep(2);
    loadGroups(course.id);
  };

  const handleEnroll = async (groupId: string) => {
    try {
      setEnrolling(true);
      await orgEnrollInGroup(groupId);
      
      if (selectedCourse?.organizationId) {
        apiAwardXP({
          type: 'org',
          organizationId: selectedCourse.organizationId
        }).then((res: any) => showGamificationToasts(res.newBadges, res.leveledUp))
          .catch(() => {});
      }

      toast.success(t('enrollment.success', 'Вы успешно записались в группу!'));
      onComplete();
    } catch (e: any) {
      toast.error(e.message || t('enrollment.enrollError', 'Ошибка при записи в группу'));
    } finally {
      setEnrolling(false);
    }
  };

  if (loading && step === 1) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="mt-3 text-slate-500 dark:text-slate-400 text-xs">{t('enrollment.searching', 'Поиск доступных курсов...')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center mx-auto mb-2">
          <GraduationCap className="w-6 h-6 text-slate-400 dark:text-slate-500" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">
          {t('enrollment.welcome', 'Добро пожаловать в обучение!')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
          {t('enrollment.intro', 'Для начала обучения вам необходимо выбрать курс и присоединиться к учебной группе.')}
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border ${step >= 1 ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700'}`}>1</div>
          <span className="font-medium text-sm">{t('enrollment.stepCourse', 'Выбор курса')}</span>
        </div>
        <div className="w-12 h-px bg-slate-200 dark:bg-slate-700">
          <div className={`h-full bg-primary-600 transition-all ${step >= 2 ? 'w-full' : 'w-0'}`}></div>
        </div>
        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border ${step >= 2 ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700'}`}>2</div>
          <span className="font-medium text-sm">{t('enrollment.stepGroup', 'Выбор группы')}</span>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
        {step === 1 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
               <BookOpen className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {t('enrollment.chooseCourse', 'Выберите курс')}
            </h2>
            {courses.length === 0 ? (
              <div className="text-center py-8 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('enrollment.noCourses', 'Пока нет доступных курсов. Пожалуйста, обратитесь к директору.')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {courses.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCourse(c)}
                    className="group cursor-pointer border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                          {c.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {c.description || t('enrollment.courseDescFallback', 'Описание курса...')}
                        </p>
                      </div>
                      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <button 
                onClick={() => setStep(1)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors"
                title={t('common.back', 'Назад')}
              >
                <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              </button>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {t('enrollment.chooseGroup', 'Выберите группу')}
              </h2>
            </div>
            
            <div className="mb-3 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700">
              <span className="text-sm text-slate-500 dark:text-slate-400">{t('enrollment.courseLabel', 'Курс:')}</span>
              <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{selectedCourse?.title}</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-primary-600 rounded-full animate-spin"></div>
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('enrollment.noGroups', 'В этом курсе пока нет доступных групп.')}</p>
                <button onClick={() => setStep(1)} className="mt-3 text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline">
                  {t('enrollment.backToCourses', 'Вернуться к выбору курса')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {groups.map((g) => {
                  const capacity = g.capacity || 0;
                  const currentStudents = g.studentIds?.length || 0;
                  const isFull = capacity > 0 && currentStudents >= capacity;

                  return (
                    <div key={g.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isFull ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 opacity-60' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 bg-white dark:bg-slate-800 dark:hover:bg-slate-700/50 transition-colors'}`}>
                      <div>
                        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{g.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {capacity > 0
                            ? t('enrollment.membersOfCapacity', '{{current}} / {{capacity}} участников', { current: currentStudents, capacity })
                            : t('enrollment.members', { count: currentStudents, defaultValue: '{{count}} участников' })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleEnroll(g.id)}
                        disabled={isFull || enrolling}
                        className={`inline-flex items-center gap-1.5 ${isFull ? 'btn-secondary opacity-60 cursor-not-allowed' : 'btn-primary'}`}
                      >
                        {isFull ? t('enrollment.full', 'Мест нет') : enrolling ? t('enrollment.enrolling', 'Запись...') : (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> {t('common.select', 'Выбрать')}</>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentEnrollmentOnboarding;
