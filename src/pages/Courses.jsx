import { useState, useMemo } from 'react'
import { getStatus, truncate, getCourseStyle, isCourseActive } from '../utils/helpers'
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

const TYPE_LABELS = { exam: 'Exam', assignment: 'Assignment', presentation: 'Presentation', project: 'Project', quiz: 'Quiz', other: 'Other' }

export default function Courses({ courses }) {
  const { inputLog, gradeComponents, deleteCourse, updateCourse, reorderCourses } = useAppData()
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [sortBy, setSortBy] = useState('custom')
  const [scopeFilter, setScopeFilter] = useState('all')
  const [dragLocal, setDragLocal] = useState(null)
  const [dragName, setDragName] = useState(null)

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
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
          const colorVal = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.color || '') ? c.color : '#6366f1'

          return (
            <div key={c.course}
              draggable={sortBy === 'custom'}
              onDragStart={e => onDragStart(e, c.course)}
              onDragOver={e => onDragOver(e, c.course)}
              onDrop={onDrop}
              onDragEnd={onDrop}
              onDoubleClick={() => setViewing(c.course)}
              title="Double-click to open the course page"
              className={`rounded-xl border ${style.border || 'border-slate-200'} ${style.soft} p-4 flex flex-col gap-3 h-full min-h-[230px] cursor-default transition-opacity ${dragging ? 'opacity-40' : ''}`}
              style={{ ...style.softCss, ...style.borderCss }}>

              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <input type="color" value={colorVal}
                    onChange={e => setCourse(c.id, { color: e.target.value })}
                    title="Pick any colour"
                    className="w-4 h-4 rounded-full mt-1 cursor-pointer border-0 p-0 bg-transparent shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight" title={c.course}>
                      {truncate(c.course, 45)}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      {c.abbrev && <span>{c.abbrev}</span>}
                      {c.ec != null && <span>{c.ec} EC</span>}
                      {c.year && !c.quartile && <span>{c.year}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
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

              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-slate-400">Hours</div>
                  <div className="text-slate-700 font-medium text-sm">{loggedHours.toFixed(1)}h</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Grade</div>
                  <div className={`font-medium text-sm ${c.grade != null ? 'text-slate-700' : 'text-slate-400'}`}>
                    {c.grade != null ? c.grade.toFixed(3) : (gradeInfo?.totalGrade != null ? gradeInfo.totalGrade.toFixed(3) : '—')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Est.</div>
                  <div className="text-slate-700 font-medium text-sm">{estimatedHours.toFixed(0)}h</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Avg</div>
                  <div className="text-slate-700 font-medium text-sm">{c.ec != null && c.ec > 0 ? `${(loggedHours / c.ec).toFixed(1)}` : '—'}</div>
                </div>
              </div>

              {progress != null && (
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>Progress</span>
                    <span>{loggedHours.toFixed(0)} / {estimatedHours.toFixed(0)}h</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${style.progress || 'bg-slate-700'}`}
                      style={{ width: `${Math.min(progress, 100)}%`, ...style.progressCss }} />
                  </div>
                </div>
              )}

              <div className="mt-auto">
                {gradeInfo && gradeInfo.components.length > 0 ? (
                  <div className="max-h-[4.75rem] overflow-hidden">
                    <div className="flex flex-wrap gap-1">
                      {gradeInfo.components.map((comp, idx) => (
                        <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap">
                          {comp.id || TYPE_LABELS[comp.type] || 'Assignment'}{comp.weight != null ? ` · ${(comp.weight * 100).toFixed(0)}%` : ''}
                        </span>
                      ))}
                    </div>
                    {gradeInfo.totalGrade != null && (
                      <div className="text-[10px] font-medium text-slate-500 mt-1">Total {gradeInfo.totalGrade.toFixed(3)}</div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-300 italic">No grade components</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <button onClick={() => setViewing(c.course)}
                  className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer">
                  Open →
                </button>
                <div className="flex items-center gap-2">
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
          key={viewingCourse.course}
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
