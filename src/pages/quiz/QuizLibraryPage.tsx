import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetQuizzes, apiDeleteQuiz, apiPublishQuiz, apiUnpublishQuiz, apiArchiveQuiz, apiDuplicateQuiz, apiCreateQuizSession } from '../../lib/api';
import type { Quiz } from '../../types';
import {
  Plus, Search, Play, Copy, Share2, Trash2, Archive,
  BookOpen, Users, Star, Filter, Zap,
  Globe, Lock, Building2, MoreVertical, Eye, EyeOff,
  Gamepad2
} from 'lucide-react';
import toast from 'react-hot-toast';

type Tab = 'my' | 'shared' | 'discover';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  hard: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  expert: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const VISIBILITY_ICONS: Record<string, React.ReactNode> = {
  private: <Lock className="w-3 h-3" />,
  organization: <Building2 className="w-3 h-3" />,
  platform: <Globe className="w-3 h-3" />,
  public: <Globe className="w-3 h-3" />,
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
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

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
    try {
      await apiDeleteQuiz(id);
      toast.success(t('quiz.deleted'));
      loadQuizzes();
    } catch { toast.error(t('common.error')); }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const result = await apiDuplicateQuiz(id);
      toast.success(t('quiz.duplicated'));
      navigate(`/quiz/${result.id}/edit`);
    } catch { toast.error(t('common.error')); }
  };

  const handlePublish = async (id: string, published: boolean) => {
    try {
      published ? await apiUnpublishQuiz(id) : await apiPublishQuiz(id);
      toast.success(published ? t('quiz.unpublished') : t('quiz.published'));
      loadQuizzes();
    } catch { toast.error(t('common.error')); }
  };

  const handleLaunch = async (quizId: string) => {
    try {
      const session = await apiCreateQuizSession({ quizId });
      navigate(`/quiz/sessions/${session.id}`);
    } catch (e: any) {
      toast.error(e.message || t('common.error'));
    }
  };

  const filtered = quizzes.filter(q =>
    !search ||
    q.title.toLowerCase().includes(search.toLowerCase()) ||
    q.subject?.toLowerCase().includes(search.toLowerCase()) ||
    q.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case 'published': return 'badge-green';
      case 'draft': return 'badge-yellow';
      case 'archived': return 'badge-slate';
      default: return 'badge-slate';
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'my', label: t('quiz.myQuizzes'), icon: <BookOpen className="w-4 h-4" /> },
    { key: 'shared', label: t('quiz.sharedWithMe'), icon: <Share2 className="w-4 h-4" /> },
    { key: 'discover', label: t('quiz.discover'), icon: <Globe className="w-4 h-4" /> },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-primary-500" />
            {t('quiz.library')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {filtered.length} {t('quiz.quizzes')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadQuizzes()}
              placeholder={`${t('common.search')}...`}
              className="input pl-8 w-48 text-xs"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-ghost p-2 ${showFilters ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/20' : ''}`}>
            <Filter className="w-4 h-4" />
          </button>
          <Link to="/quiz/new" className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors">
            <Plus className="w-3.5 h-3.5" />{t('quiz.create')}
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === t.key
                ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card p-3 mb-4 flex flex-wrap gap-3">
          <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)} className="input text-xs w-36">
            <option value="">{t('quiz.allDifficulties')}</option>
            <option value="easy">{t('quiz.easy')}</option>
            <option value="medium">{t('quiz.medium')}</option>
            <option value="hard">{t('quiz.hard')}</option>
            <option value="expert">{t('quiz.expert')}</option>
          </select>
          <input
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            placeholder={t('quiz.filterSubject')}
            className="input text-xs w-40"
          />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input text-xs w-40">
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
          <div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center">
          <Gamepad2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('quiz.noQuizzes')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('quiz.createFirst')}</p>
          <Link to="/quiz/new" className="bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors">
            <Plus className="w-3.5 h-3.5" />{t('quiz.create')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((quiz) => (
            <div key={quiz.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all group">
              {/* Cover Image */}
              {quiz.coverImageUrl ? (
                <div className="h-32 bg-gradient-to-br from-primary-100 to-purple-100 dark:from-primary-900/30 dark:to-purple-900/30 overflow-hidden">
                  <img src={quiz.coverImageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-20 bg-gradient-to-br from-primary-100 via-purple-100 to-pink-100 dark:from-primary-900/30 dark:via-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
                  <Gamepad2 className="w-8 h-8 text-primary-400/60 dark:text-primary-500/40" />
                </div>
              )}

              <div className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <Link to={tab === 'my' ? `/quiz/${quiz.id}/edit` : `/quiz/${quiz.id}`}>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-1">{quiz.title}</h3>
                    </Link>
                    {quiz.subject && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{quiz.subject}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className={`${statusBadge(quiz.status)} text-[10px]`}>{quiz.status}</span>
                    <div className="relative">
                      <button onClick={() => setActiveMenu(activeMenu === quiz.id ? null : quiz.id)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                      {activeMenu === quiz.id && (
                        <div className="absolute right-0 top-7 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-1 z-20 w-40" onMouseLeave={() => setActiveMenu(null)}>
                          {tab === 'my' && (
                            <>
                              <button onClick={() => handlePublish(quiz.id, quiz.status === 'published')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2">
                                {quiz.status === 'published' ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                {quiz.status === 'published' ? t('quiz.unpublish') : t('quiz.publish')}
                              </button>
                              <button onClick={() => handleLaunch(quiz.id)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2 text-emerald-600">
                                <Play className="w-3 h-3" />{t('quiz.launch')}
                              </button>
                            </>
                          )}
                          <button onClick={() => handleDuplicate(quiz.id)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2">
                            <Copy className="w-3 h-3" />{t('quiz.duplicate')}
                          </button>
                          {tab === 'my' && (
                            <>
                              <button onClick={() => { setActiveMenu(null); apiArchiveQuiz(quiz.id).then(loadQuizzes); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2">
                                <Archive className="w-3 h-3" />{t('quiz.archive')}
                              </button>
                              <button onClick={() => { setActiveMenu(null); handleDelete(quiz.id); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2 text-red-600">
                                <Trash2 className="w-3 h-3" />{t('common.delete')}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  {quiz.difficulty && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${DIFFICULTY_COLORS[quiz.difficulty] || DIFFICULTY_COLORS.medium}`}>
                      {quiz.difficulty}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                    {VISIBILITY_ICONS[quiz.visibility]}{quiz.visibility}
                  </span>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{quiz.questionCount || 0} Q</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{quiz.timesPlayed || 0}</span>
                  {quiz.rating > 0 && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400" />{quiz.rating.toFixed(1)}</span>}
                </div>

                {/* Author (if shared/discover) */}
                {tab !== 'my' && quiz.authorName && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">by {quiz.authorName}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuizLibraryPage;
