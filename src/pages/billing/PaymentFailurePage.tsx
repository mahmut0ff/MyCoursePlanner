import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';

const PaymentFailurePage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
        <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{t('payment.failure')}</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-6">Попробуйте ещё раз или выберите другой способ оплаты.</p>
      <Link to="/billing" className="btn-primary">{t('payment.tryAgain')}</Link>
    </div>
  );
};

export default PaymentFailurePage;
