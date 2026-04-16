/**
 * Migration: Move lesson linkage from Course.lessonIds → LessonPlan.groupIds
 * 
 * For each course that has lessonIds:
 *   1. Find all groups belonging to that course
 *   2. For each lesson in course.lessonIds, add those group IDs to lesson.groupIds
 *   3. Remove lessonIds from the course document
 *
 * Run: npx tsx scripts/migrate-lessons-to-groups.ts
 */
import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
  path.resolve(__dirname, '../confident-totem-426112-j6-firebase-adminsdk-fbsvc-3ac2bdfa61.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath as any),
  });
}

const db = admin.firestore();

async function migrate() {
  console.log('🔄 Starting migration: Course.lessonIds → LessonPlan.groupIds\n');

  // 1. Fetch all courses
  const coursesSnap = await db.collection('courses').get();
  console.log(`📚 Found ${coursesSnap.size} courses`);

  let totalLessonsUpdated = 0;
  let totalCoursesUpdated = 0;

  for (const courseDoc of coursesSnap.docs) {
    const course = courseDoc.data();
    const lessonIds: string[] = course.lessonIds || [];

    if (lessonIds.length === 0) {
      continue; // No lessons to migrate
    }

    console.log(`\n📖 Course: "${course.title}" (${courseDoc.id})`);
    console.log(`   └─ ${lessonIds.length} lesson(s) to migrate`);

    // 2. Find ALL groups for this course
    const groupsSnap = await db.collection('groups')
      .where('courseId', '==', courseDoc.id)
      .get();

    const groupIds = groupsSnap.docs.map(g => g.id);
    const groupNames = groupsSnap.docs.map(g => g.data().name || 'Без названия');

    if (groupIds.length === 0) {
      console.log(`   ⚠️  No groups found for this course. Lessons will get empty groupIds.`);
    } else {
      console.log(`   └─ Found ${groupIds.length} group(s): ${groupNames.join(', ')}`);
    }

    // 3. Update each lesson with groupIds
    for (const lessonId of lessonIds) {
      try {
        const lessonDoc = await db.collection('lessonPlans').doc(lessonId).get();
        if (!lessonDoc.exists) {
          console.log(`   ❌ Lesson ${lessonId} not found, skipping`);
          continue;
        }

        const existingGroupIds: string[] = lessonDoc.data()?.groupIds || [];
        const mergedGroupIds = [...new Set([...existingGroupIds, ...groupIds])];
        const mergedGroupNames = [...new Set([...(lessonDoc.data()?.groupNames || []), ...groupNames])];

        await db.collection('lessonPlans').doc(lessonId).update({
          groupIds: mergedGroupIds,
          groupNames: mergedGroupNames,
          updatedAt: new Date().toISOString(),
        });

        totalLessonsUpdated++;
        console.log(`   ✅ Lesson "${lessonDoc.data()?.title}" → ${mergedGroupIds.length} group(s)`);
      } catch (err: any) {
        console.error(`   ❌ Failed to update lesson ${lessonId}:`, err.message);
      }
    }

    // 4. Remove lessonIds from the course document
    try {
      await db.collection('courses').doc(courseDoc.id).update({
        lessonIds: admin.firestore.FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      });
      totalCoursesUpdated++;
      console.log(`   🗑️  Removed lessonIds from course "${course.title}"`);
    } catch (err: any) {
      console.error(`   ❌ Failed to clean course ${courseDoc.id}:`, err.message);
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   └─ ${totalLessonsUpdated} lessons updated with groupIds`);
  console.log(`   └─ ${totalCoursesUpdated} courses cleaned (lessonIds removed)`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('💥 Migration failed:', err);
    process.exit(1);
  });
