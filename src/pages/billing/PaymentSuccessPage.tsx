import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';

const PaymentSuccessPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{t('payment.success')}</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-6">Ваша подписка активирована.</p>
      <Link to="/billing" className="btn-primary">{t('payment.backToBilling')}</Link>
    </div>
  );
};

export default PaymentSuccessPage;
