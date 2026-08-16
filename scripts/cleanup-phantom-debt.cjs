/**
 * Чистка фантомного долга My Academy: счета несуществующих людей и тестовые данные.
 *
 * ── Что такое «призрак» ──────────────────────────────────────────────────────
 * Счёт, чей студент не существует нигде: нет записи в `orgMembers/{org}/members`,
 * нет документа в `users`, и он не состоит ни в одной группе. Такие остаются,
 * когда человека удалили в обход штатного потока (api-memberships сейчас либо
 * требует разобраться со счетами, либо списывает нетронутые сам). Деньги за ними
 * не стоят, но в «Дебиторской задолженности», в списке должников и в рассылке
 * напоминаний они есть — директор видит сумму и не может найти, чья она.
 *
 * Все три условия проверяются вместе НАМЕРЕННО. Отсутствие только записи
 * участника означало бы порванный ростер (человек учится, но членство потерялось),
 * и списывать его долг нельзя — это живые деньги. Списываем лишь тех, кого нет
 * ни в одном списке вообще.
 *
 * ── Что именно делаем со счётом ──────────────────────────────────────────────
 * Ровно то же, что штатное удаление участника: `status: 'cancelled'`, и ТОЛЬКО
 * для нетронутых счетов (`isUntouchedPlan` — ничего не внесено). Счёт с любой
 * оплатой не трогаем никогда: за ним стоят настоящие деньги, и списание увело бы
 * их из отчёта. Удалять счета тоже не будем — списание оставляет след, по
 * которому видно, что сумма не «испарилась», а закрыта решением.
 *
 * ── Тестовые данные ──────────────────────────────────────────────────────────
 * Аккаунты «Test Student» и «Test» — следы проверок продукта. Их счета и оплаты
 * УДАЛЯЮТСЯ (списание оставило бы тестовые строки в отчётах), вместе с оценками,
 * выставленными тому же аккаунту. Сами аккаунты, членство и участие в группах НЕ
 * трогаем: под «Test Student» заходят смотреть студенческий интерфейс, и удаление
 * входа — это не чистка данных, а потеря доступа.
 *
 * Апрельские тестовые оплаты (2 × 10 000) не попадают ни в один утверждённый
 * зарплатный период — проверено перед запуском: обе ведомости (2026-07, 2026-08)
 * в состоянии `calculated`, а их окна апрель не накрывают. Иначе удаление сдвинуло
 * бы базу уже замороженного процента преподавателя.
 *
 * ── Запуск ───────────────────────────────────────────────────────────────────
 *   netlify api getEnvVars --data '{"accountId":"61057b70ac08281d8d34dc54","siteId":"14af8751-507a-4215-97ab-5a9590635805"}' > env.json
 *   node scripts/cleanup-phantom-debt.cjs env.json            # сухой прогон
 *   node scripts/cleanup-phantom-debt.cjs env.json --apply
 *   node scripts/cleanup-phantom-debt.cjs env.json --restore=tuition-backup/<файл>.json
 *
 * Применено к боевой базе 16.08.2026.
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ORG = 'wqprPGyjbxnMrJZn0If5';
const PLANS = 'studentPaymentPlans';
const TX = 'financeTransactions';
const GRADES = 'grades';
const BATCH = 400;
const BACKUP_DIR = path.join(__dirname, '..', 'tuition-backup');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

/** Тестовые аккаунты. Список явный: угадывать «тестовость» по имени на боевой базе нельзя. */
const TEST_ACCOUNTS = {
  nRXJiNAl43Yj5sWvpiPaaM1HAzA3: 'Test Student',
  zeiM4guJKH5EOsXlimBj: 'Test',
};

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ENV_FILE = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!ENV_FILE) { console.error('Укажите выгрузку getEnvVars первым аргументом.'); process.exit(1); }

const ENV = JSON.parse(fs.readFileSync(ENV_FILE, 'utf8'));
const pick = (k) => {
  const e = ENV.find((x) => x.key === k);
  const v = e && e.values.find((x) => x.context === 'dev');
  return v && v.value;
};
initializeApp({
  credential: cert({
    projectId: pick('FIREBASE_PROJECT_ID'),
    clientEmail: pick('FIREBASE_CLIENT_EMAIL'),
    privateKey: (pick('FIREBASE_PRIVATE_KEY') || '').replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore();
const money = (n) => Number(n || 0).toLocaleString('ru-RU');

/** Копия isUntouchedPlan из src/lib/payment-plans.ts: закрытые статусы + ни копейки внесённых. */
const SETTLED = ['paid', 'cancelled'];
const isUntouched = (p) => !SETTLED.includes(p.status) && (Number(p.paidAmount) || 0) === 0;
const planDebt = (p) => (p.status === 'cancelled' ? 0 : Math.max(0, Number(p.totalAmount || 0) - Number(p.paidAmount || 0)));

async function commitInBatches(items, apply, label) {
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = db.batch();
    for (const it of items.slice(i, i + BATCH)) apply(batch, it);
    await batch.commit();
    console.log(`   ${label}: ${Math.min(i + BATCH, items.length)} / ${items.length}`);
  }
}

/** Откат: документы возвращаются как были; удалённые — воссоздаются с тем же id. */
async function restore(file) {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n♻️  Откат из ${file}: ${saved.length} документов\n`);
  await commitInBatches(saved, (b, { __collection, id, ...data }) => b.set(db.collection(__collection).doc(id), data), 'возвращено');
  console.log('✅ Откат завершён.\n');
}

(async () => {
  if (typeof args.restore === 'string') return restore(args.restore);

  const [planSnap, txSnap, memberSnap, groupSnap, gradeSnap] = await Promise.all([
    db.collection(PLANS).where('organizationId', '==', ORG).get(),
    db.collection(TX).where('organizationId', '==', ORG).get(),
    db.collection(`orgMembers/${ORG}/members`).get(),
    db.collection('groups').where('organizationId', '==', ORG).get(),
    db.collection(GRADES).where('organizationId', '==', ORG).get(),
  ]);

  const memberIds = new Set(memberSnap.docs.map((d) => d.id));
  const inGroup = new Set();
  for (const g of groupSnap.docs) for (const sid of g.data().studentIds || []) inGroup.add(String(sid));
  const plans = planSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // ── 1. Призраки ────────────────────────────────────────────────────────────
  // users читаем точечно и только для тех, кого нет ни в ростере, ни в группах:
  // это единицы документов вместо выгрузки всей коллекции.
  const candidates = [...new Set(plans.map((p) => String(p.studentId || '')).filter(Boolean))]
    .filter((sid) => !memberIds.has(sid) && !inGroup.has(sid) && !TEST_ACCOUNTS[sid]);
  const userDocs = candidates.length
    ? await db.getAll(...candidates.map((sid) => db.collection('users').doc(sid)))
    : [];
  const ghosts = new Set(candidates.filter((sid, i) => !userDocs[i].exists));

  const ghostPlans = plans.filter((p) => ghosts.has(String(p.studentId)));
  const toCancel = ghostPlans.filter(isUntouched);
  const ghostWithMoney = ghostPlans.filter((p) => !isUntouched(p) && (Number(p.paidAmount) || 0) > 0);

  console.log(`\n=== ПРИЗРАКИ: ${ghosts.size} человек, ${ghostPlans.length} счетов ===`);
  const byGhost = new Map();
  for (const p of toCancel) {
    if (!byGhost.has(p.studentId)) byGhost.set(p.studentId, []);
    byGhost.get(p.studentId).push(p);
  }
  for (const [sid, list] of byGhost) {
    console.log(`  ${sid}  списываем ${list.length} счёт(ов), снимается долг ${money(list.reduce((s, p) => s + planDebt(p), 0))} с.`);
    for (const p of list) console.log(`      ${p.courseName || p.courseId} ${p.period || ''} — ${money(p.totalAmount)} с. (${p.status})`);
  }
  console.log(`  К СПИСАНИЮ: ${toCancel.length} счетов, долг ${money(toCancel.reduce((s, p) => s + planDebt(p), 0))} с.`);
  if (ghostWithMoney.length) {
    console.log(`\n  ⚠️  НЕ трогаем ${ghostWithMoney.length} счетов призраков — по ним внесены деньги:`);
    for (const p of ghostWithMoney) console.log(`      ${p.studentId} ${p.courseName || p.courseId} внесено ${money(p.paidAmount)} из ${money(p.totalAmount)} · ${p.id}`);
  }

  // ── 2. Тестовые данные ─────────────────────────────────────────────────────
  const testIds = Object.keys(TEST_ACCOUNTS);
  const testPlans = plans.filter((p) => testIds.includes(String(p.studentId)));
  const testTx = txSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => testIds.includes(String(t.studentId)));
  const testGrades = gradeSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((g) => testIds.includes(String(g.studentId)));

  console.log(`\n=== ТЕСТОВЫЕ ДАННЫЕ (удаляем) ===`);
  for (const p of testPlans) console.log(`  счёт    ${TEST_ACCOUNTS[p.studentId]} · ${p.courseName || p.courseId} · ${p.period || '—'} · ${money(p.totalAmount)} с. · ${p.status}`);
  for (const t of testTx) console.log(`  оплата  ${TEST_ACCOUNTS[t.studentId]} · ${money(t.amount)} с. · ${String(t.date).slice(0, 10)}`);
  console.log(`  оценок: ${testGrades.length}`);
  console.log(`  из выручки уходит ${money(testTx.reduce((s, t) => s + (t.type === 'income' ? Number(t.amount || 0) : 0), 0))} с. несуществующих денег`);
  console.log(`  из долга уходит ${money(testPlans.reduce((s, p) => s + planDebt(p), 0))} с.`);
  console.log(`  аккаунты, членство и группы НЕ трогаем`);

  // ── бэкап всегда ───────────────────────────────────────────────────────────
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `cleanup-before-${STAMP}.json`);
  fs.writeFileSync(backupFile, JSON.stringify([
    ...toCancel.map((p) => ({ __collection: PLANS, ...p })),
    ...testPlans.map((p) => ({ __collection: PLANS, ...p })),
    ...testTx.map((t) => ({ __collection: TX, ...t })),
    ...testGrades.map((g) => ({ __collection: GRADES, ...g })),
  ], null, 2), 'utf8');
  console.log(`\n💾 Бэкап: ${backupFile}`);

  if (!args.apply) {
    console.log(`\n🔍 Сухой прогон — ничего не записано. Добавьте --apply.\n`);
    return;
  }

  const ts = new Date().toISOString();
  console.log(`\n✍️  Списываю счета призраков…`);
  await commitInBatches(toCancel, (b, p) => b.update(db.collection(PLANS).doc(p.id), { status: 'cancelled', updatedAt: ts }), 'списано');
  console.log(`\n🗑️  Удаляю тестовые данные…`);
  await commitInBatches(
    [...testPlans.map((p) => [PLANS, p.id]), ...testTx.map((t) => [TX, t.id]), ...testGrades.map((g) => [GRADES, g.id])],
    (b, [col, id]) => b.delete(db.collection(col).doc(id)),
    'удалено',
  );

  console.log(`\n✅ Готово. Откат: node scripts/cleanup-phantom-debt.cjs ${ENV_FILE} --restore=${backupFile}\n`);
})().catch((e) => { console.error(e); process.exit(1); });
