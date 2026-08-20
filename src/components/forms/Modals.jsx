import { useState, useMemo, useEffect } from 'react'
import { useAppData } from '../../context/AppDataContext'
import CourseSelect from '../CourseSelect'
import { DEFAULT_CATEGORIES, DEFAULT_LOCATIONS, DEFAULT_TRANSPORT, META_OPTIONS_KEY } from '../../config'

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

function seedSession(e) {
  if (!e) {
    return {
      date: '', startTime: '', endTime: '', durationHours: '',
      course: '', category: '', project: '', location: '',
      efficiency: '', wellbeing: '', lectureId: '',
      transportMode: '', commuteTime: '', notes: '',
    }
  }
  return {
    date: e.date || '',
    startTime: (e.startTime || '').slice(0, 5),
    endTime: (e.endTime || '').slice(0, 5),
    durationHours: e.durationHours ? String(e.durationHours) : '',
    course: e.course || '',
    category: e.category || '',
    project: e.project || '',
    location: e.location || '',
    efficiency: e.efficiency != null ? String(e.efficiency) : '',
    wellbeing: e.wellbeing != null ? String(e.wellbeing) : '',
    lectureId: e.lectureId || '',
    transportMode: e.transportMode || '',
    commuteTime: e.commuteTime != null ? String(e.commuteTime) : '',
    notes: e.notes || '',
  }
}

function seedDeadline(d) {
  if (!d) return { description: '', course: '', type: 'assignment', date: '', end: '', time: '', urgency: 'Medium' }
  return {
    description: d.topic || d.description || '',
    course: d.course || '',
    type: d.type || 'assignment',
    date: d.deadline || d.date || '',
    end: d.end || '',
    time: d.hoursSpent != null ? String(d.hoursSpent) : '',
    urgency: d.urgency || 'Medium',
  }
}

function seedCourse(c) {
  if (!c) {
    return { course: '', abbrev: '', ec: '', start: '', finish: '', comment: '' }
  }
  return {
    course: c.course || '',
    abbrev: c.abbrev || '',
    ec: c.ec != null ? String(c.ec) : '',
    start: c.start || '',
    finish: c.finish || '',
    comment: c.comment || '',
  }
}

// Clickable 1-10 score picker (efficiency / wellbeing). Clicking the selected
// ball again clears the score.
function ScorePicker({ value, onChange }) {
  const current = value === '' || value == null ? null : parseInt(value, 10)
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1">
        {Array.from({ length: 10 }, (_, i) => {
          const v = i + 1
          const active = current != null && current >= v
          return (
            <button key={v} type="button"
              onClick={() => onChange(active && current === v ? '' : String(v))}
              className={`w-5 h-5 rounded-full transition-transform hover:scale-110 cursor-pointer ${active ? 'bg-slate-800' : 'bg-slate-200'}`}
              title={`${v}`} />
          )
        })}
      </div>
      <span className="text-xs text-slate-400">{current != null ? current : '—'}</span>
    </div>
  )
}

function ListEditor({ label, items, onAdd, onRemove }) {
  const [val, setVal] = useState('')
  return (
    <div>
      <p className="text-xs font-medium text-slate-600 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1 mb-1">
        {items.map(i => (
          <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {i}
            <button type="button" onClick={() => onRemove(i)} className="text-slate-400 hover:text-red-500 cursor-pointer">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onAdd(val); setVal('') } }}
          className="flex-1 text-xs border border-slate-200 rounded px-2 py-1" placeholder={`Add ${label.toLowerCase()}…`} />
        <button type="button" onClick={() => { onAdd(val); setVal('') }}
          className="text-xs px-2 py-1 bg-slate-700 text-white rounded cursor-pointer">Add</button>
      </div>
    </div>
  )
}

export function AddSessionModal({ open, onClose, initial, preset }) {
  const { addSession, updateSession, masterCourses, gradeComponents, content } = useAppData()
  const [form, setForm] = useState(() => seedSession(initial))
  const [manageOpen, setManageOpen] = useState(false)
  const [meta, setMeta] = useState(() => {
    try { return JSON.parse(localStorage.getItem(META_OPTIONS_KEY)) || {} } catch { return {} }
  })
  const isEdit = !!initial

  // Re-seed the form every time the dialog opens. A preset (from checking off a
  // to-do in the planner) pre-fills the course and notes; an `initial` entry
  // seeds an edit; otherwise the form starts blank.
  useEffect(() => {
    if (!open) return
    if (preset) {
      setForm({
        ...seedSession(null),
        course: preset.course || '',
        notes: preset.task || preset.notes || '',
        date: new Date().toISOString().slice(0, 10),
      })
    } else {
      setForm(seedSession(initial))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const categories = meta.categories?.length ? meta.categories : DEFAULT_CATEGORIES
  const locations = meta.locations?.length ? meta.locations : DEFAULT_LOCATIONS
  const transports = meta.transport?.length ? meta.transport : DEFAULT_TRANSPORT

  const lectureIds = useMemo(() => {
    const ids = []
    for (const g of gradeComponents || []) {
      for (const c of g.components || []) {
        if (c.id) ids.push({ course: g.course, id: c.id, type: c.type })
      }
    }
    for (const i of content || []) {
      if (i.contentId && i.course) ids.push({ course: i.course, id: i.contentId, type: i.type })
    }
    return ids
  }, [gradeComponents, content])

  function now() {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function logNow() {
    const d = new Date()
    const dateStr = d.toISOString().slice(0, 10)
    const t = now()
    setForm(f => ({ ...f, date: dateStr, startTime: t, endTime: t, durationHours: '' }))
  }

  function timeToMin(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''))
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null
  }

  function minToTime(mins) {
    const m = ((Math.round(mins) % 1440) + 1440) % 1440
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }

  // Auto-fill: from any two of start/end/hours compute the third.
  function setField(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      const s = timeToMin(next.startTime)
      const e = timeToMin(next.endTime)
      const h = next.durationHours === '' ? null : parseFloat(next.durationHours)
      if (s != null && e != null) {
        const mins = e - s + (e < s ? 1440 : 0)
        if (mins >= 0) next.durationHours = String(+(mins / 60).toFixed(2))
        return next
      }
      if (s != null && h != null && isFinite(h) && field !== 'startTime') {
        next.endTime = minToTime(s + h * 60)
        return next
      }
      if (e != null && h != null && isFinite(h) && field !== 'endTime') {
        next.startTime = minToTime(e - h * 60)
        return next
      }
      return next
    })
  }

  function saveMeta(patch) {
    setMeta(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(META_OPTIONS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function addOption(key, value) {
    const v = String(value).trim()
    if (!v) return
    const list = key === 'categories' ? categories : key === 'locations' ? locations : transports
    if (list.includes(v)) return
    saveMeta({ [key]: [...list, v] })
  }

  function removeOption(key, value) {
    const list = key === 'categories' ? categories : key === 'locations' ? locations : transports
    saveMeta({ [key]: list.filter(x => x !== value) })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.course) {
      alert('Pick a course for this session first.')
      return
    }
    const start = form.startTime ? form.startTime + ':00' : ''
    const end = form.endTime ? form.endTime + ':00' : ''
    const dh = parseFloat(form.durationHours) || 0
    const payload = {
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
    }
    if (isEdit && initial?.id) updateSession(initial.id, payload)
    else addSession(payload)
    setForm({ date: '', startTime: '', endTime: '', durationHours: '', course: '', category: '', project: '', location: '', efficiency: '', wellbeing: '', lectureId: '', transportMode: '', commuteTime: '', notes: '' })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Study Session' : 'Add Study Session'}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={logNow} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">Log Now</button>
          <span className="text-xs text-slate-400 self-center">Pre-fills date, start and end with the current time — adjust the end time when you stop.</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Date *</label>
            <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Course *</label>
            <CourseSelect value={form.course} onChange={v => setForm(f => ({ ...f, course: v }))} courses={masterCourses} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Start</label>
            <input type="time" value={form.startTime} onChange={e => setField('startTime', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">End</label>
            <input type="time" value={form.endTime} onChange={e => setField('endTime', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Hours</label>
            <input type="text" inputMode="decimal" value={form.durationHours} onChange={e => setField('durationHours', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" placeholder="e.g. 2.5" />
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
            {lectureIds.map(a => <option key={a.id} value={a.id}>{a.id} — {a.course} ({a.type})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Efficiency (1-10)</label>
            <ScorePicker value={form.efficiency} onChange={v => setForm(f => ({ ...f, efficiency: v }))} />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Wellbeing (1-10)</label>
            <ScorePicker value={form.wellbeing} onChange={v => setForm(f => ({ ...f, wellbeing: v }))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Transport</label>
            <select value={form.transportMode} onChange={e => setForm(f => ({ ...f, transportMode: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">None</option>
              {transports.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Commute (min)</label>
            <input type="text" inputMode="numeric" value={form.commuteTime} onChange={e => setForm(f => ({ ...f, commuteTime: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={() => setManageOpen(o => !o)}
            className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">
            {manageOpen ? 'Hide manage options' : 'Manage categories, locations & transport…'}
          </button>
        </div>

        {manageOpen && (
          <div className="border border-slate-200 rounded-lg p-3 space-y-3">
            <ListEditor label="Categories" items={categories} onAdd={v => addOption('categories', v)} onRemove={v => removeOption('categories', v)} />
            <ListEditor label="Locations" items={locations} onAdd={v => addOption('locations', v)} onRemove={v => removeOption('locations', v)} />
            <ListEditor label="Transport modes" items={transports} onAdd={v => addOption('transport', v)} onRemove={v => removeOption('transport', v)} />
          </div>
        )}

        <div>
          <label className="text-xs text-slate-500 block mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button type="submit" className="text-sm px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer">{isEdit ? 'Save Changes' : 'Add Session'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function AddDeadlineModal({ open, onClose, initial }) {
  const { addDeadline, updateDeadline, masterCourses } = useAppData()
  const [form, setForm] = useState(() => seedDeadline(initial))
  const isEdit = !!initial

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.course) {
      alert('Pick a course for this item first.')
      return
    }
    const payload = {
      course: form.course,
      description: form.description,
      date: form.date,
      end: form.end || '',
      time: parseFloat(form.time) || 0,
      sessions: 1, thisWeek: 0, today: 0, done: 0,
      urgency: form.urgency,
      type: form.type,
    }
    if (isEdit && initial?.id) updateDeadline(initial.id, payload)
    else addDeadline(payload)
    setForm({ description: '', course: '', type: 'assignment', date: '', end: '', time: '', urgency: 'Medium' })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Deadline' : 'Add Deadline'}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Course *</label>
          <select required value={form.course} onChange={e => setForm(f => ({ ...f, course: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
            <option value="">Select…</option>
            {masterCourses.map(c => <option key={c.course} value={c.course}>{c.course}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Description *</label>
          <input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="assignment">Assignment</option>
              <option value="project">Project</option>
              <option value="exam">Exam</option>
              <option value="quiz">Quiz</option>
              <option value="presentation">Presentation</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Est. Hours</label>
            <input type="text" inputMode="decimal" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Date (due) *</label>
            <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Due time</label>
            <input type="time" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
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
          <button type="submit" className="text-sm px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer">{isEdit ? 'Save Changes' : 'Add Deadline'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function AddCourseModal({ open, onClose, initial }) {
  const { addCourse, updateCourse, gradeComponents } = useAppData()
  const existingGroup = initial?.course ? gradeComponents.find(g => g.course === initial.course) : null
  const [form, setForm] = useState(() => seedCourse(initial))
  const [components, setComponents] = useState(() =>
    existingGroup?.components?.map(c => ({
      type: c.type || 'assignment',
      id: c.id || '',
      weight: c.weight != null ? String(c.weight) : '',
      grade: c.grade != null ? String(c.grade) : '',
    })) || [
      { type: 'assignment', id: '', weight: '', grade: '' },
    ]
  )
  const isEdit = !!initial

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
    const payload = {
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
    }
    if (isEdit && initial?.id) updateCourse(initial.id, payload)
    else addCourse(payload)
    setForm({ course: '', abbrev: '', ec: '', start: '', finish: '', comment: '' })
    setComponents([{ type: 'assignment', id: '', weight: '', grade: '' }])
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Course' : 'Add Course'}>
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
          <button type="submit" className="text-sm px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer">{isEdit ? 'Save Changes' : 'Add Course'}</button>
        </div>
      </form>
    </Modal>
  )
}
