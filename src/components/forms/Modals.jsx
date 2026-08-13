import { useState, useMemo } from 'react'
import { useAppData } from '../../context/AppDataContext'

function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function AddSessionModal({ open, onClose }) {
  const { addSession, masterCourses, gradeComponents } = useAppData()
  const [form, setForm] = useState({
    date: '', startTime: '', endTime: '', durationHours: '',
    course: '', category: '', project: '', location: '',
    efficiency: '', wellbeing: '', lectureId: '',
    transportMode: '', commuteTime: '', notes: '',
  })

  const assignmentIds = useMemo(() => {
    const ids = []
    for (const g of gradeComponents) {
      for (const c of g.components) {
        if (c.id) ids.push({ course: g.course, id: c.id, type: c.type })
      }
    }
    return ids
  }, [gradeComponents])

  function now() {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function fillNow() {
    const d = new Date()
    const dateStr = d.toISOString().slice(0, 10)
    setForm(f => ({ ...f, date: dateStr, startTime: now() }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const start = form.startTime ? form.startTime + ':00' : ''
    const end = form.endTime ? form.endTime + ':00' : ''
    const dh = parseFloat(form.durationHours) || 0
    addSession({
      date: form.date,
      startTime: start,
      endTime: end,
      durationHours: dh,
      durationMinutes: Math.round(dh * 60) || 0,
      course: form.course,
      category: form.category,
      project: form.project || null,
      location: form.location,
      efficiency: form.efficiency ? parseInt(form.efficiency, 10) : null,
      wellbeing: form.wellbeing ? parseInt(form.wellbeing, 10) : null,
      lectureId: form.lectureId || null,
      transportMode: form.transportMode || null,
      commuteTime: form.commuteTime ? parseFloat(form.commuteTime) : null,
      notes: form.notes || null,
    })
    setForm({ date: '', startTime: '', endTime: '', durationHours: '', course: '', category: '', project: '', location: '', efficiency: '', wellbeing: '', lectureId: '', transportMode: '', commuteTime: '', notes: '' })
    onClose()
  }

  const categories = ['Studying', 'Lecture', 'Project Work', 'Group Work', 'Practical', 'Exam', 'Exam Prep', 'Exercise', 'Meeting', 'Presentation', 'Work', 'Other']
  const locations = ['Home', 'University', 'Parents', 'Home Office', 'HomeOffice', 'Elsewhere', 'Other', 'Work (Epe)']

  return (
    <Modal open={open} onClose={onClose} title="Add Study Session">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={fillNow} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">Start Now</button>
          <span className="text-xs text-slate-400 self-center">Pre-fills date &amp; start time. You can add end time later.</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Date *</label>
            <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Course *</label>
            <select required value={form.course} onChange={e => setForm(f => ({ ...f, course: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">Select…</option>
              {masterCourses.map(c => <option key={c.course} value={c.course}>{c.course}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Start</label>
            <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">End</label>
            <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Hours</label>
            <input type="text" inputMode="decimal" value={form.durationHours} onChange={e => setForm(f => ({ ...f, durationHours: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" placeholder="e.g. 2.5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">Select…</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Location</label>
            <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">Select…</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Project</label>
          <input type="text" value={form.project} onChange={e => setForm(f => ({ ...f, project: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" placeholder="e.g. ASDfR 3" />
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Assignment / Exam ID</label>
          <select value={form.lectureId} onChange={e => setForm(f => ({ ...f, lectureId: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
            <option value="">None</option>
            {assignmentIds.map(a => <option key={a.id} value={a.id}>{a.id} — {a.course} ({a.type})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Efficiency (1-10)</label>
            <input type="text" inputMode="numeric" value={form.efficiency} onChange={e => setForm(f => ({ ...f, efficiency: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Wellbeing (1-10)</label>
            <input type="text" inputMode="numeric" value={form.wellbeing} onChange={e => setForm(f => ({ ...f, wellbeing: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Transport</label>
            <select value={form.transportMode} onChange={e => setForm(f => ({ ...f, transportMode: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">None</option>
              <option value="Bicycle">Bicycle</option>
              <option value="Public Transport">Public Transport</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Commute (min)</label>
            <input type="text" inputMode="numeric" value={form.commuteTime} onChange={e => setForm(f => ({ ...f, commuteTime: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button type="submit" className="text-sm px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer">Add Session</button>
        </div>
      </form>
    </Modal>
  )
}

export function AddDeadlineModal({ open, onClose }) {
  const { addDeadline } = useAppData()
  const [form, setForm] = useState({ description: '', date: '', time: '', urgency: 'Medium' })

  function handleSubmit(e) {
    e.preventDefault()
    addDeadline({ description: form.description, date: form.date, time: parseFloat(form.time) || 0, sessions: 1, thisWeek: 0, today: 0, done: 0, urgency: form.urgency })
    setForm({ description: '', date: '', time: '', urgency: 'Medium' })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Deadline">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Description *</label>
          <input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Date *</label>
            <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Est. Hours</label>
            <input type="text" inputMode="decimal" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Urgency</label>
          <select value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Extremely High">Extremely High</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button type="submit" className="text-sm px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer">Add Deadline</button>
        </div>
      </form>
    </Modal>
  )
}

export function AddCourseModal({ open, onClose }) {
  const { addCourse } = useAppData()
  const [form, setForm] = useState({ course: '', abbrev: '', ec: '', start: '', finish: '', comment: '' })
  const [components, setComponents] = useState([
    { type: 'assignment', id: '', weight: '', grade: '' },
  ])

  function addComp() {
    setComponents([...components, { type: 'assignment', id: '', weight: '', grade: '' }])
  }

  function removeComp(i) {
    if (components.length <= 1) return
    setComponents(components.filter((_, idx) => idx !== i))
  }

  function updateComp(i, field, value) {
    const updated = [...components]
    updated[i] = { ...updated[i], [field]: value }
    setComponents(updated)
  }

  function handleSubmit(e) {
    e.preventDefault()
    addCourse({
      course: form.course,
      abbrev: form.abbrev || null,
      ec: form.ec ? parseFloat(form.ec) : null,
      start: form.start || null,
      finish: form.finish || null,
      comment: form.comment || null,
      year: null, quartile: null, timeMin: 0, timeHours: 0, grade: null,
      exam: null, assignment: null, laboratory: null,
      estTimeHours: null, assTimeHours: null, material: null,
      _gradeComponents: components
        .filter(c => c.weight)
        .map(c => ({
          type: c.type,
          id: c.id || null,
          weight: parseFloat(c.weight) || null,
          grade: c.grade ? parseFloat(c.grade) : null,
        })),
    })
    setForm({ course: '', abbrev: '', ec: '', start: '', finish: '', comment: '' })
    setComponents([{ type: 'assignment', id: '', weight: '', grade: '' }])
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Course">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Course Name *</label>
          <input type="text" required value={form.course} onChange={e => setForm(f => ({ ...f, course: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Abbrev.</label>
            <input type="text" value={form.abbrev} onChange={e => setForm(f => ({ ...f, abbrev: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">EC</label>
            <input type="text" inputMode="decimal" value={form.ec} onChange={e => setForm(f => ({ ...f, ec: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Start</label>
            <input type="date" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Finish</label>
            <input type="date" value={form.finish} onChange={e => setForm(f => ({ ...f, finish: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-xs font-medium text-slate-700">Exams / Assignments</p>
          {components.map((comp, i) => (
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
              {components.length > 1 && <button onClick={() => removeComp(i)} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">×</button>}
            </div>
          ))}
          <button type="button" onClick={addComp} className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer">+ Add component</button>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Comment</label>
          <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" rows={2} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button type="submit" className="text-sm px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer">Add Course</button>
        </div>
      </form>
    </Modal>
  )
}
