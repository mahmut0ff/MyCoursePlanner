import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary — catches unhandled React render errors
 * and shows a recovery UI instead of a white screen.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
          <div className="max-w-md w-full text-center">
            {/* Icon */}
            <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
              Что-то пошло не так
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
              Произошла непредвиденная ошибка. Попробуйте обновить страницу или вернуться на главную.
            </p>

            {/* Error details (dev only) */}
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/30 rounded-xl">
                <summary className="text-xs font-bold text-red-600 dark:text-red-400 cursor-pointer mb-2">
                  Детали ошибки (dev)
                </summary>
                <pre className="text-[11px] text-red-700 dark:text-red-300 whitespace-pre-wrap break-all font-mono leading-relaxed">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg"
              >
                Обновить страницу
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                На главную
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
