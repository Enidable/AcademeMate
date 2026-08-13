#!/usr/bin/env node
// Regenerates the six example CSVs in public/data with synthetic, clearly-fictional
// data so the (public) GitHub Pages repo never contains personal records.
// Run: node scripts/generate-example-data.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'public', 'data')

// --- deterministic PRNG so the generated files are stable between runs ---------
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260707)
const rint = (min, max) => Math.floor(rand() * (max - min + 1)) + min
const pick = arr => arr[Math.floor(rand() * arr.length)]
const round2 = n => Math.round(n * 100) / 100

function weightedPick(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let roll = rand() * total
  for (const [value, w] of entries) {
    roll -= w
    if (roll <= 0) return value
  }
  return entries[entries.length - 1][0]
}

const pad2 = n => String(n).padStart(2, '0')
function fmtDDMMYYYY(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`
}
function fmtHHMM(minutesOfDay) {
  return `${pad2(Math.floor(minutesOfDay / 60))}:${pad2(minutesOfDay % 60)}`
}

// --- CSV encoding (quotes anything with comma/quote/newline) -------------------
function esc(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const row = r => r.map(esc).join(',')
const csv = rows => rows.map(row).join('\n') + '\n'

// --- shared fictional course set ------------------------------------------------
const COURSES = [
  { name: 'Advanced Programming', abbrev: 'AP', ec: 6 },
  { name: 'Linear Algebra', abbrev: 'LA', ec: 5 },
  { name: 'Physics 1', abbrev: 'PHYS1', ec: 5 },
  { name: 'Robotics Fundamentals', abbrev: 'ROBO', ec: 6 },
  { name: 'Academic Writing', abbrev: 'WRIT', ec: 3 },
  { name: 'History of Computing', abbrev: 'ELEC', ec: 4 },
]

const CATEGORIES = [
  ['Studying', 30], ['Project Work', 16], ['Lecture', 14], ['Group Work', 10],
  ['Exam Prep', 8], ['Practical', 6], ['Meeting', 6], ['Exercise', 4],
  ['Presentation', 2], ['Other', 4],
]
const LOCATIONS = [['Home', 60], ['University', 28], ['Elsewhere', 12]]
const NOTES = [
  '', '', '', 'Chapter exercises', 'Review lecture notes', 'Past exam paper', 'Plan next week', '',
]

function weekdayDates(start, weeks) {
  const out = []
  const d = new Date(start)
  while (out.length < weeks * 5) {
    const day = d.getDay()
    if (day >= 1 && day <= 5) out.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// --- INPUT_LOG -----------------------------------------------------------------
function buildInputLog() {
  const header = ['Date', 'Start Time', 'End Time', 'Duration (hours)', 'Duration (minutes)',
    'Course', 'Category', 'Project', 'Location', 'Efficiency', 'Wellbeing',
    'Lecture ID', 'Transport Mode', 'Commute Time', 'Notes']
  const rows = [header]
  const start = new Date(2026, 0, 5) // Mon 5 Jan 2026
  for (const date of weekdayDates(start, 7)) {
    const sessions = rint(1, 3)
    for (let s = 0; s < sessions; s++) {
      const course = pick(COURSES)
      const category = weightedPick(CATEGORIES)
      const location = weightedPick(LOCATIONS)
      const minutes = rint(30, 240)
      const startMin = rint(480, 1020)
      const endMin = startMin + minutes
      const efficiency = rint(2, 9)
      const wellbeing = rint(2, 9)
      const isUni = location === 'University'
      const transport = isUni ? weightedPick([['Bicycle', 45], ['Public Transport', 35], ['', 20]]) : ''
      const commute = isUni && transport ? rint(20, 110) : ''
      let project = ''
      if (['Project Work', 'Group Work', 'Practical'].includes(category)) project = `${course.abbrev} Project`
      if (category === 'Presentation') project = `${course.abbrev} Presentation`
      let lectureId = ''
      if (category === 'Lecture') lectureId = `${course.abbrev}-L${rint(1, 10)}`
      if (category === 'Exam Prep') lectureId = `${course.abbrev}-E${rint(1, 3)}`

      rows.push([
        fmtDDMMYYYY(date),
        fmtHHMM(startMin),
        fmtHHMM(endMin),
        round2(minutes / 60),
        minutes,
        course.name,
        category,
        project,
        location,
        efficiency,
        wellbeing,
        lectureId,
        transport,
        commute,
        pick(NOTES),
      ])
    }
  }
  return rows
}

// --- Master Time Management ----------------------------------------------------
function buildCourses() {
  const header = ['', 'Quartile', 'Courses', 'Abbrev.', 'Start', 'Finish', 'Time [min]',
    'Time [h]', 'Grade', 'Exam', 'Assignment', 'Laboratory', 'EC', 'Comment',
    'Est. Time [h]', 'Ass. Time [h]', 'Material']
  const plan = [
    { c: COURSES[0], min: 6400, grade: 8.5, exam: '', assign: '60%', lab: 'Labwork', ec: 6, comment: 'Group project + written exam', est: 140 },
    { c: COURSES[1], min: 4200, grade: 7.8, exam: '80%', assign: '20%', lab: '', ec: 5, comment: 'Weekly problem sets', est: 120 },
    { c: COURSES[2], min: 3900, grade: '-', exam: '40%', assign: '3 x 20%', lab: 'Labwork', ec: 5, comment: 'Midterm + lab reports', est: 130 },
    { c: COURSES[3], min: 5200, grade: null, exam: '60%', assign: '40%', lab: '', ec: 6, comment: 'In progress — project in teams of two', est: 150 },
    { c: COURSES[4], min: 1500, grade: null, exam: '', assign: '100%', lab: '', ec: 3, comment: 'Three essays', est: 60 },
    { c: COURSES[5], min: 1800, grade: null, exam: '100%', assign: '', lab: '', ec: 4, comment: 'Oral exam + reading list', est: 80 },
  ]
  const rows = [header]
  for (const p of plan) {
    rows.push([
      '2A', 'Q1', p.c.name, p.c.abbrev,
      '02/02/2026', '12/04/2026',
      p.min, round2(p.min / 60),
      p.grade ?? '', p.exam, p.assign, p.lab, p.ec, p.comment,
      p.est, round2(p.min / 60 / 1.0), '',
    ])
  }
  // a couple of older, finished courses to fill out history
  rows.push(['1B', 'Q2', 'Introduction to Mathematics', 'MATH', '01/09/2025', '30/10/2025', 3000, 50, 9.1, '100%', '', '', 5, 'Early study support', 45, '', ''])
  rows.push(['1B', 'Q2', 'Project Skills', 'PROJ', '01/09/2025', '30/11/2025', 1800, 30, 8.0, '', '100%', '', 2, 'Group portfolio', 35, '', ''])
  return rows
}

// --- Grade Computer -------------------------------------------------------------
function buildGrades() {
  const rows = []
  const plans = [
    { c: COURSES[0], comps: [[0.2, 8.4], [0.2, 9.0], [0.6, 8.4]] },
    { c: COURSES[1], comps: [[0.15, 7.0], [0.15, 8.2], [0.15, 7.5], [0.4, 8.0], [0.15, 7.8]] },
    { c: COURSES[2], comps: [[0.4, 7.4], [0.2, 8.1], [0.4, 7.7]] },
    { c: COURSES[3], comps: [[0.6, null], [0.4, null]] },
    { c: COURSES[4], comps: [[1.0, null]] },
    { c: COURSES[5], comps: [[1.0, null]] },
  ]
  for (const p of plans) {
    const line = Array(17).fill('')
    line[0] = ''
    line[1] = p.c.name
    line[2] = p.c.ec
    for (let i = 0; i < Math.min(p.comps.length, 6); i++) {
      line[3 + i * 2] = p.comps[i][0]
      if (p.comps[i][1] != null) line[4 + i * 2] = p.comps[i][1]
    }
    const graded = p.comps.filter(([, g]) => g != null)
    const total = graded.length && graded.reduce((s, [, g]) => s + g * 1, 0) / graded.length
    line[15] = graded.length ? round2(total) : '-'
    line[16] = graded.length ? 1.0 : 0.0
    rows.push(line)
  }
  return rows
}

// --- Time structure and hours of study -----------------------------------------
function buildWeeklyHours() {
  const rows = []
  const header = ['Work Week', ...Array.from({ length: 52 }, (_, i) => i + 1)]
  rows.push(header)
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  for (const d of days) {
    const line = Array(53).fill('')
    line[0] = d
    for (let w = 1; w <= 30; w++) line[w] = rand() < 0.85 ? round2(rand() * 8) : ''
    rows.push(line)
  }
  rows.push([])
  const year = Array(53).fill('')
  year[0] = 'Year 2026 [h]'
  for (let w = 1; w <= 30; w++) year[w] = round2(3 + rand() * 30)
  rows.push(year)
  return rows
}

// --- Deadlines and Lectures -----------------------------------------------------
function buildDeadlines() {
  const header = ['Description', 'Sessions', 'Time [h]', 'Date', 'This week', 'Today', 'Done?', 'Urgency level']
  const rows = [header]
  const items = [
    ['Assignment 1', 2, 8, '2026-01-16', 'Complete', 1],
    ['Quiz 1', 1, 2, '2026-01-23', 'Complete', 1],
    ['Lab report 1', 3, 9, '2026-02-06', 'Complete', 1],
    ['Midterm exam', 4, 14, '2026-02-13', 'Extremely High', 0],
    ['Group presentation', 2, 6, '2026-02-20', 'High', 0],
    ['Assignment 2', 2, 8, '2026-02-27', 'High', 0],
    ['Essay draft', 1, 5, '2026-03-06', 'Medium', 0],
    ['Lab report 2', 3, 10, '2026-03-13', 'Medium', 0],
    ['Final exam', 5, 20, '2026-03-20', 'Extremely High', 0],
    ['Portfolio hand-in', 2, 7, '2026-03-27', 'Low', 0],
  ]
  for (const [desc, sessions, time, iso, urgency, done] of items) {
    const [y, m, d] = iso.split('-')
    rows.push([desc, sessions, time, `${d}/${m}/${y}`, 0, 0, done, urgency])
  }
  return rows
}

// --- Daily planner --------------------------------------------------------------
function buildDaily() {
  const rows = []
  const weekStarts = []
  const d = new Date(2026, 0, 5)
  for (let w = 0; w < 8; w++) {
    weekStarts.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }

  const blocks = COURSES.slice(0, 4).map(c => c.name)
  blocks.push('ELSE')

  weekStarts.forEach((startDate, wi) => {
    rows.push([]) // blank separator (skipped by the parser)
    const header = Array(17).fill('')
    header[1] = 'Daily plan'
    for (let day = 0; day < 7; day++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + day)
      header[2 + day * 2] = fmtDDMMYYYY(date)
    }
    rows.push(header)

    const label = Array(17).fill('')
    label[1] = `Week ${wi + 1}`
    rows.push(label)

    const daySums = Array(7).fill(0)
    for (const name of blocks) {
      const line = Array(17).fill('')
      line[1] = name
      for (let day = 0; day < 7; day++) {
        if (rand() < 0.35) {
          line[2 + day * 2] = pick(['Homework', 'Review', 'Group work', 'Exam prep', ''])
          line[3 + day * 2] = round2(0.5 + rand() * 3.5)
        }
      }
      const total = round2(Array.from({ length: 7 }, (_, day) => parseFloat(line[3 + day * 2] || 0)).reduce((s, v) => s + v, 0))
      line[16] = total
      rows.push(line)
      for (let day = 0; day < 7; day++) daySums[day] += parseFloat(line[3 + day * 2] || 0)
    }

    const travel = Array(17).fill('')
    travel[1] = 'Travel'
    for (let day = 0; day < 5; day++) travel[3 + day * 2] = 2
    travel[16] = 10
    rows.push(travel)
    for (let day = 0; day < 5; day++) daySums[day] += 2

    const work = Array(17).fill('')
    work[1] = 'WORK'
    work[3] = 'Workday' // Mon desc? use Tue/Thu hours
    work[4] = 4.25
    work[8] = 'Workday'
    work[10] = 4.5
    work[16] = 8.75
    rows.push(work)
    daySums[1] += 4.25
    daySums[3] += 4.5

    const sum = Array(17).fill('')
    sum[1] = 'SUM'
    for (let day = 0; day < 7; day++) sum[3 + day * 2] = round2(daySums[day])
    sum[16] = round2(daySums.reduce((s, v) => s + v, 0))
    rows.push(sum)
  })
  return rows
}

// --- assemble + write ------------------------------------------------------------
const files = {
  'Master Tracker - INPUT_LOG.csv': buildInputLog(),
  'Master Tracker - Master Time Management.csv': buildCourses(),
  'Master Tracker - Grade Computer.csv': buildGrades(),
  'Master Tracker - Time structure and hours of study.csv': buildWeeklyHours(),
  'Master Tracker - Deadlines and Lectures.csv': buildDeadlines(),
  'Master Tracker - Daily.csv': buildDaily(),
}

mkdirSync(DATA_DIR, { recursive: true })
for (const [name, rows] of Object.entries(files)) {
  writeFileSync(join(DATA_DIR, name), csv(rows), 'utf8')
}

// --- structural checks (mirror what the app parsers require) ---------------------
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}
const inputLog = files['Master Tracker - INPUT_LOG.csv'].slice(1)
assert(inputLog.length >= 50, `INPUT_LOG has too few rows (${inputLog.length})`)
assert(inputLog.every(r => r[5]), 'INPUT_LOG row missing course')

const courses = files['Master Tracker - Master Time Management.csv'].slice(1)
assert(courses.length >= 6, `Courses has too few rows (${courses.length})`)
assert(courses.every(r => r[2]), 'Course row missing name')

const grades = files['Master Tracker - Grade Computer.csv']
assert(grades.length >= 5, `Grade Computer has too few rows (${grades.length})`)

const hours = files['Master Tracker - Time structure and hours of study.csv']
const yearRow = hours.find(r => (r[0] || '').trim() === 'Year 2026 [h]')
assert(yearRow && yearRow.length === 53, 'Weekly hours: Year 2026 [h] row missing/malformed')
assert(yearRow.slice(1).some(v => v !== ''), 'Weekly hours row has no values')

const deadlines = files['Master Tracker - Deadlines and Lectures.csv'].slice(1)
assert(deadlines.length >= 8, `Deadlines has too few rows (${deadlines.length})`)
assert(deadlines.every(r => r[0] && r[3]), 'Deadline row missing description/date')

const daily = files['Master Tracker - Daily.csv']
const weekCount = daily.filter(r => (r[1] || '').trim() === 'Daily plan').length
assert(weekCount >= 6, `Daily planner has too few weeks (${weekCount})`)
assert(daily.filter(r => (r[1] || '').trim() === 'SUM').length === weekCount, 'Daily planner missing SUM rows')

console.log(`Wrote example data OK:
  INPUT_LOG rows: ${inputLog.length}
  courses:        ${courses.length}
  grade rows:     ${grades.length}
  deadlines:      ${deadlines.length}
  daily weeks:    ${weekCount}`)
