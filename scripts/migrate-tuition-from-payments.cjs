/**
 * Договорная цена из фактических оплат — разовая миграция My Academy.
 *
 * Задача: у студентов, которым админ снижал сумму счёта и они её оплатили,
 * зафиксировать эту сумму как ЛИЧНУЮ цену (`studentTuitions`), чтобы следующий
 * месяц выставлялся по ней, а не по цене курса. См. src/lib/tuition.ts.
 *
 * ── Что берём и почему именно это ────────────────────────────────────────────
 * Кандидат = пара «студент × курс», где ПОСЛЕДНЯЯ оплата ровно равна сумме
 * своего счёта (`totalAmount`) и эта сумма МЕНЬШЕ цены курса. Такой счёт — след
 * решения администратора «этот платит столько», а совпадение с оплатой
 * доказывает, что месяц закрыт полностью, а не наполовину.
 *
 * Осознанно НЕ трогаем:
 *   • оплата == цене курса — ставка ничего не изменит, а лишние 60 документов
 *     отвяжут студента от будущего изменения прайса;
 *   • оплата > цены курса (4000/7500/8000 при прайсе 3500) — это оплата за
 *     несколько месяцев или за двоих детей, а не месячная ставка;
 *   • частичная оплата (1800 из 3500, 5000 из 10000) — счёт не закрыт, сумма
 *     оплаты ставкой не является;
 *   • пересчёт за неполный месяц («за 4 урока» = 1168, «за 5 урок» = 1460,
 *     2920) — цена за уроки, а не за месяц;
 *   • оплата без счёта — не с чем сверить.
 * Все пропущенные печатаются поимённо: молчаливый пропуск читался бы как
 * «обработали всех».
 *
 * Уже выставленные счета НЕ пересчитываются: ставка смотрит вперёд. Привести к
 * ней текущие долги — отдельная кнопка «применить к неоплаченным»
 * (api-finance-tuition, action: 'reapply').
 *
 * Идемпотентно: id документа детерминированный (tuitionDocId), повторный прогон
 * перезаписывает те же документы теми же суммами.
 *
 * ── Запуск ───────────────────────────────────────────────────────────────────
 *   netlify api getEnvVars --data '{"accountId":"61057b70ac08281d8d34dc54","siteId":"14af8751-507a-4215-97ab-5a9590635805"}' > env.json
 *   node scripts/migrate-tuition-from-payments.cjs env.json           # сухой прогон
 *   node scripts/migrate-tuition-from-payments.cjs env.json --apply   # запись
 *   node scripts/migrate-tuition-from-payments.cjs env.json --restore=tuition-backup/studentTuitions-before-migration.json
 *
 * Учётные данные берём из контекста `dev` выгрузки — только он приезжает
 * незамаскированным; `production`/`branch-deploy` отдаются как '****' и валятся
 * потом невнятным «Invalid PEM formatted message».
 *
 * ПРИМЕНЕНО К БОЕВОЙ БАЗЕ 16.08.2026: записано 42 ставки, пропущено 77 пар.
 * Состояние «до» (две ставки, выставленные руками) — в
 * tuition-backup/studentTuitions-before-migration.json; это и есть цель отката.
 * Сама папка под гитигнором: в бэкапе имена и суммы живых студентов.
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ORG = 'wqprPGyjbxnMrJZn0If5';
const COLLECTION = 'studentTuitions';
const BATCH = 400;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
/** Бэкапы — рядом с репозиторием, но вне git: в них имена и суммы студентов. */
const BACKUP_DIR = path.join(__dirname, '..', 'tuition-backup');

const args = process.argv.slice(2);
const ENV_FILE = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const RESTORE = (args.find((a) => a.startsWith('--restore=')) || '').split('=')[1];

if (!ENV_FILE) {
  console.error('Укажите выгрузку getEnvVars: node scripts/migrate-tuition-from-payments.cjs env.json [--apply]');
  process.exit(1);
}

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

/** Тот же id, что в src/lib/tuition.ts — иначе ставку никто не найдёт. */
const tuitionDocId = (orgId, studentId, courseId) => `tu__${orgId}__${studentId}__${courseId}`;

async function commitInBatches(items, apply, label) {
  let done = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = db.batch();
    for (const it of items.slice(i, i + BATCH)) apply(batch, it);
    await batch.commit();
    done += Math.min(BATCH, items.length - i);
    console.log(`   ${label}: ${done} / ${items.length}`);
  }
}

/**
 * Откат: база возвращается ровно к состоянию бэкапа — документы из него
 * восстанавливаются, всё остальное по организации удаляется. Половинчатый откат
 * (только восстановить) оставил бы записанные миграцией ставки на месте.
 */
async function restore(file) {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const snap = await db.collection(COLLECTION).where('organizationId', '==', ORG).get();
  const keep = new Set(saved.map((d) => d.id));
  const doomed = snap.docs.filter((d) => !keep.has(d.id));
  console.log(`\n♻️  Откат из ${file}: вернуть ${saved.length}, удалить ${doomed.length}\n`);
  if (doomed.length) await commitInBatches(doomed, (b, d) => b.delete(d.ref), 'удалено');
  if (saved.length) {
    await commitInBatches(saved, (b, { id, ...data }) => b.set(db.collection(COLLECTION).doc(id), data), 'возвращено');
  }
  console.log('\n✅ Откат завершён.\n');
}

(async () => {
  if (RESTORE) return restore(RESTORE);

  const [courseSnap, planSnap, txSnap, memberSnap, tuitionSnap] = await Promise.all([
    db.collection('courses').where('organizationId', '==', ORG).get(),
    db.collection('studentPaymentPlans').where('organizationId', '==', ORG).get(),
    db.collection('financeTransactions').where('organizationId', '==', ORG).get(),
    db.collection(`orgMembers/${ORG}/members`).get(),
    db.collection(COLLECTION).where('organizationId', '==', ORG).get(),
  ]);

  const courses = new Map(courseSnap.docs.map((d) => [d.id, d.data()]));
  const cname = (id) => String((courses.get(id) || {}).title || (courses.get(id) || {}).name || '');
  const cprice = (id) => Number((courses.get(id) || {}).price || 0);
  const names = new Map(memberSnap.docs.map((d) => [d.id, String((d.data() || {}).userName || '')]));
  const plans = planSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const planById = new Map(plans.map((p) => [p.id, p]));
  const income = txSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.type === 'income');

  // ── оплаты по паре студент × курс ──
  // Курс у операции обычно свой; если его нет, берём у счёта, который она гасила.
  const pays = new Map();
  for (const t of income) {
    if (!t.studentId) continue;
    const courseId = t.courseId || planById.get(t.paymentPlanId)?.courseId || '';
    if (!courseId) continue;
    const k = `${t.studentId}|${courseId}`;
    if (!pays.has(k)) pays.set(k, []);
    pays.get(k).push(t);
  }

  const take = [];
  const skip = [];
  for (const [k, list] of pays) {
    const [studentId, courseId] = k.split('|');
    const price = cprice(courseId);
    const last = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1);
    const amount = Number(last.amount || 0);
    const plan = planById.get(last.paymentPlanId);
    const row = {
      studentId, courseId, amount, price,
      name: names.get(studentId) || String(last.description || studentId),
      course: cname(courseId) || courseId,
      desc: String(last.description || ''),
      date: String(last.date || '').slice(0, 10),
    };

    if (!plan) { skip.push({ ...row, why: 'оплата без счёта' }); continue; }
    const total = Number(plan.totalAmount || 0);
    if (amount > price) { skip.push({ ...row, why: `оплата ${amount} выше цены курса ${price} — вероятно за несколько месяцев` }); continue; }
    if (amount !== total) { skip.push({ ...row, why: `частичная: внесено ${amount} из ${total}` }); continue; }
    if (amount % 100 !== 0) { skip.push({ ...row, why: `пересчёт за неполный месяц («${row.desc}»)` }); continue; }
    if (amount === price) { skip.push({ ...row, why: 'платит полную цену курса — ставка не нужна' }); continue; }
    take.push(row);
  }

  take.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  skip.sort((a, b) => a.why.localeCompare(b.why, 'ru') || a.name.localeCompare(b.name, 'ru'));

  console.log(`\n🏢 My Academy [${ORG}]  проект ${pick('FIREBASE_PROJECT_ID')}`);
  console.log(`   оплат: ${income.length}   пар студент×курс с оплатами: ${pays.size}   ставок сейчас: ${tuitionSnap.size}`);

  console.log(`\n=== СТАВКА БУДЕТ ЗАПИСАНА: ${take.length} ===`);
  for (const r of take) {
    const existing = tuitionSnap.docs.find((d) => d.id === tuitionDocId(ORG, r.studentId, r.courseId));
    const mark = existing ? (Number(existing.data().amount) === r.amount ? ' (уже такая)' : ` (было ${existing.data().amount})`) : '';
    console.log(`  ${r.name.padEnd(26)} ${r.course.padEnd(20)} ${String(r.price).padStart(6)} → ${String(r.amount).padStart(6)}${mark}`);
  }

  console.log(`\n=== ПРОПУЩЕНО: ${skip.length} ===`);
  let lastWhy = '';
  for (const r of skip) {
    const why = r.why.replace(/\d+/g, '#');
    if (why !== lastWhy) { console.log(`  — ${r.why.includes('полную цену') ? 'платят полную цену курса' : r.why.replace(/\d+/g, '…')}`); lastWhy = why; }
    console.log(`     ${r.name.padEnd(26)} ${r.course.padEnd(20)} прайс ${String(r.price).padStart(6)}  оплата ${String(r.amount).padStart(6)}  ${r.desc}`);
  }

  // ── бэкап делаем всегда, даже в сухом прогоне ──
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `studentTuitions-before-${STAMP}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(tuitionSnap.docs.map((d) => ({ id: d.id, ...d.data() })), null, 2), 'utf8');
  console.log(`\n💾 Бэкап ставок «до»: ${backupFile}`);

  if (!APPLY) {
    console.log(`\n🔍 Сухой прогон — в базу ничего не записано.`);
    console.log(`   Для записи: node scripts/migrate-tuition-from-payments.cjs ${ENV_FILE} --apply\n`);
    return;
  }

  const ts = new Date().toISOString();
  const existingById = new Map(tuitionSnap.docs.map((d) => [d.id, d.data()]));
  console.log(`\n✍️  Записываю ${take.length} ставок…\n`);
  await commitInBatches(
    take,
    (batch, r) => {
      const id = tuitionDocId(ORG, r.studentId, r.courseId);
      // createdAt у уже существующей ставки сохраняем: это дата, когда цену
      // назначили руками, и миграция не имеет права её переписать.
      const prior = existingById.get(id);
      batch.set(db.collection(COLLECTION).doc(id), {
        organizationId: ORG,
        studentId: r.studentId,
        courseId: r.courseId,
        amount: r.amount,
        studentName: r.name,
        courseName: r.course,
        updatedBy: 'migration:tuition-from-payments',
        createdAt: prior?.createdAt || ts,
        updatedAt: ts,
      });
    },
    'записано',
  );

  console.log(`\n✅ Готово: ${take.length} ставок.`);
  console.log(`   Откат: node scripts/migrate-tuition-from-payments.cjs ${ENV_FILE} --restore=${backupFile}\n`);
})().catch((e) => { console.error(e); process.exit(1); });
