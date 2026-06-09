import React, { useState } from 'react';
import { X, Send, Loader2, CheckCircle2, Building2, User, AtSign } from 'lucide-react';
import { apiSubmitDemoRequest } from '../../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Landing-page modal for sales lead capture: name of the learning center,
 * owner's name and Telegram contact. Owners no longer self-register —
 * accounts are provisioned by super-admins after the demo call.
 */
const RequestDemoModal: React.FC<Props> = ({ open, onClose }) => {
  const [orgName, setOrgName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [telegram, setTelegram] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const close = () => {
    if (submitting) return;
    setOrgName(''); setOwnerName(''); setTelegram(''); setNote('');
    setError(''); setSuccess(false);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!orgName.trim() || !ownerName.trim() || !telegram.trim()) {
      setError('Заполните все обязательные поля');
      return;
    }
    setSubmitting(true);
    try {
      await apiSubmitDemoRequest({
        orgName: orgName.trim(),
        ownerName: ownerName.trim(),
        telegram: telegram.trim(),
        note: note.trim() || undefined,
      });
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить заявку. Попробуйте ещё раз.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={close}
          aria-label="Закрыть"
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Заявка отправлена</h2>
            <p className="text-slate-500 leading-relaxed mb-6">
              Спасибо! Мы свяжемся с вами в Telegram в ближайшее время, чтобы провести демо и
              рассказать про возможности платформы.
            </p>
            <button
              onClick={close}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Готово
            </button>
          </div>
        ) : (
          <>
            <div className="p-7 pb-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-bold uppercase tracking-wider mb-3">
                Для учебных центров
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-1.5">Заказать демо</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Расскажем про платформу, поможем подобрать тариф и заведём аккаунт под вас.
              </p>
            </div>

            <form onSubmit={submit} className="p-7 pt-3 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">Учебный центр</label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Например, Sunrise Academy"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">Имя владельца</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Иван Иванов"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">Telegram для связи</label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="@username или https://t.me/username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">Напишем туда, чтобы договориться о времени демо.</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">Комментарий (необязательно)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Сколько студентов, что хотите автоматизировать…"
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all resize-none"
                  maxLength={1000}
                />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">{error}</div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-70 text-white font-semibold py-3 rounded-xl shadow-lg shadow-primary-500/20 transition-all flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Отправляем…</> : <><Send className="w-4 h-4" /> Отправить заявку</>}
              </button>
              <p className="text-xs text-slate-400 text-center">
                Отправляя форму, вы соглашаетесь, что мы свяжемся с вами по указанному Telegram.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default RequestDemoModal;
