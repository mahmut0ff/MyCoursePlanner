import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';

const PaymentFailurePage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="flex items-center justify-center mx-auto mb-2">
        <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('payment.failure')}</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-4 text-xs">{t('payment.failureHint', 'Попробуйте ещё раз или выберите другой способ оплаты.')}</p>
      <Link to="/billing" className="btn-primary">{t('payment.tryAgain')}</Link>
    </div>
  );
};

export default PaymentFailurePage;
