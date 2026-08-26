import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { computeXp, courseWeightFor, XP_CONSTANTS } from '../data/xp'
import { formatDateShort } from '../utils/helpers'
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

function median(list) {
  if (!list.length) return null
  const s = [...list].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function percentile(list, p) {
  if (!list.length) return null
  const s = [...list].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length))
  return s[idx]
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
    inputLog, additionalLog, dailyPlan, masterCourses,
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

  // --- Workload prediction (TOTAL load, not just studying) -----------------
  const prediction = useMemo(() => {
    // Weekly aggregates over ALL history: study hours, additional commitments
    // (work / exercise / commute / obligations) and study-session efficiency.
    const weeks = new Map()
    const weekOf = () => ({ study: 0, add: 0, effs: [] })
    for (const e of inputLog || []) {
      if (!e.date) continue
      const k = mondayOf(e.date)
      if (!weeks.has(k)) weeks.set(k, weekOf())
      const w = weeks.get(k)
      w.study += e.durationHours || 0
      if (e.efficiency != null) w.effs.push(e.efficiency)
    }
    for (const a of additionalLog || []) {
      if (!a.date) continue
      const k = mondayOf(a.date)
      if (!weeks.has(k)) weeks.set(k, weekOf())
      weeks.get(k).add += a.hours || 0
    }
    const weekList = [...weeks.entries()]
      .map(([k, w]) => ({
        key: k,
        study: w.study,
        add: w.add,
        total: w.study + w.add,
        eff: w.effs.length ? w.effs.reduce((s, v) => s + v, 0) / w.effs.length : null,
      }))
      .sort((a, b) => a.key.localeCompare(b.key))

    const effs = weekList.map(w => w.eff).filter(v => v != null)
    const baselineEff = median(effs)
    // Rule: your sustainable TOTAL load is the heaviest week (study + work +
    // workouts + everything) in which study efficiency stayed within ~10% of
    // your historical baseline. Fallback: 75th percentile of total load.
    let sustainableTotal = null
    if (baselineEff != null) {
      const ok = weekList.filter(w => w.eff == null || w.eff >= baselineEff * 0.9)
      if (ok.length > 0) sustainableTotal = Math.max(...ok.map(w => w.total))
    }
    if (!sustainableTotal) sustainableTotal = percentile(weekList.map(w => w.total), 75) || 0

    // Typical non-study commitments per week (median, so one holiday week
    // doesn't skew it).
    const typicalAdditional = median(weekList.map(w => w.add)) || 0

    // Current week's plan.
    const monday = mondayOf(todayISO())
    const weekDates = new Set(Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i)))
    let plannedStudy = 0
    for (const r of dailyPlan || []) if (weekDates.has(r.date)) plannedStudy += r.plannedHours || 0
    let plannedAdditional = 0
    for (const a of additionalLog || []) if (weekDates.has(a.date)) plannedAdditional += a.hours || 0

    const plannedTotal = plannedStudy + plannedAdditional
    return {
      sustainableTotal,
      typicalAdditional,
      recommendedStudy: Math.max(0, sustainableTotal - typicalAdditional),
      plannedStudy,
      plannedAdditional,
      plannedTotal,
      over: sustainableTotal > 0 && plannedTotal > sustainableTotal * 1.1,
      historyWeeks: weekList.length,
    }
  }, [inputLog, additionalLog, dailyPlan])

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

      {/* Workload prediction — TOTAL load */}
      <div className={`rounded-xl border p-4 ${prediction.over ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Sustainable total load / week</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">
              {prediction.sustainableTotal > 0 ? `${prediction.sustainableTotal.toFixed(1)}h` : '—'}
              <span className="text-xs text-slate-400 font-medium ml-2">study + work + workouts + everything</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Typical fixed commitments</p>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">
              {prediction.typicalAdditional.toFixed(1)}h
              <span className="text-xs text-slate-400 font-medium ml-2">work, exercise, commute…</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Suggested study cap</p>
            <p className="text-2xl font-bold text-indigo-600 tabular-nums">{prediction.recommendedStudy.toFixed(1)}h</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Planned this week</p>
            <p className={`text-2xl font-bold tabular-nums ${prediction.over ? 'text-red-600' : 'text-slate-800'}`}>
              {prediction.plannedTotal.toFixed(1)}h
              <span className="text-xs text-slate-400 font-medium ml-2">{prediction.plannedStudy.toFixed(1)}h study + {prediction.plannedAdditional.toFixed(1)}h other</span>
            </p>
          </div>
          <div className="ml-auto">
            {prediction.over ? (
              <span className="inline-block text-xs px-3 py-1.5 rounded-full bg-red-600 text-white font-semibold">
                ⚠ Planned total exceeds your sustainable load
              </span>
            ) : (
              <span className="inline-block text-xs px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                Within sustainable load
              </span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Heuristic: the heaviest TOTAL week (study + all additional commitments) in which your study efficiency stayed
          within ~10% of your historical baseline · based on {prediction.historyWeeks} tracked weeks · rule-based for now.
        </p>
      </div>

      {/* Trend charts */}
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

      <div className="h-16" />
    </div>
  )
}
