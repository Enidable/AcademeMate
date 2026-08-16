#!/usr/bin/env node
// Verifies the bundled template CSVs parse correctly through the app's real
// parser code AND contain no personal data (grades, study logs, deadlines,
// personal planner entries). Run: node scripts/verify-example-data.mjs
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

// INPUT_LOG must be empty (only the header) — a fresh user starts with no
// personal study sessions. The header must carry the keys parseInputLog reads.
const inputLogRaw = parseCSVRaw(read('Master Tracker - INPUT_LOG.csv'))
assert(inputLogRaw.length === 1, `INPUT_LOG should contain only the header, found ${inputLogRaw.length} rows`)
const requiredLogKeys = ['Date', 'Start Time', 'End Time', 'Duration (hours)', 'Duration (minutes)',
  'Course', 'Category', 'Project', 'Location', 'Efficiency', 'Wellbeing',
  'Lecture ID', 'Transport Mode', 'Commute Time', 'Notes']
const logHeader = inputLogRaw[0]
assert(requiredLogKeys.every(k => logHeader.includes(k)), `INPUT_LOG header missing keys: ${JSON.stringify(logHeader)}`)

// Courses must be the real programme's backbone: headers, course name + course
// ID (Abbrev.), but NO personal grades and NO time spent.
const courseObjects = parseCSV(read('Master Tracker - Master Time Management.csv'))
const requiredCourseKeys = ['', 'Quartile', 'Courses', 'Abbrev.', 'Start', 'Finish', 'Time [min]',
  'Time [h]', 'Grade', 'Exam', 'Assignment', 'Laboratory', 'EC', 'Comment',
  'Est. Time [h]', 'Ass. Time [h]', 'Material']
assert(courseObjects.length >= 20, `Courses parsed only ${courseObjects.length} rows (expected the real programme)`)
assert(requiredCourseKeys.every(k => k in courseObjects[0]), `Courses missing header key in ${JSON.stringify(Object.keys(courseObjects[0]))}`)
assert(courseObjects.every(o => o.Courses), 'Course row lost its name')
assert(courseObjects.every(o => (o['Abbrev.'] || '').trim()), 'Every course must carry its course ID (Abbrev.)')
assert(courseObjects.every(o => (o.Grade || '').trim() === ''), 'Template must not contain grades')
assert(courseObjects.every(o => (o['Time [h]'] || '').trim() === '' && (o['Time [min]'] || '').trim() === ''), 'Template must not contain personal time spent')

// Grade Computer: grading weights only — NO grades anywhere (odd columns), no totals.
const gradeRaw = parseCSVRaw(read('Master Tracker - Grade Computer.csv'))
assert(gradeRaw.length >= 5, `Grade Computer parsed only ${gradeRaw.length} rows`)
for (const r of gradeRaw) {
  if (!(r[1] || '').trim()) continue
  for (const col of [4, 6, 8, 10, 12, 14, 15, 16]) {
    assert((r[col] || '').trim() === '', `Grade Computer has a grade in column ${col} for ${r[1]}`)
  }
}

// Weekly hours: the Year 2026 [h] row must be intact and have 52 week cells.
const hoursRows = parseCSVRaw(read('Master Tracker - Time structure and hours of study.csv'))
const yearRow = hoursRows.find(r => (r[0] || '').trim() === 'Year 2026 [h]')
assert(yearRow && yearRow.length === 53, 'Year 2026 [h] row missing/malformed')

// Deadlines: template must be EMPTY (header only) — no personal commitments.
const deadlineRows = parseCSVRaw(read('Master Tracker - Deadlines and Lectures.csv'))
assert(deadlineRows.length === 1, `Deadlines should be header-only, found ${deadlineRows.length}`)
assert(deadlineRows[0].length >= 8, 'Deadlines header malformed')

// Daily planner must parse into weeks, each incl. SUM, Travel, WORK — but all
// cells empty (no personal appointments).
const weeks = parseDailyPlannerRows(parseCSVRaw(read('Master Tracker - Daily.csv')))
assert(weeks.length >= 6, `Daily parsed only ${weeks.length} weeks`)
for (const w of weeks) {
  assert(w.dates.length === 7, `Week ${w.weekNumber} missing dates`)
  assert(w.rows.some(r => r.course === 'SUM' && r.isTotal), `Week ${w.weekNumber} missing SUM row`)
}
const editable = weeks[0].rows.filter(r => !r.isTotal)
assert(editable.some(r => r.course === 'Travel'), 'Week missing Travel row')
assert(editable.some(r => r.course === 'WORK'), 'Week missing WORK row')
for (const week of weeks) {
  for (const r of week.rows.filter(r => !r.isTotal && r.course !== 'Travel' && r.course !== 'WORK')) {
    assert(r.days.every(d => !d.description), `Week ${week.weekNumber}/${r.course} contains personal descriptions`)
  }
}

console.log(`Verify OK: ${courseObjects.length} real courses (no grades/time), empty log + deadlines, ${weeks.length} empty planner weeks.`)