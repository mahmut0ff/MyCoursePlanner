// Аудит локализации: ключи, которых нет в переводах, и t('key', 'фолбэк') без ключа в ru.json.
// node scripts/i18n-audit.mjs [--json out.json]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const LOCALES = ['ru', 'en', 'kg', 'uz'];
const BASE = 'ru';

export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

export function loadLocale(code) {
  const p = path.join(ROOT, 'src/locales', `${code}.json`);
  return fs.existsSync(p) ? flatten(JSON.parse(fs.readFileSync(p, 'utf8'))) : null;
}

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  }
  return files;
}

/** Все t('key', 'default') из исходников: ключ → фолбэк (первый встретившийся). */
export function collectCalls() {
  const calls = {};
  const re = /\bt\(\s*(['"`])([A-Za-z0-9_.-]+)\1\s*(?:,\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3)?/g;
  for (const f of walk(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) {
      const key = m[2];
      if (!key.includes('.')) continue;
      if (!(key in calls) || (calls[key].fallback == null && m[4] != null)) {
        calls[key] = { fallback: m[4] ?? null, file: path.relative(ROOT, f) };
      }
    }
  }
  return calls;
}

export function audit() {
  const loc = Object.fromEntries(LOCALES.map(c => [c, loadLocale(c)]));
  const base = loc[BASE];
  const calls = collectCalls();
  // Плюральный ключ живёт как key_one/key_other — базового ключа в JSON нет.
  const missingInBase = Object.keys(calls).filter(k => !(k in base) && !(`${k}_other` in base) && !(`${k}_one` in base));
  const report = {};
  for (const c of LOCALES) {
    if (c === BASE) continue;
    const l = loc[c] || {};
    // _few/_many — формы только русского (CLDR); в en/kg/uz их быть не должно.
    const missing = Object.keys(base).filter(k => !(k in l) && !/_(few|many)$/.test(k));
    // Значение совпадает с русским и содержит кириллицу — перевода нет.
    const untranslated = c === 'kg' ? [] : Object.keys(base).filter(k => k in l && l[k] === base[k] && /[А-Яа-яЁё]/.test(String(base[k])));
    report[c] = { missing, untranslated };
  }
  return { calls, missingInBase, report, baseCount: Object.keys(base).length };
}

if (process.argv[1] && process.argv[1].endsWith('i18n-audit.mjs')) {
  const r = audit();
  console.log(`ru keys: ${r.baseCount}; t() keys absent from ru.json: ${r.missingInBase.length}`);
  for (const [c, v] of Object.entries(r.report)) console.log(`${c}: missing ${v.missing.length}, same-as-ru ${v.untranslated.length}`);
  const i = process.argv.indexOf('--json');
  if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify({ ...r, calls: undefined, missingInBaseWithFallback: Object.fromEntries(r.missingInBase.map(k => [k, r.calls[k]])) }, null, 1));
  if (process.argv.includes('--strict') && (r.missingInBase.length || Object.values(r.report).some(v => v.missing.length))) process.exit(1);
}
