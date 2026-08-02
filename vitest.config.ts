import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    // `.claude/worktrees` — рабочие копии репозитория, которые агентские сессии
    // создают внутри проекта. Без этого исключения vitest подхватывает КАЖДУЮ
    // копию: один и тот же тест выполняется по разу на worktree, прогон растёт
    // кратно их числу, а в отчёте появляются падения из чужого, давно
    // отставшего коммита — то есть верификация собственных правок перестаёт
    // что-либо значить. `dist` и `netlify/functions` в сборке тестов не нужны
    // по той же причине: там лежат артефакты, а не исходники.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/worktrees/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
