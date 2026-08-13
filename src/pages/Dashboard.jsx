import { useMemo } from 'react'
import { formatDate, formatTime, getCourseStyle, truncate } from '../utils/helpers'

function getLatestWeekTotal(weeklyHours) {
  if (!weeklyHours || weeklyHours.length === 0) return null
  return weeklyHours[weeklyHours.length - 1]?.total ?? null
}

export default function Dashboard({ inputLog, courses, deadlines, weeklyHours }) {
  const stats = useMemo(() => {
    const completed = courses.filter(c => c.grade != null)
    const inProgress = courses.filter(c => c.grade == null && c.start != null)
    const totalEcEarned = completed.reduce((sum, c) => sum + (c.ec || 0), 0)
    const totalEcPlanned = courses.reduce((sum, c) => sum + (c.ec || 0), 0)
    const avgGrade = completed.length
      ? completed.reduce((sum, c) => sum + c.grade, 0) / completed.length
      : null

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

    return { completed, inProgress, totalEcEarned, totalEcPlanned, avgGrade, weekTotal, recent, upcoming, totalHours, avgEfficiency, avgWellbeing, totalEntries: inputLog.length }
  }, [inputLog, courses, deadlines, weeklyHours])

  const urgencyColors = {
    'Complete': 'bg-green-100 text-green-700',
    'Extremely High': 'bg-red-100 text-red-700',
    'High': 'bg-orange-100 text-orange-700',
    'Medium': 'bg-amber-100 text-amber-700',
    'Low': 'bg-slate-100 text-slate-500',
  }

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
            <span className="text-green-600">{stats.completed.length}</span>
            <span className="text-slate-300 text-xl mx-1">/</span>
            <span className="text-amber-600">{stats.inProgress.length}</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">{stats.completed.length} completed · {stats.inProgress.length} in progress</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">ECTS</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            {stats.totalEcEarned.toFixed(0)}
            <span className="text-slate-300 text-xl mx-1">/</span>
            {stats.totalEcPlanned.toFixed(0)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Credits earned</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Avg Grade</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            {stats.avgGrade != null ? stats.avgGrade.toFixed(2) : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-1">Across {stats.completed.length} completed courses</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Recent Activity</h2>
          <div className="space-y-3">
            {stats.recent.map((entry, i) => {
              const style = getCourseStyle(entry.course)
              return (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${style.dot}`} />
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
