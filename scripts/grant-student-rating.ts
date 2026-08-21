/**
 * Миграция: право «Рейтинг студентов» (`student_rating:read`) для уже созданных ролей.
 *
 * Раньше страницу /rating гейтила «Аналитика» (`analytics:read`). Теперь у неё
 * собственный ресурс, и системные наборы (преподаватель, менеджер) его уже
 * включают — а вот СВОИ роли организации и точечные настройки доступа
 * сотрудников про новое право не знают, и рейтинг у них молча исчез бы.
 *
 * Что делает: везде, где встречается `analytics:read`, дублирует его в
 * `student_rating:read` — в правах кастомных ролей и в персональных
 * grants/revokes сотрудников (revokes тоже: если аналитику у человека забрали
 * точечно, рейтинг не должен вернуться сам собой).
 *
 * Прогон:
 *   npx tsx scripts/grant-student-rating.ts --dry-run      # только показать план
 *   npx tsx scripts/grant-student-rating.ts                # применить
 *   npx tsx scripts/grant-student-rating.ts --org=<orgId>  # ограничить организацией
 *
 * Идемпотентна: повторный запуск ничего не меняет.
 */
import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.resolve(__dirname, '../confident-totem-426112-j6-firebase-adminsdk-fbsvc-3ac2bdfa61.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath as any) });
}

const db = admin.firestore();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_ORG = args.find(a => a.startsWith('--org='))?.slice('--org='.length);

type Perm = { resource: string; actions: string[] };

/** Есть аналитика на чтение, а рейтинга нет → добавить. Вернёт null, если менять нечего. */
function withRating(perms: unknown): Perm[] | null {
  if (!Array.isArray(perms)) return null;
  const list = perms as Perm[];
  const hasAnalytics = list.some(p => p?.resource === 'analytics' && (p.actions || []).includes('read'));
  if (!hasAnalytics) return null;
  const existing = list.find(p => p?.resource === 'student_rating');
  if (existing) {
    if ((existing.actions || []).includes('read')) return null;
    return list.map(p => p === existing ? { ...p, actions: [...(p.actions || []), 'read'] } : p);
  }
  return [...list, { resource: 'student_rating', actions: ['read'] }];
}

async function run() {
  const orgs = ONLY_ORG
    ? [await db.collection('organizations').doc(ONLY_ORG).get()]
    : (await db.collection('organizations').get()).docs;

  let roleHits = 0;
  let memberHits = 0;

  for (const org of orgs) {
    if (!org.exists) { console.log(`организация ${org.id} не найдена — пропуск`); continue; }
    const orgId = org.id;

    // 1. Свои роли организации.
    const roles = await db.collection('organizations').doc(orgId).collection('roles').get();
    for (const role of roles.docs) {
      const next = withRating(role.get('permissions'));
      if (!next) continue;
      roleHits++;
      console.log(`роль «${role.get('name') || role.id}» (${orgId}) → +student_rating:read`);
      if (!DRY_RUN) await role.ref.update({ permissions: next, updatedAt: new Date().toISOString() });
    }

    // 2. Персональные настройки доступа сотрудников (grants и revokes).
    // Пишем в обе копии членства: verifyAuth читает users/{uid}/memberships,
    // а /team — orgMembers; обновить одну — значит развести их (см. api-roles).
    const members = await db.collection('orgMembers').doc(orgId).collection('members').get();
    for (const member of members.docs) {
      const ov = member.get('permissionOverrides');
      if (!ov) continue;
      const grants = withRating(ov.grants);
      const revokes = withRating(ov.revokes);
      if (!grants && !revokes) continue;
      memberHits++;
      console.log(`сотрудник ${member.id} (${orgId}) → ${grants ? 'grants ' : ''}${revokes ? 'revokes' : ''} +student_rating:read`);
      if (!DRY_RUN) {
        const next = {
          permissionOverrides: {
            grants: grants || ov.grants || [],
            revokes: revokes || ov.revokes || [],
          },
          updatedAt: new Date().toISOString(),
        };
        await member.ref.update(next);
        await db.collection('users').doc(member.id).collection('memberships').doc(orgId)
          .set(next, { merge: true });
      }
    }
  }

  console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}ролей: ${roleHits}, сотрудников: ${memberHits}`);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
