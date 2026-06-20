import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { apiGetJoinCodes, apiRegenerateJoinCode, apiSetStudentJoinMode, type OrgJoinCodes } from '../../lib/api';
import { Loader2, Copy, Check, RefreshCw, Send, GraduationCap, UserPlus, Download } from 'lucide-react';
import toast from 'react-hot-toast';

interface RoleCardProps {
  role: 'student' | 'teacher';
  title: string;
  hint: string;
  icon: React.ElementType;
  accent: string;
  code: string;
  link: string;
  qr: string;
  onCopy: () => void;
  copied: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
}

const RoleCard: React.FC<RoleCardProps> = ({ title, hint, icon: Icon, accent, code, link, qr, onCopy, copied, onRegenerate, regenerating }) => {
  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `sabakhub-${code}.png`;
    a.click();
  };
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="shrink-0 mx-auto sm:mx-0">
          {qr ? (
            <div className="w-32 h-32 bg-white rounded-xl p-2 border border-slate-200 dark:border-slate-600">
              <img src={qr} alt="QR" className="w-full h-full" />
            </div>
          ) : (
            <div className="w-32 h-32 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Код</p>
            <p className="font-mono text-lg font-bold text-slate-900 dark:text-white tracking-widest">{code}</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
            <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate flex-1">{link}</a>
            <button onClick={onCopy} className="p-1.5 rounded-md text-slate-400 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0" title="Скопировать ссылку">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={downloadQr} disabled={!qr} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
              <Download className="w-3.5 h-3.5" /> QR
            </button>
            <button onClick={onRegenerate} disabled={regenerating} className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 text-slate-500">
              {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Сменить код
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const EnrollmentTab: React.FC = () => {
  const [data, setData] = useState<OrgJoinCodes | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrStudent, setQrStudent] = useState('');
  const [qrTeacher, setQrTeacher] = useState('');
  const [copied, setCopied] = useState<'student' | 'teacher' | null>(null);
  const [regenerating, setRegenerating] = useState<'student' | 'teacher' | null>(null);
  const [savingMode, setSavingMode] = useState(false);

  useEffect(() => {
    apiGetJoinCodes()
      .then(setData)
      .catch((err) => toast.error(err.message || 'Не удалось загрузить коды'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data) return;
    QRCode.toDataURL(data.studentLink, { width: 256, margin: 1 }).then(setQrStudent).catch(() => {});
    QRCode.toDataURL(data.teacherLink, { width: 256, margin: 1 }).then(setQrTeacher).catch(() => {});
  }, [data]);

  const copy = (role: 'student' | 'teacher') => {
    if (!data) return;
    navigator.clipboard.writeText(role === 'student' ? data.studentLink : data.teacherLink);
    setCopied(role);
    toast.success('Ссылка скопирована');
    setTimeout(() => setCopied(null), 2000);
  };

  const regenerate = async (role: 'student' | 'teacher') => {
    if (!window.confirm('Старая ссылка/код перестанут работать. Продолжить?')) return;
    setRegenerating(role);
    try {
      const res = await apiRegenerateJoinCode(role);
      setData((d) => d ? {
        ...d,
        ...(role === 'student'
          ? { studentCode: res.code, studentLink: res.link }
          : { teacherCode: res.code, teacherLink: res.link }),
      } : d);
      toast.success('Новый код создан');
    } catch (err: any) {
      toast.error(err.message || 'Ошибка');
    } finally {
      setRegenerating(null);
    }
  };

  const toggleMode = async () => {
    if (!data) return;
    const next = data.studentJoinMode === 'auto' ? 'approval' : 'auto';
    setSavingMode(true);
    try {
      await apiSetStudentJoinMode(next);
      setData((d) => d ? { ...d, studentJoinMode: next } : d);
    } catch (err: any) {
      toast.error(err.message || 'Ошибка');
    } finally {
      setSavingMode(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
  }
  if (!data) {
    return <div className="text-center py-12 text-slate-500">Не удалось загрузить настройки регистрации.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Send className="w-5 h-5" />
          <h3 className="font-semibold">Быстрая регистрация через Telegram</h3>
        </div>
        <p className="text-sm text-white/85">
          Отправьте ученику ссылку или дайте отсканировать QR. В боте <b>@{data.botUsername}</b> он за один тап
          поделится номером и сразу попадёт в приложение — без сайта, паролей и долгого онбординга.
        </p>
      </div>

      <RoleCard
        role="student"
        title="Ссылка для учеников"
        hint="Делитесь свободно: в чатах, на ресепшене, в соцсетях"
        icon={GraduationCap}
        accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        code={data.studentCode}
        link={data.studentLink}
        qr={qrStudent}
        onCopy={() => copy('student')}
        copied={copied === 'student'}
        onRegenerate={() => regenerate('student')}
        regenerating={regenerating === 'student'}
      />

      <RoleCard
        role="teacher"
        title="Ссылка для преподавателей"
        hint="⚠️ Давайте только своим — заявки требуют подтверждения админом"
        icon={UserPlus}
        accent="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        code={data.teacherCode}
        link={data.teacherLink}
        qr={qrTeacher}
        onCopy={() => copy('teacher')}
        copied={copied === 'teacher'}
        onRegenerate={() => regenerate('teacher')}
        regenerating={regenerating === 'teacher'}
      />

      {/* Student join mode */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Приём учеников</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {data.studentJoinMode === 'auto'
                ? 'Ученики зачисляются сразу (в пределах лимита тарифа).'
                : 'Каждая заявка ученика ждёт подтверждения админом.'}
            </p>
          </div>
          <button
            onClick={toggleMode}
            disabled={savingMode}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${data.studentJoinMode === 'auto' ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            title={data.studentJoinMode === 'auto' ? 'Авто-приём включён' : 'Авто-приём выключен'}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${data.studentJoinMode === 'auto' ? 'left-[26px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
