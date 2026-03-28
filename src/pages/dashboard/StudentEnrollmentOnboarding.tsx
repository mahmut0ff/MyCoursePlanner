import React, { useState, useEffect } from 'react';
import { BookOpen, Users, CheckCircle2, ChevronRight, GraduationCap } from 'lucide-react';
import { orgGetCourses, orgGetGroups, orgEnrollInGroup } from '../../lib/api';
import toast from 'react-hot-toast';

interface Props {
  onComplete: () => void;
}

const StudentEnrollmentOnboarding: React.FC<Props> = ({ onComplete }) => {
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
      toast.error(e.message || 'Ошибка загрузки курсов');
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
      toast.error(e.message || 'Ошибка загрузки групп');
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
      toast.success('Вы успешно записались в группу!');
      onComplete();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка при записи в группу');
    } finally {
      setEnrolling(false);
    }
  };

  if (loading && step === 1) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-500 text-sm">Поиск доступных курсов...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary-500/20 transform -rotate-6">
          <GraduationCap className="w-8 h-8 text-white transform rotate-6" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-3">
          Добро пожаловать в обучение!
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
          Для начала обучения вам необходимо выбрать курс и присоединиться к учебной группе. 
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-center gap-4 mb-10">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${step >= 1 ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30' : 'border-slate-200'}`}>1</div>
          <span className="font-semibold text-sm">Выбор курса</span>
        </div>
        <div className="w-12 h-[2px] bg-slate-200 dark:bg-slate-700">
          <div className={`h-full bg-primary-500 transition-all ${step >= 2 ? 'w-full' : 'w-0'}`}></div>
        </div>
        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${step >= 2 ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30' : 'border-slate-200 dark:border-slate-700'}`}>2</div>
          <span className="font-semibold text-sm">Выбор группы</span>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-10 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-200 dark:border-slate-700">
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
               <BookOpen className="w-5 h-5 text-primary-500" /> Выберите курс
            </h2>
            {courses.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-slate-500">Пока нет доступных курсов. Пожалуйста, обратитесь к администратору.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courses.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCourse(c)}
                    className="group cursor-pointer border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/10 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-lg group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                          {c.title}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                          {c.description || 'Описание курса...'}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors shrink-0">
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-primary-600 transition-colors" />
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
            <div className="flex items-center gap-3 mb-6">
              <button 
                onClick={() => setStep(1)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Назад"
              >
                <ChevronRight className="w-5 h-5 rotate-180 text-slate-500" />
              </button>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-500" /> Выберите группу
              </h2>
            </div>
            
            <div className="mb-6 px-4 py-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-100 dark:border-primary-800/40">
              <span className="text-sm text-primary-600 dark:text-primary-400">Курс:</span>
              <span className="ml-2 font-bold text-primary-700 dark:text-primary-300">{selectedCourse?.title}</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin"></div>
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-slate-500">В этом курсе пока нет доступных групп.</p>
                <button onClick={() => setStep(1)} className="mt-4 text-sm text-primary-600 font-medium hover:underline">
                  Вернуться к выбору курса
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {groups.map((g) => {
                  const capacity = g.capacity || 0;
                  const currentStudents = g.studentIds?.length || 0;
                  const isFull = capacity > 0 && currentStudents >= capacity;

                  return (
                    <div key={g.id} className={`flex items-center justify-between p-4 rounded-xl border ${isFull ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 opacity-60' : 'border-slate-200 hover:border-primary-300 dark:border-slate-700 bg-white dark:bg-slate-800 transition-colors'}`}>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">{g.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {currentStudents} {capacity > 0 ? `/ ${capacity}` : ''} участников
                        </p>
                      </div>
                      <button
                        onClick={() => handleEnroll(g.id)}
                        disabled={isFull || enrolling}
                        className={`text-sm font-semibold px-5 py-2 rounded-lg flex items-center gap-2 transition-all ${isFull ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700 text-white shadow-md'}`}
                      >
                        {isFull ? 'Мест нет' : enrolling ? 'Запись...' : (
                          <><CheckCircle2 className="w-4 h-4" /> Выбрать</>
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
