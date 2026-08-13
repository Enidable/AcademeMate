// Serializers: convert parsed app state back into the raw 2D array each tab
// stores. They mirror the column layout the parsers in loadData.js / parseDaily.js
// expect, so a read -> edit -> write cycle is lossless (for the app-managed sheet).

function num(v, max = 2) {
  if (v == null || v === '') return ''
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (isNaN(n)) return ''
  if (n === 0) return ''
  return String(Math.round(n * 10 ** max) / 10 ** max)
}

function isoDateToDDMMYYYY(val) {
  if (!val) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-')
    return `${d}/${m}/${y}`
  }
  return val
}

const INPUT_LOG_HEADER = ['Date', 'Start Time', 'End Time', 'Duration (hours)', 'Duration (minutes)', 'Course', 'Category', 'Project', 'Location', 'Efficiency', 'Wellbeing', 'Lecture ID', 'Transport Mode', 'Commute Time', 'Notes']

export function serializeInputLog(entries) {
  const rows = (entries || []).map(e => [
    isoDateToDDMMYYYY(e.date),
    e.startTime || '',
    e.endTime || '',
    num(e.durationHours, 3),
    num(e.durationMinutes),
    e.course || '',
    e.category || '',
    e.project || '',
    e.location || '',
    num(e.efficiency),
    num(e.wellbeing),
    e.lectureId || '',
    e.transportMode || '',
    num(e.commuteTime, 1),
    e.notes || '',
  ])
  return [INPUT_LOG_HEADER, ...rows]
}

const COURSES_HEADER = ['', 'Quartile', 'Courses', 'Abbrev.', 'Start', 'Finish', 'Time [min]', 'Time [h]', 'Grade', 'Exam', 'Assignment', 'Laboratory', 'EC', 'Comment', 'Est. Time [h]', 'Ass. Time [h]', 'Material']

export function serializeMasterCourses(courses) {
  const rows = (courses || []).map(c => [
    c.year || '',
    c.quartile || '',
    c.course || '',
    c.abbrev || '',
    isoDateToDDMMYYYY(c.start),
    isoDateToDDMMYYYY(c.finish),
    num(c.timeMin),
    num(c.timeHours, 3),
    num(c.grade, 2),
    c.exam || '',
    c.assignment || '',
    c.laboratory || '',
    num(c.ec, 2),
    c.comment || '',
    num(c.estTimeHours, 2),
    num(c.assTimeHours, 2),
    c.material || '',
  ])
  return [COURSES_HEADER, ...rows]
}

export function serializeGradeComponents(components) {
  return (components || []).map(g => {
    const row = Array(17).fill('')
    row[1] = g.course || ''
    row[2] = num(g.ec, 2)
    for (let off = 0; off < 6; off++) {
      const comp = g.components?.[off]
      if (comp) {
        row[3 + off * 2] = num(comp.weight, 2)
        row[4 + off * 2] = num(comp.grade, 2)
      }
    }
    row[15] = num(g.totalGrade, 2)
    row[16] = num(g.check, 2)
    return row
  })
}

export function serializeWeeklyHours(weeklyHours) {
  const totals = Array(53).fill('')
  totals[0] = 'Year 2026 [h]'
  for (const w of weeklyHours || []) {
    if (w.week >= 1 && w.week <= 52) totals[w.week] = num(w.total, 2)
  }
  return [totals]
}

export function serializeDeadlines(deadlines) {
  return (deadlines || []).map(d => [
    d.description || '',
    num(d.sessions),
    num(d.time, 2),
    isoDateToDDMMYYYY(d.date),
    num(d.thisWeek),
    num(d.today),
    num(d.done),
    d.urgency || 'Medium',
  ])
}

export function serializeDailyPlanner(weeks) {
  const rows = []
  for (const week of weeks || []) {
    const header = Array(17).fill('')
    header[1] = 'Daily plan'
    for (let d = 0; d < 7; d++) header[2 + d * 2] = week.dates?.[d] || ''

    const label = Array(17).fill('')
    label[1] = week.weekNumber ? `Week ${week.weekNumber}` : ''

    rows.push(header, label)

    for (const r of week.rows || []) {
      const row = Array(17).fill('')
      row[1] = r.course || ''
      for (let d = 0; d < 7; d++) {
        row[2 + d * 2] = r.days?.[d]?.description || ''
        row[3 + d * 2] = num(r.days?.[d]?.hours, 2)
      }
      row[16] = num(r.total, 2)
      rows.push(row)
    }
  }
  return rows
}