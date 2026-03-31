import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetManagers } from '../../lib/api';
import { ArrowLeft, Mail, Calendar, ShieldCheck, Phone } from 'lucide-react';
import type { UserProfile } from '../../types';

const C = {
  blue: '#3b82f6',
  indigo: '#6366f1',
  cyan: '#06b6d4',
};

const ManagerDetailPage: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  
  const [manager, setManager] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    // There is no apiGetManagerProfile right now, so we just get from the list
    import('../../lib/api').then(({ orgGetManagers }) => {
      orgGetManagers().then((all: UserProfile[]) => {
        setManager(all.find((u) => u.uid === uid) || null);
      }).catch(() => null).finally(() => setLoading(false));
    });
  }, [uid]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: `${C.blue}30`, borderTopColor: C.blue }} />
    </div>
  );

  if (!manager) return (
    <div className="text-center py-20">
      <ShieldCheck className="w-14 h-14 mx-auto mb-3" style={{ color: C.blue, opacity: 0.2 }} />
      <p className="text-sm font-bold text-slate-500">{t('common.notFound')}</p>
      <button onClick={() => navigate('/managers')} className="mt-3 text-sm font-bold hover:underline" style={{ color: C.blue }}>{t('common.back')}</button>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <button onClick={() => navigate('/managers')} className="flex items-center gap-1.5 text-sm font-bold mb-4 transition-all hover:gap-2.5" style={{ color: C.blue }}>
        <ArrowLeft className="w-4 h-4" />{t('common.back')}
      </button>

      {/* Hero Profile Card */}
      <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-6 shadow-sm">
        <div className="h-28 sm:h-32 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${C.blue} 0%, ${C.indigo} 50%, ${C.cyan} 100%)` }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M30 5 L55 17.5 L55 42.5 L30 55 L5 42.5 L5 17.5 Z\' fill=\'none\' stroke=\'white\' stroke-width=\'1\'/%3E%3C/svg%3E")', backgroundSize: '60px 60px' }} />
          
          <div className="absolute bottom-3 right-4 flex items-center gap-3">
             <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white px-2.5 py-1 rounded-full">
               <Calendar className="w-3.5 h-3.5" />
               <span className="text-[11px] font-bold">с {new Date(manager.createdAt).toLocaleDateString()}</span>
             </div>
          </div>
        </div>

        <div className="px-6 pb-6 relative">
          {/* Avatar */}
          <div className="absolute -top-10 left-6">
            {manager.avatarUrl ? (
              <img src={manager.avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shadow-xl ring-4 ring-white dark:ring-slate-800" />
            ) : (
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl text-white font-extrabold shadow-xl ring-4 ring-white dark:ring-slate-800" style={{ background: `linear-gradient(135deg, ${C.blue} 0%, ${C.indigo} 100%)` }}>
                {manager.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>

          <div className="pt-12 sm:pt-2 sm:ml-24 flex items-start justify-between flex-wrap gap-4">
             <div>
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{manager.displayName}</h1>
                <div className="flex items-center gap-1.5 mt-1 mb-2">
                   <span className="flex items-center gap-1 text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded uppercase tracking-wider">
                     <ShieldCheck className="w-3 h-3" /> Управляющий Филиалом / Менеджер
                   </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500 flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{manager.email}</span>
                  {manager.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{manager.phone}</span>}
                </div>
             </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm flex items-center justify-center py-16">
         <p className="text-sm text-slate-400 font-medium">Для данного сотрудника включен доступ управляющего: финансы, группы и расписание.</p>
      </div>

    </div>
  );
};

export default ManagerDetailPage;
