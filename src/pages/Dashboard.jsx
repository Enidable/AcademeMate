import { useMemo } from 'react'
import { formatDate, formatTime, getCourseStyle, truncate } from '../utils/helpers'
import { computeXp, weeklyXpSeries, ESTIMATED_HOURS_PER_EC } from '../data/xp'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

function getLatestWeekTotal(weeklyHours) {
  if (!weeklyHours || weeklyHours.length === 0) return null
  return weeklyHours[weeklyHours.length - 1]?.total ?? null
}

// Split courses into curriculum vs extra ("extra" is excluded from the degree
// average and total ECTS).
function splitByScope(courses) {
  const curriculum = []
  const extra = []
  for (const c of courses) {
    if (String(c.scope || '').toLowerCase() === 'extra') extra.push(c)
    else curriculum.push(c)
  }
  return { curriculum, extra }
}

function gradeStats(list, gradeMap) {
  const gradeOf = c => (c.grade != null ? c.grade : gradeMap?.[c.course]?.totalGrade ?? null)
  const completed = list.filter(c => gradeOf(c) != null)
  const inProgress = list.filter(c => gradeOf(c) == null && c.start != null)
  // Average grade weighted by each course's ECs: sum(grade × EC) / sum(EC).
  // Only courses that currently have a grade are considered — it grows as you
  // enter grades, never a fixed count.
  const totalEc = completed.reduce((s, c) => s + (c.ec || 0), 0)
  const avg = totalEc > 0
    ? completed.reduce((s, c) => s + (gradeOf(c) || 0) * (c.ec || 0), 0) / totalEc
    : null
  return {
    completed: completed.length,
    inProgress: inProgress.length,
    planned: Math.max(0, list.length - completed.length - inProgress.length),
    ecEarned: completed.reduce((sum, c) => sum + (c.ec || 0), 0),
    ecPlanned: list.reduce((sum, c) => sum + (c.ec || 0), 0),
    avgGrade: avg,
  }
}

export default function Dashboard({ inputLog, courses, deadlines, weeklyHours, gradeComponents }) {
  const stats = useMemo(() => {
    const { curriculum, extra } = splitByScope(courses)
    const gradeMap = {}
    for (const g of gradeComponents || []) gradeMap[g.course] = g
    const cur = gradeStats(curriculum, gradeMap)
    const ext = gradeStats(extra, gradeMap)
    const weekTotal = getLatestWeekTotal(weeklyHours)

    const recent = [...inputLog].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)).slice(0, 5)

    const upcoming = (deadlines || [])
      .filter(d => !d.done)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5)

    const totalHours = inputLog.reduce((s, e) => s + e.durationHours, 0)
    const avgEff = inputLog.filter(e => e.efficiency != null)
    const avgWell = inputLog.filter(e => e.wellbeing != null)
    const avgEfficiency = avgEff.length ? (avgEff.reduce((s, e) => s + e.efficiency, 0) / avgEff.length) : null
    const avgWellbeing = avgWell.length ? (avgWell.reduce((s, e) => s + e.wellbeing, 0) / avgWell.length) : null

    // XP: estimated workload per course, progress = logged/estimated.
    const loggedByCourse = {}
    for (const e of inputLog) loggedByCourse[e.course] = (loggedByCourse[e.course] || 0) + (e.durationHours || 0)
    const progressByCourse = {}
    for (const c of courses) {
      const est = (c.ec || 0) * ESTIMATED_HOURS_PER_EC
      progressByCourse[c.course] = est > 0 ? (loggedByCourse[c.course] || 0) / est : 0
    }
    const totalXp = inputLog.reduce((s, e) => s + computeXp(e, progressByCourse), 0)
    const xpSeries = weeklyXpSeries(inputLog, progressByCourse)

    return {
      curriculum: cur,
      extra: ext,
      both: gradeStats(courses, gradeMap),
      weekTotal, recent, upcoming, totalHours, avgEfficiency, avgWellbeing, totalEntries: inputLog.length,
      totalXp, xpSeries,
    }
  }, [inputLog, courses, deadlines, weeklyHours, gradeComponents])

  const urgencyColors = {
    'Complete': 'bg-green-100 text-green-700',
    'Extremely High': 'bg-red-100 text-red-700',
    'High': 'bg-orange-100 text-orange-700',
    'Medium': 'bg-amber-100 text-amber-700',
    'Low': 'bg-slate-100 text-slate-500',
  }

  const courseColorByCourse = useMemo(() => {
    const m = {}
    for (const c of courses) m[c.course] = c.color
    return m
  }, [courses])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Latest Week</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{stats.weekTotal != null ? stats.weekTotal.toFixed(1) : '—'}</p>
          <p className="text-xs text-slate-400 mt-1">Hours in most recent tracked week</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Courses</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            <span className="text-amber-600">{stats.curriculum.inProgress}</span>
            <span className="text-slate-300 text-xl mx-1">active ·</span>
            <span className="text-green-600">{stats.curriculum.completed}</span>
            <span className="text-slate-300 text-xl mx-1">completed ·</span>
            <span className="text-slate-400">{stats.curriculum.planned} planned</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {stats.curriculum.inProgress} active · {stats.curriculum.completed} completed · {stats.curriculum.planned} planned
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">EC</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            {stats.curriculum.ecEarned.toFixed(0)}
            <span className="text-slate-300 text-xl mx-1">/</span>
            {stats.curriculum.ecPlanned.toFixed(0)}
            <span className="text-sm text-slate-400 font-medium ml-2">curriculum</span>
          </p>
          {stats.extra.ecPlanned > 0 ? (
            <p className="text-xs text-slate-400 mt-1">
              +{stats.extra.ecEarned.toFixed(0)}/{stats.extra.ecPlanned.toFixed(0)} <span className="font-medium text-violet-600">extra EC</span>
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-1">Curriculum credits earned / planned</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Avg Grade</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            {stats.curriculum.avgGrade != null ? stats.curriculum.avgGrade.toFixed(2) : '—'}
            <span className="text-sm text-slate-400 font-medium ml-2">curriculum</span>
          </p>
          {stats.extra.avgGrade != null ? (
            <p className="text-xs text-slate-400 mt-1">
              {stats.extra.avgGrade.toFixed(2)} <span className="font-medium text-violet-600">extra avg</span>
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-1">EC-weighted average of graded courses</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-1">XP curve</h2>
          <p className="text-xs text-slate-400 mb-2">Cumulative XP across weeks · {stats.totalXp.toFixed(0)} total</p>
          {stats.xpSeries.length === 0 ? (
            <p className="text-sm text-slate-400 py-8">Log study sessions to build your XP curve.</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.xpSeries} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="key" tick={{ fontSize: 10 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => Number(v).toFixed(0)} labelStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="cumulative" name="XP" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-3">Recent Activity</h2>
            <div className="space-y-3">
              {stats.recent.map((entry, i) => {
                const style = getCourseStyle(entry.course, courseColorByCourse[entry.course])
                return (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${style.dot}`} style={style.dotCss} />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700 truncate">{truncate(entry.course, 40)}</p>
                      <p className="text-xs text-slate-400">
                        {formatDate(entry.date)} · {formatTime(entry.startTime)}–{formatTime(entry.endTime)} · {entry.durationHours}h
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-3">Upcoming Deadlines</h2>
            {stats.upcoming.length === 0 ? (
              <p className="text-sm text-slate-400">No upcoming deadlines.</p>
            ) : (
              <div className="space-y-3">
                {stats.upcoming.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-700 truncate">{d.description}</p>
                      <p className="text-xs text-slate-400">{formatDate(d.date)} · {d.time}h</p>
                    </div>
                    <span className={`ml-3 text-xs px-2 py-0.5 rounded-full shrink-0 ${urgencyColors[d.urgency] || 'bg-slate-100 text-slate-600'}`}>
                      {d.urgency}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Total Entries</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalEntries}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Total Hours</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalHours.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Efficiency / Wellbeing</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">
            {stats.avgEfficiency != null ? stats.avgEfficiency.toFixed(1) : '—'}
            <span className="text-slate-300 text-lg mx-1">/</span>
            {stats.avgWellbeing != null ? stats.avgWellbeing.toFixed(1) : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-1">Average across all entries</p>
        </div>
      </div>
    </div>
  )
}