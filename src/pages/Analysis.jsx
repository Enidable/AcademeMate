import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { computeXp, courseWeightFor, XP_CONSTANTS } from '../data/xp'
import { formatDateShort, getCourseStyle } from '../utils/helpers'
import { isoWeekOf, weekdayIndex, mondayOfWeek } from '../data/normalize'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Exam family for exam-day marking (issue #48): scheduled or deadline-shaped
// rows of these types flag their date red in the weekly grid.
const EXAM_FAMILY = new Set(['exam', 'exam review', 'resit'])

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
  ReferenceArea, BarChart, Bar, Cell,
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

// Buckets (sorted) -> rolling-average series. The window ADAPTS to the amount
// of data: short ranges stay responsive, multi-year ranges still show a smooth
// long-term line — while always plotting the FULL selected range.
function rolling(buckets, pick) {
  const window = Math.max(2, Math.min(12, Math.round(buckets.length / 8)))
  return buckets.map((b, i) => {
    const slice = buckets.slice(Math.max(0, i - window + 1), i + 1)
    const vals = slice.map(pick).filter(v => v != null && isFinite(v))
    return { key: b.key, label: b.label, value: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null }
  })
}

const GRANULARITIES = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

const METRICS = {
  wellbeing: { name: 'Wellbeing', color: '#10b981', domain: [0, 10] },
  efficiency: { name: 'Efficiency', color: '#f59e0b', domain: [0, 10] },
  hours: { name: 'Study hours', color: '#6366f1' },
  xp: { name: 'XP earned', color: '#8b5cf6' },
}

// Short quartile label with year ("2026 · Q1" -> "26 Q1") — every year has
// four quartiles, so the year is part of the label.
function shortQuartile(key) {
  const [y, p] = String(key || '').split(' · ')
  return `${(y || '').slice(2)} ${p || ''}`.trim()
}

function tickLabel(key) {
  if (/^\d{4}-\d{2}$/.test(key)) return key
  return formatDateShort(key)
}

// Two rolling series in one plot (issue #48: wellbeing+efficiency share their
// 0-10 axis; XP+hours use a dual axis). Quartile bands shade the background
// from the Academic Year ranges so trends read per-period.
function DualTrendCard({ title, left, right, bands, note }) {
  const rows = left.data.map((d, i) => ({
    key: d.key,
    label: d.label,
    l: d.value,
    r: right.data[i]?.value ?? null,
  })).filter(d => d.l != null || d.r != null)
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
      {note && <p className="text-[10px] text-slate-400 mb-2">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No data in range.</p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="key" tick={{ fontSize: 9 }} minTickGap={28} tickFormatter={tickLabel} />
              <YAxis yAxisId="left" tick={{ fontSize: 9 }} domain={left.domain || ['auto', 'auto']} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} domain={right.domain || ['auto', 'auto']} />
              <Tooltip formatter={v => Number(v).toFixed(2)} labelFormatter={k => tickLabel(k)} labelStyle={{ fontSize: 11 }} />
              {(bands || []).map(b => (
                <ReferenceArea key={b.label} yAxisId="left" x1={b.x1} x2={b.x2} fill="#f1f5f9" fillOpacity={0.7}
                  label={{ value: shortQuartile(b.label), fontSize: 9, fill: '#94a3b8', position: 'insideTopLeft' }} />
              ))}
              <Line yAxisId="left" type="monotone" dataKey="l" name={left.name} stroke={left.color} strokeWidth={2} dot={false} connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="r" name={right.name} stroke={right.color} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default function Analysis() {
  const {
    inputLog, additionalLog, dailyPlan, masterCourses, gradeComponents, academicYears, content,
  } = useAppData()

  const [gran, setGran] = useState('week')
  const [tab, setTab] = useState('overview')
  const [courseFilter, setCourseFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  // Project comparison selection (issue #48): excluded project keys. Everything
  // else is selected, so newly logged projects join the comparison by default.
  const [excludedProjects, setExcludedProjects] = useState([])

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

  // --- Day flags + quartile ranges (issue #48) ---------------------------
  // Uni day = any in-filter session with location "University" (user-defined).
  // Exam day = any exam-family content row (scheduled date or deadline).
  const dayFlags = useMemo(() => {
    const uni = new Set()
    for (const e of entries) {
      if (!(e.durationHours > 0)) continue
      if (String(e.location || '').trim().toLowerCase() === 'university') uni.add(e.date)
    }
    const exam = new Set()
    for (const c of content || []) {
      if (!EXAM_FAMILY.has(String(c.type || '').trim().toLowerCase())) continue
      if (c.date) exam.add(c.date)
      if (c.deadline) exam.add(c.deadline)
    }
    return { uni, exam }
  }, [entries, content])

  // Academic Year quartile ranges, sorted: { key: "2026 · Q1", start, finish }.
  const quartileRanges = useMemo(() => {
    const out = []
    for (const ay of academicYears || []) {
      for (const [period, q] of Object.entries(ay.quarters || {})) {
        if (q?.start && q?.finish) out.push({ key: `${ay.year} · ${period}`, start: q.start, finish: q.finish })
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start))
  }, [academicYears])

  // --- Weekly breakdown (Work Week x weekday) ------------------------------
  // Hours per ISO week, split by weekday. Aims for the "Work Week | Mon–Sun"
  // grid the user keeps in their Master Tracker: one table per year, columns
  // = work weeks, rows = Year total + each weekday.
  // Averages come in two flavours (issue #48): over all weeks in the span
  // (calendar average) and over active weeks/days only (anything over 0h —
  // the original methodology).
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
      const quartileOf = iso => quartileRanges.find(r => iso >= r.start && iso <= r.finish)?.key || null
      const cols = Array.from({ length: maxWeek }, (_, i) => {
        const w = weeks.find(x => x.week === i + 1)
        const monday = mondayOfWeek(year, i + 1)
        return {
          ...(w || { week: i + 1, total: 0, day: Array.from({ length: 7 }, () => 0) }),
          monday,
          quartile: quartileOf(monday),
        }
      })
      const dayTotals = cols.reduce((acc, c) => {
        for (let d = 0; d < 7; d++) acc[d] += c.day[d]
        return acc
      }, Array.from({ length: 7 }, () => 0))
      const grandTotal = cols.reduce((s, c) => s + c.total, 0)
      const activeWeeks = cols.filter(c => c.total > 0)
      const activeDayAvg = Array.from({ length: 7 }, (_, d) => {
        const hits = cols.filter(c => c.day[d] > 0)
        return hits.length ? hits.reduce((s, c) => s + c.day[d], 0) / hits.length : 0
      })
      return {
        year,
        cols,
        dayAvg: dayTotals.map(h => (maxWeek ? h / maxWeek : 0)),
        activeDayAvg,
        yearAvg: grandTotal / (maxWeek || 1),
        yearAvgActive: activeWeeks.length ? grandTotal / activeWeeks.length : 0,
        maxTotal: cols.reduce((m, c) => Math.max(m, c.total), 0),
        maxDay: cols.reduce((m, c) => c.day.reduce((mm, v) => Math.max(mm, v), m), 0),
      }
    })
  }, [entries, quartileRanges])

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

  // --- Quartile bands for the trend plots ---------------------------------
  // Each Academic Year range clipped to the plotted bucket keys, so the trends
  // read per-period without extra charts.
  const trendBands = useMemo(() => {
    const keys = trends.wellbeing.map(d => d.key)
    if (!keys.length || !quartileRanges.length) return []
    return quartileRanges.map(r => {
      const x1 = keys.find(k => k >= r.start)
      const x2 = [...keys].reverse().find(k => k <= r.finish)
      if (!x1 || !x2 || x1 > x2) return null
      return { x1, x2, label: r.key }
    }).filter(Boolean)
  }, [trends, quartileRanges])

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
  // average hours per weekday. When the Academic Year structure is defined
  // (Courses tab), its Q1-Q4 date ranges supply the period's start/end dates;
  // otherwise they fall back to the courses'/sessions' spans.
  const quartileStats = useMemo(() => {
    const meta = new Map((masterCourses || []).map(c => [c.course, c]))
    // Defined quartile ranges: "2026 · Q1" -> {start, finish}
    const definedRanges = new Map()
    for (const ay of academicYears || []) {
      for (const [period, q] of Object.entries(ay.quarters || {})) {
        if (q?.start || q?.finish) definedRanges.set(`${ay.year} · ${period}`, { start: q.start, finish: q.finish })
      }
    }
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
      // Period dates: the Academic Year definition wins; otherwise earliest
      // course start -> latest course finish; otherwise the session span.
      const defined = definedRanges.get(g.key)
      const courseDates = [...g.courses].map(n => meta.get(n)).filter(Boolean)
      const starts = courseDates.map(c => c.start).filter(Boolean)
      const finishes = courseDates.map(c => c.finish).filter(Boolean)
      const startDate = defined?.start || (starts.length ? starts.reduce((a, b) => a < b ? a : b) : g.min)
      const endDate = defined?.finish || (finishes.length ? finishes.reduce((a, b) => a > b ? a : b) : g.max)
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
  }, [inputLog, masterCourses, academicYears])

  // --- Projects (issue #48) --------------------------------------------------
  // Time investment per project, across courses: total hours, session count
  // and first→last span from the session project field. The table is the
  // selector — unticked projects drop out of the comparison below, so a
  // current project can be held against any hand-picked set of past ones.
  const projects = useMemo(() => {
    const map = new Map()
    for (const e of entries) {
      const name = String(e.project || '').trim()
      if (!name || !(e.durationHours > 0)) continue
      const k = name.toLowerCase()
      if (!map.has(k)) map.set(k, { key: k, name, courses: new Set(), hours: 0, sessions: 0, first: e.date, last: e.date })
      const p = map.get(k)
      if (e.course) p.courses.add(e.course)
      p.hours += e.durationHours || 0
      p.sessions += 1
      if (e.date < p.first) p.first = e.date
      if (e.date > p.last) p.last = e.date
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours)
  }, [entries])

  const selectedProjects = useMemo(
    () => projects.filter(p => !excludedProjects.includes(p.key)),
    [projects, excludedProjects],
  )

  const projectSummary = useMemo(() => {
    if (!selectedProjects.length) return null
    const hs = selectedProjects.map(p => p.hours)
    return {
      n: selectedProjects.length,
      total: hs.reduce((s, v) => s + v, 0),
      avg: hs.reduce((s, v) => s + v, 0) / hs.length,
      min: Math.min(...hs),
      max: Math.max(...hs),
    }
  }, [selectedProjects])

  // --- Per-course outcomes --------------------------------------------------
  const courseOutcomes = useMemo(() => {    const gradeOf = name => gradeComponents?.find(g => g.course === name)?.totalGrade ?? null
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

      {/* Sub-tabs: overview vs projects (issue #48) */}
      <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
        {[{ value: 'overview', label: 'Overview' }, { value: 'projects', label: 'Projects' }].map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`text-xs px-4 py-1.5 cursor-pointer ${tab === t.value ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'projects' ? (
      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Project timelines — time investment per project</h2>
        <p className="text-[10px] text-slate-400 mb-3">
          Across courses, from the session project field. Untick projects to drop them from the comparison —
          hold a current project against any hand-picked set of past ones to estimate it.
        </p>
        {projects.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No logged project sessions in this range — tag sessions with a project in the Time Log.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Selected</p>
                <p className="text-2xl font-bold text-slate-800 tabular-nums">{projectSummary.n}
                  <span className="text-xs text-slate-400 font-medium ml-2">projects</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Total</p>
                <p className="text-2xl font-bold text-slate-800 tabular-nums">{projectSummary.total.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Average per project</p>
                <p className="text-2xl font-bold text-indigo-600 tabular-nums">{projectSummary.avg.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Range</p>
                <p className="text-2xl font-bold text-slate-800 tabular-nums">{projectSummary.min.toFixed(1)}–{projectSummary.max.toFixed(1)}h</p>
              </div>
              <div className="ml-auto flex gap-2">
                <button onClick={() => setExcludedProjects([])}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-slate-600">Select all</button>
                <button onClick={() => setExcludedProjects(projects.map(p => p.key))}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-slate-600">Select none</button>
              </div>
            </div>
            {selectedProjects.length > 0 && (
              <div className="h-56 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={selectedProjects} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={140} />
                    <Tooltip formatter={v => [`${Number(v).toFixed(1)}h`, 'Total']} labelStyle={{ fontSize: 11 }} />
                    <Bar dataKey="hours" name="Total hours" radius={[0, 4, 4, 0]}>
                      {selectedProjects.map(p => (
                        <Cell key={p.key} fill={getCourseStyle([...p.courses][0] || '').dotCss?.backgroundColor || '#6366f1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <table className="w-full text-xs border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-2 py-1.5 w-8" />
                  <th className="text-left px-2 py-1.5 font-medium">Project</th>
                  <th className="text-left px-2 py-1.5 font-medium">Courses</th>
                  <th className="text-right px-2 py-1.5 font-medium">Sessions</th>
                  <th className="text-right px-2 py-1.5 font-medium">Total h</th>
                  <th className="text-right px-2 py-1.5 font-medium">First</th>
                  <th className="text-right px-2 py-1.5 font-medium">Last</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const on = !excludedProjects.includes(p.key)
                  return (
                    <tr key={p.key} className={`border-b border-slate-50 hover:bg-slate-50/60 ${on ? '' : 'opacity-40'}`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={on} onChange={() => setExcludedProjects(
                          on ? [...excludedProjects, p.key] : excludedProjects.filter(k => k !== p.key),
                        )} className="cursor-pointer" title={on ? 'Exclude from comparison' : 'Include in comparison'} />
                      </td>
                      <td className="px-2 py-1.5 text-slate-700 font-medium">{p.name}</td>
                      <td className="px-2 py-1.5 text-slate-500">{[...p.courses].join(', ')}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{p.sessions}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800">{p.hours.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{formatDateShort(p.first)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{formatDateShort(p.last)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
      ) : (
      <>

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
          {' '}<span className="inline-block w-2 h-2 rounded-[2px] align-middle" style={{ boxShadow: 'inset 0 0 0 1px #a855f7' }} />{' '}
          = day at uni (University-location session),
          {' '}<span className="inline-block w-2 h-2 rounded-[2px] align-middle" style={{ boxShadow: 'inset 0 0 0 1px #ef4444' }} />{' '}
          = exam day, thick left rule = quartile boundary (Academic Year ranges).
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
                    {' '}· active <span className="font-semibold text-slate-600 tabular-nums">{y.yearAvgActive.toFixed(1)}</span> h/week
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  <div className="min-w-[360px] max-w-full overflow-x-auto">
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="text-left px-2 py-1.5 font-medium">Work Week</th>
                          {y.cols.map((c, ci) => (
                            <th key={c.week} className="text-center px-1 py-1.5 font-medium tabular-nums"
                              style={ci > 0 && c.quartile && c.quartile !== y.cols[ci - 1].quartile ? { boxShadow: 'inset 2px 0 0 0 #64748b' } : null}
                              title={c.quartile || ''}>{c.week}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td className="px-2 py-1.5 font-semibold text-slate-700">{y.year} [h]</td>
                          {y.cols.map((c, ci) => (
                            <td key={c.week} style={{
                              ...heatStyle(c.total, y.maxTotal),
                              ...(ci > 0 && c.quartile && c.quartile !== y.cols[ci - 1].quartile ? { boxShadow: 'inset 2px 0 0 0 #64748b' } : null),
                            }} className="px-1 py-1.5 text-center tabular-nums font-semibold text-slate-800">{c.total > 0 ? c.total.toFixed(1) : ''}</td>
                          ))}
                        </tr>
                        {DOW.map((d, di) => (
                          <tr key={d} className="border-b border-slate-50">
                            <td className="px-2 py-1 text-slate-500">{d}</td>
                            {y.cols.map((c, ci) => {
                              const dateStr = addDaysISO(c.monday, di)
                              const isExam = dayFlags.exam.has(dateStr)
                              const isUni = !isExam && dayFlags.uni.has(dateStr)
                              const shadows = []
                              if (ci > 0 && c.quartile && c.quartile !== y.cols[ci - 1].quartile) shadows.push('inset 2px 0 0 0 #64748b')
                              if (isExam) shadows.push('inset 0 0 0 1px #ef4444')
                              else if (isUni) shadows.push('inset 0 0 0 1px #a855f7')
                              return (
                                <td key={c.week} style={{ ...heatStyle(c.day[di], y.maxDay), ...(shadows.length ? { boxShadow: shadows.join(', ') } : null) }}
                                  title={[dateStr, c.quartile, isExam ? 'exam day' : isUni ? 'at uni' : ''].filter(Boolean).join(' · ')}
                                  className={`px-1 py-1 text-center tabular-nums ${c.day[di] > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
                                  {c.day[di] > 0 ? c.day[di].toFixed(1) : ''}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Average per weekday (h/week)</div>
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400">
                          <th className="pr-4 py-1 text-left font-medium">Day</th>
                          <th className="px-2 py-1 text-right font-medium" title="All weeks in span">All</th>
                          <th className="px-2 py-1 text-right font-medium" title="Active days/weeks only (>0h)">Active</th>
                          {quartileStats.map(q => (
                            <th key={q.key} className="px-2 py-1 text-right font-medium" title={`${q.key}: ${q.total.toFixed(0)}h over ${q.weeks} weeks`}>{shortQuartile(q.key)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DOW.map((d, i) => (
                          <tr key={d} className="border-b border-slate-50">
                            <td className="pr-4 py-1 text-slate-500">{d}</td>
                            <td className="px-2 text-right tabular-nums font-medium text-slate-700" style={heatStyleDay(y.dayAvg[i], Math.max(...y.dayAvg))}>
                              {y.dayAvg[i].toFixed(2)}
                            </td>
                            <td className="px-2 text-right tabular-nums font-medium text-slate-700" style={heatStyleDay(y.activeDayAvg[i], Math.max(...y.activeDayAvg, 0.001))}>
                              {y.activeDayAvg[i].toFixed(2)}
                            </td>
                            {quartileStats.map(q => (
                              <td key={q.key} className="px-2 text-right tabular-nums text-slate-600">
                                {q.dayAvg[i] > 0 ? q.dayAvg[i].toFixed(2) : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {quartileStats.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-1">Quartile columns cover all logged data (course scope), not just the filters above.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trends */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Trends ({GRANULARITIES.find(g => g.value === gran)?.label})</h2>
        <p className="text-[10px] text-slate-400 mb-2">
          Full selected range is plotted; each line is a rolling average whose window adapts to the amount of data.
          Shaded bands mark quartiles (Academic Year ranges). Leave the date fields empty to see your entire history.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DualTrendCard title="Wellbeing & efficiency"
            left={{ ...METRICS.wellbeing, data: trends.wellbeing }}
            right={{ ...METRICS.efficiency, data: trends.efficiency }}
            bands={trendBands} note="Shared 0–10 scale." />
          <DualTrendCard title="Study hours & XP"
            left={{ ...METRICS.hours, data: trends.hours }}
            right={{ ...METRICS.xp, data: trends.xp }}
            bands={trendBands} note="Hours on the left axis, XP on the right." />
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

      </>
      )}

      <div className="h-16" />
    </div>
  )
}
