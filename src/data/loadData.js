import { parseCSVRows, parseCSVRaw } from '../utils/csv.js'
import {
  ASSET_BASE,
  TAB_STUDY_LOG,
  TAB_COURSES,
  TAB_GRADES,
  TAB_CONTENT,
  TAB_DAILY,
  TAB_HOURS,
  TAB_CALENDAR,
  CONTENT_TYPES,
} from '../config'
import { toFloat, toInt, parseDateDDMMYYYY } from './normalize.js'

const CSV_FILES = {
  [TAB_STUDY_LOG]: `${ASSET_BASE}data/AcademeMate - Study Log.csv`,
  [TAB_COURSES]: `${ASSET_BASE}data/AcademeMate - Courses.csv`,
  [TAB_GRADES]: `${ASSET_BASE}data/AcademeMate - Grade Components.csv`,
  [TAB_CONTENT]: `${ASSET_BASE}data/AcademeMate - Course Content.csv`,
  [TAB_DAILY]: `${ASSET_BASE}data/AcademeMate - Daily Plan.csv`,
  [TAB_HOURS]: `${ASSET_BASE}data/AcademeMate - Weekly Totals.csv`,
  [TAB_CALENDAR]: `${ASSET_BASE}data/AcademeMate - Calendar.csv`,
}

// --- Study Log ------------------------------------------------------------

function parseStudyLog(rows) {
  return rows
    .filter(r => (r.course_id || '').trim())
    .map((r, i) => {
      const durationHours = toFloat(r.duration_hours)
      const durationMinutes = toInt(r.duration_minutes)
      const date = parseDateDDMMYYYY((r.date || '').trim())
      const course = (r.course_id || '').trim()
      return {
        id: `${date}|${course}|${(r.start_time || '').trim()}|${i}`,
        date,
        startTime: (r.start_time || '').trim(),
        endTime: (r.end_time || '').trim(),
        durationHours: durationHours ?? 0,
        durationMinutes: durationMinutes ?? 0,
        course,
        category: (r.category || '').trim(),
        project: (r.project || '').trim() || null,
        location: (r.location || '').trim(),
        efficiency: toInt((r.efficiency || '').trim()),
        wellbeing: toInt((r.wellbeing || '').trim()),
        lectureId: (r.lecture_id || '').trim() || null,
        transportMode: (r.transport_mode || '').trim() || null,
        commuteTime: toFloat((r.commute_minutes || '').trim()),
        notes: (r.notes || '').trim() || null,
      }
    })
}

// --- Courses --------------------------------------------------------------

function parseCourses(rows) {
  return rows
    .filter(r => (r.course_id || '').trim())
    .map(r => ({
      id: (r.course_id || '').trim(),
      course: (r.course_id || '').trim(),
      code: (r.code || '').trim() || null,
      abbrev: (r.abbrev || '').trim() || null,
      year: (r.year || '').trim() || null,
      quartile: (r.quartile || '').trim() || null,
      start: parseDateDDMMYYYY((r.start || '').trim()),
      finish: parseDateDDMMYYYY((r.finish || '').trim()),
      ec: toFloat((r.ec || '').trim()),
      status: (r.status || '').trim() || null,
      estHours: toFloat((r.est_hours || '').trim()),
      notes: (r.notes || '').trim() || null,
      comment: (r.notes || '').trim() || null,
      grade: null,
    }))
}

// --- Grade Components -----------------------------------------------------

function parseGradeComponents(rows) {
  const map = {}
  for (const r of rows) {
    const course = (r.course_id || '').trim()
    if (!course) continue
    if (!map[course]) {
      map[course] = { course, components: [], totalGrade: null, check: null }
    }
    const entry = map[course]
    const weight = toFloat(r.weight)
    const grade = toFloat(r.grade)
    const type = ((r.type || 'other').trim().toLowerCase() || 'other')
    const name = (r.component || '').trim()
    const dueDate = parseDateDDMMYYYY((r.due_date || '').trim())
    const hoursSpent = toFloat(r.hours_spent)
    const done = (r.done || '').trim()
    entry.components.push({
      type,
      id: name || null,
      name,
      weight,
      grade,
      dueDate,
      hoursSpent,
      done: done === '' ? null : done,
      notes: (r.notes || '').trim() || null,
    })
  }
  for (const g of Object.values(map)) {
    const totalWeight = g.components.reduce((s, c) => s + (c.weight || 0), 0)
    const weighted = g.components.reduce((s, c) => (c.weight && c.grade != null ? s + c.weight * c.grade : s), 0)
    g.check = totalWeight > 0 ? totalWeight : null
    g.totalGrade = totalWeight > 0 ? weighted / totalWeight : null
  }
  return Object.values(map)
}

// --- Course Content (schedule + assessments) -----------------------------

const CONTENT_TYPES_SET = new Set(CONTENT_TYPES)

function parseContent(rows) {
  const urgencyFor = (marker, done) => {
    const m = (marker || '').trim().toLowerCase()
    if (done && String(done).toLowerCase() === 'done') return 'Complete'
    if (m === 'skip') return 'Low'
    if (m === 'important') return 'High'
    if (m === 'mandatory') return 'Medium'
    return 'Medium'
  }
  return rows
    .filter(r => (r.content_id || r.topic || '').trim())
    .map(r => {
      const course = (r.course_id || '').trim()
      const course2 = (r.course_2 || '').trim() || null
      const type = ((r.type || '').trim().toLowerCase())
      const topic = (r.topic || '').trim()
      const contentId = (r.content_id || '').trim()
      const done = (r.done || '').trim()
      const hoursSpent = toFloat(r.hours_spent)
      return {
        id: `${course}|${course2 || ''}|${contentId}|${(r.date || '').trim()}|${(r.deadline || '').trim()}|${topic}`,
        description: topic || contentId || type || 'Task',
        course,
        course2,
        contentId: contentId || null,
        type: CONTENT_TYPES_SET.has(type) ? type : 'other',
        topic,
        date: parseDateDDMMYYYY((r.date || '').trim()),
        deadline: parseDateDDMMYYYY((r.deadline || '').trim()),
        start: (r.start || '').trim(),
        end: (r.end || '').trim(),
        marker: (r.marker || '').trim() || null,
        location: (r.location || '').trim() || null,
        hoursSpent,
        materialHours: toFloat(r.material_hours),
        content: (r.content || '').trim() || null,
        calId: (r.cal_id || '').trim() || null,
        done,
        urgency: urgencyFor(r.marker, done),
        time: hoursSpent ?? 0,
      }
    })
    .sort((a, b) => {
      const da = a.date || a.deadline || '9999'
      const db = b.date || b.deadline || '9999'
      return new Date(da) - new Date(db)
    })
}

// --- Daily Plan (flat rows) ----------------------------------------------

function parseDailyPlan(rows) {
  return rows
    .filter(r => (r.date || '').trim() && (r.course_id || '').trim())
    .map(r => {
      const date = parseDateDDMMYYYY((r.date || '').trim())
      const course = (r.course_id || '').trim()
      const task = (r.task || '').trim()
      return {
        id: `${date}|${course}|${task}`,
        date,
        course,
        task,
        plannedHours: toFloat(r.planned_hours) ?? 0,
        actualHours: toFloat(r.actual_hours) ?? 0,
        done: (r.done || '').trim() || null,
        notes: (r.notes || '').trim() || null,
      }
    })
}

// --- Weekly Totals (overrides only) --------------------------------------

function parseWeeklyOverrides(rows) {
  const map = {}
  for (const r of rows) {
    const year = toInt(r.year)
    const week = toInt(r.week)
    if (year == null || week == null) continue
    map[`${year}-${week}`] = {
      year,
      week,
      total: toFloat(r.total_hours) ?? 0,
      notes: (r.notes || '').trim() || null,
    }
  }
  return map
}

// --- Calendar (flattened timetable events) -------------------------------

function parseCalendar(rows) {
  return rows
    .filter(r => (r.date || '').trim() && (r.summary || r.uid || '').trim())
    .map(r => {
      const allDay = String(r.all_day || '').trim()
      return {
        id: `${(r.uid || '').trim()}|${(r.date || '').trim()}|${(r.start_time || '').trim()}`,
        date: parseDateDDMMYYYY((r.date || '').trim()),
        startTime: (r.start_time || '').trim(),
        endTime: (r.end_time || '').trim(),
        allDay: allDay === '1' || allDay.toLowerCase() === 'true',
        summary: (r.summary || '').trim(),
        course: (r.course_id || '').trim() || null,
        location: (r.location || '').trim() || null,
        description: (r.description || '').trim() || null,
        source: (r.source || '').trim() || null,
        uid: (r.uid || '').trim() || null,
        status: (r.status || '').trim() || null,
        calId: (r.cal_id || '').trim() || null,
      }
    })
}

// --- Aggregation ---------------------------------------------------------

export function attachCourseGrades(courses, gradeComponents) {
  const byName = {}
  for (const g of gradeComponents) byName[g.course] = g.totalGrade
  for (const c of courses) {
    if (byName[c.course] != null) c.grade = byName[c.course]
  }
  return courses
}

// rowsByTab maps canonical tab title -> 2D array (from Drive or bundled CSVs).
export function parseAll(rowsByTab) {
  const courses = parseCourses(parseCSVRows(rowsByTab[TAB_COURSES] || []))
  const gradeComponents = parseGradeComponents(parseCSVRows(rowsByTab[TAB_GRADES] || []))
  attachCourseGrades(courses, gradeComponents)
  return {
    studyLog: parseStudyLog(parseCSVRows(rowsByTab[TAB_STUDY_LOG] || [])),
    courses,
    gradeComponents,
    content: parseContent(parseCSVRows(rowsByTab[TAB_CONTENT] || [])),
    dailyPlan: parseDailyPlan(parseCSVRows(rowsByTab[TAB_DAILY] || [])),
    weeklyOverrides: parseWeeklyOverrides(parseCSVRows(rowsByTab[TAB_HOURS] || [])),
    calendarEvents: parseCalendar(parseCSVRows(rowsByTab[TAB_CALENDAR] || [])),
  }
}

export async function rowsByTabFromCSVs() {
  const responses = await Promise.all(Object.values(CSV_FILES).map(url => fetch(url).then(r => r.text())))
  return Object.fromEntries(Object.keys(CSV_FILES).map((title, i) => [title, parseCSVRaw(responses[i])]))
}

export async function loadAllData() {
  const rowsByTab = await rowsByTabFromCSVs()
  return { data: parseAll(rowsByTab), rowsByTab }
}