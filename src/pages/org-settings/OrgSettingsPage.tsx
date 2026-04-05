import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlanGate } from '../../contexts/PlanContext';
import { orgGetSettings, orgUpdateSettings } from '../../lib/api';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import {
  Save, Building2, GraduationCap, Check, Bell, BarChart3,
  Database, Camera, Loader2, MapPin, Phone, Mail, Clock,
  QrCode, Download, Send, MessageCircle, Printer, Copy, CheckCircle, Bot, Globe
} from 'lucide-react';
import type { OrgSettings } from '../../types';
import QRCode from 'qrcode';
import { AIManagerTab } from './AIManagerTab';
import toast from 'react-hot-toast';

type Tab = 'general' | 'academic' | 'visitcard' | 'notifications' | 'data' | 'limits' | 'ai';

const TABS: { id: Tab; icon: React.ElementType; labelKey: string }[] = [
  { id: 'general', icon: Building2, labelKey: 'org.settings.general' },
  { id: 'academic', icon: GraduationCap, labelKey: 'org.settings.academic' },
  { id: 'visitcard', icon: QrCode, labelKey: 'org.settings.visitCardTab' },
  { id: 'notifications', icon: Bell, labelKey: 'org.settings.notifications' },
  { id: 'data', icon: Database, labelKey: 'org.settings.dataTab' },
  { id: 'limits', icon: BarChart3, labelKey: 'org.settings.limits' },
  { id: 'ai', icon: Bot, labelKey: 'AI Manager' },
];

/* ════════════════════════════════════ GENERAL ════════════════════════════════════ */
const GeneralTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings.organizationId) return;
    setUploading(true);
    try {
      const ref = storageRef(storage, `org-logos/${settings.organizationId}`);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
      update('logo', url);
    } catch (err) {
      console.error('Logo upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Branding / Logo */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.branding', 'Брендинг')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('org.settings.logoUrl', 'Логотип организации')}</label>
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/40 dark:to-indigo-900/40 flex items-center justify-center overflow-hidden shadow-lg">
                  {settings.logo ? (
                    <img src={settings.logo} alt="Logo" className="w-24 h-24 object-cover rounded-2xl" />
                  ) : (
                    <Building2 className="w-10 h-10 text-violet-600 dark:text-violet-400" />
                  )}
                </div>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 bg-black/50 text-white rounded-2xl flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
                </button>
                <input type="file" accept="image/*" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" />
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.uploadLogo', 'Загрузите логотип')}</p>
                <p className="text-xs">{t('org.settings.logoHint', 'Рекомендуемый размер: 256×256 px')}</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.primaryColor', 'Основной цвет')}</label>
            <div className="flex items-center gap-2">
              <input type="color" value={settings.primaryColor || '#6366f1'} onChange={(e) => update('primaryColor', e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
              <input type="text" value={settings.primaryColor || '#6366f1'} onChange={(e) => update('primaryColor', e.target.value)} className="input text-sm font-mono" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.general')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.orgName')}</label>
            <input value={settings.name} onChange={(e) => update('name', e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.orgDescription', 'Описание организации')}</label>
            <textarea value={settings.description || ''} onChange={(e) => update('description', e.target.value)} className="input min-h-[100px]" placeholder={t('org.settings.orgDescriptionPlaceholder')} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.timezone')}</label>
              <select value={settings.timezone} onChange={(e) => update('timezone', e.target.value)} className="input">
                <option value="Asia/Bishkek">Asia/Bishkek (UTC+6)</option>
                <option value="Asia/Almaty">Asia/Almaty (UTC+6)</option>
                <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.language')}</label>
              <select value={settings.locale} onChange={(e) => update('locale', e.target.value)} className="input">
                <option value="ru">🇷🇺 Русский</option>
                <option value="en">🇬🇧 English</option>
                <option value="kg">🇰🇬 Кыргызча</option>
              </select>
            </div>
          </div>
          
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{t('org.settings.isOnline', 'Формат обучения')}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('org.settings.isOnlineDesc', 'Отметьте, если центр проводит обучение в онлайн-формате')}</p>
              </div>
              <button
                onClick={() => update('isOnline', !settings.isOnline)}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.isOnline ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.isOnline ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ ACADEMIC ════════════════════════════════════ */
const AcademicTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.academic')}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.yearStart')}</label>
              <input type="date" value={settings.academicYearStart || ''} onChange={(e) => update('academicYearStart', e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.yearEnd')}</label>
              <input type="date" value={settings.academicYearEnd || ''} onChange={(e) => update('academicYearEnd', e.target.value)} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.gradingScale')}</label>
              <select value={settings.gradingScale || 'percentage'} onChange={(e) => update('gradingScale', e.target.value)} className="input">
                <option value="percentage">{t('org.settings.scalePercentage')}</option>
                <option value="letter">{t('org.settings.scaleLetter')}</option>
                <option value="points">{t('org.settings.scalePoints')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.passingScore')}</label>
              <input type="number" min={0} max={100} value={settings.passingScore} onChange={(e) => update('passingScore', Number(e.target.value))} className="input" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Contact & Info ── */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><MapPin className="w-4 h-4" />{t('org.settings.contactInfo', 'Контакты и расположение')}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"><span className="flex items-center gap-1"><Mail className="w-3 h-3" />{t('org.settings.contactEmail', 'Email')}</span></label>
              <input type="email" value={settings.contactEmail || ''} onChange={(e) => update('contactEmail', e.target.value)} className="input" placeholder="info@myschool.kg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"><span className="flex items-center gap-1"><Phone className="w-3 h-3" />{t('org.settings.contactPhone', 'Телефон')}</span></label>
              <input type="text" value={settings.contactPhone || ''} onChange={(e) => update('contactPhone', e.target.value)} className="input" placeholder="+996 XXX XXX XXX" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"><span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{t('org.settings.address', 'Адрес')}</span></label>
            <input type="text" value={settings.address || ''} onChange={(e) => update('address', e.target.value)} className="input" placeholder="г. Бишкек, ул. ..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t('org.settings.workingHours', 'Рабочие часы')}</span></label>
            <input type="text" value={settings.workingHours || ''} onChange={(e) => update('workingHours', e.target.value)} className="input" placeholder="Пн-Пт 09:00-18:00, Сб 10:00-15:00" />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ VISIT CARD ════════════════════════════════════ */
const VisitCardTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<string | null>(null);
  const slug = settings.slug || settings.organizationId;
  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/org/${slug}`;
  const links = settings.contactLinks || {};

  // Generate QR on mount / slug change
  useEffect(() => {
    if (!slug) return;
    QRCode.toDataURL(publicUrl, { width: 400, margin: 2, color: { dark: '#1e293b' } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [publicUrl, slug]);

  const downloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${slug}-qr.png`;
    a.click();
  };

  const copyLink = (url: string, type: string) => {
    navigator.clipboard.writeText(url);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const printPoster = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html><head>
        <title>${settings.name} — QR</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 40px; background: white; }
          .poster { width: 100%; max-width: 500px; text-align: center; }
          .logo { width: 80px; height: 80px; border-radius: 16px; object-fit: cover; margin: 0 auto 20px; }
          .logo-placeholder { width: 80px; height: 80px; border-radius: 16px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; font-weight: bold; color: #6366f1; }
          h1 { font-size: 28px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
          .desc { font-size: 14px; color: #64748b; margin-bottom: 24px; line-height: 1.5; }
          .qr { margin: 0 auto 24px; }
          .qr img { width: 250px; height: 250px; }
          .url { font-size: 13px; color: #6366f1; word-break: break-all; margin-bottom: 16px; }
          .cta { font-size: 16px; font-weight: 600; color: #1e293b; padding: 12px 24px; border: 2px solid #e2e8f0; border-radius: 12px; display: inline-block; }
          @media print {
            body { padding: 20px; }
          }
        </style>
      </head><body>
        <div class="poster">
          ${settings.logo ? `<img src="${settings.logo}" class="logo" />` : `<div class="logo-placeholder">${(settings.name || 'O')[0]}</div>`}
          <h1>${settings.name || ''}</h1>
          ${settings.description ? `<p class="desc">${settings.description}</p>` : ''}
          <div class="qr"><img src="${qrDataUrl}" /></div>
          <p class="url">${publicUrl}</p>
          <div class="cta">${t('org.settings.scanToJoin', 'Отсканируйте QR чтобы вступить')}</div>
        </div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Enable Public Profile */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><QrCode className="w-4 h-4" />{t('org.settings.visitCard', 'Визитка организации')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('org.settings.visitCardDesc', 'Публичная страница для привлечения студентов через QR-код')}</p>
          </div>
          <button
            onClick={() => update('publicProfileEnabled', !settings.publicProfileEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${settings.publicProfileEnabled ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.publicProfileEnabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        {settings.publicProfileEnabled && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between bg-slate-50 dark:bg-gray-800/50 p-3 rounded-xl border border-slate-100 dark:border-gray-700">
                <div className="min-w-0">
                  <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.studentLink', 'Для учеников')}</p>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline truncate block">{publicUrl}</a>
                </div>
                <button onClick={() => copyLink(publicUrl, 'student')} className="ml-4 p-2 shrink-0 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition">
                  {copied === 'student' ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-slate-400" />}
                </button>
              </div>

              <div className="flex items-center justify-between bg-slate-50 dark:bg-gray-800/50 p-3 rounded-xl border border-slate-100 dark:border-gray-700">
                <div className="min-w-0">
                  <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">{t('org.settings.teacherLink', 'Для преподавателей')}</p>
                  <a href={`${publicUrl}?role=teacher`} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline truncate block">{publicUrl}?role=teacher</a>
                </div>
                <button onClick={() => copyLink(`${publicUrl}?role=teacher`, 'teacher')} className="ml-4 p-2 shrink-0 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition">
                  {copied === 'teacher' ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-slate-400" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {settings.publicProfileEnabled && (
        <>
          {/* Social Links */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.socialLinks', 'Социальные сети')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  <span className="flex items-center gap-1"><Send className="w-3 h-3 text-blue-500" /> Telegram</span>
                </label>
                <input type="text" value={links.telegram || ''}
                  onChange={(e) => update('contactLinks', { ...links, telegram: e.target.value })}
                  className="input" placeholder="@username" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3 text-green-600" /> WhatsApp</span>
                </label>
                <input type="text" value={links.whatsapp || ''}
                  onChange={(e) => update('contactLinks', { ...links, whatsapp: e.target.value })}
                  className="input" placeholder="+996XXXXXXXXX" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  <span className="flex items-center gap-1"><svg className="w-3 h-3 text-pink-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> Instagram</span>
                </label>
                <input type="text" value={links.instagram || ''}
                  onChange={(e) => update('contactLinks', { ...links, instagram: e.target.value })}
                  className="input" placeholder="@username" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-violet-600" /> {t('org.settings.websiteLabel', 'Веб-сайт')}</span>
                </label>
                <input type="text" value={links.website || ''}
                  onChange={(e) => update('contactLinks', { ...links, website: e.target.value })}
                  className="input" placeholder="https://example.com" />
              </div>
            </div>
          </div>

          {/* QR Code */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.qrCode', 'QR-код')}</h3>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {qrDataUrl ? (
                <div className="w-48 h-48 bg-white rounded-2xl p-3 shadow-lg border border-slate-200 dark:border-slate-600">
                  <img src={qrDataUrl} alt="QR" className="w-full h-full" />
                </div>
              ) : (
                <div className="w-48 h-48 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center">
                  <QrCode className="w-12 h-12 text-slate-400" />
                </div>
              )}
              <div className="space-y-3 text-center sm:text-left">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('org.settings.qrDesc', 'Распечатайте этот QR-код и разместите на ресепшене, визитках или баннерах')}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={downloadQR} disabled={!qrDataUrl} className="btn-primary text-sm flex items-center gap-2">
                    <Download className="w-4 h-4" /> {t('org.settings.downloadQR', 'Скачать QR')}
                  </button>
                  <button onClick={printPoster} disabled={!qrDataUrl} className="btn-secondary text-sm flex items-center gap-2">
                    <Printer className="w-4 h-4" /> {t('org.settings.printPoster', 'Печать постера')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ════════════════════════════════════ NOTIFICATIONS ════════════════════════════════════ */
const NotificationsTab: React.FC<{ settings: OrgSettings; update: (k: string, v: any) => void }> = ({ settings, update }) => {
  const { t } = useTranslation();
  const notifs = [
    { key: 'emailNotifications', label: t('org.settings.emailNotifications'), desc: t('org.settings.emailNotificationsDesc') },
    { key: 'pushNotifications', label: t('org.settings.pushNotifications'), desc: t('org.settings.pushNotificationsDesc') },
  ];
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('org.settings.notifications')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('org.settings.notificationsDesc')}</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {notifs.map((n) => (
            <div key={n.key} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{n.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{n.desc}</p>
              </div>
              <button
                onClick={() => update(n.key, !(settings as any)[n.key])}
                className={`relative w-11 h-6 rounded-full transition-colors ${(settings as any)[n.key] ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${(settings as any)[n.key] ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ DATA MANAGEMENT ════════════════════════════════════ */
const DataTab: React.FC = () => {
  const { t } = useTranslation();

  const handleMock = () => {
    toast('Функция в разработке', { icon: '🚧' });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.exportData')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('org.settings.exportDataDesc')}</p>
        <div className="flex gap-3">
          <button onClick={handleMock} className="btn-secondary text-sm">{t('org.settings.exportStudents')}</button>
          <button onClick={handleMock} className="btn-secondary text-sm">{t('org.settings.exportTeachers')}</button>
          <button onClick={handleMock} className="btn-secondary text-sm">{t('org.settings.exportResults')}</button>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.backup')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('org.settings.backupDesc')}</p>
        <button onClick={handleMock} className="btn-primary text-sm">{t('org.settings.createBackup')}</button>
      </div>
      <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/50 rounded-2xl p-6">
        <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">{t('org.settings.dangerZone')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('org.settings.dangerZoneDesc')}</p>
        <button onClick={handleMock} className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">{t('org.settings.deleteOrg')}</button>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ LIMITS ════════════════════════════════════ */
const LimitsTab: React.FC<{ settings: OrgSettings }> = ({ settings }) => {
  const { t } = useTranslation();
  const { limits } = usePlanGate();
  
  const currStudents = (settings as any).studentsCount || 0;
  const currTeachers = (settings as any).teachersCount || 0;
  
  const maxStudentsText = limits.maxStudents === -1 ? '∞' : limits.maxStudents;
  const maxTeachersText = limits.maxTeachers === -1 ? '∞' : limits.maxTeachers;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">{t('org.settings.limits')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('org.settings.limitsDesc')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{currStudents} / {maxStudentsText}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{t('org.settings.maxStudents')}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{currTeachers} / {maxTeachersText}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{t('org.settings.maxTeachers')}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{settings.storageUsedMb ?? 0} MB</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{t('org.settings.storageUsed')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════ MAIN PAGE ════════════════════════════════════ */
const OrgSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { canAccess } = usePlanGate();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('general');

  useEffect(() => {
    orgGetSettings()
      .then(setSettings)
      .catch((e) => setError(e.message || t('common.loadError', 'Ошибка загрузки')))
      .finally(() => setLoading(false));
  }, []);

  const update = (key: string, value: any) => setSettings((s) => s ? { ...s, [key]: value } : s);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true); setError('');
    try {
      await orgUpdateSettings(settings);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { setError(e.message || t('common.saveError', 'Ошибка сохранения')); }
    finally { setSaving(false); }
  };

  if (loading || !settings) return <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

  const renderTab = () => {
    switch (activeTab) {
      case 'general': return <GeneralTab settings={settings} update={update} />;
      case 'academic': return <AcademicTab settings={settings} update={update} />;
      case 'visitcard': return <VisitCardTab settings={settings} update={update} />;
      case 'notifications': return <NotificationsTab settings={settings} update={update} />;
      case 'data': return <DataTab />;
      case 'limits': return <LimitsTab settings={settings} />;
      case 'ai': return <AIManagerTab organizationId={settings.organizationId} />;
      default: return null;
    }
  };

  return (
    <div>
      {/* Header with save */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.settings')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('org.settings.subtitle')}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-all ${saved ? 'bg-emerald-500 text-white' : 'btn-primary'}`}>
          {saved ? <><Check className="w-4 h-4" />{t('org.settings.saved')}</> : saving ? '...' : <><Save className="w-4 h-4" />{t('org.settings.save')}</>}
        </button>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">{error}</div>}

      {/* Tabbed layout */}
      <div className="flex flex-col md:flex-row gap-6 min-h-[calc(100vh-8rem)]">
        {/* Left sidebar tabs */}
        <div className="w-full md:w-56 shrink-0">
          <nav className="flex md:block space-x-2 md:space-x-0 md:space-y-0.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none md:sticky md:top-4">
            {TABS.filter(t => t.id !== 'ai' || canAccess('ai')).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 md:gap-3 shrink-0 md:w-full px-3 py-2 md:py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {renderTab()}
        </div>
      </div>
    </div>
  );
};

export default OrgSettingsPage;
