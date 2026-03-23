import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Award } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';

interface Cert {
  id: string;
  examTitle: string;
  percentage: number;
  certificateNumber: string;
  issuedAt: string;
  organizationName: string;
}

const MyCertificatesPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.uid) {
      const q = query(
        collection(db, 'certificates'),
        where('studentId', '==', profile.uid),
        orderBy('issuedAt', 'desc')
      );
      getDocs(q).then(snap => {
        setCerts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cert)));
      }).finally(() => setLoading(false));
    }
  }, [profile?.uid]);

  if (loading) return <ListSkeleton rows={3} />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('certificate.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{certs.length} {t('certificate.title').toLowerCase()}</p>
      </div>

      {certs.length === 0 ? (
        <EmptyState
          icon={Award}
          title={t('certificate.notFound')}
          description={t('certificate.noCertsDesc', 'Сдайте экзамен и получите свой первый сертификат!')}
          actionLabel={t('rooms.join')}
          actionLink="/join"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certs.map(c => (
            <Link key={c.id} to={`/certificate/${c.id}`} className="card overflow-hidden hover:shadow-lg transition-shadow group">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white">
                <div className="flex items-center gap-2">
                  <Award className="w-6 h-6" />
                  <span className="text-sm font-mono opacity-70">{c.certificateNumber}</span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{c.examTitle}</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{c.percentage}%</span>
                  <span className="text-slate-400 dark:text-slate-500">{new Date(c.issuedAt).toLocaleDateString()}</span>
                </div>
                {c.organizationName && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{c.organizationName}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyCertificatesPage;
