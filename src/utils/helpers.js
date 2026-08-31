const courseColors = [
  { course: 'Advanced Software Development for Robotics', color: 'indigo' },
  { course: 'Biomechanics of Human Movement', color: 'emerald' },
  { course: 'Biomechatronics', color: 'blue' },
  { course: 'Design Principles for Robotic and Mechatronic Mechanisms', color: 'purple' },
  { course: 'Modelling and Simulation', color: 'amber' },
  { course: 'AI for Autonomous Robots', color: 'rose' },
  { course: 'System Identification with Parameter Estimation and Machine Learning', color: 'cyan' },
  { course: 'Professional and Personal Development', color: 'teal' },
  { course: 'Other University Stuff', color: 'slate' },
  { course: 'System Improvement (Spreadsheet)', color: 'orange' },
  { course: 'Work', color: 'gray' },
  { course: 'Systems Engineering', color: 'pink' },
  { course: 'Modelling, Dynamics, and Kinematics', color: 'emerald' },
  { course: 'Machine Learning I', color: 'blue' },
  { course: 'Statistics and Probability', color: 'amber' },
  { course: 'Natural Language Processing', color: 'purple' },
]

const colorMap = {
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500', soft: 'bg-indigo-50/50', progress: 'bg-amber-500' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', soft: 'bg-emerald-50/50', progress: 'bg-rose-500' },
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500', soft: 'bg-blue-50/50', progress: 'bg-orange-500' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500', soft: 'bg-purple-50/50', progress: 'bg-amber-500' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', soft: 'bg-amber-50/50', progress: 'bg-indigo-500' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500', soft: 'bg-rose-50/50', progress: 'bg-emerald-500' },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-700', dot: 'bg-cyan-500', soft: 'bg-cyan-50/50', progress: 'bg-rose-500' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700', dot: 'bg-teal-500', soft: 'bg-teal-50/50', progress: 'bg-rose-500' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-500', soft: 'bg-slate-50/50', progress: 'bg-slate-700' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500', soft: 'bg-orange-50/50', progress: 'bg-blue-500' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500', soft: 'bg-gray-50/50', progress: 'bg-gray-700' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-500', soft: 'bg-pink-50/50', progress: 'bg-teal-500' },
}

const NAMED_COLOR_HEX = {
  indigo: '#6366f1', emerald: '#10b981', blue: '#3b82f6', purple: '#a855f7',
  amber: '#f59e0b', rose: '#f43f5e', cyan: '#06b6d4', teal: '#14b8a6',
  slate: '#64748b', orange: '#f97316', gray: '#9ca3af', pink: '#ec4899',
}

// Stable, readable hex colour for a course that has neither a saved colour nor
// an entry in the static map — so a brand-new course never falls back to grey.
const FALLBACK_HEX = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#22c55e', '#06b6d4',
  '#eab308', '#a855f7', '#3b82f6', '#ef4444', '#84cc16',
]

function colorFromName(name) {
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return FALLBACK_HEX[((h % FALLBACK_HEX.length) + FALLBACK_HEX.length) % FALLBACK_HEX.length]
}

// Inline styles for an arbitrary hex colour (colour wheel): white-tinted
// backgrounds so chips stay readable next to the class-based named colours.
function hexStyle(hex) {
  return {
    dot: '', dotCss: { backgroundColor: hex },
    bg: '', bgCss: { backgroundColor: mixHex(hex, 0.86) || '#f1f5f9' },
    text: '', textCss: { color: hex },
    soft: '', softCss: { backgroundColor: mixHex(hex, 0.93) || '#f8fafc' },
    border: '', borderCss: { borderColor: mixHex(hex, 0.7) || '#e2e8f0' },
    progress: '', progressCss: { backgroundColor: complementHex(hex) || '#334155' },
  }
}

export function getCourseStyle(courseName, colorOverride) {
  if (colorOverride && colorMap[colorOverride]) {
    return colorMap[colorOverride]
  }
  // Arbitrary hex colour (color wheel): return inline styles with white-tinted
  // backgrounds so chips stay readable next to the class-based named colours.
  if (colorOverride && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorOverride)) {
    return hexStyle(colorOverride)
  }
  const entry = courseColors.find(c => c.course === courseName)
  if (entry?.color) return colorMap[entry.color]
  return hexStyle(colorFromName(courseName))
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

// Blend a hex colour towards white by `ratio` (0 = pure, 1 = white).
function mixHex(hex, ratio) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const r = Math.round(rgb.r + (255 - rgb.r) * ratio)
  const g = Math.round(rgb.g + (255 - rgb.g) * ratio)
  const b = Math.round(rgb.b + (255 - rgb.b) * ratio)
  return `rgb(${r}, ${g}, ${b})`
}

// The opposite colour on the wheel (used for progress bars).
function complementHex(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return `rgb(${255 - rgb.r}, ${255 - rgb.g}, ${255 - rgb.b})`
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatTime(timeStr) {
  if (!timeStr) return '—'
  return timeStr.slice(0, 5)
}

export function normalizeCategory(cat) {
  if (!cat) return '—'
  return cat
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function normalizeStatus(status) {
  const s = (status || '').trim().toLowerCase()
  if (['completed', 'complete', 'done', 'finished'].includes(s)) return 'completed'
  if (['in progress', 'in process', 'active', 'ongoing', 'inprog'].includes(s)) return 'in progress'
  if (['planned', 'upcoming', 'to do', 'todo', 'not started'].includes(s)) return 'planned'
  return ''
}

export const COLOR_NAMES = Object.keys(colorMap)

export function colorToHex(color, courseName = null) {
  // No stored colour: match what getCourseStyle shows for the card — a static
  // named colour for known courses, else a stable hash colour.
  if (!color) {
    const entry = courseName ? courseColors.find(c => c.course === courseName) : null
    if (entry?.color) return NAMED_COLOR_HEX[entry.color]
    return courseName ? colorFromName(courseName) : '#6366f1'
  }
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return color
  return NAMED_COLOR_HEX[color] || (courseName ? colorFromName(courseName) : '#6366f1')
}

export function getStatus(course) {
  const normalized = normalizeStatus(course?.status)
  if (normalized) return normalized === 'completed' ? 'Completed' : normalized === 'in progress' ? 'In Progress' : 'Planned'
  if (course.grade != null) return 'Completed'
  if (!course.start) return 'Planned'
  return 'In Progress'
}

export function truncate(str, max = 50) {
  if (!str) return '—'
  return str.length > max ? str.slice(0, max) + '…' : str
}

const categoryVariants = {
  'Studying': 'bg-blue-100 text-blue-700',
  'Lecture': 'bg-purple-100 text-purple-700',
  'Project Work': 'bg-indigo-100 text-indigo-700',
  'Group Work': 'bg-teal-100 text-teal-700',
  'Practical': 'bg-cyan-100 text-cyan-700',
  'Exam': 'bg-red-100 text-red-700',
  'Exam Prep': 'bg-orange-100 text-orange-700',
  'Exercise': 'bg-green-100 text-green-700',
  'Meeting': 'bg-amber-100 text-amber-700',
  'Presentation': 'bg-violet-100 text-violet-700',
  'Work': 'bg-gray-100 text-gray-700',
  'Other': 'bg-slate-100 text-slate-700',
}

export function getCategoryStyle(cat) {
  const normalized = normalizeCategory(cat)
  return categoryVariants[normalized] || categoryVariants['Other']
}

export function getEfficiencyBar(val) {
  if (val == null) return null
  const pct = (val / 10) * 100
  let color
  if (val <= 3) color = 'bg-red-500'
  else if (val <= 5) color = 'bg-amber-500'
  else if (val <= 7) color = 'bg-yellow-500'
  else color = 'bg-green-500'
  return { pct, color }
}

export function getWellbeingBar(val) {
  if (val == null) return null
  const pct = (val / 10) * 100
  let color
  if (val <= 3) color = 'bg-red-500'
  else if (val <= 5) color = 'bg-amber-500'
  else if (val <= 7) color = 'bg-yellow-500'
  else color = 'bg-green-500'
  return { pct, color }
}

export function getCurrentWeekNumber() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = (now - start) / 86400000
  return Math.ceil((diff + start.getDay() + 1) / 7)
}

export function getWeekTotal(weeklyHours, weekNum) {
  const entry = weeklyHours.find(w => w.week === weekNum)
  return entry?.total ?? null
}

export function shortCourseName(name) {
  const map = {
    'Advanced Software Development for Robotics': 'ASDfR',
    'Biomechanics of Human Movement': 'Biomechanics',
    'Biomechatronics': 'Biomechatronics',
    'Design Principles for Robotic and Mechatronic Mechanisms': 'Design Principles',
    'Modelling and Simulation': 'M&S',
    'AI for Autonomous Robots': 'AI',
    'System Identification with Parameter Estimation and Machine Learning': 'System ID',
    'Professional and Personal Development': 'PPD',
    'Other University Stuff': 'Other Uni',
    'System Improvement (Spreadsheet)': 'Spreadsheet',
    'Work': 'Work',
  }
  return map[name] || name
}

// A course is "active" when it is currently being studied: marked in progress,
// or (no status yet and) today falls inside its start/finish window.
export function isCourseActive(course, todayISO) {
  // Unknown / missing course rows are never "active" — never crash on them
  // (a study-log entry can reference a course that isn't in the Courses tab).
  if (!course) return false
  const status = normalizeStatus(course?.status)
  if (status === 'completed') return false
  if (status === 'in progress') return true
  if (status === 'planned') return false
  const t = todayISO || new Date().toISOString().slice(0, 10)
  if (!course.start && !course.finish) return true
  if (course.start && t < course.start) return false
  if (course.finish && t > course.finish) return false
  return true
}

// Map a calendar/timetable event type to the closest session-logger category
// (defaults of the category pick-list) so ticking off a class pre-fills it.
export function sessionCategoryForType(type) {
  switch (type) {
    case 'lecture':
    case 'lectorial':
      return 'Lecture'
    case 'practical':
      return 'Practical'
    case 'presentation':
      return 'Presentation'
    case 'meeting':
      return 'Meeting'
    case 'exam':
    case 'exam review':
    case 'resit':
      return 'Exam Prep'
    default:
      return 'Studying'
  }
}

// Duration in hours between two HH:mm times; spans midnight (23:00->01:00 = 2h).
export function durationBetween(startTime, endTime) {
  const m = t => {
    const mm = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim())
    return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : null
  }
  const s = m(startTime)
  const e = m(endTime)
  if (s == null || e == null) return null
  let mins = e - s
  if (mins < 0) mins += 1440
  return +(mins / 60).toFixed(2)
}

// Current wall-clock time as HH:mm (local).
export function nowTime() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return p(d.getHours()) + ':' + p(d.getMinutes())
}

// Planner rows sorted in from the Weekly Overview "menu" are tagged in their
// notes field (menu:prep|…, menu:evt|…, menu:dl|…) so that page can find, move
// and remove them again after a reload. The tag is internal bookkeeping and
// must never surface to the user: a user note, if any, is kept after the "||"
// separator, and the whole menu:… prefix is hidden from display and editing.
export const MENU_TAG_PREFIX = 'menu:'
export const MENU_TAG_SEPARATOR = '||'

// The user-facing note of a planner row, with any menu tag stripped off.
export function displayNotes(notes) {
  const n = notes || ''
  if (n.startsWith(MENU_TAG_PREFIX)) {
    const idx = n.indexOf(MENU_TAG_SEPARATOR)
    return idx > -1 ? n.slice(idx + MENU_TAG_SEPARATOR.length) : ''
  }
  // "auto-logged" marks planner entries created from logged sessions — internal.
  if (String(n).trim() === 'auto-logged') return ''
  return n
}

// The pure "menu:…" tag of a planner row's notes, or null when there is none.
export function menuTagOfNotes(notes) {
  const n = notes || ''
  if (!n.startsWith(MENU_TAG_PREFIX)) return null
  const idx = n.indexOf(MENU_TAG_SEPARATOR)
  return idx > -1 ? n.slice(0, idx) : n
}

// Re-attaches the menu tag (if the row had one) to user-edited notes, so
// editing a tagged row keeps it linked to the Weekly Overview menu.
export function mergeNotesWithTag(edited, original) {
  const editedVal = (edited || '').trim()
  const tag = menuTagOfNotes(original)
  if (!tag) return editedVal || null
  return editedVal ? `${tag}${MENU_TAG_SEPARATOR}${editedVal}` : tag
}

// Personal-calendar events whose title/description mark them as work land in
// the "Work" additional-time row (never counted as study). Matches English
// ("work", "shift", "job") and German ("arbeit", "arbeitstag", "schicht",
// "dienst") work words, among others.
const WORK_RE = /(^|[^a-z0-9])work(s|ing|ed|day|days)?([^a-z0-9]|$)|arbeit|schicht|dienst|shift|job|client|kunde|werktag/i
export function isWorkEvent(e) {
  return WORK_RE.test(`${e.summary || ''} ${e.description || ''}`)
}

// The lecture/content ID referenced by a Weekly Overview prep or deadline row
// (menu:prep|courses|contentId|date / menu:dl|courses|contentId|deadline), so
// ticking one off can pre-fill the session logger's lecture ID.
export function lectureIdFromNotes(notes) {
  const tag = menuTagOfNotes(notes)
  if (!tag) return ''
  const parts = tag.slice(MENU_TAG_PREFIX.length).split('|')
  if (parts[0] === 'prep' || parts[0] === 'dl') return parts[2] || ''
  return ''
}
