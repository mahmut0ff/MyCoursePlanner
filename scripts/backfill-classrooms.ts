/**
 * Миграция: свободный текст `scheduleEvents.location` → справочник `classrooms`.
 *
 * Что делает:
 *   1. Собирает все занятия, у которых указан кабинет текстом и нет classroomId.
 *   2. Группирует их по (организация, филиал, нормализованное название), так что
 *      «Каб. 305», «каб 305» и «Кабинет №305» становятся одним кабинетом, а
 *      одноимённые аудитории в разных зданиях — разными.
 *   3. Заводит недостающие кабинеты и проставляет занятиям classroomId и
 *      classroomName. `location` при этом приводится к каноничному названию, но
 *      НЕ удаляется — по нему читают экраны, ещё не знающие о справочнике.
 *
 * Решение о том, что создать и что к чему привязать, живёт в
 * src/lib/classroomBackfill.ts и покрыто тестами — здесь только ввод-вывод.
 *
 * Прогон:
 *   npx tsx scripts/backfill-classrooms.ts --dry-run      # только показать план
 *   npx tsx scripts/backfill-classrooms.ts                # применить
 *   npx tsx scripts/backfill-classrooms.ts --org=<orgId>  # ограничить организацией
 *
 * Идемпотентна: повторный запуск не создаёт двойников и ничего не меняет.
 */
import * as admin from 'firebase-admin';
import * as path from 'path';
import { planClassroomBackfill } from '../src/lib/classroomBackfill';
import { normalizeRoom } from '../src/lib/classrooms';
import type { BackfillEvent, BackfillClassroom } from '../src/lib/classroomBackfill';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.resolve(__dirname, '../confident-totem-426112-j6-firebase-adminsdk-fbsvc-3ac2bdfa61.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath as any) });
}

const db = admin.firestore();
const now = () => new Date().toISOString();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_ORG = args.find(a => a.startsWith('--org='))?.slice('--org='.length) || null;

/** Firestore разрешает 500 операций в батче — берём с запасом. */
const BATCH_SIZE = 400;

async function commitInBatches<T>(items: T[], apply: (batch: admin.firestore.WriteBatch, item: T) => void) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const item of items.slice(i, i + BATCH_SIZE)) apply(batch, item);
    await batch.commit();
  }
}

async function migrate() {
  console.log('🔄 Перенос кабинетов из текста в справочник');
  console.log(`   режим: ${DRY_RUN ? 'ТОЛЬКО ПЛАН (изменений не будет)' : 'ПРИМЕНЕНИЕ'}`);
  if (ONLY_ORG) console.log(`   организация: ${ONLY_ORG}`);
  console.log('');

  const [eventsSnap, classroomsSnap] = await Promise.all([
    ONLY_ORG
      ? db.collection('scheduleEvents').where('organizationId', '==', ONLY_ORG).get()
      : db.collection('scheduleEvents').get(),
    ONLY_ORG
      ? db.collection('classrooms').where('organizationId', '==', ONLY_ORG).get()
      : db.collection('classrooms').get(),
  ]);

  const events: BackfillEvent[] = eventsSnap.docs.map(d => ({
    id: d.id,
    organizationId: d.data().organizationId,
    branchId: d.data().branchId ?? null,
    classroomId: d.data().classroomId ?? null,
    location: d.data().location ?? null,
  }));
  const existing: BackfillClassroom[] = classroomsSnap.docs.map(d => ({
    id: d.id,
    organizationId: d.data().organizationId,
    branchId: d.data().branchId ?? null,
    name: d.data().name,
    isActive: d.data().isActive,
  }));

  console.log(`📅 занятий: ${events.length}, кабинетов в справочнике: ${existing.length}`);

  const plan = planClassroomBackfill(events, existing);

  console.log(`\n📋 План:`);
  console.log(`   создать кабинетов:        ${plan.create.length}`);
  console.log(`   привязать к имеющимся:    ${plan.link.length}`);
  console.log(`   уже привязано (пропуск):  ${plan.skippedAlreadyLinked}`);
  console.log(`   без кабинета (пропуск):   ${plan.skippedNoRoom}`);

  for (const c of plan.create) {
    console.log(`   + «${c.name}»  филиал: ${c.branchId ?? '—'}  занятий: ${c.eventIds.length}`);
  }

  if (!plan.create.length && !plan.link.length) {
    console.log('\n✅ Менять нечего — данные уже перенесены.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n⏹  Сухой прогон: ничего не записано.');
    return;
  }

  // 1. Заводим недостающие кабинеты и запоминаем, каким занятиям их проставить.
  const links = [...plan.link];
  for (const c of plan.create) {
    const ref = await db.collection('classrooms').add({
      organizationId: c.organizationId,
      branchId: c.branchId,
      name: c.name,
      nameKey: c.nameKey,
      capacity: null,
      floor: null,
      color: null,
      isVirtual: false,
      notes: '',
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    });
    for (const eventId of c.eventIds) {
      links.push({ eventId, classroomId: ref.id, classroomName: c.name });
    }
  }
  console.log(`\n🏫 Заведено кабинетов: ${plan.create.length}`);

  // 2. Проставляем привязку занятиям. location приводим к каноничному написанию,
  //    но оставляем — на него опираются ещё не переехавшие экраны.
  await commitInBatches(links, (batch, l) => {
    batch.update(db.collection('scheduleEvents').doc(l.eventId), {
      classroomId: l.classroomId,
      classroomName: l.classroomName,
      location: l.classroomName,
      updatedAt: now(),
    });
  });
  console.log(`🔗 Привязано занятий: ${links.length}`);

  // 3. Проверка: не осталось ли занятий с текстом, но без привязки.
  const leftover = events.filter(e =>
    !e.classroomId
    && normalizeRoom(e.location)
    && !links.some(l => l.eventId === e.id));
  if (leftover.length) {
    console.warn(`⚠️  Осталось без привязки: ${leftover.length} — проверьте вручную`);
  }

  console.log('\n✅ Готово.');
}

migrate()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ Ошибка миграции:', err); process.exit(1); });
