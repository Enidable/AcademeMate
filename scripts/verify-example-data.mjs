// Validates that public/data/ is (a) populated enough to exercise the GUI and
// (b) contains NO personal data. Run after generate-example-data.mjs.
//
//   node scripts/verify-example-data.mjs

import fs from 'node:fs'
import path from 'node:path'
import { parseCSVRaw } from './lib/csv.mjs'
import { PERSONAL_TASK_RE, DEADLINE_TYPES } from './lib/migrate.mjs'

const DIR = path.resolve('public', 'data')
const FILES = [
  'AcademeMate - Study Log.csv',
  'AcademeMate - Courses.csv',
  'AcademeMate - Grade Components.csv',
  'AcademeMate - Course Content.csv',
  'AcademeMate - Daily Plan.csv',
  'AcademeMate - Weekly Totals.csv',
]

const errors = []
const warn = (msg) => errors.push(msg)

function rows(name) {
  const text = fs.readFileSync(path.join(DIR, name), 'utf8')
  return parseCSVRaw(text)
}

// 1. Files exist with headers.
for (const f of FILES) {
  const r = rows(f)
  if (r.length === 0) warn(`${f}: empty or missing`)
}

// 2. Personal content must never appear anywhere.
const scanFiles = ['Study Log.csv', 'Courses.csv', 'Grade Components.csv', 'Course Content.csv', 'Daily Plan.csv'].map(n => `AcademeMate - ${n}`)
const PERSONAL = /therapie|tattoo|schwarzwald|wageningen|urlaub|lukas|tirza|eye\s*test|telefon|ichaela|julia|knie|hond|geburtstag|verwandt/
for (const f of scanFiles) {
  const r = rows(f)
  for (let ri = 0; ri < r.length; ri++) {
    for (let ci = 0; ci < r[ri].length; ci++) {
      const cell = r[ri][ci] || ''
      if (PERSONAL.test(cell)) warn(`${f}: row ${ri + 1} col ${ci + 1} contains personal content: "${cell.slice(0, 60)}"`)
    }
  }
}
for (const f of ['AcademeMate - Daily Plan.csv']) {
  const r = rows(f)
  for (let ri = 0; ri < r.length; ri++) {
    const course = r[ri][1] || ''
    if (['ELSE', 'Travel', 'WORK'].includes(course)) warn(`${f}: row ${ri + 1} keeps personal/private category "${course}"`)
    const task = r[ri][2] || ''
    if (PERSONAL_TASK_RE.test(task)) warn(`${f}: row ${ri + 1} task looks personal: "${task.slice(0, 60)}"`)
  }
}

// 3. No grades anywhere in the template.
const gc = rows('AcademeMate - Grade Components.csv')
for (let ri = 1; ri < gc.length; ri++) {
  const grade = gc[ri][4] || ''
  if (grade !== '') warn(`Grade Components row ${ri + 1}: template must not ship grades (found "${grade}")`)
}

// 4. Study Log must not carry private notes; Weekly Totals must be header-only.
const log = rows('AcademeMate - Study Log.csv')
for (let ri = 1; ri < log.length; ri++) {
  if ((log[ri][14] || '') !== '') warn(`Study Log row ${ri + 1}: notes must be stripped in the template`)
}
const wt = rows('AcademeMate - Weekly Totals.csv')
if (wt.length > 1) warn('Weekly Totals should be header-only in the template (totals are derived)')

// 5. Populated enough to exercise the GUI.
const courses = rows('AcademeMate - Courses.csv').length - 1
if (courses < 15) warn(`Courses: expected >= 15, found ${courses}`)
if (log.length - 1 < 20) warn(`Study Log: expected >= 20 sessions, found ${log.length - 1}`)
if (rows('AcademeMate - Course Content.csv').length - 1 < 10) warn('Course Content: expected >= 10 rows')
if (rows('AcademeMate - Daily Plan.csv').length - 1 < 5) warn('Daily Plan: expected >= 5 rows')

// 6. Course Content semantics: assessments carry a deadline, scheduled items a date.
const cc = rows('AcademeMate - Course Content.csv')
for (let ri = 1; ri < cc.length; ri++) {
  const type = (cc[ri][3] || '').trim().toLowerCase()
  const date = (cc[ri][5] || '').trim()
  const deadline = (cc[ri][6] || '').trim()
  if (DEADLINE_TYPES.has(type) && date && !deadline) warn(`Course Content row ${ri + 1}: assessment "${type}" should carry a deadline, not a scheduled date`)
  if (!DEADLINE_TYPES.has(type) && deadline && !date) warn(`Course Content row ${ri + 1}: scheduled "${type}" item carries a deadline but no date`)
}

if (errors.length) {
  console.error('VERIFY FAILED:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('Verify OK: depersonalised template, populated and personal-data-free.')