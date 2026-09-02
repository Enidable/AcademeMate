// Flexible per-course time estimation (#39).
//
// Model
// -----
//   estimate_hours = EC · a_contact  +  EC · Σ_t ( w_t · a_t )
//
//   EC        : ECTS of the target course
//   a_contact : personal baseline hours per EC (attending + day-to-day study)
//   w_t       : total weight (fraction of the grade) that type t holds
//   a_t       : personal hours per EC when type t is worth 100% of the grade
//
// "Every grade component is evaluated separately": each component's own weight
// feeds the sum (an exam worth 40% counts 0.4, the two 15% assignments count
// 0.3 together). For calibration the component types are pooled into EXAM and
// COURSEWORK (assignment/project/presentation/quiz/other), because with a few
// finished courses you cannot reliably fit one rate per type. The UI still
// lists each component on its own.
//
// Calibration
// -----------
// For every FINISHED course that has grade components we know its total logged
// hours H_c and its mix (w_exam, w_coursework). That gives one equation
//   H_c / EC_c ≈ a_contact + w_exam·a_exam + w_coursework·a_coursework
// which we solve as a least-squares fit. With little data the fit is noisy, so
// the coefficients are shrunk towards PERSONAL PRIORS (see below) — the fit
// takes over gradually as more courses finish. The prior rates come from the
// owner's tracked courses (exam-only self-study ≈ 9 h/EC at full weight).
//
// Because observed totals vary a lot even at the same mix, callers should show
// the prediction as a range (prediction ± uncertainty), never a false-precise
// single number.

// Prior / anchor constants — tune here so tuning has one home.
export const ESTIMATE_CONSTANTS = {
  // Prior rates, hours per EC at full weight.
  PRIOR_CONTACT: 5,       // attending + general study per EC
  PRIOR_EXAM: 9,          // exam prep at 100% exam weight (45h / 5 EC self-study)
  PRIOR_COURSEWORK: 14,   // assignment / project / lab work at 100% weight
  // Prior strength (counts as if N finished courses agreed with the prior).
  PRIOR_STRENGTH: 2.5,
  // Coursework fallback when a course has no grade components on record.
  DEFAULT_EXAM_WEIGHT: 0.5,
  // Guard rails so a sparse fit can never suggest absurd totals.
  MIN_HOURS_PER_EC: 2,
  MAX_HOURS_PER_EC: 45,
}

export const COMPONENT_RATE_KEYS = ['exam', 'coursework']

// Bucket a grade component type for calibration: everything graded that is not
// an exam is "coursework" (assignments, projects, presentations, quizzes…).
export function componentRateKey(type) {
  return String(type || '').toLowerCase() === 'exam' ? 'exam' : 'coursework'
}

// Is a course finished? Completed status, or a grade already on file.
function isFinished(course) {
  if (!course) return false
  const s = String(course.status || '').trim().toLowerCase()
  if (['completed', 'complete', 'finished'].includes(s)) return true
  return course.grade != null
}

function totalLoggedHours(course, studyLog) {
  let sum = 0
  for (const s of studyLog || []) {
    if (s.course !== course?.course) continue
    sum += s.durationHours || 0
  }
  return Math.round(sum * 100) / 100
}

// Weight fractions (exam vs coursework) for one course from its grade
// components. Null when the course has no graded components on record.
export function componentWeights(components) {
  const comps = components || []
  if (comps.length === 0) return null
  let total = 0
  const exam = []
  const coursework = []
  for (const c of comps) {
    const w = Math.abs(parseFloat(c.weight)) || 0
    if (w <= 0) continue
    total += w
    if (componentRateKey(c.type) === 'exam') exam.push(c)
    else coursework.push(c)
  }
  if (total <= 0) return null
  const wExam = exam.reduce((s, c) => s + (Math.abs(parseFloat(c.weight)) || 0), 0) / total
  return {
    exam: Math.round(wExam * 1000) / 1000,
    coursework: Math.round((1 - wExam) * 1000) / 1000,
    total,
  }
}

// Solve the small least-squares system (XᵀX + αI) c = Xᵀy + α·prior via
// Gaussian elimination. Columns: contact, exam weight, coursework weight.
function fitCoefficients(rows, priors) {
  const p = 3
  const alpha = ESTIMATE_CONSTANTS.PRIOR_STRENGTH
  const A = Array.from({ length: p }, () => new Array(p).fill(0))
  const b = new Array(p).fill(0)
  for (let i = 0; i < p; i++) A[i][i] = alpha
  for (const r of rows) {
    const x = [1, r.wExam, r.wCoursework]
    for (let i = 0; i < p; i++) {
      b[i] += x[i] * r.y
      for (let j = 0; j < p; j++) A[i][j] += x[i] * x[j]
    }
  }
  for (let i = 0; i < p; i++) b[i] += alpha * (priors[i] ?? 0)

  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < p; col++) {
    let pivot = col
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r
    if (A[pivot][col] === 0) continue
    if (pivot !== col) {
      const t = A[col]; A[col] = A[pivot]; A[pivot] = t
      const tb = b[col]; b[col] = b[pivot]; b[pivot] = tb
    }
    const d = A[col][col]
    for (let j = col; j < p; j++) A[col][j] /= d
    b[col] /= d
    for (let r = 0; r < p; r++) {
      if (r === col) continue
      const f = A[r][col]
      if (f === 0) continue
      for (let j = col; j < p; j++) A[r][j] -= f * A[col][j]
      b[r] -= f * b[col]
    }
  }
  return b // [a_contact, a_exam, a_coursework]
}

export function clampHourRate(v) {
  if (v == null || isNaN(v)) return null
  return Math.min(ESTIMATE_CONSTANTS.MAX_HOURS_PER_EC, Math.max(ESTIMATE_CONSTANTS.MIN_HOURS_PER_EC, v))
}

// Personal coefficients (a_contact, a_exam, a_coursework) fitted from finished
// courses that have grade components. Returns null when nothing can be fitted.
export function personalRates(courses, studyLog, gradeComponents) {
  const groupFor = new Map()
  for (const g of gradeComponents || []) {
    if (!g?.course) continue
    let byName = groupFor.get(g.course)
    if (!byName) { byName = []; groupFor.set(g.course, byName) }
    for (const c of g.components || []) if (c && c.weight) byName.push(c)
  }
  const rows = []
  let used = 0
  for (const course of courses || []) {
    if (!course?.course || !isFinished(course)) continue
    const ec = parseFloat(course.ec)
    if (!(ec > 0)) continue
    const weights = componentWeights(groupFor.get(course.course))
    if (!weights) continue
    const h = totalLoggedHours(course, studyLog)
    if (h <= 0) continue
    rows.push({ y: h / ec, wExam: weights.exam, wCoursework: weights.coursework })
    used += 1
  }
  if (rows.length === 0) {
    // No finished courses on record yet — fall back to the personal priors.
    return { coeff: [ESTIMATE_CONSTANTS.PRIOR_CONTACT, ESTIMATE_CONSTANTS.PRIOR_EXAM, ESTIMATE_CONSTANTS.PRIOR_COURSEWORK], calibrated: false, courses: 0 }
  }
  const priors = [ESTIMATE_CONSTANTS.PRIOR_CONTACT, ESTIMATE_CONSTANTS.PRIOR_EXAM, ESTIMATE_CONSTANTS.PRIOR_COURSEWORK]
  const c = fitCoefficients(rows, priors).map(clampHourRate)
  return { coeff: c, calibrated: true, courses: used }
}

// Estimate total hours for one course (by name) using the personal model.
// Returns a breakdown per component plus a total and an uncertainty band.
export function estimateCourse(course, { courses = [], studyLog = [], gradeComponents = [] } = {}) {
  const empty = { total: null, perEc: null, low: null, high: null, contact: 0, byType: {}, components: [], logged: 0, remaining: 0, calibrated: false, coursesUsed: 0 }
  if (!course?.course) return empty
  const ec = parseFloat(course.ec)
  if (!(ec > 0)) return { ...empty, components: [], reason: 'no-ec' }

  const group = (gradeComponents || []).find(g => g.course === course.course)
  const comps = (group?.components || []).filter(c => c && c.weight && c.id)
  const weights = componentWeights(comps) || (comps.length === 0 ? { exam: ESTIMATE_CONSTANTS.DEFAULT_EXAM_WEIGHT, coursework: 1 - ESTIMATE_CONSTANTS.DEFAULT_EXAM_WEIGHT, total: 1 } : null)
  if (!weights) return { ...empty, reason: 'no-components' }

  const rates = personalRates(courses, studyLog, gradeComponents)
  const [aContact, aExam, aCoursework] = rates.coeff
  const logged = totalLoggedHours(course, studyLog)

  // Predicted hours, per component too so the UI can show each one separately.
  const byType = { exam: { weight: 0, hours: 0 }, coursework: { weight: 0, hours: 0 } }
  const componentRows = comps.map(c => {
    const w = (Math.abs(parseFloat(c.weight)) || 0) / weights.total
    const key = componentRateKey(c.type)
    const rate = key === 'exam' ? aExam : aCoursework
    const hours = Math.round(ec * w * rate * 10) / 10
    byType[key].weight += w
    byType[key].hours += hours
    return { id: c.id, name: c.name || c.id, type: c.type, weight: w, rate, hours, done: !!c.done, grade: c.grade }
  })
  const contact = Math.round(ec * aContact * 10) / 10
  // No graded components on record: fall back to the default exam/coursework
  // split so the estimate still includes assessment work, not just contact.
  if (comps.length === 0) {
    byType.exam.weight = weights.exam
    byType.coursework.weight = weights.coursework
    byType.exam.hours = Math.round(ec * weights.exam * aExam * 10) / 10
    byType.coursework.hours = Math.round(ec * weights.coursework * aCoursework * 10) / 10
  }
  byType.exam.hours = Math.round(byType.exam.hours * 10) / 10
  byType.coursework.hours = Math.round(byType.coursework.hours * 10) / 10

  const total = Math.round((contact + byType.exam.hours + byType.coursework.hours) * 10) / 10
  // Empirical spread: unfinished-course totals vary a lot, so give a band of
  // roughly ±25% unless the fit already covers the data poorly.
  const band = Math.max(3, Math.round(total * 0.22))

  return {
    total,
    perEc: Math.round((total / ec) * 10) / 10,
    low: Math.max(0, Math.round((total - band) * 10) / 10),
    high: Math.round((total + band) * 10) / 10,
    contact,
    byType,
    componentRows,
    weights,
    logged,
    remaining: Math.max(0, Math.round((total - logged) * 10) / 10),
    calibrated: rates.calibrated,
    coursesUsed: rates.courses,
  }
}
