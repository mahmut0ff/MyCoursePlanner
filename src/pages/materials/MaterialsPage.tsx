import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetMaterials, orgCreateMaterial, orgDeleteMaterial, apiAIGenerate, apiTransferRequest, apiGetPersonalLessons } from '../../lib/api';
import { uploadFile } from '../../services/storage.service';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { 
  FileText, Search, Trash2, ExternalLink, RefreshCw, 
  UploadCloud, File as FileIcon, FileImage, FileAudio, FileVideo, 
  LayoutGrid, List, Sparkles, X, Eye, FolderPlus
} from 'lucide-react';
import type { Material, LessonPlan } from '../../types';
import FileViewerModal, { getViewerUrl } from '../../components/ui/FileViewerModal';
import { toast } from 'react-hot-toast';
import EmptyState from '../../components/ui/EmptyState';

const TYPE_COLORS: Record<string, string> = {
  link: 'bg-blue-500/10 text-blue-500 border-blue-500/20', 
  video: 'bg-red-500/10 text-red-500 border-red-500/20',
  audio: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  file: 'bg-amber-500/10 text-amber-500 border-amber-500/20', 
  document: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  image: 'bg-pink-500/10 text-pink-500 border-pink-500/20'
};

const getFileIcon = (mimeType?: string, type?: string) => {
  if (mimeType?.startsWith('image/') || type === 'image') return <FileImage className="w-5 h-5" />;
  if (mimeType?.startsWith('video/') || type === 'video') return <FileVideo className="w-5 h-5" />;
  if (mimeType?.startsWith('audio/') || type === 'audio') return <FileAudio className="w-5 h-5" />;
  if (type === 'link') return <ExternalLink className="w-5 h-5" />;
  return <FileIcon className="w-5 h-5" />;
};

const formatBytes = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes === 0) return '0 Bytes';
  const k = 1024, dm = 2, sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const MaterialsPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile, role } = useAuth();
  const { canAccess } = usePlanGate();
  const isAdmin = role === 'super_admin' || role === 'manager';
  const orgId = profile?.activeOrgId;

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [showCreate, setShowCreate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewMaterial, setViewMaterial] = useState<Material | null>(null);
  const [transferringMaterial, setTransferringMaterial] = useState<Material | null>(null);
  const [personalLessons, setPersonalLessons] = useState<LessonPlan[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  const [form, setForm] = useState({ 
    title: '', url: '', type: 'document', category: 'General', 
    description: '', tags: [] as string[],
    mimeType: '', sizeBytes: 0, file: null as File | null
  });

  const load = () => { 
    setLoading(true); 
    orgGetMaterials()
      .then(setMaterials)
      .catch((e: any) => toast.error(e.message || 'Error'))
      .finally(() => setLoading(false)); 
  };
  
  useEffect(() => { load(); }, []);

  const filtered = materials.filter((m) => 
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.description?.toLowerCase().includes(search.toLowerCase()) ||
    m.category?.toLowerCase().includes(search.toLowerCase())
  );

  const categories = Array.from(new Set(materials.map(m => m.category))).filter(Boolean);

  const guessTypeFromMime = (mime: string): string => {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.includes('pdf') || mime.includes('word') || mime.includes('presentation')) return 'document';
    return 'file';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setForm(prev => ({
      ...prev,
      title: file.name.split('.')[0],
      file,
      mimeType: file.type,
      sizeBytes: file.size,
      type: guessTypeFromMime(file.type)
    }));
  };

  const processWithAI = async (url: string) => {
    try {
      setIsProcessingAI(true);
      const res = await apiAIGenerate({ type: 'material_summary', fileUrl: url });
      if (res?.data) {
        setForm(f => ({
          ...f,
          title: res.data.title || f.title,
          description: res.data.description || '',
          tags: res.data.tags || [],
          category: res.data.suggestedCategory || f.category
        }));
        toast.success(t('materials.aiSuccess', 'ИИ успешно заполнил данные'));
      }
    } catch (e: any) {
      console.warn('AI Parsing failed', e);
      toast.error(t('materials.aiError', 'ИИ не смог распознать файл'));
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim() && !form.file) return;
    if (!orgId) return;

    setIsUploading(true);
    try {
      let downloadUrl = form.url;
      
      // If we have a physical file, upload it into Firebase Storage
      if (form.file) {
        const path = `materials/${orgId}/${Date.now()}_${form.file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        downloadUrl = await uploadFile(path, form.file);
      } else if (!form.url.trim()) {
        toast.error('URL or File is required');
        setIsUploading(false);
        return;
      }

      const payload = {
        title: form.title,
        description: form.description,
        url: downloadUrl,
        type: form.type,
        category: form.category,
        tags: form.tags,
        mimeType: form.mimeType,
        sizeBytes: form.sizeBytes
      };

      const c = await orgCreateMaterial(payload) as Material;
      setMaterials((p) => [c, ...p]);
      setShowCreate(false);
      setForm({ title: '', url: '', type: 'link', category: 'General', description: '', tags: [], mimeType: '', sizeBytes: 0, file: null });
      toast.success(t('materials.created', 'Материал успешно добавлен'));
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(t('common.confirmDelete', 'Удалить безвозвратно?'))) return;
    try { 
      await orgDeleteMaterial(id); 
      setMaterials((p) => p.filter((m) => m.id !== id)); 
      toast.success(t('common.deleted', 'Удалено'));
    } catch (e: any) { 
      toast.error(e.message); 
    }
  };

  const openTransferModal = async (e: React.MouseEvent, m: Material) => {
    e.stopPropagation();
    setTransferringMaterial(m);
    setSelectedLessonId('');
    setLoadingLessons(true);
    try {
      const pLessons = await apiGetPersonalLessons();
      setPersonalLessons(pLessons);
    } catch (err: any) {
       toast.error(err.message || 'Ошибка загрузки уроков');
    } finally {
      setLoadingLessons(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferringMaterial || !selectedLessonId || !profile?.activeOrgId) return;
    setIsTransferring(true);
    try {
       await apiTransferRequest({
          transferType: 'material_to_lesson',
          sourceId: transferringMaterial.id!,
          targetId: selectedLessonId,
          orgId: profile.activeOrgId,
          sourceTitle: transferringMaterial.title
       });
       toast.success(t('materials.transferRequested', 'Запрос на копирование отправлен администратору'));
       setTransferringMaterial(null);
    } catch (err: any) {
       toast.error(err.message || 'Ошибка при запросе');
    } finally {
       setIsTransferring(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('nav.materials', 'Материалы')}
          </h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
            {t('org.materials.subtitle', 'Хранилище файлов, лекций и медиа библиотеки')}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary-500' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary-500' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm shadow-primary-500/20">
            <UploadCloud className="w-4 h-4" />
            <span>{t('org.materials.add', 'Загрузить файл')}</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={t('common.search', 'Поиск материалов...')}
            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all" 
          />
        </div>
        {categories.length > 0 && (
          <select className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/20">
            <option value="all">{t('common.allCategories', 'Все категории')}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-xl p-4 h-40 animate-pulse border border-slate-100 dark:border-slate-700" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState 
          icon={FileText}
          title={search ? t('common.noResults', 'Ничего не найдено') : t('org.materials.empty', 'Материалов пока нет')}
          description={search ? '' : t('org.materials.emptyDesc', 'Загрузите файлы, документы или добавьте полезные ссылки для ваших курсов.')}
          actionLabel={!search ? t('org.materials.add', 'Добавить первый материал') : undefined}
          onAction={!search ? () => setShowCreate(true) : undefined}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((m) => {
            const colors = TYPE_COLORS[m.type] || TYPE_COLORS.file;
            return (
              <div 
                key={m.id} 
                onClick={() => setViewMaterial(m)}
                className="group cursor-pointer bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-5 hover:shadow-xl hover:shadow-primary-500/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col"
              >
                {/* Format Badge */}
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md border ${colors} backdrop-blur-md`}>
                    {m.type}
                  </span>
                </div>

                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${colors.replace('border-', 'border-none ')}`}>
                  {getFileIcon(m.mimeType, m.type)}
                </div>

                <h3 className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2 leading-tight">
                  {m.title}
                </h3>
                
                {m.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                    {m.description}
                  </p>
                )}

                <div className="mt-auto pt-4 flex flex-wrap gap-1.5 items-center justify-between border-t border-slate-50 dark:border-slate-700/50">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[60%]">
                    {m.category}
                  </span>
                  {m.sizeBytes ? <span className="text-[10px] text-slate-400">{formatBytes(m.sizeBytes)}</span> : null}
                </div>

                {/* Quick actions overlay */}
                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); setViewMaterial(m); }} className="p-2 bg-white text-slate-900 hover:text-primary-500 rounded-full shadow-lg transition-transform hover:scale-110 tooltip" data-tip="Просмотр">
                    <Eye className="w-4 h-4" />
                  </button>
                  <a href={getViewerUrl(m.url, m.mimeType || 'unknown', m.title) || m.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="p-2 bg-white text-slate-900 hover:text-emerald-500 rounded-full shadow-lg transition-transform hover:scale-110 tooltip" data-tip="Внешняя ссылка">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {profile?.activeOrgId && (
                    <button onClick={(e) => openTransferModal(e, m)} className="p-2 bg-white text-slate-900 hover:text-indigo-500 rounded-full shadow-lg transition-transform hover:scale-110 tooltip" data-tip="Добавить в мой урок">
                      <FolderPlus className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={(e) => handleDelete(m.id, e)} className="p-2 bg-red-500 text-white hover:bg-red-600 rounded-full shadow-lg transition-transform hover:scale-110 tooltip" data-tip="Удалить">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-700/50">
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('common.name', 'Название')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">{t('common.category', 'Категория')}</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">{t('common.size', 'Размер')}</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer" onClick={() => setViewMaterial(m)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${TYPE_COLORS[m.type] || TYPE_COLORS.file}`}>
                        {getFileIcon(m.mimeType, m.type)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{m.title}</div>
                        {m.description && <div className="text-[11px] text-slate-500 max-w-md truncate">{m.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-sm text-slate-600 dark:text-slate-400">
                    {m.category}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-sm text-slate-500">
                    {formatBytes(m.sizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {profile?.activeOrgId && (
                        <button onClick={(e) => openTransferModal(e, m)} className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors tooltip" data-tip="Добавить в мой урок">
                          <FolderPlus className="w-4 h-4" />
                        </button>
                      )}
                      <a href={getViewerUrl(m.url, m.mimeType || 'unknown', m.title) || m.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors tooltip" data-tip="Внешняя ссылка">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {isAdmin && (
                        <button onClick={(e) => handleDelete(m.id, e)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors tooltip" data-tip="Удалить">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4 animate-in fade-in" onClick={() => !isUploading && setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl p-6 relative flex flex-col max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => !isUploading && setShowCreate(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 pr-8">
              {t('materials.uploadNew', 'Загрузка материала')}
            </h2>

            <div className="space-y-5">
              {/* File Dropzone */}
              <div 
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group flex flex-col items-center justify-center text-center relative overflow-hidden"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileSelect} 
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                />
                
                {form.file ? (
                  <div className="flex flex-col items-center gap-2 z-10">
                    <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 text-primary-600 rounded-full flex items-center justify-center mb-1">
                      {getFileIcon(form.mimeType, form.type)}
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-white line-clamp-1">{form.file.name}</span>
                    <span className="text-xs text-slate-500">{formatBytes(form.file.size)}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 z-10">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-primary-500 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/30 rounded-full flex items-center justify-center transition-colors mb-2">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Нажмите для загрузки файла</p>
                    <p className="text-xs text-slate-500">или просто перетащите его сюда (PDF, DOCX, MP4, PNG)</p>
                  </div>
                )}
              </div>

              {/* Or URL */}
              {!form.file && (
                <div className="flex items-center gap-3">
                  <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
                  <span className="text-xs text-slate-400 font-medium uppercase">или вставьте ссылку</span>
                  <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
                </div>
              )}

              {!form.file && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t('common.link', 'Ссылка (URL)')}</label>
                  <input type="url" placeholder="https://..." value={form.url} onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-slate-900 dark:text-white transition-all" />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t('materials.title', 'Название (Обязательно)')}</label>
                  <input placeholder={t('org.materials.titlePlaceholder', 'Например: Учебник 5 класс')} value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-slate-900 dark:text-white transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t('materials.category', 'Категория / Предмет')}</label>
                  <input placeholder="Например: Математика, Документы" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-slate-900 dark:text-white transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t('common.description', 'Краткое описание (Опционально)')}</label>
                <textarea placeholder="О чём этот материал..." value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-slate-900 dark:text-white transition-all resize-none" />
              </div>

              {!form.file && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t('common.type', 'Формат файла вручную')}</label>
                  <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-slate-900 dark:text-white transition-all">
                    <option value="link">🌐 {t('materials.type.link', 'Внешняя ссылка')}</option>
                    <option value="video">🎥 {t('materials.type.video', 'Видео')}</option>
                    <option value="document">📄 {t('materials.type.document', 'Документ (PDF/Word)')}</option>
                    <option value="image">🖼 {t('materials.type.image', 'Изображение')}</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-8">
              <button 
                onClick={() => !isUploading && setShowCreate(false)} 
                disabled={isUploading}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded-xl transition-colors w-full sm:w-auto text-center"
              >
                {t('common.cancel', 'Отмена')}
              </button>

              {!form.file && form.url.trim() && canAccess('ai') && (
                 <button 
                    onClick={() => processWithAI(form.url)} 
                    disabled={isProcessingAI || isUploading}
                    className="relative overflow-hidden group px-6 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-violet-500/25 shrink-0"
                 >
                   {isProcessingAI ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
                   <span>Заполнить ИИ</span>
                 </button>
              )}

              <button 
                onClick={handleCreate} 
                disabled={isUploading || isProcessingAI || (!form.title.trim() && !form.file)} 
                className="bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Загрузка...</span>
                  </>
                ) : t('common.save', 'Опубликовать файл')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {viewMaterial && (
        <FileViewerModal 
          file={{ name: viewMaterial.title, url: viewMaterial.url, type: viewMaterial.mimeType || 'unknown' }} 
          onClose={() => setViewMaterial(null)} 
        />
      )}
      {/* Transfer Modal */}
      {transferringMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isTransferring && setTransferringMaterial(null)} />
           <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                 <h2 className="text-xl font-bold dark:text-white">Добавить в личный урок</h2>
                 <button onClick={() => !isTransferring && setTransferringMaterial(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                   <X className="w-5 h-5 dark:text-slate-400" />
                 </button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Выберите свой личный урок, в который вы хотите перенести материал "{transferringMaterial.title}". Данная операция требует одобрения администратора.</p>
              
              {loadingLessons ? (
                 <div className="flex justify-center p-8"><span className="w-8 h-8 border-4 border-slate-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : personalLessons.length === 0 ? (
                 <div className="text-center p-6 text-slate-500 text-sm">У вас пока нет личных уроков.</div>
              ) : (
                 <div className="flex-1 overflow-y-auto min-h-0 space-y-2 mb-6 pr-2">
                    {personalLessons.map(l => (
                       <button
                          key={l.id}
                          onClick={() => setSelectedLessonId(l.id!)}
                          className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedLessonId === l.id ? 'bg-primary-50 border-primary-500 shadow-sm dark:bg-primary-900/20 dark:border-primary-500' : 'bg-slate-50 border-slate-200 hover:border-primary-300 dark:bg-slate-900/50 dark:border-slate-700 dark:hover:border-primary-700'}`}
                       >
                          <div className="font-medium text-slate-900 dark:text-white line-clamp-1">{l.title}</div>
                          <div className="text-xs text-slate-500 mt-1">{l.subject} • {l.level}</div>
                       </button>
                    ))}
                 </div>
              )}
              
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700 mt-auto">
                 <button disabled={isTransferring} onClick={() => setTransferringMaterial(null)} className="btn-ghost">Отмена</button>
                 <button 
                    disabled={!selectedLessonId || isTransferring} 
                    onClick={handleTransfer}
                    className="btn-primary"
                 >
                    {isTransferring ? 'Отправка...' : 'Отправить запрос'}
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default MaterialsPage;
