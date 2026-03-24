import React from 'react';
import { useTranslation } from 'react-i18next';
import { UploadCloud, Film, Image as ImageIcon } from 'lucide-react';

interface StudentPortfolioProps {
  uid: string;
}

const StudentPortfolio: React.FC<StudentPortfolioProps> = ({ uid }) => {
  const { t } = useTranslation();
  console.log('Rendering portfolio for:', uid); // temporary usage of uid to avoid lint error

  return (
    <div className="card p-8 text-center border-dashed border-2 border-slate-200 dark:border-slate-700">
      <UploadCloud className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('profile.portfolioTitle', 'Your Portfolio')}</h3>
      <p className="text-slate-500 mb-6">{t('profile.portfolioEmpty', 'You have no posts yet. Add projects, certificates, or updates to stand out!')}</p>
      
      <div className="flex justify-center gap-4">
        <button className="btn-secondary flex items-center gap-2"><ImageIcon className="w-4 h-4" />{t('profile.addPhoto', 'Add Photo')}</button>
        <button className="btn-secondary flex items-center gap-2"><Film className="w-4 h-4" />{t('profile.addVideo', 'Add Video')}</button>
      </div>
    </div>
  );
};

export default StudentPortfolio;
