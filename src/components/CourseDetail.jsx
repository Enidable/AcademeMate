import { useState, useMemo } from 'react'
import { getStatus, getCourseStyle } from '../utils/helpers'
import { useAppData } from '../context/AppDataContext'
import { nextDeadlineId } from '../utils/ids'
import Syllabus from './Syllabus'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const statusColors = {
  'Completed': 'bg-green-100 text-green-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Planned': 'bg-slate-100 text-slate-500',
}

const CATEGORY_COLORS = {
  'Studying': '#3b82f6',
  'Lecture': '#8b5cf6',
  'Project Work': '#6366f1',
  'Group Work': '#14b8a6',
  'Practical': '#06b6d4',
  'Exam': '#ef4444',
  'Exam Prep': '#f97316',
  'Exercise': '#22c55e',
  'Meeting': '#f59e0b',
  'Presentation': '#a855f7',
  'Work': '#6b7280',
  'Other': '#94a3b8',
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500 mb-0.5 font-medium">{label}</div>
      {children}
    </div>
  )
}

const inputCls = 'text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white'

// Grade component editor. Hoisted to module scope and auto-saving on every
// add / change / remove, so nothing disappears and there is no separate Save
// step. A component with a due date automatically creates a calendar deadline
// via updateGradeComponents. Blank IDs are auto-filled in the new scheme
// (ML11 for assignments/projects, ML1E1 for exams).
function GradeEditor({ course, abbrev, code }) {
  const { gradeComponents, content, updateGradeComponents } = useAppData()
  const existing = gradeComponents.find((g) => g.course === course)
  const [comps, setComps] = useState(
    existing?.components?.map((c) => ({
      type: c.type || 'assignment',
      id: c.id || '',
      name: c.name || c.id || '',
      dueDate: c.dueDate || '',
      weight: c.weight != null ? String(c.weight) : '',
      grade: c.grade != null ? String(c.grade) : '',
    })) || [
      { type: 'assignment', id: '', name: '', dueDate: '', weight: '', grade: '' },
    ]
  )

  // Combined list of every existing ID for this course, so nextDeadlineId can
  // suggest/assign the next free number.
  const combined = useMemo(() => [
    ...(content || []).filter((i) => i.course === course),
    ...(gradeComponents || []).flatMap((g) => (g.components || []).map((c) => ({ course: g.course, contentId: c.id, type: c.type }))),
    ...comps.filter((c) => c.id).map((c) => ({ course, contentId: c.id, type: c.type })),
  ], [course, content, gradeComponents, comps])

  const placeholderIds = useMemo(() => ({
    normal: nextDeadlineId(course, abbrev, code, combined, 'assignment'),
    exam: nextDeadlineId(course, abbrev, code, combined, 'exam'),
  }), [course, abbrev, code, combined])

  function persist(next) {
    const parsed = next.map((c) => ({
      type: c.type,
      id: c.id || null,
      name: c.name || c.id || null,
      weight: parseFloat(c.weight) || null,
      grade: c.grade ? parseFloat(c.grade) : null,
      dueDate: c.dueDate || null,
    })).filter((c) => c.id || c.name || c.weight != null || c.dueDate)
    const running = [
      ...combined,
      ...parsed.filter((c) => c.id).map((c) => ({ course, contentId: c.id, type: c.type })),
    ]
    for (const c of parsed) {
      if (c.id) continue
      c.id = nextDeadlineId(course, abbrev, code, running, c.type)
      running.push({ course, contentId: c.id, type: c.type })
      if (!c.name) c.name = c.id
    }
    updateGradeComponents(course, parsed)
  }

  function addComp() {
    const next = [...comps, { type: 'assignment', id: '', name: '', dueDate: '', weight: '', grade: '' }]
    setComps(next)
    persist(next)
  }

  function removeComp(i) {
    if (comps.length <= 1) return
    const next = comps.filter((_, idx) => idx !== i)
    setComps(next)
    persist(next)
  }

  function updateComp(i, field, value) {
    const next = [...comps]
    next[i] = { ...next[i], [field]: value }
    setComps(next)
    persist(next)
  }

  const total = comps.reduce((sum, c) => {
    const w = parseFloat(c.weight) || 0
    const g = parseFloat(c.grade)
    return g != null ? sum + w * g : sum
  }, 0)
  const totalWeight = comps.reduce((sum, c) => sum + (parseFloat(c.weight) || 0), 0)

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <p className="text-xs font-medium text-slate-700">Grade Components</p>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-1.5">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">Type</div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 w-28">Project ID</div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 w-32">Deadline</div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 w-14">Weight</div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 w-14">Grade</div>
        <div className="w-5" />
      </div>
      {comps.map((comp, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-1.5">
          <select value={comp.type} onChange={(e) => updateComp(i, 'type', e.target.value)}
            className="text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400 bg-white w-full">
            <option value="exam">Exam</option>
            <option value="assignment">Assignment</option>
            <option value="presentation">Presentation</option>
            <option value="project">Project</option>
            <option value="quiz">Quiz</option>
            <option value="other">Other</option>
          </select>
          <input type="text" list={'project-ids-' + course} value={comp.id}
            onChange={(e) => updateComp(i, 'id', e.target.value)}
            placeholder={comp.type === 'exam' ? placeholderIds.exam : placeholderIds.normal}
            className="w-28 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400" />
          <input type="date" value={comp.dueDate} onChange={(e) => updateComp(i, 'dueDate', e.target.value)}
            className="w-32 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400" />
          <input type="text" inputMode="decimal" placeholder="0.3" value={comp.weight}
            onChange={(e) => updateComp(i, 'weight', e.target.value)}
            className="w-14 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400" />
          <input type="text" inputMode="decimal" placeholder="-" value={comp.grade}
            onChange={(e) => updateComp(i, 'grade', e.target.value)}
            className="w-14 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400" />
          {comps.length > 1
            ? <button onClick={() => removeComp(i)} className="w-5 text-xs text-red-400 hover:text-red-600 cursor-pointer">x</button>
            : <div className="w-5" />}
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <button onClick={addComp} className="text-slate-500 hover:text-slate-700 cursor-pointer">+ Add component</button>
        <span className="ml-auto">
          Weight sum: {(totalWeight * 100).toFixed(0)}% |
          Weighted avg: {totalWeight > 0 ? (total / totalWeight).toFixed(3) : '-'}
        </span>
      </div>
    </div>
  )
}

// A compact course editor opened by double-clicking a course. Shows the key
// stats and a time-by-category pie chart, with inline auto-saving fields,
// grade components and the syllabus, laid out to avoid scrolling.
export default function CourseDetail({ course, loggedHours, avgHoursPerEC, onClose }) {
  const { gradeComponents, deleteCourse, updateCourse, inputLog } = useAppData()
  const c = course
  const status = getStatus(c)
  const style = getCourseStyle(c.course, c.color)
  const gradeInfo = gradeComponents.find((g) => g.course === c.course)
  const estimatedHours = c.estHours != null && c.estHours > 0
    ? c.estHours
    : c.ec != null && c.ec > 0
      ? c.ec * avgHoursPerEC
      : loggedHours * 2
  const progress = estimatedHours > 0 ? Math.min((loggedHours / estimatedHours) * 100, 100) : null

  const [form, setForm] = useState({
    abbrev: c.abbrev || '',
    code: c.code || '',
    ec: c.ec != null ? String(c.ec) : '',
    quartile: c.quartile || '',
    estHours: c.estHours != null ? String(c.estHours) : '',
    start: c.start || '',
    finish: c.finish || '',
    comment: c.comment || '',
  })

  function set(patch) {
    updateCourse(c.course, patch)
  }

  function commit() {
    set({
      abbrev: form.abbrev || null,
      code: form.code || null,
      ec: form.ec ? parseFloat(form.ec) : null,
      quartile: form.quartile || null,
      estHours: form.estHours ? parseFloat(form.estHours) : null,
      start: form.start || null,
      finish: form.finish || null,
      comment: form.comment || null,
    })
  }

  function confirmDelete() {
    if (window.confirm('Delete course "' + c.course + '"? This also removes its grade components, syllabus items, study-log entries and planner to-dos.')) {
      deleteCourse(c.course)
      onClose()
    }
  }

  const catData = useMemo(() => {
    const map = {}
    for (const e of inputLog || []) {
      if (e.course !== c.course) continue
      const cat = e.category || 'Other'
      map[cat] = (map[cat] || 0) + (parseFloat(e.durationHours) || 0)
    }
    return Object.entries(map).filter((entry) => entry[1] > 0).map((entry) => ({ name: entry[0], value: entry[1] }))
  }, [inputLog, c.course])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto p-4">
        <div className={`rounded-xl border ${style.border || 'border-slate-200'} ${style.soft} p-4`} style={{ ...style.softCss, ...style.borderCss }}>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => { commit(); onClose() }} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 bg-white cursor-pointer">Back to Courses</button>
            <span className={`w-3 h-3 rounded-full shrink-0 ${style.dot}`} style={style.dotCss} />
            <h2 className="font-semibold text-slate-800 text-base leading-tight truncate">{c.course}</h2>
            <div className="ml-auto flex items-center gap-2">
              <select value={status}
                onChange={(e) => set({ status: e.target.value === 'Planned' ? 'planned' : e.target.value === 'In Progress' ? 'in progress' : 'completed' })}
                className={`text-xs px-2 py-0.5 rounded-full cursor-pointer border-0 focus:outline-none ${statusColors[status]}`}>
                <option value="Planned">Planned</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
              <select value={(c.scope || '').toLowerCase() || 'curriculum'}
                onChange={(e) => set({ scope: e.target.value })}
                className={`text-xs px-2 py-0.5 rounded-full cursor-pointer border-0 focus:outline-none ${(c.scope || '').toLowerCase() === 'extra' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                <option value="curriculum">Curriculum</option>
                <option value="extra">Extra</option>
              </select>
              <button onClick={() => { commit(); onClose() }} className="text-slate-400 hover:text-slate-600 text-2xl leading-none cursor-pointer">&times;</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-lg border border-slate-200 p-2">
                  <div className="text-[10px] text-slate-400">Hours logged</div>
                  <div className="text-slate-700 font-semibold">{loggedHours.toFixed(1)}h</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-2">
                  <div className="text-[10px] text-slate-400">Grade</div>
                  <div className="font-semibold text-slate-700">{c.grade != null ? c.grade.toFixed(3) : (gradeInfo?.totalGrade != null ? gradeInfo.totalGrade.toFixed(3) : '-')}</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-2">
                  <div className="text-[10px] text-slate-400">Est. required</div>
                  <div className="text-slate-700 font-semibold">{estimatedHours.toFixed(0)}h</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-2">
                  <div className="text-[10px] text-slate-400">Avg {avgHoursPerEC.toFixed(1)}h/EC</div>
                  <div className="text-slate-700 font-semibold">{c.ec != null && c.ec > 0 ? (loggedHours / c.ec).toFixed(1) + 'h/EC' : '-'}</div>
                </div>
              </div>

              {progress != null && (
                <div className="bg-white rounded-lg border border-slate-200 p-2">
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

              <div className="bg-white rounded-lg border border-slate-200 p-2">
                <div className="text-[10px] text-slate-400 mb-1">Time by category</div>
                {catData.length === 0 ? (
                  <p className="text-[11px] text-slate-300 italic">No sessions logged yet.</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <div style={{ width: 120, height: 120 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={catData} dataKey="value" nameKey="name" innerRadius={30} outerRadius={58} paddingAngle={2} stroke="none">
                            {catData.map((d) => <Cell key={d.name} fill={CATEGORY_COLORS[d.name] || '#94a3b8'} />)}
                          </Pie>
                          <Tooltip formatter={(v) => v.toFixed(1) + 'h'} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-0.5">
                      {catData.slice().sort((a, b) => b.value - a.value).map((d) => (
                        <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: CATEGORY_COLORS[d.name] || '#94a3b8' }} />
                          <span className="text-slate-600 truncate">{d.name}</span>
                          <span className="ml-auto text-slate-400">{d.value.toFixed(1)}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Field label="Abbreviation (IDs)">
                  <input type="text" value={form.abbrev} placeholder="e.g. ASDfR" onChange={(e) => setForm((f) => ({ ...f, abbrev: e.target.value }))} onBlur={commit} className={inputCls} />
                </Field>
                <Field label="Course code">
                  <input type="text" value={form.code} placeholder="e.g. 202400250" onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} onBlur={commit} className={inputCls} />
                </Field>
                <Field label="EC">
                  <input type="text" inputMode="decimal" value={form.ec} onChange={(e) => setForm((f) => ({ ...f, ec: e.target.value }))} onBlur={commit} className={inputCls} />
                </Field>
                <Field label="Quartile">
                  <select value={form.quartile} onChange={(e) => { setForm((f) => ({ ...f, quartile: e.target.value })); set({ quartile: e.target.value || null }) }} className={inputCls}>
                    <option value="">-</option>
                    <option value="Q1">Q1</option>
                    <option value="Q2">Q2</option>
                    <option value="Q3">Q3</option>
                    <option value="Q4">Q4</option>
                  </select>
                </Field>
                <Field label="Est. hours">
                  <input type="text" inputMode="decimal" value={form.estHours} placeholder="e.g. 160" onChange={(e) => setForm((f) => ({ ...f, estHours: e.target.value }))} onBlur={commit} className={inputCls} />
                </Field>
                <Field label="Colour">
                  <div className="flex items-center gap-2">
                    <input type="color" value={/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.color || '') ? c.color : '#6366f1'}
                      onChange={(e) => set({ color: e.target.value })}
                      className="w-10 h-10 cursor-pointer border border-slate-200 rounded" />
                    <span className="text-[11px] text-slate-400">Pick any colour with the wheel</span>
                  </div>
                </Field>
                <Field label="Start">
                  <input type="date" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} onBlur={commit} className={inputCls} />
                </Field>
                <Field label="Finish">
                  <input type="date" value={form.finish} onChange={(e) => setForm((f) => ({ ...f, finish: e.target.value }))} onBlur={commit} className={inputCls} />
                </Field>
                <Field label="Comment">
                  <input type="text" value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} onBlur={commit} className={inputCls} />
                </Field>
              </div>

              <GradeEditor course={c.course} abbrev={c.abbrev} code={c.code} />

              <Syllabus course={c.course} abbrev={c.abbrev} code={c.code} />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-slate-200 mt-3">
            <button onClick={confirmDelete} className="text-sm px-4 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer">Delete course</button>
          </div>
        </div>
      </div>
    </div>
  )
}
