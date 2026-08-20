// Provisional XP model (weights are placeholders to be tuned later):
//
//   xp = hours × timeWeight × progressWeight × efficiencyWeight × wellbeingWeight
//
// timeWeight grows with time invested per session (1h → 0.8, 2h → 1.2), so
// longer study blocks pay better per hour. progressWeight scales with how far
// through the course's estimated workload you are. efficiency/wellbeing act as
// soft multipliers centred on their midpoint (5).

export const ESTIMATED_HOURS_PER_EC = 28

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

// progressByCourse: map course name -> loggedHours / estimatedHours (0..1).
export function computeXp(entry, progressByCourse = {}) {
  const h = entry.durationHours || 0
  if (h <= 0) return 0

  const eff = entry.efficiency != null ? clamp(entry.efficiency, 1, 10) : 5
  const well = entry.wellbeing != null ? clamp(entry.wellbeing, 1, 10) : 5
  const progress = clamp(progressByCourse[entry.course] ?? 0, 0, 1)

  const timeWeight = 0.4 + 0.4 * h
  const progressWeight = 0.9 + 0.2 * progress
  const efficiencyWeight = 0.6 + 0.08 * eff
  const wellbeingWeight = 0.85 + 0.03 * well

  return h * timeWeight * progressWeight * efficiencyWeight * wellbeingWeight
}

// Aggregate study log into a cumulative weekly XP series for the XP curve.
// output: [{ week: 'yyyy', label: 'yyyy-Www', xp, cumulative }]
export function weeklyXpSeries(inputLog, progressByCourse) {
  const byWeek = new Map()
  for (const e of inputLog || []) {
    if (!e.durationHours) continue
    const yearWeek = weekKey(e.date)
    if (!yearWeek) continue
    const xp = computeXp(e, progressByCourse)
    byWeek.set(yearWeek, (byWeek.get(yearWeek) || 0) + xp)
  }
  const keys = [...byWeek.keys()].sort()
  let cumulative = 0
  return keys.map(k => {
    cumulative += byWeek.get(k)
    return { key: k, xp: byWeek.get(k), cumulative }
  })
}

// 'yyyy-Www' key (Monday-first) from a yyyy-mm-dd date.
function weekKey(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO || '')) return null
  const date = new Date(dateISO + 'T12:00:00')
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day + 3)
  const firstThursday = new Date(date.getFullYear(), 0, 4)
  const firstDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3)
  const week = 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000))
  return `${firstThursday.getFullYear()}-W${String(week).padStart(2, '0')}`
}