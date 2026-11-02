/**
 * fileUrl приходит в генерацию прямо от клиента: функция не должна скачивать
 * ничего, кроме файлов из Firebase Storage (иначе SSRF к метаданным облака,
 * localhost и т.п.), и не должна идти за редиректом на чужой хост.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/ai', () => ({
  generateWithFallback: vi.fn(async () => ({ response: { text: () => '[]' } })),
  parseJsonLoose: (s: string) => JSON.parse(s),
}));

import { generateAIContent, isAllowedFileUrl, AIGenerateError } from '../utils/ai-generate';

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(new Response(new ArrayBuffer(4), { status: 200, headers: { 'content-type': 'application/pdf' } }));
  vi.stubGlobal('fetch', fetchSpy);
});

const blocked = [
  'http://169.254.169.254/latest/meta-data/',
  'https://metadata.google.internal/computeMetadata/v1/',
  'http://localhost:8888/.netlify/functions/api-finance',
  'file:///etc/passwd',
  'https://firebasestorage.googleapis.com@evil.example.com/x.pdf',
  'https://evil-firebasestorage.googleapis.com/x.pdf',
  'https://firebasestorage.googleapis.com.evil.example.com/x.pdf',
  'not a url',
];

describe('ai-generate fileUrl', () => {
  it.each(blocked)('отклоняет %s и не скачивает его', async (url) => {
    expect(isAllowedFileUrl(url)).toBe(false);
    await expect(generateAIContent({ prompt: 'x', type: 'quiz', fileUrl: url } as any)).rejects.toBeInstanceOf(AIGenerateError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('скачивает файл из Firebase Storage', async () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/app.firebasestorage.app/o/ai-uploads%2Fu1%2Ff.pdf?alt=media&token=t';
    await generateAIContent({ prompt: 'x', type: 'quiz', fileUrl: url } as any);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(isAllowedFileUrl('https://app.firebasestorage.app/x.pdf')).toBe(true);
  });

  it('не идёт за редиректом на внутренний адрес', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));
    await expect(generateAIContent({ prompt: 'x', type: 'quiz',
      fileUrl: 'https://firebasestorage.googleapis.com/v0/b/a/o/f.pdf' } as any)).rejects.toBeInstanceOf(AIGenerateError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
