import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetQuizzes, apiDeleteQuiz, apiDuplicateQuiz, apiCreateQuizSession } from '../../lib/api';
import type { Quiz } from '../../types';
import {
  Plus, Search, Play, Copy, Trash2,
  BookOpen, Share2, Filter, Zap,
  Globe, Lock, Building2,
  Users, Star, Gamepad2, Download, CopyPlus
} from 'lucide-react';
import toast from 'react-hot-toast';

type Tab = 'my' | 'shared' | 'discover';

const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  easy: { label: 'Easy', color: '#26890c' },
  medium: { label: 'Medium', color: '#d89e00' },
  hard: { label: 'Hard', color: '#e21b3c' },
  expert: { label: 'Expert', color: '#46178f' },
};

const QuizLibraryPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('my');
  const [sortBy, setSortBy] = useState('createdAt');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const { profile } = useAuth();

  useEffect(() => { loadQuizzes(); }, [tab, sortBy, filterDifficulty, filterSubject]);

  const loadQuizzes = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { tab, sortBy };
      if (filterDifficulty) params.difficulty = filterDifficulty;
      if (filterSubject) params.subject = filterSubject;
      if (search) params.search = search;
      const data = await apiGetQuizzes(params);
      setQuizzes(Array.isArray(data) ? data : []);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('quiz.deleteConfirm'))) return;
    try { await apiDeleteQuiz(id); toast.success(t('quiz.deleted')); loadQuizzes(); }
    catch { toast.error(t('common.error')); }
  };

  const handleDuplicate = async (id: string) => {
    try { const result = await apiDuplicateQuiz(id); toast.success(t('quiz.duplicated')); navigate(`/quiz/${result.id}/edit`); }
    catch { toast.error(t('common.error')); }
  };

  const handleLaunch = async (quizId: string) => {
    try { const session = await apiCreateQuizSession({ quizId }); navigate(`/quiz/sessions/${session.id}`); }
    catch (e: any) { toast.error(e.message || t('common.error')); }
  };

  const filtered = quizzes.filter(q => {
    // Search filtering
    const matchesSearch = !search ||
      q.title.toLowerCase().includes(search.toLowerCase()) ||
      q.subject?.toLowerCase().includes(search.toLowerCase()) ||
      q.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));

    // Organization filtering for "My Quizzes"
    const matchesOrg = tab !== 'my' || !profile?.organizationId || q.organizationId === profile.organizationId;

    return matchesSearch && matchesOrg;
  });

  const getCardGradient = (index: number) => {
    const gradients = [
      'linear-gradient(135deg, #46178f 0%, #6c34b2 100%)',
      'linear-gradient(135deg, #1368ce 0%, #2b86e3 100%)',
      'linear-gradient(135deg, #e21b3c 0%, #f05a6f 100%)',
      'linear-gradient(135deg, #26890c 0%, #3ba524 100%)',
      'linear-gradient(135deg, #d89e00 0%, #f0b830 100%)',
      'linear-gradient(135deg, #864cbf 0%, #a76fe3 100%)',
    ];
    return gradients[index % gradients.length];
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'my', label: t('quiz.myQuizzes'), icon: <BookOpen className="w-4 h-4" /> },
    { key: 'shared', label: t('quiz.sharedWithMe'), icon: <Share2 className="w-4 h-4" /> },
    { key: 'discover', label: t('quiz.discover'), icon: <Globe className="w-4 h-4" /> },
  ];

  return (
    <div className="kahoot-font">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--kahoot-purple)' }}>
              <Gamepad2 className="w-5 h-5 text-white" />
            </div>
            Kahoots
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {filtered.length} {t('quiz.quizzes')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:w-auto w-full">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadQuizzes()}
              placeholder={`${t('common.search')}...`}
              className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm w-full sm:w-52 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all dark:text-white"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`p-2.5 rounded-lg transition-colors shrink-0 ${showFilters ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
            <Filter className="w-4 h-4" />
          </button>
          {tab === 'my' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-slate-700 bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 text-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] shadow-sm"
              >
                <Download className="w-4 h-4" />{t('quiz.import', 'Импорт')}
              </button>
              <Link
                to="/quiz/new"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white text-sm transition-all hover:shadow-lg active:scale-[0.98]"
                style={{ backgroundColor: 'var(--kahoot-green)', boxShadow: '0 3px 10px rgba(38,137,12,0.25)' }}
              >
                <Plus className="w-4 h-4" />{t('quiz.create')}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1.5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-white dark:bg-slate-700 shadow-sm text-[var(--kahoot-purple)] dark:text-purple-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-5 flex flex-wrap gap-3">
          <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)} className="px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white">
            <option value="">{t('quiz.allDifficulties')}</option>
            <option value="easy">{t('quiz.easy')}</option>
            <option value="medium">{t('quiz.medium')}</option>
            <option value="hard">{t('quiz.hard')}</option>
            <option value="expert">{t('quiz.expert')}</option>
          </select>
          <input value={filterSubject} onChange={e => setFilterSubject(e.target.value)} placeholder={t('quiz.filterSubject')} className="px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 w-40 dark:text-white" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white">
            <option value="createdAt">{t('quiz.sortNewest')}</option>
            <option value="updatedAt">{t('quiz.sortUpdated')}</option>
            <option value="timesPlayed">{t('quiz.sortPopular')}</option>
            <option value="rating">{t('quiz.sortRating')}</option>
          </select>
        </div>
      )}

      {/* Quiz Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin dark:border-purple-800 dark:border-t-purple-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-14 text-center">
          {tab === 'my' && (
            <>
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--kahoot-purple)', opacity: 0.2 }}>
                <Gamepad2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-2">{t('quiz.noQuizzes')}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{t('quiz.createFirst')}</p>
              <Link
                to="/quiz/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white text-sm"
                style={{ backgroundColor: 'var(--kahoot-green)' }}
              >
                <Plus className="w-4 h-4" />{t('quiz.create')}
              </Link>
            </>
          )}
          {tab === 'shared' && (
            <>
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #1368ce 0%, #2b86e3 100%)', opacity: 0.2 }}>
                <Share2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-2">{t('quiz.noSharedQuizzes', 'Нет общих викторин')}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-md mx-auto">{t('quiz.noSharedDesc', 'Здесь появятся викторины, которыми поделились коллеги из вашей организации или другие преподаватели на платформе.')}</p>
              <button
                onClick={() => setTab('discover')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white text-sm transition-all hover:shadow-lg active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #1368ce 0%, #2b86e3 100%)' }}
              >
                <Globe className="w-4 h-4" />{t('quiz.browseDiscover', 'Обзор публичных')}
              </button>
            </>
          )}
          {tab === 'discover' && (
            <>
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #26890c 0%, #3ba524 100%)', opacity: 0.2 }}>
                <Globe className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-2">{t('quiz.noPublicQuizzes', 'Публичных викторин пока нет')}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-md mx-auto">{t('quiz.noPublicDesc', 'Здесь будут отображаться опубликованные викторины от всех преподавателей на платформе.')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((quiz, idx) => (
            <div key={quiz.id} className="kahoot-library-card group bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-full">
              {/* Cover */}
              <div
                className="h-32 flex items-center justify-center relative shrink-0"
                style={{ background: quiz.coverImageUrl ? undefined : getCardGradient(idx) }}
              >
                {quiz.coverImageUrl ? (
                  <img src={quiz.coverImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center">
                    <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">{t('quiz.quizId', 'Код квиза')}</p>
                    <p className="text-3xl font-black text-white tracking-widest drop-shadow-md">
                      {quiz.id.substring(0, 6).toUpperCase()}
                    </p>
                  </div>
                )}
                {/* Status badge */}
                <div className="absolute top-2 right-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm ${
                    quiz.status === 'published' ? 'bg-green-500 text-white' :
                    quiz.status === 'draft' ? 'bg-yellow-500 text-white' : 'bg-slate-500 text-white'
                  }`}>
                    {quiz.status === 'published' ? t('quiz.published', 'Опубликован') : t('quiz.draft', 'Черновик')}
                  </span>
                </div>
                {/* Question count */}
                <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Zap className="w-3 h-3 text-yellow-400" />{quiz.questionCount || 0} {t('quiz.questions', 'Вопросов')}
                </div>
              </div>

              <div className="p-4 flex flex-col flex-1">
                <div className="mb-3">
                  <h3 className="text-base font-black text-slate-900 dark:text-white line-clamp-2 leading-tight mb-1">
                    {quiz.title}
                  </h3>
                  {quiz.subject && <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{quiz.subject}</p>}
                </div>

                {/* Tags row */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {quiz.difficulty && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm"
                      style={{ backgroundColor: DIFFICULTY_LABELS[quiz.difficulty]?.color || '#999' }}
                    >
                      {DIFFICULTY_LABELS[quiz.difficulty]?.label || quiz.difficulty}
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    {quiz.visibility === 'private' ? <Lock className="w-3 h-3" /> :
                     quiz.visibility === 'organization' ? <Building2 className="w-3 h-3" /> :
                     <Globe className="w-3 h-3" />}
                    {quiz.visibility}
                  </span>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs font-bold text-slate-400 dark:text-slate-500 mt-1 mb-auto">
                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{quiz.timesPlayed || 0} {t('quiz.plays', 'игр')}</span>
                  {quiz.rating > 0 && <span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-yellow-400" />{quiz.rating.toFixed(1)}</span>}
                </div>

                {tab !== 'my' && quiz.authorName && (
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 truncate">
                    {t('quiz.byAuthor', 'Автор:')} {quiz.authorName}
                  </p>
                )}

                {/* 3D Action Buttons */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <button onClick={() => handleLaunch(quiz.id)} 
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-white text-sm transition-all transform hover:-translate-y-1 hover:brightness-110 active:translate-y-1"
                    style={{ backgroundColor: 'var(--kahoot-green)', boxShadow: '0 4px 0 rgba(0,0,0,0.2)' }}
                    title={t('quiz.launch', 'Играть')}
                  >
                    <Play className="w-4 h-4 fill-current" /> {t('quiz.play', 'Играть')}
                  </button>
                  
                  {tab === 'my' && (
                    <>
                      <Link to={`/quiz/${quiz.id}/edit`} 
                        className="w-10 h-10 flex items-center justify-center rounded-xl transition-all transform hover:-translate-y-1 hover:brightness-105 hover:shadow-md active:translate-y-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
                        style={{ boxShadow: '0 4px 0 rgba(0,0,0,0.1)' }}
                        title={t('quiz.edit', 'Редактировать')}
                      >
                        <BookOpen className="w-4 h-4" />
                      </Link>
                      <button onClick={() => handleDelete(quiz.id)} 
                        className="w-10 h-10 flex items-center justify-center rounded-xl transition-all transform hover:-translate-y-1 hover:brightness-105 hover:shadow-md active:translate-y-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400"
                        style={{ boxShadow: '0 4px 0 rgba(0,0,0,0.1)' }}
                        title={t('common.delete', 'Удалить')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {tab !== 'my' && (
                    <button onClick={() => handleDuplicate(quiz.id)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl transition-all transform hover:-translate-y-1 hover:brightness-105 hover:shadow-md active:translate-y-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400"
                      style={{ boxShadow: '0 4px 0 rgba(0,0,0,0.1)' }}
                      title={t('quiz.duplicate', 'Копировать')}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity" onClick={() => setShowImportModal(false)} />
          <div className="fixed inset-0 overflow-y-auto z-50 pointer-events-none">
            <div className="flex min-h-full items-center justify-center p-4 text-center pointer-events-none">
              <div className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-6 text-left align-middle shadow-xl transition-all pointer-events-auto">
                <h3 className="text-xl font-bold leading-6 text-slate-900 dark:text-white flex items-center gap-3 mb-2">
                  <Download className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  {t('quiz.importModalTitle', 'Импорт викторин')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium">
                  {t('quiz.importModalDesc', 'Выберите ваши личные викторины (или из других организаций) и скопируйте их в текущую организацию.')}
                </p>

                <div className="max-h-[60vh] overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 pr-2">
                  {quizzes.filter(q => q.organizationId !== profile?.organizationId).length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500">
                      {t('quiz.noQuizzesToImport', 'У вас нет викторин, доступных для импорта.')}
                    </div>
                  ) : (
                    quizzes.filter(q => q.organizationId !== profile?.organizationId).map(quiz => (
                      <div key={quiz.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-600 transition-colors bg-white dark:bg-slate-800 group">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{quiz.title}</h4>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                              <Zap className="w-3.5 h-3.5" />{quiz.questionCount} {t('quiz.questions', 'вопросов')}
                            </span>
                            {quiz.organizationId ? (
                              <span className="text-[10px] uppercase tracking-wider font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                Из другой организации
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                Личный черновик
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              toast.loading('Импорт...', { id: `import-${quiz.id}` });
                              await apiDuplicateQuiz(quiz.id);
                              toast.success('Успешно импортировано!', { id: `import-${quiz.id}` });
                              loadQuizzes();
                            } catch {
                              toast.error('Ошибка импорта', { id: `import-${quiz.id}` });
                            }
                          }}
                          className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 transition-colors"
                        >
                          <CopyPlus className="w-4 h-4" /> {t('quiz.importButton', 'Импортировать')}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <button
                    onClick={() => setShowImportModal(false)}
                    className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t('common.close', 'Закрыть')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default QuizLibraryPage;
