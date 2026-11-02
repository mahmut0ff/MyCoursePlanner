import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';

const PaymentSuccessPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="flex items-center justify-center mx-auto mb-2">
        <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('payment.success')}</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-4 text-xs">{t('payment.successHint', 'Ваша подписка активирована.')}</p>
      <Link to="/billing" className="btn-primary">{t('payment.backToBilling')}</Link>
    </div>
  );
};

export default PaymentSuccessPage;
