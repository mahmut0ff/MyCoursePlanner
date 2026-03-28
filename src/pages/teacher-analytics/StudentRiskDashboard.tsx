import React, { useEffect, useState } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { apiGetStudentRisks } from '../../lib/api';
import type { StudentRiskProfile } from '../../types';
import { ShieldAlert, AlertTriangle, ShieldCheck, TrendingDown, Clock } from 'lucide-react';

const RiskCard: React.FC<{ student: StudentRiskProfile }> = ({ student }) => {
  return (
    <div className={`p-4 rounded-xl border bg-white dark:bg-slate-800 shadow-sm transition-all hover:shadow-md ${
      student.riskLevel === 'high' ? 'border-red-200 dark:border-red-900/50' :
      student.riskLevel === 'medium' ? 'border-amber-200 dark:border-amber-900/50' : 
      'border-emerald-200 dark:border-emerald-900/50'
    }`}>
      <div className="flex items-center gap-3 mb-4">
        {student.avatarUrl ? (
          <img src={student.avatarUrl} alt={student.studentName} className="w-10 h-10 rounded-full" />
        ) : (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
            student.riskLevel === 'high' ? 'bg-red-100 text-red-600' :
            student.riskLevel === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
          }`}>
            {student.studentName.charAt(0)}
          </div>
        )}
        <div>
          <h4 className="font-bold text-slate-800 dark:text-white leading-tight">{student.studentName}</h4>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3"/> был(а) {student.daysSinceLastActive} дн. назад 
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg">
          <p className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Ср. Балл</p>
          <p className={`font-bold ${student.averageScore < 60 ? 'text-red-500' : 'text-slate-800 dark:text-white'}`}>{student.averageScore}%</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg">
          <p className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Посещения</p>
          <p className={`font-bold ${student.attendanceRate < 70 ? 'text-amber-500' : 'text-slate-800 dark:text-white'}`}>{student.attendanceRate}%</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg col-span-2 flex items-center justify-between">
          <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Стрик (дней подряд)</span>
          <span className="font-bold text-orange-500 flex items-center gap-1">{student.streak} 🔥</span>
        </div>
      </div>
    </div>
  );
};

const StudentRiskDashboard: React.FC = () => {
  const { organizationId } = useAuth();
  
  const [risks, setRisks] = useState<StudentRiskProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (organizationId) {
      setLoading(true);
      apiGetStudentRisks(organizationId)
        .then(setRisks)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [organizationId]);

  if (loading) return <div className="p-8 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>;

  const highRisk = risks.filter(r => r.riskLevel === 'high');
  const medRisk = risks.filter(r => r.riskLevel === 'medium');
  const lowRisk = risks.filter(r => r.riskLevel === 'low');

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <TrendingDown className="text-red-500" />
          Светофор Рисков (Retention)
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
          Следите за вовлеченностью студентов. Красная зона показывает учеников, которые давно не заходили, получают плохие оценки или пропускают занятия. Вовремя свяжитесь с ними!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Red Column */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-4 py-3 rounded-xl border border-red-200 dark:border-red-900/50">
            <h3 className="font-bold flex items-center gap-2"><ShieldAlert className="w-5 h-5"/> Критическая зона</h3>
            <span className="font-black text-xl">{highRisk.length}</span>
          </div>
          {highRisk.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Нет критических рисков 🎉</p>}
          {highRisk.map(s => <RiskCard key={s.studentId} student={s} />)}
        </div>

        {/* Yellow Column */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-900/50">
            <h3 className="font-bold flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Зона внимания</h3>
            <span className="font-black text-xl">{medRisk.length}</span>
          </div>
          {medRisk.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Все стабильно</p>}
          {medRisk.map(s => <RiskCard key={s.studentId} student={s} />)}
        </div>

        {/* Green Column */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50">
            <h3 className="font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5"/> Зеленая зона</h3>
            <span className="font-black text-xl">{lowRisk.length}</span>
          </div>
          {lowRisk.map(s => <RiskCard key={s.studentId} student={s} />)}
        </div>

      </div>
    </div>
  );
};

export default StudentRiskDashboard;
