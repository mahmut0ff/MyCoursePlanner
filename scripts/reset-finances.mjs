/**
 * Полный сброс финансов одной организации: financeTransactions + studentPaymentPlans.
 *
 * Порядок работы — три шага, пропустить нельзя:
 *   1. Выгрузка + dry-run (ничего не удаляет, показывает что попадёт под нож):
 *        node scripts/reset-finances.mjs --org=<orgId>
 *   2. Смотрите сводку и файлы бэкапа. Если всё верно — удаление:
 *        node scripts/reset-finances.mjs --org=<orgId> --confirm=<orgId>
 *   3. Если что-то пошло не так — возврат из бэкапа:
 *        node scripts/reset-finances.mjs --restore=finance-backup/<папка>
 *
 * Флаги:
 *   --org=<id>       обязателен: организация, чьи финансы сбрасываем
 *   --key=<path>     service account JSON (или переменная GOOGLE_APPLICATION_CREDENTIALS)
 *   --period=YYYY-MM только один месяц; без флага сносится ВСЯ история финансов
 *   --confirm=<id>   должен ПОБУКВЕННО совпасть с --org, иначе скрипт откажется удалять
 *   --keep-payroll   не трогать транзакции выплат зарплат (у них есть payrollPeriodId)
 *   --out=<dir>      куда класть бэкап, по умолчанию ./finance-backup
 *
 * Подписка организации на платформу (коллекции subscriptions/payments) НЕ трогается.
 *
 * Креды: нужен service account JSON — Firebase Console → Project settings →
 * Service accounts → Generate new private key. В .env репозитория кредов нет, а
 * `netlify dev:exec` не подходит: FIREBASE_PRIVATE_KEY помечен в Netlify секретным
 * и приезжает маской '****'. Скачанный JSON держите вне git и удалите после сброса.
 */
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

config();

const TARGETS = ['financeTransactions', 'studentPaymentPlans'];
const BATCH_SIZE = 400; // лимит Firestore — 500 операций на batch, берём с запасом

// ── аргументы ────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const outDir = typeof args.out === 'string' ? args.out : 'finance-backup';

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

// ── подключение ──────────────────────────────────────────────────────────────
// Основной путь — service account JSON: --key=<путь> или GOOGLE_APPLICATION_CREDENTIALS.
// Путь через `netlify dev:exec` не работает: FIREBASE_PRIVATE_KEY помечен в Netlify как
// секрет, и CLI подставляет маску '****…' вместо значения — ловим это отдельно, иначе
// firebase-admin падает с невнятным 'Invalid PEM formatted message'.
const keyPath = typeof args.key === 'string' ? args.key : process.env.GOOGLE_APPLICATION_CREDENTIALS;

let projectId;
let credential;

if (keyPath) {
  let sa;
  try {
    sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch (e) {
    die(`Не читается service account JSON по пути ${keyPath}: ${e.message}`);
  }
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    die(`${keyPath} не похож на service account: нет project_id / client_email / private_key`);
  }
  projectId = sa.project_id;
  credential = cert({ projectId, clientEmail: sa.client_email, privateKey: sa.private_key });
} else {
  projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (privateKey && /^\*{4,}/.test(privateKey)) {
    die(
      'FIREBASE_PRIVATE_KEY пришёл замаскированным (****) — так Netlify отдаёт секретные\n' +
        '   переменные наружу. Скачайте service account JSON в Firebase Console:\n' +
        '   Project settings → Service accounts → Generate new private key, и запустите\n' +
        '   скрипт с ним:\n\n' +
        '   node scripts/reset-finances.mjs --key=<путь-к-json> --org=<orgId>',
    );
  }
  if (!projectId || !clientEmail || !privateKey) {
    // ADC — вариант без создания нового приватного ключа: креды берутся из вашего же
    // логина (gcloud auth application-default login). Ключ при этом нигде не лежит.
    const adcProject = projectId || (typeof args.project === 'string' ? args.project : null);
    if (!adcProject) {
      die(
        'Нет кредов Firebase. Два варианта:\n\n' +
          '   1. Service account JSON — Firebase Console → Project settings → Service\n' +
          '      accounts → Generate new private key, затем:\n' +
          '      node scripts/reset-finances.mjs --key=<путь-к-json> --org=<orgId>\n\n' +
          '   2. Без нового ключа, через свой же логин Google:\n' +
          '      gcloud auth application-default login\n' +
          '      node scripts/reset-finances.mjs --project=<projectId> --org=<orgId>',
      );
    }
    projectId = adcProject;
    credential = applicationDefault();
  } else {
    credential = cert({ projectId, clientEmail, privateKey });
  }
}

initializeApp({ credential, projectId });
const db = getFirestore();

const money = (n) => Number(n || 0).toLocaleString('ru-RU');

// ── батчевая запись/удаление ─────────────────────────────────────────────────
async function commitInBatches(items, apply, label) {
  let done = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const item of items.slice(i, i + BATCH_SIZE)) apply(batch, item);
    await batch.commit();
    done += Math.min(BATCH_SIZE, items.length - i);
    console.log(`   ${label}: ${done} / ${items.length}`);
  }
}

// ── режим восстановления ─────────────────────────────────────────────────────
/**
 * JSON.stringify разбирает Firestore Timestamp на {_seconds,_nanoseconds}. Без обратной
 * сборки восстановленный документ получил бы на месте даты обычную мапу — поле молча
 * перестало бы быть датой, и это вскрылось бы уже на отчётах. Собираем назад.
 */
function reviveTimestamps(value) {
  if (Array.isArray(value)) return value.map(reviveTimestamps);
  if (value && typeof value === 'object') {
    if (typeof value._seconds === 'number' && typeof value._nanoseconds === 'number') {
      return new Timestamp(value._seconds, value._nanoseconds);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, reviveTimestamps(v)]));
  }
  return value;
}

async function restore(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) die(`В ${dir} нет .json файлов бэкапа`);

  console.log(`\n♻️  Восстановление из ${dir}\n`);
  for (const file of files) {
    const collection = file.replace(/\.json$/, '');
    if (!TARGETS.includes(collection)) {
      console.log(`   пропускаю ${file} — не финансовая коллекция`);
      continue;
    }
    const docs = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    console.log(`\n📥 ${collection}: ${docs.length} документов`);
    await commitInBatches(
      docs,
      (batch, { id, ...data }) => batch.set(db.collection(collection).doc(id), reviveTimestamps(data)),
      'записано',
    );
  }
  console.log('\n✅ Восстановление завершено.\n');
}

if (typeof args.restore === 'string') {
  await restore(args.restore);
  process.exit(0);
}

// ── основной сценарий ────────────────────────────────────────────────────────
const orgId = typeof args.org === 'string' ? args.org : null;
if (!orgId) die('Укажите организацию: --org=<orgId>');

const orgSnap = await db.collection('organizations').doc(orgId).get();
if (!orgSnap.exists) die(`Организация ${orgId} не найдена — проверьте id, чтобы не снести чужие данные`);

console.log(`\n🏢 Организация: ${orgSnap.data()?.name || '(без названия)'}  [${orgId}]`);
console.log(`   проект Firebase: ${projectId}`);

// Запрос строго по одному полю равенства — составные индексы в этом проекте не задеплоены.
const data = {};
for (const collection of TARGETS) {
  const snap = await db.collection(collection).where('organizationId', '==', orgId).get();
  data[collection] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Ограничение по месяцу. У транзакций месяц берём из `date` ('YYYY-MM-DD'), у счетов —
// из `period` ('YYYY-MM'), который проставляет ежемесячный биллинг; у счетов, заведённых
// руками, period нет, для них откатываемся на createdAt.
const period = typeof args.period === 'string' ? args.period : null;
if (period && !/^\d{4}-\d{2}$/.test(period)) die(`--period ожидает формат YYYY-MM, получено «${period}»`);

const planMonth = (p) => p.period || String(p.createdAt || '').slice(0, 7);

if (period) {
  // Месяц вычисляется из строки. Документ, у которого дата лежит объектом (Timestamp)
  // или отсутствует, в выборку не попадёт — и месяц окажется вычищен не до конца.
  // Молчать об этом нельзя: пропуск при удалении выглядит как «всё удалилось».
  const blindTx = data.financeTransactions.filter((t) => typeof t.date !== 'string');
  const blindPlans = data.studentPaymentPlans.filter(
    (p) => typeof p.period !== 'string' && typeof p.createdAt !== 'string',
  );
  if (blindTx.length || blindPlans.length) {
    console.log(`\n⚠️  Не удалось определить месяц: ${blindTx.length} операций, ${blindPlans.length} счетов.`);
    console.log(`   Их даты лежат не строкой. В выборку они НЕ попали и удалены не будут —`);
    console.log(`   после сброса ${period} останется частично непочищенным. Ищите их вручную.`);
  }

  data.financeTransactions = data.financeTransactions.filter((t) => String(t.date || '').startsWith(period));
  data.studentPaymentPlans = data.studentPaymentPlans.filter((p) => planMonth(p) === period);
}

let transactions = data.financeTransactions;
const payouts = transactions.filter((t) => t.payrollPeriodId);
if (args['keep-payroll']) {
  transactions = transactions.filter((t) => !t.payrollPeriodId);
  data.financeTransactions = transactions;
}
const plans = data.studentPaymentPlans;

// При месячном сбросе связи рвутся поперёк месяцев: оплата, проведённая в этом месяце,
// могла закрывать счёт другого месяца. Такой счёт остаётся, но его paidAmount больше
// ничем не подтверждён — деньги в отчётах есть, операции под ними нет. Считаем это.
const doomedPlanIds = new Set(plans.map((p) => p.id));
const orphanedPayments = period
  ? transactions.filter((t) => t.paymentPlanId && !doomedPlanIds.has(t.paymentPlanId))
  : [];

// ── сводка ───────────────────────────────────────────────────────────────────
const byType = {};
for (const t of transactions) {
  const key = `${t.type} / ${t.categoryId || '—'}`;
  byType[key] = byType[key] || { count: 0, sum: 0 };
  byType[key].count += 1;
  byType[key].sum += Number(t.amount || 0);
}
const dates = transactions.map((t) => t.date).filter(Boolean).sort();
const billed = plans.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
const paid = plans.reduce((s, p) => s + Number(p.paidAmount || 0), 0);

console.log(`\n📊 Под удаление попадает${period ? ` (только период ${period})` : ' (ВСЯ история)'}:\n`);
console.log(`   financeTransactions — ${transactions.length} операций`);
if (dates.length) console.log(`      период: ${dates[0]} … ${dates[dates.length - 1]}`);
for (const [key, { count, sum }] of Object.entries(byType).sort((a, b) => b[1].sum - a[1].sum)) {
  console.log(`      ${key.padEnd(28)} ${String(count).padStart(5)} шт   ${money(sum).padStart(12)}`);
}
console.log(`\n   studentPaymentPlans — ${plans.length} счетов`);
console.log(`      выставлено: ${money(billed)}`);
console.log(`      оплачено:   ${money(paid)}`);

if (orphanedPayments.length) {
  const sum = orphanedPayments.reduce((s, t) => s + Number(t.amount || 0), 0);
  console.log(`\n⚠️  ${orphanedPayments.length} оплат этого месяца (${money(sum)}) закрывали счета ДРУГИХ`);
  console.log(`   месяцев. Сами счета останутся, но их «оплачено» больше ничем не подтверждено:`);
  console.log(`   в отчётах деньги будут, операций под ними — нет. Список в orphaned-payments.json.`);
}

if (payouts.length && !args['keep-payroll']) {
  console.log(`\n⚠️  Среди операций ${payouts.length} выплат зарплат (payrollPeriodId).`);
  console.log(`   Коллекция payrollPeriods НЕ чистится: её периоды останутся помечены`);
  console.log(`   как выплаченные, а транзакций под ними уже не будет. Если это не нужно —`);
  console.log(`   перезапустите с флагом --keep-payroll.`);
}

// ── бэкап (делается всегда, даже в dry-run) ──────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(outDir, `${orgId}${period ? `-${period}` : '-all'}-${stamp}`);
mkdirSync(backupDir, { recursive: true });
for (const collection of TARGETS) {
  writeFileSync(join(backupDir, `${collection}.json`), JSON.stringify(data[collection], null, 2), 'utf8');
}
if (orphanedPayments.length) {
  // Не в TARGETS — restore этот файл пропустит, он для разбора глазами.
  writeFileSync(
    join(backupDir, 'orphaned-payments.json'),
    JSON.stringify(orphanedPayments, null, 2),
    'utf8',
  );
}
console.log(`\n💾 Бэкап: ${backupDir}`);

// ── удаление ─────────────────────────────────────────────────────────────────
if (args.confirm !== orgId) {
  console.log(`\n🔍 Это dry-run — ничего не удалено.`);
  console.log(`   Проверьте сводку и бэкап. Для реального удаления:\n`);
  const flags = process.argv.slice(2).filter((a) => !a.startsWith('--confirm'));
  console.log(`   node scripts/reset-finances.mjs ${flags.join(' ')} --confirm=${orgId}\n`);
  process.exit(0);
}

console.log(`\n🗑️  Удаляю…\n`);
for (const collection of TARGETS) {
  if (data[collection].length === 0) continue;
  console.log(`   ${collection}:`);
  await commitInBatches(
    data[collection],
    (batch, doc) => batch.delete(db.collection(collection).doc(doc.id)),
    '   удалено',
  );
}

console.log(`\n✅ Готово. Удалено: ${transactions.length} операций, ${plans.length} счетов.`);
console.log(`   Откат: node scripts/reset-finances.mjs --restore=${backupDir}\n`);
