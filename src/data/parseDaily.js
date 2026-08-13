import { parseCSVRaw } from '../utils/csv'

function toFloat(val) {
  if (val == null || val === '' || val === '-') return 0
  const n = parseFloat(String(val).replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export function parseDailyPlanner(csvText) {
  return parseDailyPlannerRows(parseCSVRaw(csvText))
}

export function parseDailyPlannerRows(raw) {
  const weeks = []
  let i = 0

  while (i < raw.length) {
    const row = raw[i]
    const label = (row[1] || '').trim()

    if (label === 'Daily plan' && (row[2] || '').trim()) {
      const headerRow = row
      const weekLabelRow = raw[i + 1]
      let weekNumber = 0
      if (weekLabelRow && (weekLabelRow[1] || '').includes('Week')) {
        weekNumber = parseInt(weekLabelRow[1].replace('Week ', ''), 10) || 0
      }

      const dates = []
      for (let d = 0; d < 7; d++) {
        dates.push((headerRow[2 + d * 2] || '').trim())
      }

      const courseRows = []
      let j = i + 2

      while (j < raw.length) {
        const courseRow = raw[j]
        const courseName = (courseRow[1] || '').trim()
        if (!courseName || courseName === 'Daily plan') break

        if (courseName === 'SUM') {
          const days = []
          for (let d = 0; d < 7; d++) {
            days.push({ description: '', hours: toFloat(courseRow[3 + d * 2]) })
          }
          courseRows.push({
            course: 'SUM',
            days,
            total: toFloat(courseRow[16]),
            isTotal: true,
          })
          j++
          break
        }

        const days = []
        for (let d = 0; d < 7; d++) {
          days.push({
            description: (courseRow[2 + d * 2] || '').trim(),
            hours: toFloat(courseRow[3 + d * 2]),
          })
        }
        courseRows.push({
          course: courseName,
          days,
          total: toFloat(courseRow[16]),
          isTotal: false,
        })
        j++
      }

      weeks.push({
        weekNumber,
        startDate: dates[0] || '',
        dates,
        rows: courseRows,
      })

      i = j
    } else {
      i++
    }
  }

  return weeks
}

export function getAverageWeeklyHours(weeklyHours) {
  if (!weeklyHours || weeklyHours.length === 0) return 0
  const sum = weeklyHours.reduce((s, w) => s + w.total, 0)
  return sum / weeklyHours.length
}
