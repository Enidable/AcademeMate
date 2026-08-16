import { parseCSVRows, parseCSVRaw } from '../utils/csv'
import {
  ASSET_BASE,
  TAB_DAILY,
  TAB_INPUT_LOG,
  TAB_COURSES,
  TAB_GRADES,
  TAB_HOURS,
  TAB_DEADLINES,
} from '../config'

const CSV_FILES = {
  [TAB_INPUT_LOG]: `${ASSET_BASE}data/Master Tracker - INPUT_LOG.csv`,
  [TAB_COURSES]: `${ASSET_BASE}data/Master Tracker - Master Time Management.csv`,
  [TAB_GRADES]: `${ASSET_BASE}data/Master Tracker - Grade Computer.csv`,
  [TAB_HOURS]: `${ASSET_BASE}data/Master Tracker - Time structure and hours of study.csv`,
  [TAB_DEADLINES]: `${ASSET_BASE}data/Master Tracker - Deadlines and Lectures.csv`,
  [TAB_DAILY]: `${ASSET_BASE}data/Master Tracker - Daily.csv`,
}

function toFloat(val) {
  if (val == null || val === '' || val === '-') return null
  const n = parseFloat(String(val).replace(',', '.'))
  return isNaN(n) ? null : n
}

function toInt(val) {
  if (val == null || val === '' || val === '-') return null
  const n = parseInt(String(val), 10)
  return isNaN(n) ? null : n
}

function parseDateDDMMYYYY(val) {
  if (!val) return null
  const parts = val.split('/')
  if (parts.length !== 3) return val
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
}

function parseInputLog(rows) {
  return rows
    .filter(r => {
      const c = (r.Course || '').trim()
      const cat = (r.Category || '').trim().toLowerCase()
      return c && cat !== 'health'
    })
    .map(r => {
      let durHours = toFloat((r['Duration (hours)'] || '').trim())
      let durMinutes = toInt((r['Duration (minutes)'] || '').trim())

      const minutesRaw = (r['Duration (minutes)'] || '').trim()
      if (durHours == null && minutesRaw.includes(':')) {
        const [h, m] = minutesRaw.split(':')
        durHours = toFloat(h) + (toFloat(m) ?? 0) / 60
        durMinutes = (toFloat(h) ?? 0) * 60 + (toInt(m) ?? 0)
      }

      return {
        date: parseDateDDMMYYYY((r.Date || '').trim()),
        startTime: (r['Start Time'] || '').trim(),
        endTime: (r['End Time'] || '').trim(),
        durationHours: durHours ?? 0,
        durationMinutes: durMinutes ?? 0,
        course: (r.Course || '').trim(),
        category: (r.Category || '').trim(),
        project: (r.Project || '').trim() || null,
        location: (r.Location || '').trim(),
        efficiency: toInt((r.Efficiency || '').trim()),
        wellbeing: toInt((r.Wellbeing || '').trim()),
        lectureId: (r['Lecture ID'] || '').trim() || null,
        transportMode: (r['Transport Mode'] || '').trim() || null,
        commuteTime: toFloat((r['Commute Time'] || '').trim()),
        notes: (r.Notes || '').trim() || null,
      }
    })
}

function parseMasterCourses(rows) {
  return rows
    .filter(r => {
      const course = (r.Courses || '').trim()
      if (!course) return false
      const skip = ['General additional time investment', 'Days at University this semester:', 'completed', 'in process', 'activated', 'inactive', 'Start', 'Now', 'Busy for:', 'This week until now:']
      if (skip.some(x => course.startsWith(x))) return false
      if (course.match(/^\d+(\.\d+)?$/) || course.match(/^[\d:]+$/)) return false
      return true
    })
    .map(r => ({
      year: (r[''] || '').trim() || null,
      quartile: (r.Quartile || '').trim() || null,
      course: (r.Courses || '').trim(),
      abbrev: (r['Abbrev.'] || '').trim() || null,
      start: parseDateDDMMYYYY((r.Start || '').trim()),
      finish: parseDateDDMMYYYY((r.Finish || '').trim()),
      timeMin: toInt((r['Time [min]'] || '').trim()) ?? 0,
      timeHours: toFloat((r['Time [h]'] || '').trim()) ?? 0,
      grade: toFloat((r.Grade || '').trim()),
      exam: (r.Exam || '').trim() || null,
      assignment: (r.Assignment || '').trim() || null,
      laboratory: (r.Laboratory || '').trim() || null,
      ec: toFloat((r.EC || '').trim()),
      comment: (r.Comment || '').trim() || null,
      estTimeHours: toFloat((r['Est. Time [h]'] || '').trim()),
      assTimeHours: toFloat((r['Ass. Time [h]'] || '').trim()),
      material: (r.Material || '').trim() || null,
    }))
}

function parseGradeComponents(rawRows) {
  const map = {}
  for (const r of rawRows) {
    const course = (r[1] || '').trim()
    // Skip the literal header row a human-filled sheet may carry: `,Course,EC's,...`
    if (!course || course === 'Course') continue
    if (!map[course]) {
      map[course] = {
        course,
        ec: toFloat(r[2]),
        totalGrade: toFloat(r[15]),
        check: toFloat(r[16]),
        components: [],
      }
    }
    for (let off = 0; off < 6; off++) {
      const weight = toFloat(r[3 + off * 2])
      const grade = toFloat(r[4 + off * 2])
      if (weight != null || grade != null) {
        map[course].components.push({ weight, grade })
      }
    }
  }
  return Object.values(map).map(c => ({
    ...c,
    components: c.components.filter(c => c.weight != null),
  }))
}

function parseWeeklyHours(rawRows) {
  const year2026Row = rawRows.find(r => (r[0] || '').trim() === 'Year 2026 [h]')
  if (!year2026Row) return []
  const weeks = []
  for (let w = 1; w <= 52; w++) {
    const val = year2026Row[w] || ''
    const total = toFloat(val.trim())
    if (total != null) weeks.push({ week: w, total })
  }
  return weeks
}

function parseDeadlines(rawRows) {
  const results = []
  let inIdHours = false
  for (const r of rawRows) {
    const desc = (r[0] || '').trim()
    const urgency = (r[7] || '').trim()

    if (!desc && r[0] === '' && (r[10] || '').trim() === 'ID') { inIdHours = true; continue }
    if (inIdHours) continue

    if (desc && ['Complete', 'Extremely High', 'High', 'Medium', 'Low'].includes(urgency)) {
      results.push({
        description: desc,
        sessions: toInt(r[1]) ?? 0,
        time: toFloat(r[2]) ?? 0,
        date: parseDateDDMMYYYY(r[3]),
        thisWeek: toInt(r[4]) ?? 0,
        today: toInt(r[5]) ?? 0,
        done: toInt(r[6]) ?? 0,
        urgency,
      })
    }
  }
  return results.sort((a, b) => new Date(a.date) - new Date(b.date))
}

// rowsByTab maps canonical tab title -> 2D array (from Drive or bundled CSVs).
export function parseAll(rowsByTab) {
  return {
    inputLog: parseInputLog(parseCSVRows(rowsByTab[TAB_INPUT_LOG] || [])),
    masterCourses: parseMasterCourses(parseCSVRows(rowsByTab[TAB_COURSES] || [])),
    gradeComponents: parseGradeComponents(rowsByTab[TAB_GRADES] || []),
    weeklyHours: parseWeeklyHours(rowsByTab[TAB_HOURS] || []),
    deadlines: parseDeadlines(rowsByTab[TAB_DEADLINES] || []),
  }
}

export async function rowsByTabFromCSVs() {
  const responses = await Promise.all(Object.entries(CSV_FILES).map(([, url]) => fetch(url).then(r => r.text())))
  return Object.fromEntries(Object.entries(CSV_FILES).map(([title], i) => [title, parseCSVRaw(responses[i])]))
}

export async function loadAllData() {
  const rowsByTab = await rowsByTabFromCSVs()
  return { data: parseAll(rowsByTab), rowsByTab }
}