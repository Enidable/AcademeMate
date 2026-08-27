import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { computeXp, courseWeightFor, XP_CONSTANTS } from '../data/xp'
import { formatDateShort, getCourseStyle } from '../utils/helpers'
import { isoWeekOf, weekdayIndex } from '../data/normalize'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Subtle heat-map background for an hour value scaled against the range's max.
// Low values lean warm (orange), high values cool (blue) — kept light so the
// numbers stay readable. Returns a style object (or null to leave transparent).
function heatStyle(v, max) {
  if (!(v > 0) || !(max > 0)) return null
  const t = Math.min(1, v / max)
  const lo = [251, 146, 60] // orange-400
  const hi = [59, 130, 246] // blue-500
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * t)
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * t)
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * t)
  const alpha = 0.10 + 0.30 * t
  return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})` }
}

// Yellow (low) -> purple (high) tint for the per-weekday averages, so the day
// with the most hours stands out. Same subtle alpha treatment.
function heatStyleDay(v, max) {
  if (!(v > 0) || !(max > 0)) return null
  const t = Math.min(1, v / max)
  const lo = [250, 204, 21] // yellow-400
  const hi = [168, 85, 247] // purple-500
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * t)
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * t)
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * t)
  const alpha = 0.12 + 0.32 * t
  return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})` }
}
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ScatterChart, Scatter,
} from 'recharts'

function pad(n) {
  return String(n).padStart(2, '0')
}

function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function todayISO() {
  return toISO(new Date())
}

function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}

// Monday of the ISO week containing `iso` (used as the weekly bucket key).
function mondayOf(iso) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toISO(d)
}

// Categories are human-entered and drift in casing ("Project Work" /
// "project Work" / …). Normalise to a canonical display form: same letters,
// one spelling (the most frequent original).
function makeCategoryNormalizer() {
  const freq = new Map() // lower -> Map<original, count>
  return {
    feed(raw) {
      const k = String(raw || '').trim().toLowerCase()
      if (!k) return null
      if (!freq.has(k)) freq.set(k, new Map())
      const m = freq.get(k)
      m.set(String(raw).trim(), (m.get(String(raw).trim()) || 0) + 1)
      return k
    },
    canonical(lowerKey) {
      const m = freq.get(lowerKey)
      if (!m) return lowerKey
      let best = '', n = -1
      for (const [label, count] of m) if (count > n) { best = label; n = count }
      return best
    },
  }
}

// Pearson correlation coefficient of two equal-length numeric arrays.
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  let sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i] }
  const mx = sx / n, my = sy / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  const den = Math.sqrt(dx * dy)
  return den === 0 ? null : num / den
}

// Buckets (sorted) -> rolling-average series. The window ADAPTS to the amount
// of data: short ranges stay responsive, multi-year ranges still show a smooth
// long-term line — while always plotting the FULL selected range.
function rolling(buckets, pick) {
  const window = Math.max(2, Math.min(12, Math.round(buckets.length / 8)))
  return buckets.map((b, i) => {
    const slice = buckets.slice(Math.max(0, i - window + 1), i + 1)
    const vals = slice.map(pick).filter(v => v != null && isFinite(v))
    return { label: b.label, value: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null }
  })
}

const GRANULARITIES = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

const METRICS = [
  { key: 'wellbeing', title: 'Wellbeing', color: '#10b981', domain: [0, 10] },
  { key: 'efficiency', title: 'Efficiency', color: '#f59e0b', domain: [0, 10] },
  { key: 'hours', title: 'Study hours', color: '#6366f1' },
  { key: 'xp', title: 'XP earned', color: '#8b5cf6' },
]

function TrendCard({ title, data, color, domain }) {
  const clean = data.filter(d => d.value != null)
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{title}</h3>
      {clean.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No data in range.</p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={clean} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} minTickGap={28} />
              <YAxis tick={{ fontSize: 9 }} domain={domain || ['auto', 'auto']} />
              <Tooltip formatter={v => Number(v).toFixed(2)} labelStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="value" name={title} stroke={color} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function CorrelationCard({ title, points, xLabel, yLabel }) {
  const r = pearson(points.map(p => p.x), points.map(p => p.y))
  const strength = r == null ? '—' : `${r > 0 ? '+' : ''}${r.toFixed(2)}`
  const tone = r == null ? 'bg-slate-100 text-slate-500'
    : Math.abs(r) >= 0.5 ? (r > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
    : Math.abs(r) >= 0.25 ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-500'
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tone}`} title="Pearson correlation coefficient">
          r = {strength}
        </span>
      </div>
      {points.length < 3 ? (
        <p className="text-xs text-slate-400 py-8 text-center">Not enough data.</p>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="x" name={xLabel} tick={{ fontSize: 9 }} type="number" domain={['auto', 'auto']} />
              <YAxis dataKey="y" name={yLabel} tick={{ fontSize: 9 }} type="number" domain={['auto', 'auto']} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => [Number(v).toFixed(2), n]} labelStyle={{ fontSize: 11 }} />
              <Scatter data={points} fill="#6366f1" fillOpacity={0.55} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default function Analysis() {
  const {
    inputLog, additionalLog, dailyPlan, masterCourses, gradeComponents,
  } = useAppData()

  const [gran, setGran] = useState('week')
  const [courseFilter, setCourseFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')

  // Per-course XP inputs (same model as the Dashboard curve).
  const xpInputs = useMemo(() => {
    const progressByCourse = {}
    const loggedByCourse = {}
    for (const e of inputLog || []) loggedByCourse[e.course] = (loggedByCourse[e.course] || 0) + (e.durationHours || 0)
    const courseWeights = {}
    const courseEstHours = {}
    for (const c of masterCourses || []) {
      const est = (c.ec || 0) * XP_CONSTANTS.ESTIMATED_HOURS_PER_EC
      progressByCourse[c.course] = est > 0 ? (loggedByCourse[c.course] || 0) / est : 0
      courseWeights[c.course] = courseWeightFor(c.ec)
      courseEstHours[c.course] = est
    }
    return { progressByCourse, courseWeights, courseEstHours }
  }, [inputLog, masterCourses])

  // Canonical category spellings (case-insensitive grouping).
  const normalizer = useMemo(() => {
    const norm = makeCategoryNormalizer()
    for (const e of inputLog || []) norm.feed(e.category)
    return norm
  }, [inputLog])

  const categories = useMemo(() => {
    const seen = new Set()
    for (const e of inputLog || []) {
      const k = String(e.category || '').trim().toLowerCase()
      if (k) seen.add(normalizer.canonical(k))
    }
    return [...seen].sort()
  }, [inputLog, normalizer])

  const catKey = raw => String(raw || '').trim().toLowerCase()
  const filterKey = categoryFilter ? catKey(categoryFilter) : ''

  // Entries inside every active filter.
  const entries = useMemo(() => (inputLog || []).filter(e =>
    e.date &&
    (!rangeFrom || e.date >= rangeFrom) && (!rangeTo || e.date <= rangeTo) &&
    (!courseFilter || e.course === courseFilter) &&
    (!filterKey || catKey(e.category) === filterKey)
  ), [inputLog, rangeFrom, rangeTo, courseFilter, filterKey])

  // --- Weekly breakdown (Work Week x weekday) ------------------------------
  // Hours per ISO week, split by weekday. Aims for the "Work Week | Mon–Sun"
  // grid the user keeps in their Master Tracker: one table per year, columns
  // = work weeks, rows = Year total + each weekday.
  const weeklyBreakdown = useMemo(() => {
    const byYear = new Map() // year -> Map<week, { total, day[7] }>
    for (const e of entries) {
      if (!e.date || !(e.durationHours > 0)) continue
      const wk = isoWeekOf(e.date)
      if (!wk) continue
      if (!byYear.has(wk.year)) byYear.set(wk.year, new Map())
      const weeks = byYear.get(wk.year)
      if (!weeks.has(wk.week)) weeks.set(wk.week, { week: wk.week, total: 0, day: Array.from({ length: 7 }, () => 0) })
      const w = weeks.get(wk.week)
      w.total += e.durationHours || 0
      w.day[weekdayIndex(e.date)] += e.durationHours || 0
    }
    return [...byYear.keys()].sort().map(year => {
      const weeks = [...byYear.get(year).values()].sort((a, b) => a.week - b.week)
      const maxWeek = weeks.length ? weeks[weeks.length - 1].week : 0
      const cols = Array.from({ length: maxWeek }, (_, i) => {
        const w = weeks.find(x => x.week === i + 1)
        return w || { week: i + 1, total: 0, day: Array.from({ length: 7 }, () => 0) }
      })
      const dayTotals = cols.reduce((acc, c) => {
        for (let d = 0; d < 7; d++) acc[d] += c.day[d]
        return acc
      }, Array.from({ length: 7 }, () => 0))
      return {
        year,
        cols,
        dayAvg: dayTotals.map(h => (maxWeek ? h / maxWeek : 0)),
        yearAvg: cols.reduce((s, c) => s + c.total, 0) / (maxWeek || 1),
        maxTotal: cols.reduce((m, c) => Math.max(m, c.total), 0),
        maxDay: cols.reduce((m, c) => c.day.reduce((mm, v) => Math.max(mm, v), m), 0),
      }
    })
  }, [entries])

  // --- Trend buckets ------------------------------------------------------
  const trends = useMemo(() => {
    const keyOf = iso => gran === 'day' ? iso : gran === 'week' ? mondayOf(iso) : iso.slice(0, 7)
    const buckets = new Map()
    for (const e of entries) {
      const k = keyOf(e.date)
      if (!buckets.has(k)) buckets.set(k, { key: k, label: gran === 'month' ? k : formatDateShort(k), hours: 0, xp: 0, effs: [], wells: [] })
      const b = buckets.get(k)
      b.hours += e.durationHours || 0
      b.xp += computeXp(e, xpInputs.progressByCourse, xpInputs.courseWeights, xpInputs.courseEstHours)
      if (e.efficiency != null) b.effs.push(e.efficiency)
      if (e.wellbeing != null) b.wells.push(e.wellbeing)
    }
    const list = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key))
    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
    return {
      wellbeing: rolling(list, b => avg(b.wells)),
      efficiency: rolling(list, b => avg(b.effs)),
      hours: rolling(list, b => b.hours),
      xp: rolling(list, b => b.xp),
    }
  }, [entries, gran, xpInputs])

  // --- Correlation datasets ----------------------------------------------
  const scatters = useMemo(() => {
    const effDur = entries
      .filter(e => e.efficiency != null && (e.durationHours || 0) > 0)
      .map(e => ({ x: +(e.durationHours).toFixed(2), y: e.efficiency }))
    // Daily hours vs that day's average wellbeing.
    const byDay = new Map()
    for (const e of entries) {
      if (!byDay.has(e.date)) byDay.set(e.date, { hours: 0, wells: [] })
      const d = byDay.get(e.date)
      d.hours += e.durationHours || 0
      if (e.wellbeing != null) d.wells.push(e.wellbeing)
    }
    const wellHours = []
    for (const [, d] of byDay) {
      if (d.wells.length === 0) continue
      wellHours.push({ x: +d.hours.toFixed(2), y: +(d.wells.reduce((s, v) => s + v, 0) / d.wells.length).toFixed(2) })
    }
    const effWell = entries
      .filter(e => e.efficiency != null && e.wellbeing != null)
      .map(e => ({ x: e.wellbeing, y: e.efficiency }))
    const effStart = entries
      .filter(e => e.efficiency != null && /^\d{1,2}:\d{2}/.test(e.startTime || ''))
      .map(e => {
        const [h, m] = e.startTime.split(':').map(Number)
        return { x: h + m / 60, y: e.efficiency }
      })
    return [
      { title: 'Efficiency vs study duration', points: effDur, xLabel: 'Duration (h)', yLabel: 'Efficiency' },
      { title: 'Efficiency vs wellbeing', points: effWell, xLabel: 'Wellbeing', yLabel: 'Efficiency' },
      { title: 'Wellbeing vs study hours (per day)', points: wellHours, xLabel: 'Hours/day', yLabel: 'Wellbeing' },
      { title: 'Efficiency vs time of day', points: effStart, xLabel: 'Session start (h)', yLabel: 'Efficiency' },
    ]
  }, [entries])

  // --- Workload guidance (study hours) -------------------------------------
  const prediction = useMemo(() => {
    // Weekly aggregates over ALL history: study hours, additional commitments
    // (work / exercise / commute / obligations).
    const weeks = new Map()
    const weekOf = () => ({ study: 0, add: 0 })
    for (const e of inputLog || []) {
      if (!e.date) continue
      const k = mondayOf(e.date)
      if (!weeks.has(k)) weeks.set(k, weekOf())
      weeks.get(k).study += e.durationHours || 0
    }
    for (const a of additionalLog || []) {
      if (!a.date) continue
      const k = mondayOf(a.date)
      if (!weeks.has(k)) weeks.set(k, weekOf())
      weeks.get(k).add += a.hours || 0
    }
    const weekList = [...weeks.values()]
      .map(w => ({ study: w.study, add: w.add }))
      .filter(w => w.study > 0 || w.add > 0)

    const mean = list => list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0
    const studyHours = weekList.map(w => w.study)
    // Average weekly study load…
    const avgStudy = mean(studyHours)
    // …and a maximum recommendation taken from the OUTLIER weeks (every week
    // above your own average): what a push-week looks like for you.
    const outlierWeeks = weekList.filter(w => w.study > avgStudy)
    const maxRecommendedStudy = outlierWeeks.length ? mean(outlierWeeks.map(w => w.study)) : avgStudy

    // Current week's plan.
    const monday = mondayOf(todayISO())
    const weekDates = new Set(Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i)))
    let plannedStudy = 0
    for (const r of dailyPlan || []) if (weekDates.has(r.date)) plannedStudy += r.plannedHours || 0
    let plannedAdditional = 0
    for (const a of additionalLog || []) if (weekDates.has(a.date)) plannedAdditional += a.hours || 0

    return {
      avgStudy,
      maxRecommendedStudy,
      historyWeeks: weekList.length,
      outlierWeeks: outlierWeeks.length,
      plannedStudy,
      plannedAdditional,
      // Red once the plan goes past your proven push-week level, amber when
      // merely above your average.
      over: plannedStudy > maxRecommendedStudy,
      aboveAvg: plannedStudy > avgStudy && plannedStudy <= maxRecommendedStudy,
    }
  }, [inputLog, additionalLog, dailyPlan])

  // --- Quartile analysis ---------------------------------------------------
  // Sessions are assigned to the (year, quartile) of their course, then per
  // period: total hours, weeks spanned, average h/week, h/course/week and
  // average hours per weekday.
  const quartileStats = useMemo(() => {
    const meta = new Map((masterCourses || []).map(c => [c.course, c]))
    const groups = new Map()
    for (const e of inputLog || []) {
      if (!e.date || !(e.durationHours > 0)) continue
      const c = meta.get(e.course)
      const ym = c && String(c.year || '').match(/\d{4}/)?.[0]
      const qm = c && String(c.quartile || '').match(/[1-4]/)?.[0]
      if (!ym || !qm) continue
      const key = `${ym} · Q${qm}`
      if (!groups.has(key)) groups.set(key, {
        key, courses: new Set(), total: 0,
        min: e.date, max: e.date,
        dayHours: Array.from({ length: 7 }, () => 0),
      })
      const g = groups.get(key)
      g.courses.add(e.course)
      g.total += e.durationHours
      if (e.date < g.min) g.min = e.date
      if (e.date > g.max) g.max = e.date
      g.dayHours[(new Date(e.date + 'T12:00:00').getDay() + 6) % 7] += e.durationHours
    }
    return [...groups.values()].map(g => {
      const startMon = mondayOf(g.min)
      const endMon = mondayOf(g.max)
      const weeks = Math.max(1, Math.round((new Date(endMon + 'T12:00:00') - new Date(startMon + 'T12:00:00')) / 604800000) + 1)
      const nCourses = g.courses.size
      // Quartile period: earliest course start -> latest course finish across
      // the courses that make up this quartile. Falls back to the session span
      // when a course has no dates.
      const courseDates = [...g.courses].map(n => meta.get(n)).filter(Boolean)
      const starts = courseDates.map(c => c.start).filter(Boolean)
      const finishes = courseDates.map(c => c.finish).filter(Boolean)
      const startDate = starts.length ? starts.reduce((a, b) => a < b ? a : b) : g.min
      const endDate = finishes.length ? finishes.reduce((a, b) => a > b ? a : b) : g.max
      return {
        key: g.key,
        start: startDate,
        end: endDate,
        nCourses,
        total: g.total,
        weeks,
        avgWeek: g.total / weeks,
        avgPerCourse: nCourses > 0 ? (g.total / weeks) / nCourses : 0,
        dayAvg: g.dayHours.map(h => h / weeks),
      }
    }).sort((a, b) => a.key.localeCompare(b.key))
  }, [inputLog, masterCourses])

  // --- Per-course outcomes --------------------------------------------------
  const courseOutcomes = useMemo(() => {
    const gradeOf = name => gradeComponents?.find(g => g.course === name)?.totalGrade ?? null
    const rows = []
    for (const c of masterCourses || []) {
      const entries = (inputLog || []).filter(e => e.course === c.course && e.durationHours > 0)
      if (entries.length === 0 && gradeOf(c.course) == null) continue
      const dates = entries.map(e => e.date).filter(Boolean).sort()
      let weeks = 1
      if (dates.length >= 2) {
        weeks = Math.max(1, Math.round((new Date(mondayOf(dates[dates.length - 1]) + 'T12:00:00') - new Date(mondayOf(dates[0]) + 'T12:00:00')) / 604800000) + 1)
      }
      const effs = entries.map(e => e.efficiency).filter(v => v != null)
      const wells = entries.map(e => e.wellbeing).filter(v => v != null)
      const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
      rows.push({
        course: c.course,
        color: getCourseStyle(c.course),
        hours: entries.reduce((s, e) => s + e.durationHours, 0),
        sessions: entries.length,
        weeks,
        avgWeek: entries.length ? entries.reduce((s, e) => s + e.durationHours, 0) / weeks : 0,
        grade: gradeOf(c.course),
        efficiency: avg(effs),
        wellbeing: avg(wells),
      })
    }
    return rows.sort((a, b) => b.hours - a.hours)
  }, [masterCourses, inputLog, gradeComponents])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {GRANULARITIES.map(g => (
            <button key={g.value} onClick={() => setGran(g.value)}
              className={`text-xs px-3 py-1.5 cursor-pointer ${gran === g.value ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {g.label}
            </button>
          ))}
        </div>
        <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer">
          <option value="">All courses</option>
          {(masterCourses || []).map(c => <option key={c.course} value={c.course}>{c.course}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer">
          <option value="">All work types</option>
          {categories.map(c => <option key={catKey(c)} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-1 text-xs text-slate-500 ml-auto">
          <span>From</span>
          <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1 bg-white" placeholder="Beginning" />
          <span>to</span>
          <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1 bg-white" placeholder="Today" />
        </div>
      </div>

      {/* Study load guidance */}
      <div className={`rounded-xl border p-4 ${prediction.over ? 'border-red-200 bg-red-50' : prediction.aboveAvg ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Average weekly study</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">
              {prediction.avgStudy.toFixed(1)}h
              <span className="text-xs text-slate-400 font-medium ml-2">your normal week</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Max recommended weekly study</p>
            <p className="text-2xl font-bold text-indigo-600 tabular-nums">
              {prediction.maxRecommendedStudy.toFixed(1)}h
              <span className="text-xs text-slate-400 font-medium ml-2">average of your above-average weeks</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Planned this week</p>
            <p className={`text-2xl font-bold tabular-nums ${prediction.over ? 'text-red-600' : 'text-slate-800'}`}>
              {prediction.plannedStudy.toFixed(1)}h
              <span className="text-xs text-slate-400 font-medium ml-2">study · +{prediction.plannedAdditional.toFixed(1)}h other commitments</span>
            </p>
          </div>
          <div className="ml-auto">
            {prediction.over ? (
              <span className="inline-block text-xs px-3 py-1.5 rounded-full bg-red-600 text-white font-semibold">
                ⚠ Above your proven maximum — dial back
              </span>
            ) : prediction.aboveAvg ? (
              <span className="inline-block text-xs px-3 py-1.5 rounded-full bg-amber-500 text-white font-semibold">
                Push week — above average, within limits
              </span>
            ) : (
              <span className="inline-block text-xs px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                Within a normal study week
              </span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Based on {prediction.historyWeeks} tracked weeks ({prediction.outlierWeeks} of them above-average "push" weeks).
        </p>
      </div>

      {/* Weekly breakdown: Work Week x weekday */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Weekly hours by weekday</h2>
        <p className="text-[10px] text-slate-400 mb-3">
          Hours per work week (ISO), split by weekday — matches the Work Week grid in your Master Tracker.
          The <span className="font-medium text-slate-500">Year [h]</span> row is that week's total. Cells are tinted by
          intensity: warm (orange) for low hours, cool (blue) for high. The daily averages use yellow → purple so
          the busiest weekday stands out.
        </p>
        {weeklyBreakdown.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No session data in this range.</p>
        ) : (
          <div className="space-y-5">
            {weeklyBreakdown.map(y => (
              <div key={y.year}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-slate-600">Work Week — {y.year}</h3>
                  <div className="text-[10px] text-slate-400">
                    avg <span className="font-semibold text-slate-600 tabular-nums">{y.yearAvg.toFixed(1)}</span> h/week
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  <div className="min-w-[360px] max-w-full overflow-x-auto">
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="text-left px-2 py-1.5 font-medium">Work Week</th>
                          {y.cols.map(c => (
                            <th key={c.week} className="text-center px-1 py-1.5 font-medium tabular-nums">{c.week}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td className="px-2 py-1.5 font-semibold text-slate-700">{y.year} [h]</td>
                          {y.cols.map(c => (
                            <td key={c.week} style={heatStyle(c.total, y.maxTotal)} className="px-1 py-1.5 text-center tabular-nums font-semibold text-slate-800">{c.total > 0 ? c.total.toFixed(1) : ''}</td>
                          ))}
                        </tr>
                        {DOW.map((d, di) => (
                          <tr key={d} className="border-b border-slate-50">
                            <td className="px-2 py-1 text-slate-500">{d}</td>
                            {y.cols.map(c => (
                              <td key={c.week} style={heatStyle(c.day[di], y.maxDay)} className={`px-1 py-1 text-center tabular-nums ${c.day[di] > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
                                {c.day[di] > 0 ? c.day[di].toFixed(1) : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Average per weekday (h/week)</div>
                    <table className="text-xs border-collapse">
                      <tbody>
                        {DOW.map((d, i) => (
                          <tr key={d} className="border-b border-slate-50">
                            <td className="pr-4 py-1 text-slate-500">{d}</td>
                            <td className="text-right tabular-nums font-medium text-slate-700" style={heatStyleDay(y.dayAvg[i], Math.max(...y.dayAvg))}>
                              {y.dayAvg[i].toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quartile analysis */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Quartile analysis</h2>
        <p className="text-[10px] text-slate-400 mb-3">
          Sessions grouped by the year + quartile of their course — how much you actually studied per period,
          per week, per course and per weekday. Use it to judge how many courses you can handle per quartile.
        </p>
        {quartileStats.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            No quartile data yet — set Year and Quartile on your courses so sessions can be grouped.
          </p>
        ) : (
          <table className="w-full text-xs border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left px-2 py-1.5 font-medium">Period</th>
                <th className="text-center px-2 py-1.5 font-medium">Courses</th>
                <th className="text-center px-2 py-1.5 font-medium">Weeks</th>
                <th className="text-right px-2 py-1.5 font-medium">Total h</th>
                <th className="text-right px-2 py-1.5 font-medium">Avg h/week</th>
                <th className="text-right px-2 py-1.5 font-medium">h/course/week</th>
                <th className="text-left px-2 py-1.5 font-medium">Avg per weekday</th>
              </tr>
            </thead>
            <tbody>
              {quartileStats.map(q => (
                <tr key={q.key} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                  <td className="px-2 py-1.5">
                    <div className="font-medium text-slate-700 whitespace-nowrap">{q.key}</div>
                    <div className="text-[10px] text-slate-400 whitespace-nowrap">{formatDateShort(q.start)} – {formatDateShort(q.end)}</div>
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{q.nCourses}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{q.weeks}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{q.total.toFixed(0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800">{q.avgWeek.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-indigo-600 font-medium">{q.avgPerCourse.toFixed(1)}</td>
                  <td className="px-2 py-1.5">
                    <table className="text-[10px] w-full">
                      <tbody>
                        {DOW.map((d, i) => (
                          <tr key={d}>
                            <td className="pr-2 text-slate-400">{d}</td>
                            <td className="text-right tabular-nums text-slate-600">{q.dayAvg[i].toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Trends */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Trends ({GRANULARITIES.find(g => g.value === gran)?.label})</h2>
        <p className="text-[10px] text-slate-400 mb-2">
          Full selected range is plotted; the line is a rolling average whose window adapts to the amount of data.
          Leave the date fields empty to see your entire history.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {METRICS.map(m => (
            <TrendCard key={m.key} title={m.title} data={trends[m.key]} color={m.color} domain={m.domain} />
          ))}
        </div>
      </div>

      {/* Correlations */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Correlations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {scatters.map(s => (
            <CorrelationCard key={s.title} title={s.title} points={s.points} xLabel={s.xLabel} yLabel={s.yLabel} />
          ))}
        </div>
      </div>

      {/* Per-course outcomes */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Course outcomes — time investment vs result</h2>
        <p className="text-[10px] text-slate-400 mb-3">
          Per course: logged time, weekly pace while active, grade, and average efficiency/wellbeing —
          to see which courses paid off for the effort and where prioritisation pays.
        </p>
        {courseOutcomes.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No course data yet.</p>
        ) : (
          <table className="w-full text-xs border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left px-2 py-1.5 font-medium">Course</th>
                <th className="text-right px-2 py-1.5 font-medium">Sessions</th>
                <th className="text-right px-2 py-1.5 font-medium">Total h</th>
                <th className="text-right px-2 py-1.5 font-medium">Active weeks</th>
                <th className="text-right px-2 py-1.5 font-medium">Avg h/week</th>
                <th className="text-right px-2 py-1.5 font-medium">Grade</th>
                <th className="text-right px-2 py-1.5 font-medium">Avg efficiency</th>
                <th className="text-right px-2 py-1.5 font-medium">Avg wellbeing</th>
              </tr>
            </thead>
            <tbody>
              {courseOutcomes.map(r => (
                <tr key={r.course} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${r.color.dot}`} style={r.color.dotCss} />
                      <span className="truncate text-slate-700 max-w-[240px]" title={r.course}>{r.course}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.sessions}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.hours.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.weeks}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-800">{r.avgWeek > 0 ? r.avgWeek.toFixed(1) : '—'}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${r.grade != null && r.grade >= 5.5 ? 'text-emerald-700' : r.grade != null ? 'text-red-600' : 'text-slate-400'}`}>
                    {r.grade != null ? r.grade.toFixed(1) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.efficiency != null ? r.efficiency.toFixed(1) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.wellbeing != null ? r.wellbeing.toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="h-16" />
    </div>
  )
}
