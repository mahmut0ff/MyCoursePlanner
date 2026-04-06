import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, Bot, Calendar, Phone, User, MessageSquare, CheckCircle, Clock, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface AILead {
  id: string;
  name: string;
  phone: string;
  reason: string;
  source: 'telegram_bot' | 'web_chat';
  status: 'new' | 'contacted' | 'resolved';
  createdAt: string;
}

const AILeadsPage: React.FC = () => {
  const { organizationId } = useAuth();
  const [leads, setLeads] = useState<AILead[]>([]);
  const [loading, setLoading] = useState(true);

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
      console.error("Error fetching AI leads:", error);
      toast.error('Ошибка при загрузке заявок от ИИ');
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="w-7 h-7 text-primary-500" />
            Заявки от ИИ-ассистента
          </h1>
          <p className="text-slate-500 mt-1">Клиенты, которых записал искусственный интеллект на пробный урок или встречу.</p>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center text-slate-500">
          <Bot className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-lg font-medium">Пока нет заявок от ИИ</p>
          <p className="text-sm">Как только наш бот запишет клиента, заявка появится здесь.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {leads.map(lead => (
            <div key={lead.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
              <div className="flex items-center justify-between mb-4">
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full flex items-center gap-1
                  ${lead.status === 'new' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : ''}
                  ${lead.status === 'contacted' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : ''}
                  ${lead.status === 'resolved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}
                `}>
                  {lead.status === 'new' && <Clock className="w-3.5 h-3.5" />}
                  {lead.status === 'contacted' && <MessageSquare className="w-3.5 h-3.5" />}
                  {lead.status === 'resolved' && <CheckCircle className="w-3.5 h-3.5" />}
                  {lead.status === 'new' ? 'Новая' : lead.status === 'contacted' ? 'В обработке' : 'Закрыта'}
                </span>
                <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                  {format(new Date(lead.createdAt), 'dd.MM.yyyy HH:mm')}
                </span>
              </div>
              
              <div className="space-y-3 mb-5">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{lead.name}</p>
                    <p className="text-xs text-slate-500">Имя клиента</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <a href={`tel:${lead.phone}`} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">{lead.phone}</a>
                    <p className="text-xs text-slate-500">Телефон</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-slate-700 dark:text-slate-300 line-clamp-3">{lead.reason}</p>
                    <p className="text-xs text-slate-500">Цель заявки</p>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50 flex gap-2">
                <select 
                  value={lead.status}
                  onChange={(e) => updateStatus(lead.id, e.target.value)}
                  className="input py-1.5 px-3 text-sm flex-1 bg-slate-50 dark:bg-slate-900/50"
                >
                  <option value="new">Новая</option>
                  <option value="contacted">Связались</option>
                  <option value="resolved">Успешно закрыта</option>
                </select>
                
                <button 
                  onClick={() => deleteLead(lead.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-800/30"
                  title="Удалить заявку"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="absolute -top-2 -right-2 bg-slate-800 dark:bg-slate-700 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                {lead.source === 'telegram_bot' ? 'TG BOT' : 'WEB CHAT'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AILeadsPage;
