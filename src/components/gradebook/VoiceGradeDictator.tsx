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
  schema: GradeSchema;
  onApply: (grades: { studentId: string; value: number | null; comment?: string }[]) => void;
}

const VoiceGradeDictator: React.FC<VoiceGradeDictatorProps> = ({ isOpen, onClose, column, students, schema, onApply }) => {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [parsedGrades, setParsedGrades] = useState<{ studentId: string; value: number | null; comment?: string; studentName: string }[] | null>(null);

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
        schema
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
      setError(err.message || 'Error processing audio');
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700/50">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Mic className="w-5 h-5 text-indigo-500" />
              Голсовое выставление ({column?.title})
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Gemini Audio AI Intelligence</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Ошибка</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {!parsedGrades ? (
            <div className="flex flex-col items-center justify-center py-8">
              {processing ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-6 relative">
                    <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Распознавание речи...</h4>
                  <p className="text-sm text-slate-500 text-center max-w-xs">Искусственный интеллект анализирует запись и сопоставляет имена учеников.</p>
                </>
              ) : (
                <>
                  <button
                    onClick={recording ? stopRecording : startRecording}
                    className={`
                      w-24 h-24 rounded-full flex items-center justify-center mb-8 transition-all hover:scale-105 active:scale-95 shadow-xl
                      ${recording 
                        ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/30' 
                        : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'}
                    `}
                  >
                    {recording ? (
                      <Square className="w-8 h-8 text-white fill-current" />
                    ) : (
                      <Mic className="w-10 h-10 text-white" />
                    )}
                  </button>

                  <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mb-3 text-center">
                    {recording ? 'Идет запись...' : 'Нажмите чтобы начать'}
                  </h4>
                  
                  {recording ? (
                    <div className="flex items-center gap-1.5 h-6">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="w-1.5 bg-rose-500 rounded-full animate-soundwave" style={{ animationDelay: `${i * 0.15}s` }}></div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center max-w-xs font-medium leading-relaxed">
                      Автоматически распознает <span className="text-indigo-600 dark:text-indigo-400">любой язык</span> речи. 
                      Просто назовите имена и их оценки.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-[300px]">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 ml-1">Распознанные оценки:</h4>
              
              {parsedGrades.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
                    <AlertCircle className="w-8 h-8 text-amber-500" />
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white mb-1">Оценки не найдены</p>
                  <p className="text-sm text-slate-500">Система не услышала имена или оценки из текущего списка студентов.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                  {parsedGrades.map((g, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl">
                      <div className="font-semibold text-slate-900 dark:text-white">{g.studentName}</div>
                      <div className="flex items-center gap-3">
                        {g.comment && <span className="text-xs italic text-slate-500 max-w-[150px] truncate">{g.comment}</span>}
                        <div className="px-3 py-1 bg-white dark:bg-slate-800 border-2 border-indigo-500/20 dark:border-indigo-500/40 rounded-lg font-bold text-indigo-700 dark:text-indigo-400 shadow-sm min-w-[40px] text-center">
                          {g.value !== null ? g.value : '-'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setParsedGrades(null)}
                  className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-colors text-sm"
                >
                  Перезаписать
                </button>
                <button
                  onClick={() => {
                    onApply(parsedGrades);
                    onClose();
                  }}
                  disabled={parsedGrades.length === 0}
                  className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 text-sm"
                >
                  <Check className="w-5 h-5" />
                  Применить ко всем
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
