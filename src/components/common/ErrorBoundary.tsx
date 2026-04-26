import React from 'react';
import { RefreshCw, WifiOff, AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional fallback — if omitted, uses the built-in UI */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

/**
 * Global ErrorBoundary that specifically handles dynamic import (chunk load)
 * failures — the #1 cause of white-screen crashes in SPAs after deploys.
 *
 * When a lazy() chunk fails to load it throws a predictable error that we
 * detect and offer a one-click reload instead of an opaque crash screen.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const isChunkError = ErrorBoundary.isChunkLoadError(error);
    return { hasError: true, error, isChunkError };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Auto-reload once for chunk errors (deploy mismatch)
    const alreadyRetried = sessionStorage.getItem('chunk_error_retry');
    if (ErrorBoundary.isChunkLoadError(error) && !alreadyRetried) {
      sessionStorage.setItem('chunk_error_retry', '1');
      window.location.reload();
      return;
    }

    console.error('[ErrorBoundary] Caught:', error, info);
  }

  /**
   * Detect dynamic import / chunk loading failures.
   * Vite, Webpack, and browsers all throw slightly different messages,
   * so we match broadly.
   */
  static isChunkLoadError(error: Error): boolean {
    const msg = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';
    return (
      msg.includes('loading chunk') ||
      msg.includes('loading module') ||
      msg.includes('dynamically imported module') ||
      msg.includes('failed to fetch') ||
      msg.includes('importing a module script failed') ||
      msg.includes('loading css chunk') ||
      name === 'chunkerror' ||
      name === 'chunkloaderror'
    );
  }

  handleReload = () => {
    // Clear the retry guard so future deploys can auto-retry again
    sessionStorage.removeItem('chunk_error_retry');
    window.location.reload();
  };

  handleGoHome = () => {
    sessionStorage.removeItem('chunk_error_retry');
    window.location.href = '/dashboard';
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, isChunkError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const { isChunkError, error } = this.state;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <div className="max-w-md w-full text-center">
          {/* Icon */}
          <div className={`mx-auto mb-6 w-16 h-16 rounded-2xl flex items-center justify-center ${
            isChunkError
              ? 'bg-amber-100 dark:bg-amber-900/30'
              : 'bg-red-100 dark:bg-red-900/30'
          }`}>
            {isChunkError
              ? <WifiOff className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              : <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            }
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {isChunkError ? 'Обновление приложения' : 'Что-то пошло не так'}
          </h1>

          {/* Description */}
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            {isChunkError
              ? 'Вышла новая версия приложения. Перезагрузите страницу, чтобы получить обновление.'
              : 'Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу или вернуться на главную.'
            }
          </p>

          {/* Error detail (collapsed by default for non-chunk errors) */}
          {!isChunkError && error && (
            <details className="mb-6 text-left">
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                Подробности ошибки
              </summary>
              <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs text-red-600 dark:text-red-400 overflow-x-auto whitespace-pre-wrap break-words border border-slate-200 dark:border-slate-700">
                {error.message}
              </pre>
            </details>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium text-sm transition-colors shadow-md shadow-primary-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              Перезагрузить
            </button>

            {!isChunkError && (
              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                На главную
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
