// Rebuild the DEPERSONALISED default template in public/data/ from your data.
// Keeps your course backbone, study-log sessions, planner rows and lecture
// schedule; strips grades, personal notes and personal appointments so the
// repo (and GitHub Pages) never ships anything personal.
//
//   node scripts/generate-example-data.mjs
//   node scripts/verify-example-data.mjs

import fs from 'node:fs'
import path from 'node:path'
import { writeCSV } from './lib/csv.mjs'
import { buildTables, sanitize } from './lib/migrate.mjs'
import {
  serializeStudyLog,
  serializeCourses,
  serializeGradeComponents,
  serializeContent,
  serializeDailyPlan,
  serializeWeeklyOverrides,
} from '../src/data/serialize.js'

const MY_DATA = path.resolve('my_data')
const OUT = path.resolve('public', 'data')

const OUT_FILES = {
  'AcademeMate - Study Log.csv': ['studyLog', serializeStudyLog],
  'AcademeMate - Courses.csv': ['courses', serializeCourses],
  'AcademeMate - Grade Components.csv': ['gradeComponents', serializeGradeComponents],
  'AcademeMate - Course Content.csv': ['content', serializeContent],
  'AcademeMate - Daily Plan.csv': ['dailyPlan', serializeDailyPlan],
  'AcademeMate - Weekly Totals.csv': ['weeklyOverrides', serializeWeeklyOverrides],
}

const tables = sanitize(buildTables(MY_DATA))

fs.mkdirSync(OUT, { recursive: true })
for (const [name, [key, serializer]] of Object.entries(OUT_FILES)) {
  fs.writeFileSync(path.join(OUT, name), writeCSV(serializer(tables[key])))
}

console.log(`Template rebuilt from my_data/ -> public/data/ (depersonalised).`)
console.log(`  ${tables.courses.length} courses, ${tables.gradeComponents.reduce((s, g) => s + g.components.length, 0)} weighted components (no grades)`)
console.log(`  ${tables.studyLog.length} study sessions, ${tables.content.length} content items (incl. ${tables.content.filter(c => c.deadline).length} assessments), ${tables.dailyPlan.length} planner rows`)