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
      alert('Could not access microphone. Please grant permissions.');
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
      <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm w-full max-w-sm mx-auto kahoot-font">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-green-100 dark:bg-green-900/40">
          <Mic className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <div className="text-lg font-black text-slate-800 dark:text-white mb-2">{t('quiz.audioRecorded', 'Аудио записано')}</div>
        <p className="text-sm text-slate-500">{t('quiz.readyToSubmit', 'Готово к отправке')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm w-full max-w-md mx-auto kahoot-font transition-all delay-75">
      <div className={`w-28 h-28 rounded-full flex items-center justify-center mb-6 transition-all duration-300 ${isRecording ? 'bg-red-100/50 dark:bg-red-900/20 animate-pulse ring-[8px] ring-red-500/30' : 'bg-slate-100 dark:bg-slate-700/50'}`}>
        <Mic className={`w-14 h-14 ${isRecording ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`} />
      </div>
      
      <div className="text-4xl font-black text-slate-800 dark:text-white mb-8 tabular-nums tracking-widest">
        {formatTime(timer)}
      </div>

      {!isRecording ? (
        <button
          onClick={startRecording}
          disabled={disabled}
          className="w-full py-5 rounded-2xl font-bold text-white text-xl bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-red-500/20"
        >
          {t('quiz.startRecording', 'Начать запись')}
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="w-full py-5 rounded-2xl font-bold text-slate-900 text-xl bg-yellow-400 hover:bg-yellow-500 active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-lg shadow-yellow-400/20"
        >
          <Square className="w-6 h-6 fill-current" /> {t('quiz.stopRecording', 'Остановить')}
        </button>
      )}
    </div>
  );
}
