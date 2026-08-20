import { useState, useMemo } from 'react'
import { getStatus, truncate, getCourseStyle, COLOR_NAMES } from '../utils/helpers'
import { useAppData } from '../context/AppDataContext'
import { AddCourseModal } from '../components/forms/Modals'

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

export default function Courses({ courses }) {
  const { inputLog, gradeComponents, deleteCourse, updateCourse, content } = useAppData()
  const [expanded, setExpanded] = useState(null)
  const [editing, setEditing] = useState(null)
  const [sortBy, setSortBy] = useState('status')
  const [scopeFilter, setScopeFilter] = useState('all')

  const allCourses = useMemo(() => {
    const logCourses = new Set(inputLog.map(e => e.course))
    const merged = [...courses]
    for (const c of logCourses) {
      if (!merged.find(m => m.course === c)) {
        merged.push({ course: c, year: null, quartile: null, abbrev: null, start: null, finish: null, timeMin: 0, timeHours: 0, grade: null, exam: null, assignment: null, laboratory: null, ec: null, comment: null, estTimeHours: null, assTimeHours: null, material: null, scope: null, color: null })
      }
    }

    if (scopeFilter !== 'all') {
      const wanted = scopeFilter === 'extra'
      const filtered = merged.filter(c => ((c.scope || '').toLowerCase() === 'extra') === wanted)
      return filtered
    }

    const order = { 'Completed': 0, 'In Progress': 1, 'Planned': 2 }
    const qOrder = { 'Q1': 0, 'Q2': 1, 'Q3': 2, 'Q4': 3 }
    const copy = [...merged]
    copy.sort((a, b) => {
      switch (sortBy) {
        case 'status': return order[getStatus(a)] - order[getStatus(b)] || a.course.localeCompare(b.course)
        case 'quartile': return (qOrder[a.quartile] ?? 9) - (qOrder[b.quartile] ?? 9) || order[getStatus(a)] - order[getStatus(b)]
        case 'scope': return (a.scope || 'z').localeCompare(b.scope || 'z') || a.course.localeCompare(b.course)
        case 'ec': return (b.ec || 0) - (a.ec || 0)
        case 'name': return a.course.localeCompare(b.course)
        default: return 0
      }
    })
    return copy
  }, [courses, inputLog, sortBy, scopeFilter])

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
            <option value="status">Status</option>
            <option value="quartile">Quartile</option>
            <option value="scope">Scope (curriculum/extra)</option>
            <option value="ec">ECTS</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {allCourses.map((c) => {
          const status = getStatus(c)
          const style = getCourseStyle(c.course, c.color)
          const loggedHours = loggedHoursMap[c.course] || 0
          const estimatedHours = c.ec != null && c.ec > 0 ? c.ec * avgHoursPerEC : loggedHours * 2
          const progress = estimatedHours > 0 ? Math.min((loggedHours / estimatedHours) * 100, 100) : null
          const gradeInfo = gradeMap[c.course]
          const scope = c.scope || ''
          const isExpanded = expanded === c.course

          return (
            <div key={c.course} className={`bg-white rounded-xl border border-slate-200 p-5 flex flex-col ${isExpanded ? 'md:col-span-2 xl:col-span-3' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight" title={c.course}>
                      {truncate(c.course, 45)}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    {c.abbrev && <span>{c.abbrev}</span>}
                    {c.ec != null && <span>{c.ec} EC</span>}
                    {c.year && !c.quartile && <span>{c.year}</span>}
                    {scope && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${scope === 'extra' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                        {scope === 'extra' ? 'Extra' : 'Curriculum'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[status]}`}>{status}</span>
                  {c.quartile && <span className={`text-xs px-2 py-0.5 rounded-full ${quartileColors[c.quartile] || 'bg-slate-100 text-slate-600'}`}>{c.quartile}</span>}
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
                    <div className={`h-2 rounded-full transition-all ${status === 'Completed' ? 'bg-green-500' : 'bg-slate-700'}`}
                      style={{ width: `${Math.min(progress, 100)}%` }} />
                  </div>
                </div>
              )}

              {gradeInfo && gradeInfo.components.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <div className="text-xs text-slate-500 mb-1 font-medium">Grade Components</div>
                  <div className="space-y-1">
                    {gradeInfo.components.map((comp, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-slate-600">
                        <span>{comp.type === 'exam' ? 'Exam' : 'Assignment'}{comp.id ? ` (${comp.id})` : ''}</span>
                        <span>{comp.weight != null ? `${(comp.weight * 100).toFixed(0)}%` : '—'} {comp.grade != null ? `· ${comp.grade}` : '(pending)'}</span>
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

              {isExpanded && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-slate-500 mb-1 font-medium">Status</div>
                      <select value={status} onChange={e => setCourse(c.id, { status: e.target.value === 'Planned' ? 'planned' : e.target.value === 'In Progress' ? 'in progress' : 'completed' })}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full focus:outline-none focus:border-slate-400 bg-white">
                        <option value="Completed">Completed</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Planned">Planned</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1 font-medium">Scope</div>
                      <select value={scope.toLowerCase() || 'curriculum'} onChange={e => setCourse(c.id, { scope: e.target.value })}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full focus:outline-none focus:border-slate-400 bg-white">
                        <option value="curriculum">Curriculum (counts toward degree)</option>
                        <option value="extra">Extra (excluded from average/ECTS)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 mb-1 font-medium">Colour</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {COLOR_NAMES.map(name => (
                        <button key={name} onClick={() => setCourse(c.id, { color: name })}
                          className={`w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110 ${colorDot[name]} ${c.color === name ? 'ring-2 ring-slate-700 ring-offset-1' : ''}`}
                          title={name} />
                      ))}
                    </div>
                  </div>

                  <CourseTimeline course={c.course} content={content} gradeComponents={gradeComponents} />
                  <GradeEditor course={c.course} />
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setExpanded(isExpanded ? null : c.course)}
                  className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {isExpanded ? 'Collapse' : 'Edit course / timeline →'}
                </button>
                {c.id != null && (
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setEditing(c)} className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer">Edit</button>
                    <button onClick={() => { if (window.confirm(`Delete course "${c.course}"? This also removes its grade components.`)) deleteCourse(c.id) }} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">Delete</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <AddCourseModal
        key={editing?.id || 'course-edit'}
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

// Horizontal course timeline: start -> finish with markers for scheduled items
// (indigo), assessments/deadlines (amber) and grade component due dates (rose).
function CourseTimeline({ course, content, gradeComponents }) {
  const items = (content || []).filter(i => i.course === course)
  const grades = (gradeComponents || []).find(g => g.course === course)
  const now = new Date()
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const minDate = items.reduce((min, i) => {
    const d = i.date || i.deadline
    return d && (!min || d < min) ? d : min
  }, null)
  const maxDate = items.reduce((max, i) => {
    const d = i.date || i.deadline
    return d && (!max || d > max) ? d : max
  }, null)

  if (!minDate || !maxDate) {
    return (
      <div className="text-xs text-slate-400 italic">No dated items for a timeline yet (import schedule in Course Content).</div>
    )
  }

  const start = new Date(minDate + 'T12:00:00').getTime()
  const end = new Date(maxDate + 'T12:00:00').getTime()
  const span = Math.max(end - start, 1)
  const pos = (iso) => {
    const t = new Date(iso + 'T12:00:00').getTime()
    return Math.min(100, Math.max(0, ((t - start) / span) * 100))
  }

  const markers = []
  for (const i of items) {
    const iso = i.date || i.deadline
    if (!iso) continue
    const isDeadline = !!i.deadline
    markers.push({ iso, label: i.topic || i.description, isDeadline, course: i.course, type: i.type })
  }
  const todayPos = todayIso >= minDate && todayIso <= maxDate ? pos(todayIso) : null
  for (const comp of grades?.components || []) {
    if (comp.dueDate) markers.push({ iso: comp.dueDate, label: `${comp.type === 'exam' ? 'Exam' : 'Assignment'} due`, isDeadline: true, due: true })
  }
  markers.sort((a, b) => a.iso.localeCompare(b.iso))

  return (
    <div>
      <div className="text-xs text-slate-500 mb-2 font-medium">Timeline</div>
      <div className="relative h-2 bg-slate-100 rounded-full mb-2">
        {todayPos != null && (
          <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-slate-700 rounded" style={{ left: `${todayPos}%` }} title="Today" />
        )}
      </div>
      <div className="relative pt-3">
        {markers.slice(0, 16).map((m, i) => (
          <div key={i} className="flex items-center gap-2 mb-1.5 absolute" style={{ left: `${pos(m.iso) - 2}%`, top: 0 }}>
            <span className={`h-2 w-2 rounded-full shrink-0 ${m.isDeadline ? 'bg-amber-400' : m.due ? 'bg-rose-400' : 'bg-indigo-400'}`} />
            <span className="text-[11px] text-slate-600 whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px]">{m.label}</span>
          </div>
        ))}
        <div className="h-px" />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{minDate}</span>
        <span>{maxDate}</span>
      </div>
    </div>
  )
}

function GradeEditor({ course }) {
  const { gradeComponents, updateGradeComponents } = useAppData()
  const existing = gradeComponents.find(g => g.course === course)
  const [comps, setComps] = useState(
    existing?.components?.map(c => ({
      type: c.type || 'assignment',
      id: c.id || '',
      weight: c.weight != null ? String(c.weight) : '',
      grade: c.grade != null ? String(c.grade) : '',
    })) || [
      { type: 'assignment', id: '', weight: '', grade: '' },
      { type: 'assignment', id: '', weight: '', grade: '' },
    ]
  )

  function addComp() {
    setComps([...comps, { type: 'assignment', id: '', weight: '', grade: '' }])
  }

  function removeComp(i) {
    if (comps.length <= 1) return
    setComps(comps.filter((_, idx) => idx !== i))
  }

  function updateComp(i, field, value) {
    const updated = [...comps]
    updated[i] = { ...updated[i], [field]: value }
    setComps(updated)
  }

  function save() {
    const parsed = comps.map(c => ({
      type: c.type,
      id: c.id || null,
      weight: parseFloat(c.weight) || null,
      grade: c.grade ? parseFloat(c.grade) : null,
    })).filter(c => c.weight != null)
    updateGradeComponents(course, parsed)
  }

  const total = comps.reduce((sum, c) => {
    const w = parseFloat(c.weight) || 0
    const g = parseFloat(c.grade)
    return g != null ? sum + w * g : sum
  }, 0)

  const totalWeight = comps.reduce((sum, c) => sum + (parseFloat(c.weight) || 0), 0)

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <p className="text-xs font-medium text-slate-700">Grade Components for {course}</p>
      {comps.map((comp, i) => (
        <div key={i} className="flex items-center gap-1.5 flex-wrap">
          <select value={comp.type} onChange={e => updateComp(i, 'type', e.target.value)}
            className="text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400">
            <option value="exam">Exam</option>
            <option value="assignment">Assignment</option>
          </select>
          <input type="text" placeholder="ID" value={comp.id}
            onChange={e => updateComp(i, 'id', e.target.value)}
            className="w-20 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400" />
          <input type="text" inputMode="decimal" placeholder="Weight (0-1)" value={comp.weight}
            onChange={e => updateComp(i, 'weight', e.target.value)}
            className="w-20 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400" />
          <input type="text" inputMode="decimal" placeholder="Grade" value={comp.grade}
            onChange={e => updateComp(i, 'grade', e.target.value)}
            className="w-20 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400" />
          {comps.length > 1 && <button onClick={() => removeComp(i)} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">×</button>}
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <button onClick={addComp} className="text-slate-500 hover:text-slate-700 cursor-pointer">+ Add component</button>
        <button onClick={save} className="ml-2 px-2 py-0.5 bg-slate-700 text-white rounded cursor-pointer">Save</button>
        <span className="ml-auto">
          Weight sum: {(totalWeight * 100).toFixed(0)}% |
          Weighted avg: {totalWeight > 0 ? (total / totalWeight).toFixed(3) : '—'}
        </span>
      </div>
    </div>
  )
}