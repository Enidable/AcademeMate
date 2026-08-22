// Shared helpers for generating and rewriting course-component IDs.
//
// ID scheme (chosen for AcademeMate):
//   - Scheduled sessions (lecture, tutorial, practical, ...) -> {abbrev}-{LETTER}{NN}
//     e.g. ASDfR-L01, ASDfR-P02, ASDfR-T01
//   - Projects AND assessments (assignment, exam, quiz, presentation, ...) ->
//     {abbrev}-{NN}  (no letter, two-digit, starting at 01)
//     e.g. ASDfR-01, ASDfR-02
//
// The abbreviation is mandatory when a course is created; code/derived
// abbreviation is the fallback. Spaces in the base are replaced with dashes.

// Only scheduled session types carry a letter. Everything else (projects,
// assessments, etc.) stays a plain number.
export const TYPE_LETTER = {
  lecture: 'L',
  lectorial: 'Lr',
  tutorial: 'T',
  practical: 'P',
  seminar: 'S',
  selfstudy: 'Ss',
  presentation: 'Pr',
  // Calendar exam events are scheduled occurrences, so they get a distinct
  // letter to avoid colliding with plain deadline numbers (ABBR-NN).
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

// Next scheduled ID for a given type: {abbrev}-{LETTER}{NN}, numbered per
// letter within the course so lectures, tutorials and practicals each start
// their own 01.. sequence. `items` is the existing content list.
export function nextScheduledId(course, abbrev, code, items, type) {
  const base = idBase(course, abbrev, code)
  const letter = typeLetter(type) || ''
  const pat = new RegExp('^' + escapeRe(base) + '[- ]?' + escapeRe(letter) + '(\\d+)$', 'i')
  let max = 0
  for (const i of items || []) {
    if (i.course !== course) continue
    const m = i.contentId && pat.exec(String(i.contentId))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return base + '-' + letter + String(max + 1).padStart(2, '0')
}

// Next plain deadline/project ID: {abbrev}-{NN} (two-digit, starting 01),
// shared across all non-scheduled components of a course so the numbers stay
// unique. Pass the combined list of content items + grade components.
export function nextDeadlineId(course, abbrev, code, items) {
  const base = idBase(course, abbrev, code)
  const pat = new RegExp('^' + escapeRe(base) + '[- ]?(\\d+)$', 'i')
  let max = 0
  for (const i of items || []) {
    if (i.course !== course) continue
    const m = i.contentId && pat.exec(String(i.contentId))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return base + '-' + String(max + 1).padStart(2, '0')
}

// Rewrite only the prefix of an ID when a course's abbreviation (or code)
// changes, keeping the letter + number suffix exactly as it was. Returns the
// original id when it does not start with oldBase.
export function renameIdBase(id, oldBase, newBase) {
  if (!id || typeof id !== 'string') return id
  const re = new RegExp('^' + escapeRe(oldBase) + '([- ][A-Za-z]{0,2}\\d+)?$', 'i')
  const m = re.exec(id)
  if (!m) return id
  return newBase + (m[1] || '')
}
