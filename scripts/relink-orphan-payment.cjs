/**
 * Привязать «осиротевшую» оплату к действующему счёту.
 *
 * ── Что чиним ────────────────────────────────────────────────────────────────
 * Оплата хранит `paymentPlanId`. Если счёт, который она гасила, потом удалили, а
 * взамен выставили новый (например, кнопкой «Начислить за месяц»), деньги
 * остаются в кассе и в выручке, но новый счёт про них не знает: `paidAmount: 0`,
 * статус «просрочено», человек попадает в должники и в рассылку напоминаний. На
 * карточке это выглядит противоречием — «оплачено 0 из 3500», а ниже, в истории
 * оплат, стоит платёж на те же 3500 (история читается по studentId и счета не
 * спрашивает).
 *
 * ── Почему именно перепривязка, а не «принять оплату заново» ──────────────────
 * Повторный приём создал бы ВТОРУЮ кассовую операцию: выручка августа выросла бы
 * на сумму, которую никто не приносил, а процентная часть зарплаты преподавателя
 * посчиталась бы с этих же денег дважды. Здесь новых денег не появляется —
 * восстанавливается только ссылка, и `paidAmount` приводится к сумме реально
 * привязанных операций.
 *
 * ── Проверки перед записью (любая несостыковка = отказ) ───────────────────────
 * Совпадают студент и курс; счёт не списан; сумма оплат не больше суммы счёта.
 * Скрипт отказывается работать, если счёт, на который ссылается операция, ЖИВ, —
 * тогда это не сирота, и перепривязка молча увела бы деньги с чужого счёта.
 *
 * ── Запуск ───────────────────────────────────────────────────────────────────
 *   netlify api getEnvVars --data '{"accountId":"61057b70ac08281d8d34dc54","siteId":"14af8751-507a-4215-97ab-5a9590635805"}' > env.json
 *   node scripts/relink-orphan-payment.cjs env.json --tx=<id> --plan=<id>           # сухой прогон
 *   node scripts/relink-orphan-payment.cjs env.json --tx=<id> --plan=<id> --apply
 *   node scripts/relink-orphan-payment.cjs env.json --restore=tuition-backup/<файл>.json
 *
 * Применено 16.08.2026: tx XADF45AsRxnb9uwsCGSq (Абдивалиев Барспек, 3500 с. от
 * 06.08) → счёт mp__…__2026-08.
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PLANS = 'studentPaymentPlans';
const TX = 'financeTransactions';
const BACKUP_DIR = path.join(__dirname, '..', 'tuition-backup');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

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

const die = (msg) => { console.error(`\n❌ ${msg}\n`); process.exit(1); };

/**
 * Лестница статусов — копия derivePlanStatus из netlify/functions/utils/finance-names.ts.
 * Списанный счёт не воскрешаем, «просрочено» снимается только полной оплатой.
 */
function derivePlanStatus(paidAmount, totalAmount, currentStatus) {
  if (currentStatus === 'cancelled') return 'cancelled';
  const total = Number(totalAmount);
  if (Number.isFinite(total) && total > 0 && paidAmount >= total) return 'paid';
  if (currentStatus === 'overdue') return 'overdue';
  if (paidAmount === 0) return 'pending';
  return 'partial';
}

async function restore(file) {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n♻️  Откат из ${file}: ${saved.length} документов\n`);
  const batch = db.batch();
  for (const { __collection, id, ...data } of saved) batch.set(db.collection(__collection).doc(id), data);
  await batch.commit();
  console.log('✅ Откат завершён.\n');
}

(async () => {
  if (typeof args.restore === 'string') return restore(args.restore);

  const txId = args.tx;
  const planId = args.plan;
  if (typeof txId !== 'string' || typeof planId !== 'string') die('Нужны --tx=<id> и --plan=<id>');

  const [txDoc, planDoc] = await Promise.all([
    db.collection(TX).doc(txId).get(),
    db.collection(PLANS).doc(planId).get(),
  ]);
  if (!txDoc.exists) die(`Операция ${txId} не найдена`);
  if (!planDoc.exists) die(`Счёт ${planId} не найден`);
  const tx = txDoc.data();
  const plan = planDoc.data();

  // ── проверки ──
  if (tx.type !== 'income') die(`Операция не доход, а «${tx.type}» — перепривязывать нечего`);
  if (tx.paymentPlanId && tx.paymentPlanId !== planId) {
    const oldDoc = await db.collection(PLANS).doc(tx.paymentPlanId).get();
    if (oldDoc.exists) die(`Операция ссылается на ЖИВОЙ счёт ${tx.paymentPlanId} — это не сирота. Перепривязка увела бы деньги с него.`);
  }
  if (tx.organizationId !== plan.organizationId) die('Операция и счёт из разных организаций');
  if (tx.studentId !== plan.studentId) die(`Разные студенты: у операции ${tx.studentId}, у счёта ${plan.studentId}`);
  if (tx.courseId !== plan.courseId) die(`Разные курсы: у операции ${tx.courseId}, у счёта ${plan.courseId}`);
  if (plan.status === 'cancelled') die('Счёт списан — оплату на него вешать нельзя, сначала решите, что со списанием');

  // Итог считаем по ВСЕМ операциям счёта, а не «старое + эта»: если операций
  // окажется больше одной, сумма обязана сойтись со всеми.
  const linkedSnap = await db.collection(TX).where('paymentPlanId', '==', planId).get();
  const linked = linkedSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.id !== txId);
  const paid = [...linked, { ...tx, id: txId }].reduce((s, t) => {
    if (t.type === 'income') return s + Number(t.amount || 0);
    if (t.type === 'expense' && t.categoryId === 'refund') return s - Number(t.amount || 0);
    return s;
  }, 0);
  const total = Number(plan.totalAmount || 0);
  if (paid > total) die(`После привязки внесено ${paid} при сумме счёта ${total} — это переплата, у неё отдельный разбор`);

  const status = derivePlanStatus(paid, total, plan.status);

  console.log(`\n🔗 Перепривязка оплаты`);
  console.log(`   студент:  ${plan.studentName || tx.description || plan.studentId}`);
  console.log(`   курс:     ${plan.courseName || plan.courseId}   период ${plan.period}`);
  console.log(`   операция: ${txId}  ${tx.amount} с. от ${String(tx.date).slice(0, 10)}`);
  console.log(`   было:     paymentPlanId=${tx.paymentPlanId} (счёта нет)`);
  console.log(`   станет:   paymentPlanId=${planId}`);
  console.log(`   счёт:     внесено ${plan.paidAmount} → ${paid} из ${total}, статус ${plan.status} → ${status}`);
  if (linked.length) console.log(`   на счёте уже есть операций: ${linked.length}`);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `relink-${txId}-before-${STAMP}.json`);
  fs.writeFileSync(backupFile, JSON.stringify([
    { __collection: TX, id: txId, ...tx },
    { __collection: PLANS, id: planId, ...plan },
  ], null, 2), 'utf8');
  console.log(`\n💾 Бэкап обоих документов: ${backupFile}`);

  if (!args.apply) {
    console.log(`\n🔍 Сухой прогон — ничего не записано. Добавьте --apply.\n`);
    return;
  }

  const ts = new Date().toISOString();
  const batch = db.batch();
  batch.update(db.collection(TX).doc(txId), { paymentPlanId: planId });
  batch.update(db.collection(PLANS).doc(planId), { paidAmount: paid, status, updatedAt: ts });
  await batch.commit();

  console.log(`\n✅ Готово. Откат: node scripts/relink-orphan-payment.cjs ${ENV_FILE} --restore=${backupFile}\n`);
})().catch((e) => { console.error(e); process.exit(1); });
