// Derivation helpers: turn the flat tables into the views the GUI renders.
//   - weekly totals: summed from Study Log (per ISO week) with manual overrides
//   - planner grid: flat Daily Plan rows regrouped into the Mon-Sun week grid
import { isoWeekOf, mondayOfWeek, weekdayIndex } from './normalize.js'

// Effective weekly totals = Study Log per ISO week, plus the Additional Time
// Log (work / other obligations / commute / exercise) and manual overrides.
// Each entry: { year, week, total, study, work, travel, other, commute, exercise, notes }.
export function deriveWeeklyTotals(studyLog, overrides, additionalLog = []) {
  const weeks = new Map()
  const addHours = (key, field, hours) => {
    if (!weeks.has(key)) {
      weeks.set(key, { year: key.split('-')[0], week: parseInt(key.split('-')[1], 10), total: 0, study: 0, work: 0, travel: 0, other: 0, commute: 0, exercise: 0, notes: '' })
    }
    weeks.get(key)[field] += hours || 0
  }

  for (const e of studyLog || []) {
    const wk = isoWeekOf(e.date)
    if (!wk) continue
    const key = `${wk.year}-${wk.week}`
    const duration = e.durationHours || 0
    const isWork = (e.category || '').toLowerCase() === 'work'
    addHours(key, 'total', duration)
    addHours(key, isWork ? 'work' : 'study', duration)
    if (e.transportMode && e.commuteTime) {
      addHours(key, 'travel', e.commuteTime / 60)
      addHours(key, 'total', e.commuteTime / 60)
    }
  }

  // Additional Time Log hours count toward total weekly capacity (burnout
  // tracking) but never toward study sessions.
  const fieldFor = cat => {
    const c = String(cat || '').toLowerCase()
    if (c === 'work' || c === 'other') return c
    if (c === 'obligations') return 'other'
    if (c === 'commute' || c === 'travel') return 'commute'
    if (c === 'exercise' || c === 'sport') return 'exercise'
    return 'other'
  }
  for (const a of additionalLog || []) {
    const wk = isoWeekOf(a.date)
    if (!wk) continue
    const key = `${wk.year}-${wk.week}`
    addHours(key, 'total', a.hours)
    addHours(key, fieldFor(a.category), a.hours)
  }

  for (const override of Object.values(overrides || {})) {
    const key = `${override.year}-${override.week}`
    const entry = weeks.get(key) || { year: override.year, week: override.week, total: 0, study: 0, work: 0, travel: 0, other: 0, commute: 0, exercise: 0, notes: '' }
    if (override.total != null) entry.total = override.total
    if (override.notes) entry.notes = override.notes
    weeks.set(key, entry)
  }

  return Array.from(weeks.values())
    .map(w => ({ ...w, year: Number(w.year), week: Number(w.week) }))
    .sort((a, b) => a.year - b.year || a.week - b.week)
}

export function getAverageWeeklyHours(weeklyHours) {
  if (!weeklyHours || weeklyHours.length === 0) return 0
  const sum = weeklyHours.reduce((s, w) => s + w.total, 0)
  return sum / weeklyHours.length
}

// Flat daily rows -> the planner week grid the DailyPlanner page renders.
export function buildPlannerWeeks(dailyPlan) {
  const byWeek = new Map()

  for (const r of dailyPlan || []) {
    const wk = isoWeekOf(r.date)
    if (!wk) continue
    const key = `${wk.year}-${wk.week}`
    if (!byWeek.has(key)) {
      byWeek.set(key, {
        weekNumber: wk.week,
        year: wk.year,
        startDate: mondayOfWeek(wk.year, wk.week),
        rows: new Map(),
      })
    }
    const week = byWeek.get(key)
    const dow = weekdayIndex(r.date)
    if (!week.rows.has(r.course)) {
      week.rows.set(r.course, {
        course: r.course,
        days: Array.from({ length: 7 }, () => ({ description: '', hours: 0 })),
        total: 0,
        isTotal: false,
        tasks: Array.from({ length: 7 }, () => []),
        planned: Array.from({ length: 7 }, () => 0),
      })
    }
    const row = week.rows.get(r.course)
    const day = row.days[dow]
    if (r.task) day.description = day.description ? `${day.description}; ${r.task}` : r.task
    day.hours += r.plannedHours && !r.actualHours ? r.plannedHours : r.actualHours || 0
    row.planned[dow] += r.plannedHours || 0
    if (r.task) row.tasks[dow].push(r.task)
    row.total = row.days.reduce((s, d) => s + d.hours, 0)
  }

  const weeks = Array.from(byWeek.entries()).map(([key, week]) => {
    const rows = []
    for (const row of week.rows.values()) {
      if (row.total <= 0 && row.days.every(d => !d.description)) continue
      rows.push(row)
    }
    rows.sort((a, b) => {
      const aSpecial = a.course === 'Travel' || a.course === 'WORK'
      const bSpecial = b.course === 'Travel' || b.course === 'WORK'
      if (aSpecial !== bSpecial) return aSpecial ? 1 : -1
      return a.course.localeCompare(b.course)
    })

    // Day totals row, mirroring the old SUM row.
    const sumDays = Array.from({ length: 7 }, () => 0)
    for (const row of rows) {
      for (let d = 0; d < 7; d++) sumDays[d] += row.days[d].hours
    }
    const sumRow = {
      course: 'SUM',
      days: sumDays.map(h => ({ description: '', hours: h })),
      total: sumDays.reduce((s, h) => s + h, 0),
      isTotal: true,
    }

    return {
      key,
      weekNumber: week.weekNumber,
      year: week.year,
      startDate: week.startDate,
      dates: buildWeekDates(week.startDate),
      rows: [...rows, sumRow],
    }
  })

  return weeks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
}

function buildWeekDates(mondayISO) {
  const dates = []
  const monday = new Date(mondayISO + 'T12:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime() + i * 86400000)
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return dates
}