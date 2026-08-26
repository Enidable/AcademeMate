import { useMemo } from 'react'
import { formatDate, formatTime, getCourseStyle, truncate, sessionCategoryForType, durationBetween, nowTime } from '../utils/helpers'
import { computeXp, weeklyXpSeries, courseWeightFor, XP_CONSTANTS } from '../data/xp'
import { useAppData } from '../context/AppDataContext'
import { inferEventType } from '../drive/driveClient'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

function pad(n) {
  return String(n).padStart(2, '0')
}

// Live mirror of today's column on the Daily Planner: planned tasks per course,
// scheduled classes and additional-time entries. Items can be ticked off right
// here — ticking a to-do opens the pre-filled session logger, exactly like the
// planner does.
function TodayOverview({ onLogTask }) {
  const {
    dailyPlan, additionalLog, calendarEvents, updatePlannerTask, updateAdditionalEntry,
    liveSession, stopLiveSession,
  } = useAppData()

  const now = new Date()
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const toMin = t => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim())
    return m ? +m[1] * 60 + +m[2] : null
  }
  const durHours = e => {
    const s = toMin(e.startTime)
    const en = toMin(e.endTime)
    return s == null || en == null || en <= s ? 0 : Math.round(((en - s) / 60) * 100) / 100
  }

  const tasks = useMemo(() => (dailyPlan || []).filter(r => r.date === today), [dailyPlan, today])
  const extra = useMemo(() => (additionalLog || []).filter(r => r.date === today), [additionalLog, today])
  const classes = useMemo(() => (calendarEvents || [])
    .filter(e => e.date === today)
    .sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99')), [calendarEvents, today])

  const byCourse = useMemo(() => {
    const m = new Map()
    for (const r of tasks) {
      const c = r.course || 'Other University Stuff'
      if (!m.has(c)) m.set(c, [])
      m.get(c).push(r)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [tasks])

  // If a live session is running, ticking anything off closes it and links the
  // recorded times to the item being logged.
  const consumeLiveTimes = () => {
    if (!liveSession) return null
    const s = stopLiveSession()
    const end = nowTime()
    return { date: s.startDate, startTime: s.startTime, endTime: end, durationHours: durationBetween(s.startTime, end) ?? '' }
  }

  const toggleTask = r => {
    if (r.done) {
      updatePlannerTask(r.id, { done: null })
    } else {
      updatePlannerTask(r.id, { done: 'done' })
      if (onLogTask) onLogTask({ course: r.course, task: r.task, notes: r.notes, date: today, ...consumeLiveTimes() })
    }
  }

  // Ticking off a scheduled class opens the session logger pre-filled with
  // the class's known data (same behaviour as the Daily Planner).
  const logClass = e => {
    if (!onLogTask) return
    const live = consumeLiveTimes()
    onLogTask({
      course: e.course || '',
      task: e.summary,
      ...(live || {
        date: e.date,
        startTime: e.startTime || '',
        endTime: e.endTime || '',
        durationHours: e.allDay ? '' : durHours(e),
      }),
      category: sessionCategoryForType(inferEventType(e.summary, e.description)),
      location: 'University',
      lectureId: e.lectureId || '',
    })
  }

  const toggleExtra = r => updateAdditionalEntry(r.id, { done: r.done ? null : 'done' })

  const TaskLine = ({ checked, label, sub, hours, muted, onToggle }) => (
    <div className="flex items-center gap-2 py-0.5">
      {onToggle ? (
        <input type="checkbox" checked={!!checked} onChange={onToggle}
          className="h-3 w-3 accent-indigo-600 cursor-pointer shrink-0" />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <span className={`text-xs flex-1 min-w-0 truncate ${checked ? 'line-through text-slate-400' : muted ? 'text-slate-500' : 'text-slate-700'}`} title={label}>{label}</span>
      {sub && <span className="text-[10px] text-slate-400 shrink-0">{sub}</span>}
      {hours > 0 && <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{hours.toFixed(2)}h</span>}
    </div>
  )

  const empty = tasks.length === 0 && extra.length === 0 && classes.length === 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800">Today</h2>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">Mirror of today's Daily Planner</span>
      </div>
      {empty ? (
        <p className="text-sm text-slate-400 py-4 text-center">Nothing planned for today yet.</p>
      ) : (
        <div className="space-y-3 max-h-[22rem] overflow-y-auto pr-1">
          {classes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Scheduled</p>
              {classes.map(e => {
                const loggable = !!e.course && !e.isDeadline
                return (
                  <div key={e.id || `${e.summary}|${e.startTime}`} className="flex items-center gap-2 py-0.5">
                    {loggable ? (
                      <input type="checkbox" checked={false} onChange={() => logClass(e)}
                        title="Log this class as a study session (pre-filled with its course, times, location and lecture ID)"
                        className="h-3 w-3 accent-indigo-600 cursor-pointer shrink-0" />
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    <span className={`text-xs flex-1 min-w-0 truncate ${e.isDeadline ? 'text-slate-700' : 'text-slate-600'}`}>
                      {e.isDeadline ? `Due: ${e.summary}` : e.summary}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">{e.allDay ? '' : `${e.startTime || ''}${e.endTime ? `–${e.endTime}` : ''}`}</span>
                    {!e.allDay && durHours(e) > 0 && <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{durHours(e).toFixed(2)}h</span>}
                  </div>
                )
              })}
            </div>
          )}
          {byCourse.map(([course, list]) => {
            const style = getCourseStyle(course)
            return (
              <div key={course}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} style={style.dotCss} />
                  <p className="text-[11px] font-medium text-slate-600 truncate">{course}</p>
                </div>
                {list.map(r => (
                  <TaskLine key={r.id} checked={r.done} label={r.task || '—'}
                    hours={r.plannedHours || r.actualHours || 0}
                    onToggle={() => toggleTask(r)} />
                ))}
              </div>
            )
          })}
          {extra.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Additional time</p>
              {extra.map(r => (
                <TaskLine key={r.id} checked={r.done} label={`${r.category !== r.task ? `${r.category}: ` : ''}${r.task || r.category}`}
                  hours={r.hours || 0}
                  onToggle={() => toggleExtra(r)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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

export default function Dashboard({ inputLog, courses, deadlines, weeklyHours, gradeComponents, onLogTask }) {
  const stats = useMemo(() => {
    const { curriculum, extra } = splitByScope(courses)
    const gradeMap = {}
    for (const g of gradeComponents || []) gradeMap[g.course] = g
    const cur = gradeStats(curriculum, gradeMap)
    const ext = gradeStats(extra, gradeMap)
    const weekTotal = getLatestWeekTotal(weeklyHours)

    const recent = [...inputLog].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)).slice(0, 5)

    const today = new Date().toISOString().slice(0, 10)
    const upcoming = (deadlines || [])
      .filter(d => !d.done)
      .map(d => ({ ...d, when: d.deadline || d.date || '' }))
      .filter(d => d.when >= today)
      .sort((a, b) => a.when.localeCompare(b.when))
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
      const est = (c.ec || 0) * XP_CONSTANTS.ESTIMATED_HOURS_PER_EC
      progressByCourse[c.course] = est > 0 ? (loggedByCourse[c.course] || 0) / est : 0
    }
    const courseWeights = {}
    for (const c of courses) courseWeights[c.course] = courseWeightFor(c.ec)
    const totalXp = inputLog.reduce((s, e) => s + computeXp(e, progressByCourse, courseWeights), 0)
    const xpSeries = weeklyXpSeries(inputLog, progressByCourse, courseWeights)

    return {
      curriculum: cur,
      extra: ext,
      both: gradeStats(courses, gradeMap),
      weekTotal, recent, upcoming, totalHours, avgEfficiency, avgWellbeing, totalEntries: inputLog.length,
      totalXp, xpSeries, courseWeights,
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
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-amber-600 font-semibold">{stats.curriculum.inProgress} active</span>
            <span className="text-slate-300">·</span>
            <span className="text-green-600 font-semibold">{stats.curriculum.completed} completed</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400 font-semibold">{stats.curriculum.planned} planned</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Curriculum courses</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">EC</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            {stats.both.ecEarned.toFixed(0)}
            <span className="text-slate-300 text-xl mx-1">/</span>
            {stats.both.ecPlanned.toFixed(0)}
            <span className="text-sm text-slate-400 font-medium ml-2">total</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Earned / planned — every course counted, including planned ones
            {(stats.extra.ecPlanned > 0 || stats.curriculum.ecPlanned !== stats.both.ecPlanned) && (
              <> · curriculum {stats.curriculum.ecEarned.toFixed(0)}/{stats.curriculum.ecPlanned.toFixed(0)}
                {stats.extra.ecPlanned > 0 && <> · <span className="font-medium text-violet-600">extra +{stats.extra.ecEarned.toFixed(0)}/{stats.extra.ecPlanned.toFixed(0)}</span></>}
              </>
            )}
          </p>
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
          <TodayOverview onLogTask={onLogTask} />

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
                      <p className="text-xs text-slate-400">{formatDate(d.when)} · {d.time}h</p>
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

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-3">Recent Activity</h2>
        {stats.recent.length === 0 ? (
          <p className="text-sm text-slate-400">No sessions logged yet.</p>
        ) : (
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
        )}
      </div>
    </div>
  )
}