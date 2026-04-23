import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Phone, MessageSquare, CheckCircle, Clock, Trash2, Plus, X, Inbox, Target, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface AILead {
  id: string;
  name: string;
  phone: string;
  reason: string;
  source: 'telegram_bot' | 'web_chat' | 'manual' | 'test_link';
  createdBy?: string;
  status: 'new' | 'contacted' | 'resolved';
  branchId?: string | null;
  testResult?: {
    examId: string;
    examTitle: string;
    score: number;
    maxScore: number;
    percentage: number;
    passed: boolean;
    aiFeedback?: any;
  };
  createdAt: string;
}

const STATUS_CFG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  new:       { label: 'Новая',       icon: <Clock className="w-3 h-3" />,          cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  contacted: { label: 'В обработке', icon: <MessageSquare className="w-3 h-3" />,  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  resolved:  { label: 'Закрыта',     icon: <CheckCircle className="w-3 h-3" />,    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

const SOURCE_LABEL: Record<string, string> = {
  telegram_bot: 'TG BOT',
  test_link:    'PUBLIC TEST',
  web_chat:     'WEB CHAT',
  manual:       'ВРУЧНУЮ',
};

const AILeadsPage: React.FC = () => {
  const { organizationId, profile, firebaseUser } = useAuth();
  const [leads, setLeads] = useState<AILead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!organizationId) {
       setLoading(false);
       return;
    }

    const q = query(
      collection(db, 'organizations', organizationId, 'aiLeads'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: AILead[] = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as AILead);
      });
      setLeads(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching leads:", error);
      toast.error('Ошибка при загрузке заявок');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [organizationId]);

  const updateStatus = async (id: string, newStatus: string) => {
    if (!organizationId) return;
    try {
      await updateDoc(doc(db, 'organizations', organizationId, 'aiLeads', id), { status: newStatus });
      toast.success('Статус заявки обновлен');
    } catch (err) {
      console.error(err);
      toast.error('Не удалось обновить статус');
    }
  };
  
  const deleteLead = async (id: string) => {
    if (!organizationId) return;
    if (!window.confirm('Вы точно хотите удалить эту заявку?')) return;
    try {
      await deleteDoc(doc(db, 'organizations', organizationId, 'aiLeads', id));
      toast.success('Заявка удалена');
    } catch (err) {
      console.error(err);
      toast.error('Не удалось удалить заявку');
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !profile) return;
    if (!newName.trim() || !newPhone.trim()) {
      toast.error('Пожалуйста, заполните имя и телефон');
      return;
    }

    setCreating(true);
    try {
      const managerName = profile.displayName || 'Менеджер';
      
      await addDoc(collection(db, 'organizations', organizationId, 'aiLeads'), {
        name: newName.trim(),
        phone: newPhone.trim(),
        reason: newReason.trim() || 'Новая заявка',
        source: 'manual',
        createdBy: managerName,
        status: 'new',
        createdAt: new Date().toISOString()
      });
      
      // Trigger telegram notification
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        fetch('/.netlify/functions/api-notifications?action=notifyNewLead', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: newName.trim(),
            phone: newPhone.trim(),
            reason: newReason.trim(),
            source: 'manual'
          })
        }).catch(e => console.error('Failed to notify about new lead:', e));
      }
      
      toast.success('Заявка добавлена');
      setModalOpen(false);
      setNewName('');
      setNewPhone('');
      setNewReason('');
    } catch (err) {
      console.error(err);
      toast.error('Не удалось создать заявку');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Заявки</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Входящие заявки от клиентов, телеграм-бота и AI-ассистента.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="h-9 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Добавить
        </button>
      </div>

      {/* List */}
      {leads.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
          <Inbox className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Пока нет заявок</p>
          <p className="text-sm text-slate-400 mt-1">Как только клиент оставит заявку, она появится здесь.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          {leads.map((lead, idx) => {
            const cfg = STATUS_CFG[lead.status] || STATUS_CFG.new;
            const isExpanded = expandedId === lead.id;
            const srcLabel = lead.source === 'manual' && lead.createdBy ? lead.createdBy : SOURCE_LABEL[lead.source] || lead.source;

            return (
              <div
                key={lead.id}
                className={`${idx > 0 ? 'border-t border-slate-100 dark:border-slate-700/60' : ''}`}
              >
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3 sm:px-5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  {/* Status badge */}
                  <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-md shrink-0 ${cfg.cls}`}>
                    {cfg.icon} {cfg.label}
                  </span>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{lead.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* Mobile status */}
                      <span className={`sm:hidden inline-flex items-center gap-0.5 text-[10px] font-bold ${cfg.cls} px-1.5 py-0.5 rounded`}>{cfg.icon} {cfg.label}</span>
                      <a href={`tel:${lead.phone}`} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center gap-1">
                        <Phone className="w-3 h-3" />{lead.phone}
                      </a>
                    </div>
                  </div>

                  {/* Source tag */}
                  <span className="hidden md:inline-block text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md shrink-0">
                    {srcLabel}
                  </span>

                  {/* Date */}
                  <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap shrink-0 hidden sm:block">
                    {format(new Date(lead.createdAt), 'dd.MM.yyyy HH:mm')}
                  </span>

                  {/* Status select */}
                  <select
                    value={lead.status}
                    onChange={(e) => updateStatus(lead.id, e.target.value)}
                    className="h-8 pl-2 pr-6 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-500 shrink-0"
                  >
                    <option value="new">Новая</option>
                    <option value="contacted">Связались</option>
                    <option value="resolved">Закрыта</option>
                  </select>

                  {/* Expand reason */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shrink-0 ${isExpanded ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : ''}`}
                    title="Показать цель заявки"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteLead(lead.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:text-slate-600 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors shrink-0"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Collapsible reason + test result */}
                {isExpanded && (
                  <div className="px-5 pb-4 pt-1 bg-slate-50/50 dark:bg-slate-900/20 border-t border-slate-100/80 dark:border-slate-700/40 animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* Reason */}
                    <div className="mb-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Цель заявки</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{lead.reason}</p>
                    </div>

                    {/* Mobile-only: date + source */}
                    <div className="flex items-center gap-3 sm:hidden mt-2 mb-2">
                      <span className="text-[11px] text-slate-400">{format(new Date(lead.createdAt), 'dd.MM.yyyy HH:mm')}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">{srcLabel}</span>
                    </div>

                    {/* Test result */}
                    {lead.testResult && (
                      <div className="mt-3 bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-3.5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-5">
                          <Target className="w-12 h-12 text-indigo-500" />
                        </div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Результат тестирования</p>
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1.5 truncate pr-6">{lead.testResult.examTitle}</p>
                        <div className="flex items-end gap-2">
                          <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 leading-none">{lead.testResult.percentage}%</span>
                          <span className="text-xs font-medium text-slate-400 pb-0.5">{lead.testResult.score} / {lead.testResult.maxScore}</span>
                        </div>

                        {lead.testResult.aiFeedback && (
                          <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 mb-0.5 uppercase tracking-wide">✨ AI Анализ</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">
                              "{lead.testResult.aiFeedback.teacherNotes || lead.testResult.aiFeedback.summary}"
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Lead Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Добавить заявку</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddLead} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                  Имя клиента
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="input w-full"
                  placeholder="Иван Иванов"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                  Номер телефона
                </label>
                <input
                  type="tel"
                  required
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  className="input w-full"
                  placeholder="+996 555 123 456"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                  Цель заявки
                </label>
                <textarea
                  value={newReason}
                  onChange={e => setNewReason(e.target.value)}
                  className="input w-full min-h-[100px] resize-y"
                  placeholder="Запись на пробный урок..."
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn-ghost"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="h-9 px-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AILeadsPage;
