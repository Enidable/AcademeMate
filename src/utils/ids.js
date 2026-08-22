// Shared helpers for generating and rewriting course-component IDs.
//
// ID scheme (AcademeMate):
//   - Scheduled sessions (lecture, tutorial, practical, ...) -> {abbrev}-{LETTER}-{NN}
//     e.g. ML1-L-01, ML1-T-02, ML1-P-03. The number increments across ALL
//     scheduled types within a course (one shared sequence), so the letter is
//     only the calendar type — a practical that follows a lecture just gets the
//     next number. The legacy {abbrev}{LETTER}{NN} form (ML1-L01) is also
//     matched so existing IDs keep their numbering.
//   - Grade components (assignment, project, quiz, presentation, ...) ->
//     {abbrev}{NN}  (no dash, no padding)  e.g. ML11, ML12
//   - Exams -> {abbrev}E{NN}  (own sequence per course)  e.g. ML1E1
//
// The abbreviation is mandatory when a course is created; code/derived
// abbreviation is the fallback. Spaces in the base are replaced with dashes.

// Only scheduled session types carry a letter. Everything else (projects,
// assessments, etc.) is a plain number or (for exams) {ABBR}E{NN}.
export const TYPE_LETTER = {
  lecture: 'L',
  lectorial: 'L',
  tutorial: 'T',
  practical: 'P',
  meeting: 'M',
  seminar: 'S',
  selfstudy: 'Ss',
  presentation: 'Pr',
  // Calendar exam events are scheduled occurrences, so they get a distinct
  // letter to avoid colliding with grade-component exam IDs (ABBR-E-NN).
  exam: 'E',
}

export function typeLetter(type) {
  if (!type) return ''
  return TYPE_LETTER[type] || ''
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The prefix used to build IDs: the course's abbreviation when set, else the
// course code, else a derived abbreviation (never the full course name).
export function idBase(course, abbrev, code) {
  return (abbrev || code || deriveAbbrevFallback(course)).replace(/\s+/g, '-')
}

// Local fallback so this module has no hard dependency on driveClient.
function deriveAbbrevFallback(name) {
  if (!name) return 'COURSE'
  const words = String(name).trim().split(/\s+/).filter((w) => w.length > 1)
  const initials = (words.map((w) => w[0]).join('') || String(name).slice(0, 4)).toUpperCase()
  return initials.slice(0, 8)
}

// Next scheduled ID for a course: {abbrev}-{LETTER}-{NN}. One incremental
// sequence per course across ALL scheduled types, so lectures, tutorials and
// practicals share the numbering. `items` is the existing content list.
export function nextScheduledId(course, abbrev, code, items, type) {
  const base = idBase(course, abbrev, code)
  const letter = typeLetter(type) || ''
  // Scheduled IDs always carry a letter + separator (ABBR-L-01 or legacy
  // ABBR-L01); plain-numbered deadlines are never counted.
  const pat = new RegExp('^' + escapeRe(base) + '[- ][A-Za-z]{1,2}[- ]?(\\d+)$', 'i')
  let max = 0
  for (const i of items || []) {
    if (i.course !== course) continue
    const m = i.contentId && pat.exec(String(i.contentId))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return base + '-' + letter + '-' + String(max + 1).padStart(2, '0')
}

// Next grade-component ID for a course: {abbrev}{NN} (e.g. ML11) for anything
// but exams, {abbrev}E{NN} (e.g. ML1E1) for exams. Exams and non-exams keep
// separate sequences. Legacy {abbrev}-{NN} deadlines are matched too so
// existing IDs keep their numbers. Pass the combined content list + grade
// components of the course.
export function nextDeadlineId(course, abbrev, code, items, type) {
  const base = idBase(course, abbrev, code)
  const isExam = type === 'exam'
  const pat = new RegExp('^' + escapeRe(base) + '([A-Z]?)[- ]?(\\d+)$', 'i')
  let max = 0
  for (const i of items || []) {
    if (i.course !== course) continue
    const m = i.contentId && pat.exec(String(i.contentId))
    if (!m) continue
    const isExamId = !!m[1]
    if (isExam !== isExamId) continue
    max = Math.max(max, parseInt(m[2], 10))
  }
  return base + (isExam ? 'E' : '') + String(max + 1)
}

// Rewrite only the prefix of an ID when a course's abbreviation (or code)
// changes, keeping the suffix (letter + number) exactly as it was. Returns the
// original id when it does not start with oldBase.
export function renameIdBase(id, oldBase, newBase) {
  if (!id || typeof id !== 'string') return id
  // scheduled: ABBR-L-01 / ABBR-L01 · deadlines: ABBR01 / ABBRE1 / ABBR-01
  const re = new RegExp('^' + escapeRe(oldBase) + '([- ][A-Za-z]{1,2}[- ]?\\d+|[- ]?[A-Za-z]?\\d+)?$', 'i')
  const m = re.exec(id)
  if (!m) return id
  return newBase + (m[1] || '')
}
