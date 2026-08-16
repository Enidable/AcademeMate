// Shared number/date helpers for parsing (loadData) and serializing (serialize).
// Dates are stored in the spreadsheet as dd/mm/yyyy (matching the old tracker);
// in memory the app works with ISO yyyy-mm-dd so JS Date logic is unambiguous.

export function toFloat(val) {
  if (val == null || val === '' || val === '-') return null
  const n = parseFloat(String(val).replace(',', '.'))
  return isNaN(n) ? null : n
}

export function toInt(val) {
  if (val == null || val === '' || val === '-') return null
  const n = parseInt(String(val), 10)
  return isNaN(n) ? null : n
}

export function parseDateDDMMYYYY(val) {
  if (!val) return null
  const parts = String(val).trim().split('/')
  if (parts.length !== 3) return val
  const d = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const y = parseInt(parts[2], 10)
  if (!d || !m || !y) return val
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function isoDateToDDMMYYYY(val) {
  if (!val) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-')
    return `${d}/${m}/${y}`
  }
  return val
}

export function num(v, max = 2) {
  if (v == null || v === '') return ''
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  if (isNaN(n)) return ''
  if (n === 0) return ''
  return String(Math.round(n * 10 ** max) / 10 ** max)
}

// ISO-8601 week number + year for a yyyy-mm-dd date (Monday-first).
export function isoWeekOf(dateISO) {
  if (!dateISO) return null
  const date = new Date(dateISO + 'T12:00:00')
  if (isNaN(date.getTime())) return null
  const day = (date.getDay() + 6) % 7 // Mon=0 … Sun=6
  date.setDate(date.getDate() - day + 3) // nearest Thursday
  const firstThursday = new Date(date.getFullYear(), 0, 4)
  const firstDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3)
  const week = 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000))
  return { year: date.getFullYear(), week }
}

export function mondayOfWeek(year, week) {
  const firstThursday = new Date(year, 0, 4)
  const firstDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3)
  const thursday = new Date(firstThursday.getTime())
  thursday.setDate(thursday.getDate() + (week - 1) * 7)
  const monday = new Date(thursday.getTime())
  monday.setDate(monday.getDate() - 3)
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function weekdayIndex(dateISO) {
  if (!dateISO) return 0
  const d = new Date(dateISO + 'T12:00:00')
  if (isNaN(d.getTime())) return 0
  return (d.getDay() + 6) % 7 // Mon=0 … Sun=6
}