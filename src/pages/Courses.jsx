import { useState, useMemo, useEffect } from 'react'
import { getStatus, truncate, getCourseStyle, isCourseActive, COLOR_NAMES } from '../utils/helpers'
import { useAppData } from '../context/AppDataContext'
import { AddCourseModal } from '../components/forms/Modals'
import CourseDetail from '../components/CourseDetail'

const statusColors = {
  'Completed': 'bg-green-100 text-green-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Planned': 'bg-slate-100 text-slate-500',
}

const quartileColors = {
  'Q1': 'bg-blue-100 text-blue-700',
  'Q2': 'bg-purple-100 text-purple-700',
  'Q3': 'bg-indigo-100 text-indigo-700',
  'Q4': 'bg-rose-100 text-rose-700',
}

const colorDot = {
  indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', blue: 'bg-blue-500', purple: 'bg-purple-500',
  amber: 'bg-amber-500', rose: 'bg-rose-500', cyan: 'bg-cyan-500', teal: 'bg-teal-500',
  slate: 'bg-slate-500', orange: 'bg-orange-500', gray: 'bg-gray-500', pink: 'bg-pink-500',
}

const TYPE_LABELS = { exam: 'Exam', assignment: 'Assignment', presentation: 'Presentation', project: 'Project', quiz: 'Quiz', other: 'Other' }

export default function Courses({ courses }) {
  const { inputLog, gradeComponents, deleteCourse, updateCourse, reorderCourses } = useAppData()
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [sortBy, setSortBy] = useState('custom')
  const [scopeFilter, setScopeFilter] = useState('all')
  const [colorMenu, setColorMenu] = useState(null)
  const [dragLocal, setDragLocal] = useState(null)
  const [dragName, setDragName] = useState(null)

  // Close the colour popover when clicking anywhere outside it.
  useEffect(() => {
    function onDocClick(e) {
      if (colorMenu && !e.target.closest('[data-colormenu]')) setColorMenu(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [colorMenu])

  const allCourses = useMemo(() => {
    const logCourses = new Set(inputLog.map(e => e.course))
    const merged = [...courses]
    for (const c of logCourses) {
      if (!merged.find(m => m.course === c)) {
        merged.push({ course: c, year: null, quartile: null, abbrev: null, code: null, start: null, finish: null, ec: null, comment: null, scope: null, color: null, order: null })
      }
    }

    if (scopeFilter !== 'all') {
      const wanted = scopeFilter === 'extra'
      return merged.filter(c => ((c.scope || '').toLowerCase() === 'extra') === wanted)
    }

    const order = { 'Completed': 0, 'In Progress': 1, 'Planned': 2 }
    const qOrder = { 'Q1': 0, 'Q2': 1, 'Q3': 2, 'Q4': 3 }
    const today = new Date().toISOString().slice(0, 10)
    const idxMap = new Map(merged.map((c, i) => [c.course, i]))
    const copy = [...merged]
    copy.sort((a, b) => {
      // Active courses are always listed first — except in "Custom" order,
      // where the drag & drop sequence is shown exactly as arranged.
      if (sortBy !== 'custom') {
        const activeDiff = isCourseActive(b, today) - isCourseActive(a, today)
        if (activeDiff !== 0) return activeDiff
      }
      switch (sortBy) {
        case 'status': return order[getStatus(a)] - order[getStatus(b)] || a.course.localeCompare(b.course)
        // Quartiles repeat each year, so group by year first, then quarter.
        case 'quartile': return (a.year || '~').localeCompare(b.year || '~') || (qOrder[a.quartile] ?? 9) - (qOrder[b.quartile] ?? 9) || order[getStatus(a)] - order[getStatus(b)]
        case 'scope': return (a.scope || 'z').localeCompare(b.scope || 'z') || a.course.localeCompare(b.course)
        case 'ec': return (b.ec || 0) - (a.ec || 0)
        case 'name': return a.course.localeCompare(b.course)
        default: {
          const oa = a.order != null ? a.order : idxMap.get(a.course)
          const ob = b.order != null ? b.order : idxMap.get(b.course)
          return oa - ob
        }
      }
    })
    return copy
  }, [courses, inputLog, sortBy, scopeFilter])

  const displayed = useMemo(() => {
    if (dragLocal) {
      const byName = new Map(allCourses.map(c => [c.course, c]))
      return dragLocal.map(n => byName.get(n)).filter(Boolean)
    }
    return allCourses
  }, [allCourses, dragLocal])

  const loggedHoursMap = useMemo(() => {
    const map = {}
    for (const e of inputLog) {
      map[e.course] = (map[e.course] || 0) + (e.durationHours || 0)
    }
    return map
  }, [inputLog])

  const { avgHoursPerEC } = useMemo(() => {
    const coursesWithEC = allCourses.filter(c => c.ec != null && c.ec > 0)
    const totalECVal = coursesWithEC.reduce((s, c) => s + c.ec, 0)
    const totalHours = coursesWithEC.reduce((s, c) => s + (loggedHoursMap[c.course] || 0), 0)
    return {
      avgHoursPerEC: totalECVal > 0 ? totalHours / totalECVal : 28,
    }
  }, [allCourses, loggedHoursMap])

  const gradeMap = useMemo(() => {
    const map = {}
    for (const g of gradeComponents) map[g.course] = g
    return map
  }, [gradeComponents])

  function setCourse(id, patch) {
    updateCourse(id, patch)
  }

  function onDragStart(e, name) {
    if (sortBy !== 'custom') return
    setDragName(name)
    setDragLocal(allCourses.map(c => c.course))
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', name)
  }

  function onDragOver(e, target) {
    if (sortBy !== 'custom' || !dragName || !dragLocal) return
    e.preventDefault()
    if (target === dragName) return
    const from = dragLocal.indexOf(dragName)
    const to = dragLocal.indexOf(target)
    if (from < 0 || to < 0) return
    const next = [...dragLocal]
    next.splice(from, 1)
    next.splice(to, 0, dragName)
    setDragLocal(next)
  }

  function onDrop() {
    if (dragLocal && sortBy === 'custom') {
      const byName = new Map(courses.map(c => [c.course, c]))
      reorderCourses(dragLocal.map(n => byName.get(n)).filter(Boolean))
    }
    setDragLocal(null)
    setDragName(null)
  }

  const viewingCourse = viewing ? courses.find(c => c.course === viewing) || { course: viewing } : null

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          {[
            { label: 'All', value: 'all' },
            { label: 'Curriculum', value: 'curriculum' },
            { label: 'Extra', value: 'extra' },
          ].map(f => (
            <button key={f.value} onClick={() => setScopeFilter(f.value)}
              className={`text-xs px-3 py-1 rounded-full cursor-pointer ${
                scopeFilter === f.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span>Sort by</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-400 bg-white">
            <option value="custom">Custom (drag to reorder)</option>
            <option value="status">Status</option>
            <option value="quartile">Year + quartile</option>
            <option value="scope">Scope (curriculum/extra)</option>
            <option value="ec">ECTS</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {displayed.map((c) => {
          const status = getStatus(c)
          const style = getCourseStyle(c.course, c.color)
          const loggedHours = loggedHoursMap[c.course] || 0
          const estimatedHours = c.estHours != null && c.estHours > 0
            ? c.estHours
            : c.ec != null && c.ec > 0
              ? c.ec * avgHoursPerEC
              : loggedHours * 2
          const progress = estimatedHours > 0 ? Math.min((loggedHours / estimatedHours) * 100, 100) : null
          const gradeInfo = gradeMap[c.course]
          const scope = c.scope || ''
          const dragging = dragName === c.course

          return (
            <div key={c.course}
              draggable={sortBy === 'custom'}
              onDragStart={e => onDragStart(e, c.course)}
              onDragOver={e => onDragOver(e, c.course)}
              onDrop={onDrop}
              onDragEnd={onDrop}
              onDoubleClick={() => setViewing(c.course)}
              title="Double-click to open the course page"
              className={`rounded-xl border ${style.border || 'border-slate-200'} ${style.soft} p-5 flex flex-col cursor-default transition-opacity ${dragging ? 'opacity-40' : ''}`}
              style={{ ...style.softCss, ...style.borderCss }}>
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="relative" data-colormenu>
                      <button onClick={() => setColorMenu(colorMenu === c.course ? null : c.course)}
                        title="Change colour"
                        className={`w-2.5 h-2.5 rounded-full shrink-0 cursor-pointer ${style.dot}`} style={style.dotCss} />
                      {colorMenu === c.course && (
                        <div className="absolute left-0 top-4 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-52">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {COLOR_NAMES.map(name => (
                              <button key={name} onClick={() => { setCourse(c.id, { color: name }); setColorMenu(null) }}
                                className={`w-5 h-5 rounded-full cursor-pointer transition-transform hover:scale-110 ${colorDot[name]} ${c.color === name ? 'ring-2 ring-slate-700 ring-offset-1' : ''}`}
                                title={name} />
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mt-2 border-t border-slate-100 pt-2">
                            <input type="color" value={/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.color || '') ? c.color : '#6366f1'}
                              onChange={e => setCourse(c.id, { color: e.target.value })}
                              className="w-7 h-7 cursor-pointer border border-slate-200 rounded" title="Pick any colour" />
                            <span className="text-[11px] text-slate-400">Any colour (color wheel)</span>
                          </div>
                        </div>
                      )}
                    </span>
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight" title={c.course}>
                      {truncate(c.course, 45)}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    {c.abbrev && <span>{c.abbrev}</span>}
                    {c.ec != null && <span>{c.ec} EC</span>}
                    {c.year && !c.quartile && <span>{c.year}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                  <select value={status}
                    onChange={e => setCourse(c.id, { status: e.target.value === 'Planned' ? 'planned' : e.target.value === 'In Progress' ? 'in progress' : 'completed' })}
                    title="Mark as planned, active (in progress) or completed"
                    className={`text-xs px-2 py-0.5 rounded-full cursor-pointer border-0 focus:outline-none ${statusColors[status]}`}>
                    <option value="Planned">Planned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                  <select value={scope.toLowerCase() || 'curriculum'}
                    onChange={e => setCourse(c.id, { scope: e.target.value })}
                    title="Curriculum or extra course"
                    className={`text-xs px-2 py-0.5 rounded-full cursor-pointer border-0 focus:outline-none ${scope === 'extra' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                    <option value="curriculum">Curriculum</option>
                    <option value="extra">Extra</option>
                  </select>
                  {c.quartile && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${quartileColors[c.quartile] || 'bg-slate-100 text-slate-600'}`}>
                      {c.quartile}{c.year ? ` · ${c.year}` : ''}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400">Hours logged</span>
                  <p className="text-slate-700 font-medium">{loggedHours.toFixed(1)}h</p>
                </div>
                <div>
                  <span className="text-slate-400">Grade</span>
                  <p className={`font-medium ${c.grade != null ? 'text-slate-700' : 'text-slate-400'}`}>
                    {c.grade != null ? c.grade.toFixed(3) : (gradeInfo?.totalGrade != null ? gradeInfo.totalGrade.toFixed(3) : '—')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Est. required</span>
                  <p className="text-slate-700 font-medium">{estimatedHours.toFixed(0)}h</p>
                </div>
                <div>
                  <span className="text-slate-400">Avg {avgHoursPerEC.toFixed(1)}h/EC</span>
                  <p className="text-slate-700 font-medium">{c.ec != null && c.ec > 0 ? `${(loggedHours / c.ec).toFixed(1)}h/EC` : '—'}</p>
                </div>
              </div>

              {progress != null && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Progress</span>
                    <span>{loggedHours.toFixed(0)} / {estimatedHours.toFixed(0)}h</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${style.progress || 'bg-slate-700'}`}
                      style={{ width: `${Math.min(progress, 100)}%`, ...style.progressCss }} />
                  </div>
                </div>
              )}

              {gradeInfo && gradeInfo.components.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <div className="text-xs text-slate-500 mb-1 font-medium">Grade Components</div>
                  <div className="space-y-1">
                    {gradeInfo.components.map((comp, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="font-medium shrink-0">{TYPE_LABELS[comp.type] || 'Assignment'}</span>
                        {comp.id && <span className="font-mono text-[10px] text-slate-400 shrink-0">{comp.id}</span>}
                        {comp.name && comp.name !== comp.id && <span className="truncate text-slate-400">{comp.name}</span>}
                        <span className="ml-auto shrink-0">{comp.weight != null ? `${(comp.weight * 100).toFixed(0)}%` : '—'} · {comp.grade != null ? comp.grade : 'pending'}</span>
                      </div>
                    ))}
                    {gradeInfo.totalGrade != null && (
                      <div className="flex justify-between text-xs font-medium text-slate-700 border-t border-slate-100 pt-1 mt-1">
                        <span>Total</span>
                        <span>{gradeInfo.totalGrade.toFixed(3)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {c.comment && <p className="mt-2 text-xs text-slate-400 italic">{c.comment}</p>}

              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => setViewing(c.course)}
                  className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer">
                  Open course page →
                </button>
                <div className="ml-auto flex items-center gap-2">
                  {sortBy === 'custom' && <span className="text-[10px] text-slate-300 cursor-grab" title="Drag to reorder">⠿</span>}
                  <button onClick={() => { if (window.confirm(`Delete course "${c.course}"? This also removes its grade components, syllabus items, study-log entries and planner to-dos.`)) deleteCourse(c.course) }} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">Delete</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {viewingCourse && (
        <CourseDetail
          course={viewingCourse}
          loggedHours={loggedHoursMap[viewingCourse.course] || 0}
          avgHoursPerEC={avgHoursPerEC}
          onClose={() => setViewing(null)}
          onEdit={course => { setEditing(course); setViewing(null) }}
        />
      )}

      <AddCourseModal
        key={editing?.id || 'course-edit'}
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
      />
    </>
  )
}
