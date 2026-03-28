import { useState, useRef, useCallback, useEffect } from 'react';

interface UseSpeechToTextOptions {
  /** Language code for speech recognition (default: 'ru-RU') */
  lang?: string;
  /** Whether to continuously listen until explicitly stopped */
  continuous?: boolean;
  /** Called whenever interim/final transcript is produced */
  onTranscript?: (text: string, isFinal: boolean) => void;
}

interface UseSpeechToTextReturn {
  /** Whether we are currently listening */
  isListening: boolean;
  /** The current interim transcript */
  transcript: string;
  /** Whether the browser supports SpeechRecognition */
  isSupported: boolean;
  /** Start listening */
  startListening: () => void;
  /** Stop listening */
  stopListening: () => void;
  /** Toggle listening on/off */
  toggleListening: () => void;
}

/**
 * Custom hook wrapping Web Speech API's SpeechRecognition.
 * Works on Chrome, Edge, Safari 14.1+, and most modern browsers.
 */
export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
  const { lang = 'ru-RU', continuous = true, onTranscript } = options;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const isSupported = !!SpeechRecognition;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return;
    // If already listening, stop first
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript);
        onTranscript?.(finalTranscript, true);
      } else if (interimTranscript) {
        setTranscript(interimTranscript);
        onTranscript?.(interimTranscript, false);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('SpeechRecognition error:', event.error);
      if (event.error !== 'aborted') {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [SpeechRecognition, lang, continuous, onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return { isListening, transcript, isSupported, startListening, stopListening, toggleListening };
}
