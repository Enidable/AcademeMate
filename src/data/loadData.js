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
  TAB_ADDITIONAL,
  TAB_ACADEMIC_YEAR,
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
  [TAB_ACADEMIC_YEAR]: `${ASSET_BASE}data/AcademeMate - Academic Year.csv`,
}

// --- Study Log ------------------------------------------------------------

function parseStudyLog(rows, resolveCourse) {
  return rows
    .filter(r => (r.course_id || '').trim())
    .map((r, i) => {
      const durationHours = toFloat(r.duration_hours)
      const durationMinutes = toInt(r.duration_minutes)
      const date = parseDateDDMMYYYY((r.date || '').trim())
      const course = resolveCourse((r.course_id || '').trim())
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

// Some courses (e.g. Professional and Personal Development) span the whole
// degree and end up with one row per quartile. Merge rows that share a name
// into a single course: latest year, widest date range, highest ECTS, summed
// estimated hours. Saving later collapses them to one row in the sheet.
function mergeCourses(list) {
  const byName = new Map()
  const merged = []
  for (const c of list) {
    const existing = byName.get(c.course)
    if (!existing) {
      byName.set(c.course, c)
      merged.push(c)
      continue
    }
    if ((c.year || '') > (existing.year || '')) existing.year = c.year
    if (c.quartile && existing.quartile && c.quartile !== existing.quartile) existing.quartile = null
    else if (c.quartile && !existing.quartile) existing.quartile = c.quartile
    existing.start = existing.start && c.start ? (existing.start < c.start ? existing.start : c.start) : (existing.start || c.start)
    existing.finish = existing.finish && c.finish ? (existing.finish > c.finish ? existing.finish : c.finish) : (existing.finish || c.finish)
    existing.ec = Math.max(existing.ec || 0, c.ec || 0)
    existing.estHours = (existing.estHours || 0) + (c.estHours || 0)
    existing.status = existing.status || c.status
    existing.code = existing.code || c.code
    existing.abbrev = existing.abbrev || c.abbrev
    existing.notes = existing.notes || c.notes
    existing.comment = existing.comment || c.comment
    existing.scope = existing.scope || c.scope
    existing.color = existing.color || c.color
  }
  return merged
}

function parseCourses(rows) {
  return mergeCourses(rows
    .filter(r => (r.course_id || '').trim())
    .map(r => ({
      id: (r.course_id || '').trim(),
      course: (r.name || r.course_id || '').trim(),
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
      scope: (r.scope || '').trim() || null,
      color: (r.color || '').trim() || null,
      order: toInt((r.order || '').trim()),
      grade: null,
    })))
}

// course_id columns hold the university course code (new data) but historically
// held the course name — resolve either back to the canonical course name.
function resolveCourseFor(courses) {
  const byName = new Map()
  const byCode = new Map()
  for (const c of courses) {
    if (c.course) byName.set(c.course, c.course)
    if (c.code) byCode.set(c.code, c.course)
  }
  return v => byName.get(v) || byCode.get(v) || v
}

// --- Grade Components -----------------------------------------------------

function parseGradeComponents(rows, resolveCourse) {
  const map = {}
  for (const r of rows) {
    const course = resolveCourse((r.course_id || '').trim())
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
    // Weighted average over components that HAVE a grade (ungraded parts are
    // excluded so they don't drag the course grade down).
    let totalWeight = 0
    let weighted = 0
    for (const c of g.components) {
      if (c.grade == null) continue
      totalWeight += c.weight || 0
      weighted += (c.weight || 0) * c.grade
    }
    g.check = totalWeight > 0 ? totalWeight : null
    g.totalGrade = totalWeight > 0 ? weighted / totalWeight : null
  }
  return Object.values(map)
}

// --- Course Content (schedule + assessments) -----------------------------

const CONTENT_TYPES_SET = new Set(CONTENT_TYPES)

function parseContent(rows, resolveCourse) {
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
      const course = resolveCourse((r.course_id || '').trim())
      const course2 = (r.course_2 || '').trim() || null
      const type = ((r.type || '').trim().toLowerCase())
      const topic = (r.topic || '').trim()
      const contentId = (r.content_id || '').trim()
      const done = (r.done || '').trim()
      const hoursSpent = toFloat(r.hours_spent)
      // Older writes put the marker value in the location column (serializer
      // bug) — recognise marker keywords sitting in the location cell so that
      // legacy rows keep their urgency after the column order was fixed.
      let location = (r.location || '').trim() || null
      let marker = (r.marker || '').trim() || null
      if (location && !marker && /^(important|mandatory|skip)$/i.test(location)) {
        marker = location.toLowerCase()
        location = null
      }
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
        marker,
        location,
        hoursSpent,
        materialHours: toFloat(r.material_hours),
        content: (r.content || '').trim() || null,
        calId: (r.cal_id || '').trim() || null,
        prep: (r.prep || '').trim() || null,
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

function parseDailyPlan(rows, resolveCourse) {
  return rows
    .filter(r => (r.date || '').trim() && (r.course_id || '').trim())
    .map(r => {
      const date = parseDateDDMMYYYY((r.date || '').trim())
      const course = resolveCourse((r.course_id || '').trim())
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

// --- Additional Time Log (work / other / commute / exercise) -------------

function parseAdditionalLog(rows) {
  return rows
    .filter(r => (r.date || '').trim() && (r.category || '').trim())
    .map((r, i) => {
      const category = (r.category || '').trim()
      const date = parseDateDDMMYYYY((r.date || '').trim())
      const done = (r.done || '').trim()
      return {
        id: `${date}|${category.toLowerCase()}|${(r.task || '').trim()}|${i}`,
        date,
        course: category,
        category,
        task: (r.task || '').trim(),
        hours: toFloat((r.hours || '').trim()) ?? 0,
        startTime: (r.start_time || '').trim(),
        endTime: (r.end_time || '').trim(),
        efficiency: toInt((r.efficiency || '').trim()),
        wellbeing: toInt((r.wellbeing || '').trim()),
        location: (r.location || '').trim() || null,
        notes: (r.notes || '').trim() || null,
        done,
        isAdditional: true,
      }
    })
}

// --- Calendar (flattened timetable events) -------------------------------

function parseCalendar(rows, resolveCourse) {
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
        course: resolveCourse((r.course_id || '').trim()) || null,
        location: (r.location || '').trim() || null,
        description: (r.description || '').trim() || null,
        source: (r.source || '').trim() || null,
        uid: (r.uid || '').trim() || null,
        status: (r.status || '').trim() || null,
        lectureId: (r.lecture_id || '').trim() || null,
        calId: (r.cal_id || '').trim() || null,
      }
    })
}

// --- Academic Year (quarter/holiday structure) ---------------------------

// Flat rows: year, period (Q1..Q4 or Holiday), label (holidays), start, finish.
// Output shape: [{ year, quarters: { Q1: {start, finish}, … }, holidays: [{label, start, finish}] }]
function parseAcademicYears(rows) {
  const byYear = new Map()
  for (const r of parseCSVRows(rows)) {
    const year = String(r.year || '').trim()
    if (!year) continue
    const period = String(r.period || '').trim().toUpperCase()
    if (!byYear.has(year)) byYear.set(year, { year, quarters: {}, holidays: [] })
    const y = byYear.get(year)
    const start = parseDateDDMMYYYY((r.start || '').trim())
    const finish = parseDateDDMMYYYY((r.finish || '').trim())
    if (/^Q[1-4]$/.test(period)) {
      y.quarters[period] = { start, finish }
    } else if (period === 'HOLIDAY') {
      y.holidays.push({ label: (r.label || '').trim(), start, finish })
    }
  }
  return [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year))
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
  let courses = parseCourses(parseCSVRows(rowsByTab[TAB_COURSES] || []))
  // Drop garbage "courses" whose name is purely the numeric course code (a bug
  // produced rows like "191211110,191211110" next to the real course). Keeping
  // them would shadow the real course in the code→name lookup and steal its
  // grade components.
  courses = courses.filter(c => !/^\d{5,9}$/.test(String(c.course || '')))
  const resolveCourse = resolveCourseFor(courses)
  const gradeComponents = parseGradeComponents(parseCSVRows(rowsByTab[TAB_GRADES] || []), resolveCourse)
  attachCourseGrades(courses, gradeComponents)
  return {
    studyLog: parseStudyLog(parseCSVRows(rowsByTab[TAB_STUDY_LOG] || []), resolveCourse),
    courses,
    gradeComponents,
    content: parseContent(parseCSVRows(rowsByTab[TAB_CONTENT] || []), resolveCourse),
    dailyPlan: parseDailyPlan(parseCSVRows(rowsByTab[TAB_DAILY] || []), resolveCourse),
    weeklyOverrides: parseWeeklyOverrides(parseCSVRows(rowsByTab[TAB_HOURS] || [])),
    calendarEvents: parseCalendar(parseCSVRows(rowsByTab[TAB_CALENDAR] || []), resolveCourse),
    additionalLog: parseAdditionalLog(parseCSVRows(rowsByTab[TAB_ADDITIONAL] || [])),
    academicYears: parseAcademicYears(rowsByTab[TAB_ACADEMIC_YEAR] || []),
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