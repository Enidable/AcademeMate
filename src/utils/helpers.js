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
]

const colorMap = {
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500', soft: 'bg-indigo-50/50' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', soft: 'bg-emerald-50/50' },
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500', soft: 'bg-blue-50/50' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500', soft: 'bg-purple-50/50' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', soft: 'bg-amber-50/50' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500', soft: 'bg-rose-50/50' },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-700', dot: 'bg-cyan-500', soft: 'bg-cyan-50/50' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700', dot: 'bg-teal-500', soft: 'bg-teal-50/50' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-500', soft: 'bg-slate-50/50' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500', soft: 'bg-orange-50/50' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500', soft: 'bg-gray-50/50' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-500', soft: 'bg-pink-50/50' },
}

export function getCourseStyle(courseName, colorOverride) {
  if (colorOverride && colorMap[colorOverride]) {
    return colorMap[colorOverride]
  }
  const entry = courseColors.find(c => c.course === courseName)
  return colorMap[entry?.color] || colorMap.slate
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
