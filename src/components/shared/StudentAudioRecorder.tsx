import { useState, useRef, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  onRecordingComplete: (blob: Blob) => void;
  disabled?: boolean;
}

export function StudentAudioRecorder({ onRecordingComplete, disabled }: Props) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [hasRecorded, setHasRecorded] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecordingComplete(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setHasRecorded(false);
      setTimer(0);
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Mic error:', err);
      alert(t('audio.micDenied', 'Нет доступа к микрофону. Разрешите доступ в настройках браузера.'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setHasRecorded(true);
      clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (hasRecorded) {
    return (
      <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-auto">
        <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2 bg-emerald-100 dark:bg-emerald-900/30">
          <Mic className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5">{t('quiz.audioRecorded', 'Аудио записано')}</div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('quiz.readyToSubmit', 'Готово к отправке')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 w-full max-w-md mx-auto">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 transition-colors ${isRecording ? 'bg-red-100 dark:bg-red-900/30 animate-pulse ring-4 ring-red-500/20' : 'bg-slate-100 dark:bg-slate-700/50'}`}>
        <Mic className={`w-6 h-6 ${isRecording ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`} />
      </div>
      
      <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-4 tabular-nums">
        {formatTime(timer)}
      </div>

      {!isRecording ? (
        <button
          onClick={startRecording}
          disabled={disabled}
          className="btn-danger w-full inline-flex items-center justify-center gap-1.5"
        >
          {t('quiz.startRecording', 'Начать запись')}
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="btn-secondary w-full inline-flex items-center justify-center gap-1.5"
        >
          <Square className="w-3.5 h-3.5 fill-current" /> {t('quiz.stopRecording', 'Остановить')}
        </button>
      )}
    </div>
  );
}
