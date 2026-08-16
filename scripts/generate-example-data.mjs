#!/usr/bin/env node
// Rebuilds the six template CSVs in public/data from the owner's personal sheets
// in my_data/ (which is gitignored and never committed), keeping only a *course
// backbone* for the public repo / new accounts:
//   - real course IDs, names, quartiles, EC, grading weights, est. hours
//   - NO grades, NO time spent, NO study log, NO deadlines, NO personal planner
// Runs locally:  node scripts/generate-example-data.mjs   (reads my_data/)
// Then validate with:  node scripts/verify-example-data.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MY_DATA = join(ROOT, 'my_data')
const DATA_DIR = join(ROOT, 'public', 'data')

if (!existsSync(MY_DATA)) {
  console.error('my_data/ not found — this script reads the owner\'s local sheets to build the sanitized template.')
  process.exit(1)
}

// --- minimal CSV helpers --------------------------------------------------------
function parseRows(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field.trim()); field = ''
    } else if (ch === '\n') {
      row.push(field.trim()); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else if (ch === '\r') {
    } else field += ch
  }
  if (field.trim() || row.length > 0) {
    row.push(field.trim())
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}
function esc(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const csv = rows => rows.map(r => r.map(esc).join(',')).join('\n') + '\n'
const read = name => readFileSync(join(MY_DATA, name), 'utf8')

// --- personal comments to strip from the course sheet ---------------------------
const PERSONAL_COMMENTS = new Set([
  'Just math, fun :D',
  'Easy points, this will probably only require like 30 h after doing the other statistics course',
  'just seems super interesting',
])

// --- Master Time Management: real courses, no grades/times/personal notes -------
function buildCourses(rawRows) {
  const header = ['', 'Quartile', 'Courses', 'Abbrev.', 'Start', 'Finish', 'Time [min]',
    'Time [h]', 'Grade', 'Exam', 'Assignment', 'Laboratory', 'EC', 'Comment',
    'Est. Time [h]', 'Ass. Time [h]', 'Material']
  const skipPrefixes = ['General additional time investment', 'Days at University this semester:', 'completed',
    'in process', 'activated', 'inactive', 'Start', 'Now', 'Busy for:', 'This week until now:']
  const rows = [header]
  for (const r of rawRows.slice(1)) {
    const name = (r[2] || '').trim()
    if (!name) continue
    if (skipPrefixes.some(x => name.startsWith(x))) continue
    if (/^\d+(\.\d+)?$/.test(name) || /^[\d:]+$/.test(name)) continue
    let comment = (r[13] || '').trim()
    if (PERSONAL_COMMENTS.has(comment)) comment = ''
    rows.push([
      r[0] || '',                       // year
      r[1] || '',                       // quartile
      name,
      r[3] || '',                       // course ID
      r[4] || '', r[5] || '',           // start, finish
      '', '',                           // Time [min], Time [h]  <- personal, dropped
      '',                               // Grade <- personal, dropped
      r[9] || '', r[10] || '', r[11] || '', // exam/assignment/laboratory %
      r[12] || '',                      // EC
      comment,
      r[14] || '',                      // Est. Time [h] (course planning)
      '',                               // Ass. Time [h] <- personal, dropped
      r[16] || '',                      // Material
    ])
  }
  return rows
}

// --- Grade Computer: weights only, no grades/totals -----------------------------
function buildGrades(rawRows) {
  const rows = []
  for (const r of rawRows) {
    const name = (r[1] || '').trim()
    if (!name || name === 'Course' || name === 'Average') continue
    const line = Array(17).fill('')
    line[1] = name
    line[2] = (r[2] || '').trim() // EC
    for (let off = 0; off < 6; off++) {
      const w = (r[3 + off * 2] || '').trim()
      if (w) line[3 + off * 2] = w // weight only; grade column left empty
    }
    rows.push(line)
  }
  return rows
}

// --- Weekly hours: keep only the aggregate Year 2026 [h] row --------------------
function buildWeeklyHours(rawRows) {
  const header = ['Work Week', ...Array.from({ length: 52 }, (_, i) => i + 1)]
  const src = rawRows.find(r => (r[0] || '').trim() === 'Year 2026 [h]')
  const year = Array(53).fill('')
  year[0] = 'Year 2026 [h]'
  if (src) for (let w = 1; w <= 52; w++) year[w] = (src[w] || '').trim()
  return [header, year]
}

// --- Deadlines: empty (header only) ---------------------------------------------
function buildDeadlines() {
  return [['Description', 'Sessions', 'Time [h]', 'Date', 'This week', 'Today', 'Done?', 'Urgency level']]
}

// --- Daily planner: empty skeleton weeks, reusing the owner's course labels -----
function buildDaily(rawRows) {
  const rows = []
  let firstPlan = -1
  for (let i = 0; i < rawRows.length; i++) {
    if ((rawRows[i][1] || '').trim() === 'Daily plan' && (rawRows[i][2] || '').trim()) { firstPlan = i; break }
  }
  if (firstPlan < 0) throw new Error('Daily sheet has no "Daily plan" block')

  const startDate = (rawRows[firstPlan][2] || '').trim()
  const labels = []
  for (let j = firstPlan + 2; j < rawRows.length; j++) {
    const name = (rawRows[j][1] || '').trim()
    if (!name || name === 'Daily plan') break
    if (name === 'SUM') break
    labels.push(name)
  }
  if (!labels.includes('Travel')) labels.push('Travel')
  if (!labels.includes('WORK')) labels.push('WORK')

  const parseDate = iso => {
    const [d, m, y] = iso.split('/').map(Number)
    return new Date(y, m - 1, d)
  }
  const fmt = date => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  let monday = parseDate(startDate)

  for (let w = 1; w <= 6; w++) {
    const header = Array(17).fill('')
    header[1] = 'Daily plan'
    for (let day = 0; day < 7; day++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + day)
      header[2 + day * 2] = fmt(d)
    }
    rows.push(header)
    const label = Array(17).fill('')
    label[1] = `Week ${w}`
    rows.push(label)
    for (const name of labels) {
      const line = Array(17).fill('')
      line[1] = name
      rows.push(line)
    }
    const sum = Array(17).fill('')
    sum[1] = 'SUM'
    rows.push(sum)
    monday = new Date(monday)
    monday.setDate(monday.getDate() + 7)
  }
  return rows
}

// --- assemble + write -------------------------------------------------------------
const files = {
  'Master Tracker - INPUT_LOG.csv': [['Date', 'Start Time', 'End Time', 'Duration (hours)', 'Duration (minutes)',
    'Course', 'Category', 'Project', 'Location', 'Efficiency', 'Wellbeing',
    'Lecture ID', 'Transport Mode', 'Commute Time', 'Notes']],
  'Master Tracker - Master Time Management.csv': buildCourses(parseRows(read('Master Tracker - Master Time Management.csv'))),
  'Master Tracker - Grade Computer.csv': buildGrades(parseRows(read('Master Tracker - Grade Computer.csv'))),
  'Master Tracker - Time structure and hours of study.csv': buildWeeklyHours(parseRows(read('Master Tracker - Time structure and hours of study.csv'))),
  'Master Tracker - Deadlines and Lectures.csv': buildDeadlines(),
  'Master Tracker - Daily.csv': buildDaily(parseRows(read('Master Tracker - Daily.csv'))),
}

for (const [name, rows] of Object.entries(files)) {
  writeFileSync(join(DATA_DIR, name), csv(rows), 'utf8')
}

const courseCount = files['Master Tracker - Master Time Management.csv'].length - 1
console.log(`Template rebuilt from my_data/ -> public/data/ (${courseCount} real courses, all personal data stripped).`)
