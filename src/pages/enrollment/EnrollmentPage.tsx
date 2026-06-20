import React from 'react';
import { EnrollmentTab } from '../org-settings/EnrollmentTab';

/** Standalone "Набор" page — share Telegram join links / QR to enroll students & teachers. */
const EnrollmentPage: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Набор</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Ссылки и QR для быстрой регистрации учеников и преподавателей через Telegram.
        </p>
      </div>
      <EnrollmentTab />
    </div>
  );
};

export default EnrollmentPage;
