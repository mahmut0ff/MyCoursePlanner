import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Loader2, Check, X, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiAIGradeDictation } from '../../lib/api';
import type { UserProfile, GradeSchema } from '../../types';

interface VoiceGradeDictatorProps {
  isOpen: boolean;
  onClose: () => void;
  column: any; // We just need the title
  students: UserProfile[];
  schema?: GradeSchema;
  mode?: 'gradebook' | 'journal';
  onApply: (grades: { studentId: string; value: number | null; comment?: string; status?: string }[]) => void;
}

const VoiceGradeDictator: React.FC<VoiceGradeDictatorProps> = ({ isOpen, onClose, column, students, schema, mode = 'gradebook', onApply }) => {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [parsedGrades, setParsedGrades] = useState<{ studentId: string; value: number | null; status?: string; comment?: string; studentName: string }[] | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobChunk[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Type for blob chunk
  type BlobChunk = Blob;

  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      setParsedGrades(null);
      setError('');
    }
    return () => {
      stopRecording();
    };
  }, [isOpen]);

  const startRecording = async () => {
    try {
      setError('');
      setParsedGrades(null);
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener('stop', handleStop);

      mediaRecorder.start();
      setRecording(true);
    } catch (err: any) {
      setError(t('gradebook.micError', 'Ошибка доступа к микрофону'));
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setRecording(false);
  };

  const handleStop = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    
    // Convert to Base64
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      await processAudio(base64data);
    };
  };

  const processAudio = async (base64Audio: string) => {
    setProcessing(true);
    setError('');
    try {
      const studentsList = students.map(s => ({ id: s.uid, name: s.displayName }));
      
      const result = await apiAIGradeDictation({
        audioBase64: base64Audio,
        mimeType: 'audio/webm',
        students: studentsList,
        schema,
        mode
      });

      if (result && Array.isArray(result.data)) {
        // Map back names for the review UI
        const mapped = result.data.map((item: any) => {
          const student = students.find(s => s.uid === item.studentId);
          return {
            ...item,
            studentName: student ? student.displayName : 'Unknown'
          };
        }).filter((item: any) => item.studentName !== 'Unknown');

        setParsedGrades(mapped);
      } else {
        setError(t('gradebook.aiParseError', 'Не удалось распознать оценки'));
      }
    } catch (err: any) {
      setError(err.message || t('gradebook.ui.voice.processFailed', 'Не удалось обработать запись'));
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end justify-end p-0 animate-fade-in pointer-events-none">
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-[420px] shadow-float overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700 pointer-events-auto">
        
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-slate-400" />
              {t('gradebook.ui.voice.title', 'Голосовое выставление ({{column}})', { column: column?.title })}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('gradebook.ui.voice.subtitle', 'Продиктуйте оценки — AI разнесёт их по ученикам')}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center shrink-0 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 pt-2 pb-4">
          {error && (
            <div className="mb-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{t('common.error', 'Ошибка')}</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {!parsedGrades ? (
            <div className="flex flex-col items-center justify-center py-8">
              {processing ? (
                <>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 relative">
                    <div className="absolute inset-0 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                    <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{t('gradebook.ui.voice.recognizing', 'Распознавание речи...')}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs">{t('gradebook.ui.voice.recognizingDesc', 'Искусственный интеллект анализирует запись и сопоставляет имена учеников.')}</p>
                </>
              ) : (
                <>
                  <button
                    onClick={recording ? stopRecording : startRecording}
                    className={`
                      w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors
                      ${recording
                        ? 'bg-rose-500 hover:bg-rose-600'
                        : 'bg-primary-600 hover:bg-primary-700'}
                    `}
                  >
                    {recording ? (
                      <Square className="w-5 h-5 text-white fill-current" />
                    ) : (
                      <Mic className="w-6 h-6 text-white" />
                    )}
                  </button>

                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 text-center">
                    {recording ? t('gradebook.ui.voice.recording', 'Идёт запись...') : t('gradebook.ui.voice.tapToStart', 'Нажмите, чтобы начать')}
                  </h4>
                  
                  {recording ? (
                    <div className="flex items-center gap-1.5 h-6">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="w-1.5 bg-rose-500 rounded-full animate-soundwave" style={{ animationDelay: `${i * 0.15}s` }}></div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs leading-relaxed">
                      {t('gradebook.ui.voice.hint', 'Автоматически распознаёт речь на любом языке. Просто назовите имена и их оценки.')}
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-[300px]">
              <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('gradebook.ui.voice.parsed', 'Распознанные оценки:')}</h4>
              
              {parsedGrades.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="flex items-center justify-center mb-2">
                    <AlertCircle className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{t('gradebook.ui.voice.noneFound', 'Оценки не найдены')}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('gradebook.ui.voice.noneFoundDesc', 'Система не услышала имена или оценки из текущего списка студентов.')}</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar rounded-lg border border-slate-200 dark:border-slate-700">
                  {parsedGrades.map((g, idx) => (
                    <div key={idx} className="flex items-center justify-between min-h-[40px] px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{g.studentName}</div>
                      <div className="flex items-center gap-2">
                        {g.comment && <span className="text-xs text-slate-500 max-w-[150px] truncate">{g.comment}</span>}
                        <div className={`inline-flex items-center justify-center h-5 px-1.5 rounded text-xs font-medium tabular-nums min-w-[28px] ${mode === 'journal'
                          ? (g.status === 'present' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                             g.status === 'absent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                             g.status === 'late' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                             'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400')
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>
                          {mode === 'journal' 
                            ? (g.status === 'present' ? t('journal.present', 'Присутствует') :
                               g.status === 'absent' ? t('journal.absent', 'Отсутствует') :
                               g.status === 'late' ? t('journal.late', 'Опоздал') :
                               g.status === 'excused' ? t('gradebook.ui.voice.excusedShort', 'По ув. причине') : '-')
                            : (g.value !== null ? g.value : '-')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center justify-end gap-2 shrink-0">
                <button
                  onClick={() => setParsedGrades(null)}
                  className="btn-ghost"
                >
                  {t('gradebook.ui.voice.rerecord', 'Перезаписать')}
                </button>
                <button
                  onClick={() => {
                    onApply(parsedGrades);
                    onClose();
                  }}
                  disabled={parsedGrades.length === 0}
                  className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {t('gradebook.ui.voice.applyAll', 'Применить ко всем')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceGradeDictator;
