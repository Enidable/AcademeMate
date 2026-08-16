// Convert the legacy "Master Tracker" exports in my_data/ into the new flat
// schema and write the FULL personal data set to my_data/new/. (my_data/ is
// gitignored — this output is only ever imported into your own spreadsheet.)
//
//   node scripts/migrate-to-new-schema.mjs

import fs from 'node:fs'
import path from 'node:path'
import { writeCSV } from './lib/csv.mjs'
import { buildTables } from './lib/migrate.mjs'
import {
  serializeStudyLog,
  serializeCourses,
  serializeGradeComponents,
  serializeContent,
  serializeDailyPlan,
  serializeWeeklyOverrides,
} from '../src/data/serialize.js'

const MY_DATA = path.resolve('my_data')
const OUT = path.resolve('my_data', 'new')

const OUT_FILES = {
  'AcademeMate - Study Log.csv': ['studyLog', serializeStudyLog],
  'AcademeMate - Courses.csv': ['courses', serializeCourses],
  'AcademeMate - Grade Components.csv': ['gradeComponents', serializeGradeComponents],
  'AcademeMate - Course Content.csv': ['content', serializeContent],
  'AcademeMate - Daily Plan.csv': ['dailyPlan', serializeDailyPlan],
  'AcademeMate - Weekly Totals.csv': ['weeklyOverrides', serializeWeeklyOverrides],
}

if (!fs.existsSync(path.join(MY_DATA, 'Master Tracker - INPUT_LOG.csv'))) {
  console.error('No legacy exports found in my_data/. Put your 6 "Master Tracker - *.csv" exports there first.')
  process.exit(1)
}

const tables = buildTables(MY_DATA)

fs.mkdirSync(OUT, { recursive: true })
for (const [name, [key, serializer]] of Object.entries(OUT_FILES)) {
  fs.writeFileSync(path.join(OUT, name), writeCSV(serializer(tables[key])))
}

console.log(`Migrated ${tables.studyLog.length} study sessions`)
console.log(`  ${tables.courses.length} courses`)
console.log(`  ${tables.gradeComponents.reduce((s, g) => s + g.components.length, 0)} grade components in ${tables.gradeComponents.length} courses`)
console.log(`  ${tables.content.length} content items (lectures/assessments)`)
console.log(`  ${tables.dailyPlan.length} daily plan rows`)
console.log(`-> my_data/new/ (personal, never committed)`)