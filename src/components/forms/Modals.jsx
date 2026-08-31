import { useState, useMemo, useEffect } from 'react'
import { useAppData } from '../../context/AppDataContext'
import CourseSelect from '../CourseSelect'
import { getCourseStyle } from '../../utils/helpers'
import { DEFAULT_CATEGORIES, DEFAULT_LOCATIONS, DEFAULT_TRANSPORT, META_OPTIONS_KEY, DEADLINE_TYPES, ADDITIONAL_CATEGORIES } from '../../config'

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
    return { course: '', abbrev: '', code: '', ec: '', start: '', finish: '', year: '', quartile: '', status: 'In Progress', scope: 'curriculum', comment: '', estHours: '' }
  }
  const st = (c.status || '').toLowerCase()
  return {
    course: c.course || '',
    abbrev: c.abbrev || '',
    code: c.code || '',
    ec: c.ec != null ? String(c.ec) : '',
    start: c.start || '',
    finish: c.finish || '',
    year: c.year || '',
    quartile: c.quartile || '',
    status: st === 'completed' ? 'Completed' : st === 'planned' ? 'Planned' : 'In Progress',
    scope: (c.scope || '').toLowerCase() || 'curriculum',
    comment: c.comment || '',
    estHours: c.estHours != null ? String(c.estHours) : '',
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
  // to-do or class in the planner / dashboard) pre-fills everything that is
  // already known — course, date, times, category, location, lecture ID — while
  // an `initial` entry seeds an edit; otherwise the form starts blank.
  useEffect(() => {
    if (!open) return
    if (preset) {
      const dh = preset.durationHours
      setForm({
        ...seedSession(null),
        course: preset.course || '',
        notes: preset.task || preset.notes || '',
        date: preset.date || new Date().toISOString().slice(0, 10),
        startTime: preset.startTime || '',
        endTime: preset.endTime || '',
        durationHours: dh != null && dh !== '' ? String(dh) : '',
        category: preset.category || '',
        project: preset.project || '',
        location: preset.location || '',
        lectureId: preset.lectureId || '',
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
        if (c.id && !c.done) ids.push({ course: g.course, courseId: g.courseId, id: c.id, type: c.type })
      }
    }
    for (const i of content || []) {
      if (i.contentId && i.course && !i.done) ids.push({ course: i.course, courseId: i.courseId, id: i.contentId, type: i.type })
    }
    return ids
  }, [gradeComponents, content])

  // The selected course's stable id, so projects and lectures are matched by
  // the course_id foreign key (no more name/abbrev/code string matching).
  const selectedCourseId = useMemo(() => {
    if (!form.course) return null
    const c = (masterCourses || []).find(c => c.course === form.course)
    return c?.id || c?.code || null
  }, [form.course, masterCourses])

  const projectOptions = useMemo(() =>
    (content || []).filter(i => {
      if (!i.contentId || i.done || !(i.deadline || DEADLINE_TYPES.has(i.type))) return false
      return selectedCourseId ? (i.courseId === selectedCourseId || i.course === form.course) : i.course === form.course
    }),
  [content, selectedCourseId, form.course])

  // Lecture IDs strictly for the selected course (nothing else leaks in), in
  // natural number order (lecture 2, lecture 4, lecture 8, …). Requires a
  // course — with none picked the list stays empty.
  const filteredLectureIds = useMemo(() => {
    if (!form.course) return []
    return lectureIds
      .filter(a => selectedCourseId ? (a.courseId === selectedCourseId || a.course === form.course) : a.course === form.course)
      .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
  }, [lectureIds, selectedCourseId, form.course])

  function now() {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // Display parts of the canonical durationHours value as whole hours + minutes.
  const totalDurMins = Math.round((parseFloat(String(form.durationHours).replace(',', '.')) || 0) * 60)
  const durParts = {
    h: form.durationHours ? String(Math.floor(totalDurMins / 60)) : '',
    m: form.durationHours && totalDurMins % 60 ? String(totalDurMins % 60) : '',
  }

  function logNow() {
    const d = new Date()
    const dateStr = d.toISOString().slice(0, 10)
    const t = now()
    // Fill ONLY the end time with "now" — the start time stays empty so it can
    // be typed in freely, after which the duration follows automatically
    // (filling both start and end would lock the hours field at a computed 0).
    setForm(f => ({ ...f, date: f.date || dateStr, startTime: '', endTime: t, durationHours: '' }))
  }

  function timeToMin(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''))
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null
  }

  function minToTime(mins) {
    const m = ((Math.round(mins) % 1440) + 1440) % 1440
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }

  // Auto-fill: from any two of start/end/duration compute the third.
  function computeDerived(next, changed) {
    const s = timeToMin(next.startTime)
    const e = timeToMin(next.endTime)
    const h = next.durationHours === '' ? null : parseFloat(String(next.durationHours).replace(',', '.'))
    // The user is editing the duration (hours/minutes) directly — it wins over
    // any start/end pair, so typing "12" minutes isn't overwritten on the next
    // keystroke by a recompute from start+end (which typing the first digit
    // just back-filled). Derive the missing time from the duration instead.
    if (changed === 'durationHours') {
      if (s != null && h != null && isFinite(h)) next.endTime = minToTime(s + h * 60)
      else if (e != null && h != null && isFinite(h)) next.startTime = minToTime(e - h * 60)
      return next
    }
    if (s != null && e != null) {
      const mins = e - s + (e < s ? 1440 : 0)
      if (mins >= 0) next.durationHours = String(+(mins / 60).toFixed(2))
      return next
    }
    if (s != null && h != null && isFinite(h) && changed !== 'startTime') {
      next.endTime = minToTime(s + h * 60)
      return next
    }
    if (e != null && h != null && isFinite(h) && changed !== 'endTime') {
      next.startTime = minToTime(e - h * 60)
      return next
    }
    return next
  }

  function setField(field, value) {
    setForm(prev => computeDerived({ ...prev, [field]: value }, field))
  }

  // Duration is entered as separate hours + minutes fields (no decimals
  // needed); both write back into the canonical durationHours value.
  function setDurationPart(part, raw) {
    setForm(prev => {
      const mins = Math.round((parseFloat(String(prev.durationHours).replace(',', '.')) || 0) * 60)
      const hRaw = part === 'h' ? raw : String(Math.floor(mins / 60))
      const mRaw = part === 'm' ? raw : String(mins % 60 || '')
      const total = (parseInt(hRaw, 10) || 0) * 60 + (parseInt(mRaw, 10) || 0)
      return computeDerived({ ...prev, durationHours: total ? String(total / 60) : '' }, 'durationHours')
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
    const dh = parseFloat(String(form.durationHours).replace(',', '.')) || 0
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
    else {
      // A session logged from ticking off a Daily Planner item is linked to it
      // (plan_id); the planner row is then updated through the relation.
      if (preset?.plannerId) payload.planId = preset.plannerId
      addSession(payload)
    }
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <input type="text" inputMode="numeric" value={durParts.h} onChange={e => setDurationPart('h', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" placeholder="e.g. 1" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Minutes</label>
            <input type="text" inputMode="numeric" value={durParts.m} onChange={e => setDurationPart('m', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" placeholder="e.g. 30" />
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
          <select value={form.project || ''} onChange={e => setForm(f => ({ ...f, project: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
            <option value="">None</option>
            {projectOptions.map(p => (
              <option key={p.contentId} value={p.contentId}>{p.contentId} · {p.description || p.type}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Component / Lecture ID</label>
          <select value={form.lectureId || ''} onChange={e => setForm(f => ({ ...f, lectureId: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
            <option value="">None</option>
            {filteredLectureIds.map(a => <option key={a.id} value={a.id}>{a.id} — {a.course} ({a.type})</option>)}
          </select>
          {!form.course && <p className="text-[10px] text-slate-400 mt-1">Pick a course to see its lecture IDs.</p>}
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
  const { addCourse, updateCourse } = useAppData()
  const [form, setForm] = useState(() => seedCourse(initial))
  const isEdit = !!initial

  function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      course: form.course,
      abbrev: form.abbrev || null,
      code: form.code || null,
      ec: form.ec ? parseFloat(form.ec) : null,
      start: form.start || null,
      finish: form.finish || null,
      quartile: form.quartile || null,
      status: form.status === 'Completed' ? 'completed' : form.status === 'Planned' ? 'planned' : 'in progress',
      scope: form.scope,
      comment: form.comment || null,
      estHours: form.estHours ? parseFloat(form.estHours) : null,
      timeMin: 0, timeHours: 0, grade: null,
      exam: null, assignment: null, laboratory: null,
      estTimeHours: null, assTimeHours: null, material: null,
    }
    if (isEdit && initial?.id) updateCourse(initial.id, payload)
    else addCourse(payload)
    setForm({ course: '', abbrev: '', code: '', ec: '', start: '', finish: '', year: '', quartile: '', status: 'In Progress', scope: 'curriculum', comment: '', estHours: '' })
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
            <label className="text-xs text-slate-500 block mb-1">Abbrev. (used for IDs)</label>
            <input type="text" value={form.abbrev} placeholder="e.g. ASDfR" onChange={e => setForm(f => ({ ...f, abbrev: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Course code</label>
            <input type="text" value={form.code} placeholder="e.g. 202400250" onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">EC</label>
            <input type="text" inputMode="decimal" value={form.ec} onChange={e => setForm(f => ({ ...f, ec: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Quartile</label>
            <select value={form.quartile} onChange={e => setForm(f => ({ ...f, quartile: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">—</option>
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="In Progress">In Progress (active)</option>
              <option value="Planned">Planned</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Scope</label>
            <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="curriculum">Curriculum (counts toward degree)</option>
              <option value="extra">Extra (excluded from average/ECTS)</option>
            </select>
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
          <div>
            <label className="text-xs text-slate-500 block mb-1">Estimated hours (optional)</label>
            <input type="text" inputMode="decimal" value={form.estHours} placeholder="e.g. 160" onChange={e => setForm(f => ({ ...f, estHours: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
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

// Shown when closing a live session: lets you match the session to one of
// today's Daily Planner items, so the session logger opens pre-filled with the
// item's course + note while keeping the session's own start/end times.
export function PlannerMatchModal({ open, items, onClose, onPick, onSkip }) {
  return (
    <Modal open={open} onClose={onClose} title="Was this session in your Daily Planner?">
      <p className="text-xs text-slate-500 mb-3">
        Pick the planner item this session was working on — its course and note are pre-filled, and the start/end times come from the session itself.
      </p>
      <div className="space-y-1.5 max-h-[45vh] overflow-y-auto mb-3">
        {items.map(item => (
          <button key={item.id} type="button" onClick={() => onPick(item)}
            className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <span className={`w-2 h-2 rounded-full shrink-0 ${getCourseStyle(item.course).dot}`} style={getCourseStyle(item.course).dotCss} />
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-medium text-slate-700 truncate">{item.task || '—'}</span>
              <span className="block text-[10px] text-slate-400 truncate">{item.course}{item.plannedHours ? ` · ${item.plannedHours}h` : ''}{item.done ? ' · done' : ''}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">Cancel</button>
        <button type="button" onClick={onSkip} className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Skip — open logger without an item</button>
      </div>
    </Modal>
  )
}

function localISODate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function seedAdditional(p) {
  const today = localISODate()
  if (!p) {
    return { date: today, category: 'Work', task: '', startTime: '', endTime: '', hours: '', efficiency: '', wellbeing: '', location: '', notes: '' }
  }
  return {
    date: p.date || today,
    category: p.category || p.course || 'Work',
    task: p.task || '',
    startTime: (p.startTime || '').slice(0, 5),
    endTime: (p.endTime || '').slice(0, 5),
    hours: p.hours ? String(p.hours) : '',
    efficiency: p.efficiency != null ? String(p.efficiency) : '',
    wellbeing: p.wellbeing != null ? String(p.wellbeing) : '',
    location: p.location || '',
    notes: p.notes || '',
  }
}

// Dedicated logging window for additional-time items (work / exercise / other
// obligations / commute / social). Opens when checking one of those off in the
// planner or dashboard, or from the "Additional Time Log" page. Never a study
// session — these hours count toward weekly capacity, not study.
export function AdditionalLogModal({ open, onClose, preset, existingId }) {
  const { addAdditionalEntry, updateAdditionalEntry } = useAppData()
  const [meta] = useState(() => {
    try { return JSON.parse(localStorage.getItem(META_OPTIONS_KEY)) || {} } catch { return {} }
  })
  const [form, setForm] = useState(() => seedAdditional(preset))

  const locations = meta.locations?.length ? meta.locations : DEFAULT_LOCATIONS

  // Re-seed the form every time the dialog opens (checking off an item always
  // opens with that item's known data pre-filled).
  useEffect(() => {
    if (!open) return
    setForm(seedAdditional(preset))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function timeToMin(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''))
    return m ? +m[1] * 60 + +m[2] : null
  }

  // Start + end auto-fill the hours field; a manually typed hours value sticks.
  function setField(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'hours') return next
      const s = timeToMin(next.startTime)
      const e = timeToMin(next.endTime)
      if (s != null && e != null && e > s) next.hours = String(+( (e - s) / 60 ).toFixed(2))
      return next
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.category) {
      alert('Pick a category first.')
      return
    }
    const payload = {
      date: form.date,
      category: form.category,
      task: form.task.trim(),
      hours: parseFloat(String(form.hours).replace(',', '.')) || 0,
      startTime: form.startTime ? form.startTime + ':00' : '',
      endTime: form.endTime ? form.endTime + ':00' : '',
      efficiency: form.efficiency !== '' ? parseInt(form.efficiency, 10) : null,
      wellbeing: form.wellbeing !== '' ? parseInt(form.wellbeing, 10) : null,
      location: form.location || null,
      notes: form.notes || null,
      done: 'done',
    }
    if (existingId) updateAdditionalEntry(existingId, payload)
    else addAdditionalEntry(payload)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={existingId ? 'Edit Additional Time' : 'Log Additional Time'}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Date *</label>
            <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Category *</label>
            <select required value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              {ADDITIONAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">What was it?</label>
          <input type="text" value={form.task} placeholder="e.g. Evening shift, 5k run, family dinner…" onChange={e => setForm(f => ({ ...f, task: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <input type="text" inputMode="decimal" value={form.hours} placeholder="e.g. 2.5" onChange={e => setField('hours', e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Location</label>
            <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300">
              <option value="">—</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
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

        <div>
          <label className="text-xs text-slate-500 block mb-1">Note</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300" rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button type="submit" className="text-sm px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 cursor-pointer">{existingId ? 'Save Changes' : 'Log It'}</button>
        </div>
      </form>
    </Modal>
  )
}
