#!/usr/bin/env node
// Verifies the generated example CSVs parse correctly through the app's real
// parser code. Run: node scripts/verify-example-data.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCSV, parseCSVRaw } from '../src/utils/csv.js'
import { parseDailyPlannerRows } from '../src/data/parseDaily.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'public', 'data')
const read = name => readFileSync(join(DATA_DIR, name), 'utf8')

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

// INPUT_LOG must produce objects with the exact keys parseInputLog reads.
const inputLogObjects = parseCSV(read('Master Tracker - INPUT_LOG.csv'))
const requiredLogKeys = ['Date', 'Start Time', 'End Time', 'Duration (hours)', 'Duration (minutes)',
  'Course', 'Category', 'Project', 'Location', 'Efficiency', 'Wellbeing',
  'Lecture ID', 'Transport Mode', 'Commute Time', 'Notes']
assert(inputLogObjects.length >= 50, `INPUT_LOG parsed only ${inputLogObjects.length} rows`)
assert(requiredLogKeys.every(k => k in inputLogObjects[0]), `INPUT_LOG missing header key in ${JSON.stringify(Object.keys(inputLogObjects[0]))}`)
assert(inputLogObjects.every(o => o.Course), 'INPUT_LOG row lost its course')
assert(inputLogObjects.every(o => !isNaN(parseFloat(o['Duration (hours)']))), 'INPUT_LOG duration not numeric')

// Courses header must produce the keys parseMasterCourses reads.
const courseObjects = parseCSV(read('Master Tracker - Master Time Management.csv'))
const requiredCourseKeys = ['', 'Quartile', 'Courses', 'Abbrev.', 'Start', 'Finish', 'Time [min]',
  'Time [h]', 'Grade', 'Exam', 'Assignment', 'Laboratory', 'EC', 'Comment',
  'Est. Time [h]', 'Ass. Time [h]', 'Material']
assert(courseObjects.length >= 6, `Courses parsed only ${courseObjects.length} rows`)
assert(requiredCourseKeys.every(k => k in courseObjects[0]), `Courses missing header key in ${JSON.stringify(Object.keys(courseObjects[0]))}`)
assert(courseObjects.every(o => o.Courses), 'Course row lost its name')

// Weekly hours: the Year 2026 [h] row must be intact and have 52 week cells.
const hoursRows = parseCSVRaw(read('Master Tracker - Time structure and hours of study.csv'))
const yearRow = hoursRows.find(r => (r[0] || '').trim() === 'Year 2026 [h]')
assert(yearRow && yearRow.length === 53, 'Year 2026 [h] row missing/malformed')

// Deadlines: positional columns 0..7 must be present.
const deadlineRows = parseCSVRaw(read('Master Tracker - Deadlines and Lectures.csv')).slice(1)
assert(deadlineRows.every(r => r[0] && r[3] && r[7]), 'Deadline row missing desc/date/urgency')

// Daily planner must parse into weeks, each with rows incl. SUM, Travel, WORK.
const weeks = parseDailyPlannerRows(parseCSVRaw(read('Master Tracker - Daily.csv')))
assert(weeks.length >= 6, `Daily parsed only ${weeks.length} weeks`)
for (const w of weeks) {
  assert(w.dates.length === 7, `Week ${w.weekNumber} missing dates`)
  assert(w.rows.some(r => r.course === 'SUM' && r.isTotal), `Week ${w.weekNumber} missing SUM row`)
}
const editable = weeks[0].rows.filter(r => !r.isTotal)
assert(editable.some(r => r.course === 'Travel'), 'Week missing Travel row')
assert(editable.some(r => r.course === 'WORK'), 'Week missing WORK row')

console.log(`Verify OK: ${inputLogObjects.length} log rows, ${courseObjects.length} courses, ${weeks.length} daily weeks — all parse through the app parsers.`)
