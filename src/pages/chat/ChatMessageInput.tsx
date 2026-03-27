import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Paperclip, X, File, Image as ImageIcon, Reply, Smile } from 'lucide-react';
import type { ChatMessage } from '../../types';
import EmojiPicker, { Theme } from 'emoji-picker-react';

interface ChatMessageInputProps {
  onSendMessage: (text: string, files?: File[], replyTo?: ChatMessage['replyTo']) => Promise<void>;
  disabled?: boolean;
  replyingTo?: ChatMessage | null;
  onCancelReply?: () => void;
}

export default function ChatMessageInput({ onSendMessage, disabled, replyingTo, onCancelReply }: ChatMessageInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Close emoji picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  // Focus textarea when reply is set
  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = text.trim();
    if (!cleanText && files.length === 0 && disabled) return;
    
    if (isSubmitting || (files.length === 0 && !cleanText)) return;

    const replyData = replyingTo ? {
      messageId: replyingTo.id,
      text: replyingTo.text?.slice(0, 100) || '📎',
      senderName: replyingTo.senderName || 'User',
    } : undefined;

    try {
      setIsSubmitting(true);
      setShowEmojiPicker(false);
      await onSendMessage(cleanText, files.length > 0 ? files : undefined, replyData);
      setText('');
      setFiles([]);
      onCancelReply?.();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && replyingTo) {
      onCancelReply?.();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setFiles((prev: File[]) => [...prev, ...selected]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev: File[]) => prev.filter((_: File, i: number) => i !== index));
  };

  return (
    <form 
      onSubmit={handleSubmit}
      className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800"
    >
      {/* Reply Preview */}
      {replyingTo && (
        <div className="px-4 pt-3 flex items-start gap-3">
          <div className="flex-1 border-l-2 border-primary-500 pl-3 py-1 bg-primary-50/50 dark:bg-primary-500/5 rounded-r-lg">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Reply className="w-3.5 h-3.5 text-primary-500" />
              <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">
                {replyingTo.senderName || 'User'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
              {replyingTo.text || '📎 Вложение'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mt-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="p-4">
        {/* File Previews */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {files.map((file: File, i: number) => (
              <div key={i} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                {file.type.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-primary-500" /> : <File className="w-4 h-4 text-slate-500" />}
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                  {file.name}
                </span>
                <button 
                  type="button" 
                  onClick={() => removeFile(i)}
                  className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                  disabled={isSubmitting}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-2 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 transition-colors">
          
          {/* Attachment Button */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            multiple 
            disabled={disabled || isSubmitting}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isSubmitting}
            className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-xl transition-colors shrink-0 disabled:opacity-50"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Emoji Button (Hidden on strict mobile, shown safely on sm and above) */}
          <div className="relative hidden sm:block" ref={emojiPickerRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={disabled || isSubmitting}
              className={`p-2 rounded-xl transition-colors shrink-0 disabled:opacity-50 ${
                showEmojiPicker 
                  ? 'text-primary-500 bg-primary-50 dark:bg-primary-500/10' 
                  : 'text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10'
              }`}
            >
              <Smile className="w-5 h-5" />
            </button>
            
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-2 z-50 shadow-xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <EmojiPicker
                  theme={document.documentElement.classList.contains('dark') ? Theme.DARK : Theme.LIGHT}
                  onEmojiClick={(emojiData) => {
                    setText((prev) => prev + emojiData.emoji);
                  }}
                  searchDisabled={false}
                  skinTonesDisabled
                  lazyLoadEmojis
                />
              </div>
            )}
          </div>

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.typeMessage', 'Введите сообщение...')}
            className="flex-1 max-h-[120px] min-h-[40px] py-2 bg-transparent resize-none outline-none text-slate-900 dark:text-white pb-3 no-scrollbar"
            disabled={disabled || isSubmitting}
            rows={1}
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={isSubmitting || disabled || (files.length === 0 && !text.trim())}
            className="p-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-600 text-white rounded-xl transition-all shrink-0 shadow-sm disabled:shadow-none"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
