// Adaptive XP model (#16):
//
//   Total XP  = Effort XP + Mastery XP
//   Effort XP = hours_logged × course_weight          (rewards effort, linear)
//   Mastery XP = progress × efficiency_f × wellbeing_f (rewards quality)
//
// Time is the BASELINE unit, not a multiplier: 1 logged hour is 1 base point.
// Quality enters through two channels:
//   • efficiency/wellbeing scores (1–10) map to small scaling factors
//     (score 1 → ×0.8, score 10 → ×1.2, neutral ×1.0 when absent)
//   • progress through the course's estimated workload gates the Mastery term
// All tunable values live in XP_CONSTANTS so weight tuning (#4) has one home.

export const XP_CONSTANTS = {
  // Estimated real study hours per EC (used for progress estimation).
  ESTIMATED_HOURS_PER_EC: 28,
  // Course weight for courses without a known EC.
  COURSE_WEIGHT_DEFAULT: 1,
  // A "typical" 15 EC quartile course maps to weight 1.0; heavier courses weigh more.
  COURSE_WEIGHT_REFERENCE_EC: 15,
  COURSE_WEIGHT_MIN: 0.6,
  COURSE_WEIGHT_MAX: 1.6,
  // Score -> factor mapping endpoints (efficiency & wellbeing, scores 1..10).
  SCORE_FACTOR_AT_1: 0.8,
  SCORE_FACTOR_AT_10: 1.2,
  // Factor applied when a session has no score recorded.
  SCORE_FACTOR_NEUTRAL: 1.0,
  // Overall scale of the Mastery term relative to raw Effort XP.
  MASTERY_XP_SCALE: 1,
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

// Score (1-10) -> small scaling factor, linear between AT_1 and AT_10.
// Missing/invalid scores are neutral (no bonus, no penalty).
export function scoreFactor(score) {
  if (score == null || isNaN(Number(score))) return XP_CONSTANTS.SCORE_FACTOR_NEUTRAL
  const s = clamp(Number(score), 1, 10)
  return XP_CONSTANTS.SCORE_FACTOR_AT_1 +
    ((XP_CONSTANTS.SCORE_FACTOR_AT_10 - XP_CONSTANTS.SCORE_FACTOR_AT_1) * (s - 1)) / 9
}

// EC-informed course weight: heavier courses reward the same hour slightly
// more. Unknown EC falls back to the default weight.
export function courseWeightFor(ec) {
  if (ec == null || isNaN(Number(ec)) || Number(ec) <= 0) return XP_CONSTANTS.COURSE_WEIGHT_DEFAULT
  const w = Number(ec) / XP_CONSTANTS.COURSE_WEIGHT_REFERENCE_EC
  return clamp(w, XP_CONSTANTS.COURSE_WEIGHT_MIN, XP_CONSTANTS.COURSE_WEIGHT_MAX)
}

// progressByCourse: map course name -> loggedHours / estimatedHours (0..1).
// courseWeights: map course name -> weight (see courseWeightFor).
export function computeXp(entry, progressByCourse = {}, courseWeights = {}) {
  const h = entry.durationHours || 0
  if (h <= 0) return 0

  const effortXp = h * (courseWeights[entry.course] ?? XP_CONSTANTS.COURSE_WEIGHT_DEFAULT)

  const progress = clamp(progressByCourse[entry.course] ?? 0, 0, 1)
  const masteryXp = XP_CONSTANTS.MASTERY_XP_SCALE *
    progress *
    scoreFactor(entry.efficiency) *
    scoreFactor(entry.wellbeing)

  return effortXp + masteryXp
}

// Aggregate study log into a cumulative weekly XP series for the XP curve.
// output: [{ week: 'yyyy', label: 'yyyy-Www', xp, cumulative }]
export function weeklyXpSeries(inputLog, progressByCourse, courseWeights = {}) {
  const byWeek = new Map()
  for (const e of inputLog || []) {
    if (!e.durationHours) continue
    const yearWeek = weekKey(e.date)
    if (!yearWeek) continue
    const xp = computeXp(e, progressByCourse, courseWeights)
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
