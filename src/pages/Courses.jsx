import { useState, useMemo } from 'react'
import { getStatus, truncate, getCourseStyle } from '../utils/helpers'
import { useAppData } from '../context/AppDataContext'
import { AddCourseModal } from '../components/forms/Modals'

export default function Courses({ courses }) {
  const { inputLog, gradeComponents, deleteCourse } = useAppData()
  const [expanded, setExpanded] = useState(null)
  const [editing, setEditing] = useState(null)

  const allCourses = useMemo(() => {
    const logCourses = new Set(inputLog.map(e => e.course))
    const merged = [...courses]
    for (const c of logCourses) {
      if (!merged.find(m => m.course === c)) {
        merged.push({ course: c, year: null, quartile: null, abbrev: null, start: null, finish: null, timeMin: 0, timeHours: 0, grade: null, exam: null, assignment: null, laboratory: null, ec: null, comment: null, estTimeHours: null, assTimeHours: null, material: null })
      }
    }
    const order = { 'Completed': 0, 'In Progress': 1, 'Planned': 2 }
    return merged.sort((a, b) => order[getStatus(a)] - order[getStatus(b)])
  }, [courses, inputLog])

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

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {allCourses.map((c) => {
        const status = getStatus(c)
        const style = getCourseStyle(c.course)
        const loggedHours = loggedHoursMap[c.course] || 0
        const estimatedHours = c.ec != null && c.ec > 0 ? c.ec * avgHoursPerEC : loggedHours * 2
        const progress = estimatedHours > 0 ? Math.min((loggedHours / estimatedHours) * 100, 100) : null
        const gradeInfo = gradeMap[c.course]

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
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {c.abbrev && <span>{c.abbrev}</span>}
                  {c.ec != null && <span>{c.ec} EC</span>}
                  {c.year && !c.quartile && <span>{c.year}</span>}
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
                <p className="text-slate-700 font-medium">{c.ec != null ? `${(loggedHours / c.ec).toFixed(1)}h/EC` : '—'}</p>
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

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setExpanded(isExpanded ? null : c.course)}
                className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {isExpanded ? 'Collapse' : 'Edit grade components →'}
              </button>
              {c.id != null && (
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => setEditing(c)} className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer">Edit</button>
                  <button onClick={() => { if (window.confirm(`Delete course "${c.course}"? This also removes its grade components.`)) deleteCourse(c.id) }} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">Delete</button>
                </div>
              )}
            </div>

            {isExpanded && (
              <GradeEditor course={c.course} />
            )}
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
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
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
