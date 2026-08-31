import { useState, useMemo } from 'react'
import { getStatus, truncate, getCourseStyle, isCourseActive, colorToHex } from '../utils/helpers'
import { useAppData } from '../context/AppDataContext'
import { deriveAbbrev } from '../drive/driveClient'
import { AddCourseModal } from '../components/forms/Modals'
import CourseDetail from '../components/CourseDetail'
import AcademicYearEditor from '../components/AcademicYearEditor'

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

const COMPONENT_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#eab308', '#3b82f6', '#f97316', '#a855f7', '#22c55e']

export default function Courses({ courses }) {
  const { inputLog, gradeComponents, deleteCourse, updateCourse, reorderCourses, academicYears, updateAcademicYears } = useAppData()
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
        merged.push({ id: c, course: c, year: null, quartile: null, abbrev: null, code: null, start: null, finish: null, ec: null, comment: null, scope: null, color: null, order: null })
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

  const viewingCourse = viewing ? courses.find(c => c.id === viewing || c.course === viewing) || { course: viewing } : null

  return (
    <>
      <AcademicYearEditor academicYears={academicYears} onChange={updateAcademicYears} courses={courses} />
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
            <option value="ec">EC</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {displayed.map((c) => {
          const status = getStatus(c)
          const style = getCourseStyle(c.course, c.color)
          const loggedHours = loggedHoursMap[c.course] || 0
          const estimatedHours = c.estHours != null && c.estHours > 0
            ? c.estHours
            : c.ec != null && c.ec > 0
              ? c.ec * avgHoursPerEC
              : loggedHours * 2
          // A completed course's estimate matches what was actually invested, so
          // the progress bar reads 100% instead of "still in progress".
          const effectiveEstimated = status === 'Completed' && loggedHours > estimatedHours
            ? loggedHours
            : estimatedHours
          const progress = effectiveEstimated > 0 ? Math.min((loggedHours / effectiveEstimated) * 100, 100) : null
          const gradeInfo = gradeMap[c.course]
          const scope = c.scope || ''
          const dragging = dragName === c.course
          const colorVal = colorToHex(c.color, c.course)

          return (
            <div key={c.course}
              draggable={sortBy === 'custom'}
              onDragStart={e => onDragStart(e, c.course)}
              onDragOver={e => onDragOver(e, c.course)}
              onDrop={onDrop}
              onDragEnd={onDrop}
              onDoubleClick={() => setViewing(c.id)}
              title="Double-click to open the course page"
              className={`rounded-lg border ${style.border || 'border-slate-200'} ${style.soft} p-2.5 flex flex-col gap-2 sm:flex-row sm:items-center transition-opacity ${dragging ? 'opacity-40' : ''}`}
              style={{ ...style.softCss, ...style.borderCss }}>

              <div className="flex items-center gap-2 sm:flex-1 sm:min-w-0">
                <input type="color" value={colorVal}
                  onChange={e => setCourse(c.id, { color: e.target.value })}
                  title="Pick any colour"
                  className="w-4 h-4 rounded-full cursor-pointer border-0 p-0 bg-transparent shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-800 text-sm leading-tight" title={c.course}>{truncate(c.course, 60)}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    {c.abbrev ? <span>{c.abbrev}</span> : <span title="Derived abbreviation (no custom one saved)">{deriveAbbrev(c.course)}</span>}
                    {c.ec != null && <span>{c.ec} EC</span>}
                    {c.year && !c.quartile && <span>{c.year}</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <select value={status}
                  onChange={e => {
                    const nextStatus = e.target.value === 'Planned' ? 'planned' : e.target.value === 'In Progress' ? 'in progress' : 'completed'
                    // Marking a course completed sets its estimate to the hours
                    // actually invested, so estimate and progress match (100%).
                    const patch = nextStatus === 'completed' && loggedHours > 0
                      ? { status: nextStatus, estHours: loggedHours }
                      : { status: nextStatus }
                    setCourse(c.id, patch)
                  }}
                  title="Mark as planned, active (in progress) or completed"
                  className={`text-[11px] px-2 py-0.5 rounded-full cursor-pointer border-0 focus:outline-none ${statusColors[status]}`}>
                  <option value="Planned">Planned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
                <select value={scope.toLowerCase() || 'curriculum'}
                  onChange={e => setCourse(c.id, { scope: e.target.value })}
                  title="Curriculum or extra course"
                  className={`text-[11px] px-2 py-0.5 rounded-full cursor-pointer border-0 focus:outline-none ${scope === 'extra' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                  <option value="curriculum">Curriculum</option>
                  <option value="extra">Extra</option>
                </select>
                {c.quartile && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${quartileColors[c.quartile] || 'bg-slate-100 text-slate-600'}`}>
                    {c.quartile}{c.year ? ` · ${c.year}` : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-slate-500 shrink-0">
                <span><span className="text-slate-400">Hours </span><span className="font-medium text-slate-700">{loggedHours.toFixed(1)}</span></span>
                <span><span className="text-slate-400">Grade </span><span className={`font-medium ${c.grade != null ? 'text-slate-700' : 'text-slate-400'}`}>{c.grade != null ? c.grade.toFixed(3) : (gradeInfo?.totalGrade != null ? gradeInfo.totalGrade.toFixed(3) : '—')}</span></span>
                <span><span className="text-slate-400">Est </span><span className="font-medium text-slate-700">{effectiveEstimated.toFixed(0)}h</span></span>
                <span><span className="text-slate-400">EC </span><span className="font-medium text-slate-700">{c.ec != null ? c.ec : '—'}</span></span>
                <span><span className="text-slate-400">Avg/EC </span><span className="font-medium text-slate-700">{c.ec != null && c.ec > 0 ? `${(loggedHours / c.ec).toFixed(1)}` : '—'}</span></span>
              </div>

              {progress != null && (
                <div className="sm:w-24 shrink-0" title={`${loggedHours.toFixed(0)} / ${effectiveEstimated.toFixed(0)}h`}>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${style.progress || 'bg-slate-700'}`}
                      style={{ width: `${Math.min(progress, 100)}%`, ...style.progressCss }} />
                  </div>
                </div>
              )}

              {gradeInfo && gradeInfo.components.length > 0 ? (
                <div className="sm:w-44 shrink-0" title="Grade component weights">
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                    {gradeInfo.components.map((comp, idx) => {
                      const totalW = gradeInfo.components.reduce((s, x) => s + (parseFloat(x.weight) || 0), 0)
                      const pct = totalW > 0 ? (parseFloat(comp.weight) || 0) / totalW * 100 : 100 / gradeInfo.components.length
                      const isExam = comp.type === 'exam'
                      const bg = isExam ? '#ef4444' : COMPONENT_COLORS[idx % COMPONENT_COLORS.length]
                      return <div key={idx} style={{ width: `${pct}%`, backgroundColor: bg }} title={(comp.id || TYPE_LABELS[comp.type] || 'Assignment') + (comp.weight != null ? ` ${(comp.weight * 100).toFixed(0)}%` : '')} />
                    })}
                  </div>
                </div>
              ) : (
                <div className="sm:w-44 shrink-0 text-[11px] text-slate-300 italic">No grade components</div>
              )}

              <div className="flex items-center gap-3 sm:ml-auto shrink-0">
                <button onClick={() => setViewing(c.id)}
                  className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer">
                  Open →
                </button>
                {sortBy === 'custom' && <span className="text-[10px] text-slate-300 cursor-grab" title="Drag to reorder">⠿</span>}
                <button onClick={() => { if (window.confirm(`Delete course "${c.course}"? This also removes its grade components, syllabus items, study-log entries and planner to-dos.`)) deleteCourse(c.course) }} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">Delete</button>
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
