// Converts the six legacy "Master Tracker" CSV exports in `my_data/` into the
// new flat-table schema. Produces app-shaped objects; the caller decides whether
// to write them as the user's private import set or as the depersonalised
// public template.
//
// Legacy sources (one per tab):
//   - INPUT_LOG.csv                       -> Study Log
//   - Master Time Management.csv          -> Courses
//   - Grade Computer.csv                  -> Grade Components
//   - Deadlines and Lectures.csv          -> Course Content (schedule + deadlines)
//   - Daily.csv                           -> Daily Plan (grid flattened to rows)
//   - Time structure and hours of study   -> (derived; Weekly Totals stay empty)

import fs from 'node:fs'
import path from 'node:path'
import { parseCSVRaw } from './csv.mjs'
import { toFloat, toInt, parseDateDDMMYYYY } from '../../src/data/normalize.js'

const OLD_FILES = {
  studyLog: 'Master Tracker - INPUT_LOG.csv',
  courses: 'Master Tracker - Master Time Management.csv',
  gradeComponents: 'Master Tracker - Grade Computer.csv',
  lectures: 'Master Tracker - Deadlines and Lectures.csv',
  dailyPlan: 'Master Tracker - Daily.csv',
}

function toKeyedRows(text) {
  const raw = parseCSVRaw(text)
  if (raw.length === 0) return []
  const headers = raw[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
  return raw.slice(1).map(r => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = i < r.length ? r[i] : '' })
    return obj
  })
}

// --- Study Log -----------------------------------------------------------

function convertStudyLog(text) {
  return toKeyedRows(text)
    .filter(r => (r.course || '').trim())
    .map(r => {
      let durationHours = toFloat(r.duration_hours)
      let durationMinutes = toInt(r.duration_minutes)
      const minutesRaw = (r.duration_minutes || '').trim()
      if (minutesRaw.includes(':')) {
        const [h, m] = minutesRaw.split(':')
        const hh = toFloat(h) || 0
        const mm = toFloat(m) || 0
        durationHours = durationHours ?? hh + mm / 60
        durationMinutes = hh * 60 + mm
      }
      return {
        date: parseDateDDMMYYYY((r.date || '').trim()),
        startTime: (r.start_time || '').trim(),
        endTime: (r.end_time || '').trim(),
        durationHours: durationHours ?? 0,
        durationMinutes: durationMinutes ?? 0,
        course: (r.course || '').trim(),
        category: (r.category || '').trim(),
        project: (r.project || '').trim() || null,
        location: (r.location || '').trim(),
        efficiency: toInt((r.efficiency || '').trim()),
        wellbeing: toInt((r.wellbeing || '').trim()),
        lectureId: (r.lecture_id || '').trim() || null,
        transportMode: (r.transport_mode || '').trim() || null,
        commuteTime: toFloat((r.commute_time || '').trim()),
        notes: (r.notes || '').trim() || null,
      }
    })
}

// --- Courses -------------------------------------------------------------

const SYSTEM_ROWS = /^(General additional time investment|Days at University this semester:|This week until now:|Start|Now|Busy for:|completed|in process|activated|inactive)$/

function convertCourses(text) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const rows = toKeyedRows(text)
  const courses = []
  for (const r of rows) {
    const name = (r.courses || '').trim()
    if (!name) continue
    if (SYSTEM_ROWS.test(name)) continue
    if (/^\d+(\.\d+)?$|^[\d:]+$/.test(name)) continue

    const start = parseDateDDMMYYYY((r.start || '').trim())
    const grade = toFloat(r.grade)
    const comment = (r.comment || '').trim() || null

    const gradingParts = [r.exam, r.assignment, r.laboratory]
      .map(s => (s || '').trim())
      .filter(Boolean)
    const grading = gradingParts.length ? gradingParts.join('; ') : null
    const notes = comment && grading ? `${comment}. ${grading}` : comment || grading

    let status = 'planned'
    if (grade != null) status = 'completed'
    else if (start && start <= todayStr) status = 'in process'

    courses.push({
      id: name,
      course: name,
      code: (r.abbrev || '').trim() || null,
      abbrev: null,
      year: (r[''] || '').trim() || null,
      quartile: (r.quartile || '').trim() || null,
      start,
      finish: parseDateDDMMYYYY((r.finish || '').trim()),
      ec: toFloat(r.ec),
      status,
      estHours: toFloat(r.est_time_h),
      notes,
      comment: notes,
      grade: null,
    })
  }
  return courses
}

// --- Grade Components ----------------------------------------------------

function convertGradeComponents(text) {
  const groups = []
  const raw = parseCSVRaw(text)
  for (const row of raw) {
    const course = (row[1] || '').trim()
    if (!course || course === 'Course' || course === 'Average') continue
    const components = []
    for (let off = 0; off < 6; off++) {
      const weight = toFloat(row[3 + off * 2])
      const grade = toFloat(row[4 + off * 2])
      if (weight != null || grade != null) {
        components.push({
          type: 'other',
          id: `Component ${off + 1}`,
          name: `Component ${off + 1}`,
          weight,
          grade,
          dueDate: null,
          hoursSpent: null,
          done: null,
          notes: null,
        })
      }
    }
    const check = components.reduce((s, c) => s + (c.weight || 0), 0)
    groups.push({ course, ec: toFloat(row[2]), components, totalGrade: null, check: check || null })
  }
  return groups
}

// --- Lectures (legacy "Deadlines and Lectures") --------------------------

const CODE_TO_COURSE = [
  [/dppm/i, 'Design Principles for Robotic and Mechatronic Mechanisms'],
  [/ppd/i, 'Professional and Personal Development'],
  [/asdfr|advanced software/i, 'Advanced Software Development for Robotics'],
  [/bmhm|biomechanics/i, 'Biomechanics of Human Movement'],
  [/m&s|modelling and simulation|m s/i, 'Modelling and Simulation'],
  [/^ai|ai\d|autonomous/i, 'AI for Autonomous Robots'],
  [/^\bbm\d?\b/i, 'Biomechatronics'],
  [/sysid|system ident/i, 'System Identification with Parameter Estimation and Machine Learning'],
]

function mapCode(code) {
  for (const [re, course] of CODE_TO_COURSE) {
    if (re.test(code)) return course
  }
  return code
}

// Legacy "Deadlines and Lectures" uses these kinds; assessments carry a due
// date (deadline), everything else a scheduled date. Mirrors DEADLINE_TYPES in
// src/config.js (node can't import that Vite-dependent file).
export const DEADLINE_TYPES = new Set(['project', 'assignment', 'exam', 'quiz', 'presentation'])

function kindOf(desc) {
  const d = desc.toLowerCase()
  if (/self study/.test(d)) return 'self study'
  if (/q\s*&\s*a|q&a/.test(d)) return 'q&a'
  if (/exam review|review/.test(d)) return 'exam review'
  if (/resit/.test(d)) return 'resit'
  if (/lectorial/.test(d)) return 'lectorial'
  if (/lecture/.test(d)) return 'lecture'
  if (/tutorial/.test(d)) return 'tutorial'
  if (/lab|practical/.test(d)) return 'practical'
  if (/presentation/.test(d)) return 'presentation'
  if (/assignment|assign/.test(d)) return 'assignment'
  if (/quiz/.test(d)) return 'quiz'
  if (/exam/.test(d)) return 'exam'
  if (/peer review|oral/.test(d)) return 'oral exam'
  return 'other'
}

// An assessment's date is a *deadline*; a lecture-ish item's date is *scheduled*.
function dateFields(kind, dateStr) {
  const parsed = parseDateDDMMYYYY(dateStr.trim())
  if (DEADLINE_TYPES.has(kind)) return { date: null, deadline: parsed }
  return { date: parsed, deadline: null }
}

// The legacy "Deadlines and Lectures" sheet is a two-column-block layout:
//   col 0-7  : left block   (Description, Sessions, Time[h], Date, …, Urgency)
//   col 8    : separator (always empty)
//   col 9-16 : right block  (same columns shifted by one)
//   col 18-20: ad-hoc per-assignment "ID / Hours" block
function convertContent(text) {
  const raw = parseCSVRaw(text)
  const items = []
  let leftCourse = ''
  let rightCourse = ''

  const push = item => {
    items.push(item)
    return item
  }

  const emit = (course, a, b, c, d, doneRaw, urgencyRaw) => {
    const kind = kindOf(a)
    const sessions = b.trim()
    const contentId = kind === 'other' ? a : sessions ? `${kind} ${sessions}` : kind
    const done = String(doneRaw).trim() === '1' ? 'done' : ''
    const urgency = urgencyRaw.trim() || 'Medium'
    const marker = (!done && urgency === 'Extremely High') ? 'important' : ''
    const time = toFloat(c.trim())
    const { date, deadline } = dateFields(kind, d)
    push({
      course,
      course2: null,
      contentId: contentId || null,
      type: kind,
      topic: a,
      date,
      deadline,
      start: '',
      end: '',
      marker,
      location: null,
      hoursSpent: time,
      materialHours: null,
      content: null,
      done,
      description: a,
      urgency: done ? 'Complete' : urgency,
      time: time ?? 0,
    })
  }

  for (const row of raw) {
    const leftDesc = (row[0] || '').trim()
    const leftName = (row[1] || '').trim()
    const rightDesc = (row[9] || '').trim()
    const rightName = (row[10] || '').trim()
    const idCode = (row[19] || '').trim()
    const idHours = (row[20] || '').trim()

    // Left block: `,CourseName,,,,,,,` sets the course.
    if (leftDesc === '' && leftName && !(row[2] || '').trim() && !(row[3] || '').trim() && leftName !== 'ID') {
      leftCourse = leftName
      continue
    }
    // Right block: `,,,,,,,,,CourseName,,,,,,,` sets the course.
    if (rightDesc && !(row[11] || '').trim() && !(row[12] || '').trim() && rightName === '' && rightDesc !== 'Description' && rightDesc !== 'ID') {
      rightCourse = rightDesc
      continue
    }
    // Ad-hoc per-assignment hours: `,,,,,,,,,,,,,,,,,,,ID,Hours` rows.
    if (idCode && idHours && !(row[18] || '').trim() && toFloat(idHours) != null && idCode !== 'ID') {
      push({
        course: mapCode(idCode),
        course2: null,
        contentId: idCode,
        type: 'assignment',
        topic: idCode,
        date: null,
        deadline: null,
        start: '',
        end: '',
        marker: '',
        location: null,
        hoursSpent: toFloat(idHours),
        materialHours: null,
        content: null,
        done: '',
        description: idCode,
        urgency: 'Medium',
        time: toFloat(idHours) ?? 0,
      })
      continue
    }
    if (leftDesc && leftCourse) emit(leftCourse, leftDesc, row[1] || '', row[2] || '', row[3] || '', row[6] || '', row[7] || '')
    if (rightDesc && rightDesc !== 'Description' && rightCourse) emit(rightCourse, rightDesc, row[10] || '', row[11] || '', row[12] || '', row[15] || '', row[16] || '')
  }
  return items
}

// --- Daily Plan (grid flattened) ----------------------------------------

function convertDailyPlan(text) {
  const raw = parseCSVRaw(text)
  const plan = []
  let i = 0
  while (i < raw.length) {
    const row = raw[i]
    if ((row[1] || '').trim() !== 'Daily plan' || !(row[2] || '').trim()) { i++; continue }
    const dates = []
    for (let d = 0; d < 7; d++) dates.push((row[2 + d * 2] || '').trim())
    let j = i + 2
    while (j < raw.length) {
      const courseRow = raw[j]
      const courseName = (courseRow[1] || '').trim()
      if (!courseName || courseName === 'Daily plan' || courseName === 'SUM') break
      for (let d = 0; d < 7; d++) {
        const task = (courseRow[2 + d * 2] || '').trim()
        const hours = toFloat(courseRow[3 + d * 2])
        if (task || (hours != null && hours > 0)) {
          plan.push({
            date: parseDateDDMMYYYY(dates[d]),
            course: courseName,
            task,
            plannedHours: 0,
            actualHours: hours ?? 0,
            done: null,
            notes: null,
          })
        }
      }
      j++
    }
    i = j
  }
  return plan
}

// --- Public entry --------------------------------------------------------

export function buildTables(dir) {
  const read = name => fs.readFileSync(path.join(dir, name), 'utf8')
  return {
    studyLog: convertStudyLog(read(OLD_FILES.studyLog)),
    courses: convertCourses(read(OLD_FILES.courses)),
    gradeComponents: convertGradeComponents(read(OLD_FILES.gradeComponents)),
    content: convertContent(read(OLD_FILES.lectures)),
    dailyPlan: convertDailyPlan(read(OLD_FILES.dailyPlan)),
    weeklyOverrides: {},
    stats: {
      studyLog: convertStudyLog(read(OLD_FILES.studyLog)).length,
    },
  }
}

// --- Depersonalisation ---------------------------------------------------

export const PERSONAL_TASK_RE = /therapie|tattoo|schwarzwald|wageningen|urlaub|lukas|tirza|eye|meet\s|appoint|workday|mails|important\s*stuff|spreadsheet/i

export function sanitize(tables) {
  const gradeComponents = tables.gradeComponents.map(g => ({
    ...g,
    components: g.components.map(c => ({
      ...c,
      grade: null,
      hoursSpent: null,
      dueDate: null,
      done: null,
      notes: null,
    })),
  }))

  const studyLog = tables.studyLog.map(e => ({
    ...e,
    notes: null,
    project: e.project && /^\s*\d/i.test(e.project) ? null : e.project,
  }))

  const content = tables.content.map(c => ({ ...c, content: null }))

  const dailyPlan = tables.dailyPlan.filter(r => {
    if (['ELSE', 'Travel', 'WORK'].includes(r.course)) return false
    return !PERSONAL_TASK_RE.test(r.task || '')
  })

  return {
    studyLog,
    courses: tables.courses,
    gradeComponents,
    content,
    dailyPlan,
    weeklyOverrides: {},
  }
}