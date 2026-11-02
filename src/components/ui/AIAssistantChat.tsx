import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiAIManagerChat } from '../../lib/api';
import type { OrgAIManagerSettings } from '../../types';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
}

interface Props {
  organizationId: string;
  settings: OrgAIManagerSettings;
}

export const AIAssistantChat: React.FC<Props> = ({ organizationId, settings }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize with greeting
  useEffect(() => {
    if (messages.length === 0 && settings.greetingMessage) {
      // Intercept the legacy English default that might be saved in existing database records
      const greeting = settings.greetingMessage === 'Hello! How can I help you today?' 
        ? t('aiChat.greeting', 'Здравствуйте! Чем я могу вам помочь?')
        : settings.greetingMessage;

      setMessages([{
        id: 'greeting',
        role: 'assistant',
        content: greeting
      }]);
    }
  }, [settings.greetingMessage, messages.length, t]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isLoading]);

  const handleSend = async (overrideText?: string) => {
    const text = overrideText || inputValue.trim();
    if (!text) return;
    
    setInputValue('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsLoading(true);

    try {
      // Send chat history to AI Manager backend
      const res = await apiAIManagerChat(organizationId, newHistory);
      
      const aiMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: res.reply || t('aiChat.replyError', 'Не удалось получить ответ. Попробуйте ещё раз.')
      };
      setMessages(prev => [...prev, aiMsg]);
      
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsg = err?.message || t('aiChat.unknownError', 'Неизвестная ошибка');
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('aiChat.errorPrefix', '⚠️ Ошибка: {{msg}}', { msg: errorMsg })
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedQuestions = settings.faq?.slice(0, 3).map(f => f.question) || [
    t('aiChat.suggest1', 'Какие курсы вы предлагаете?'),
    t('aiChat.suggest2', 'Связь с менеджером'),
    t('aiChat.suggest3', 'Где вы находитесь?')
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-float flex items-center justify-center transition-colors z-50"
        aria-label={t('aiChat.open', 'Открыть SabakHub AI')}
      >
        <Sparkles className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[360px] sm:w-[400px] h-[600px] max-h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop flex flex-col z-50 overflow-hidden">
      
      {/* ── Header ── */}
      <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary-100 dark:bg-primary-950 rounded-md flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">SabakHub AI</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              {t('presence.online', 'В сети')}
            </p>
          </div>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Messages Area ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-white dark:bg-slate-900">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[85%] rounded-[12px] px-3 py-2 text-sm leading-5 ${
                msg.role === 'user' 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
              }`}
            >
              {/* Very simple markdown converter: breaks \n into <br /> and handles bold text (**) */}
              {msg.content.split('\n').map((line, i) => {
                const parts = line.split(/(\*\*.*?\*\*)/g);
                return (
                  <span key={i}>
                    {parts.map((part, j) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={j}>{part.slice(2, -2)}</strong>;
                      }
                      return <span key={j}>{part}</span>;
                    })}
                    {i < msg.content.split('\n').length - 1 && <br />}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-[12px] px-3 py-2.5 flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
              </span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* ── Suggestions & Input Box ── */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shrink-0">
        {/* Suggested Pickers */}
        {messages.length <= 1 && !isLoading && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                className="h-7 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('aiChat.placeholder', 'Введите сообщение...')}
            className="input h-9 pr-10"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isLoading}
            className="absolute right-1 w-7 h-7 flex items-center justify-center bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-md transition-colors"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="text-[11px] text-center text-slate-400 dark:text-slate-500 mt-2">
          {t('aiChat.disclaimer', 'ИИ может допускать неточности. Уточняйте важную информацию у менеджеров.')}
        </div>
      </div>
    </div>
  );
};
