import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { deriveAbbrev } from '../drive/driveClient'

const TYPE_LABELS = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lectorial: 'Lectorial',
  practical: 'Practical',
  presentation: 'Presentation',
  selfstudy: 'Self study',
  seminar: 'Seminar',
  project: 'Project',
  assignment: 'Assignment',
  exam: 'Exam',
  quiz: 'Quiz',
  other: 'Other',
}

const SCHEDULED_TYPES = ['lecture', 'tutorial', 'lectorial', 'practical', 'presentation', 'selfstudy', 'seminar']

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The prefix used to build IDs: the course's abbreviation when set, else the
// course code, else a derived abbreviation (never the full course name).
function idBase(course, abbrev, code) {
  return (abbrev || code || deriveAbbrev(course)).replace(/\s+/g, '-')
}

// Lecture IDs are {abbrev}-NN (e.g. ASDfR-01).
function nextContentId(course, abbrev, code, items) {
  const a = idBase(course, abbrev, code)
  const pat = new RegExp(`^${escapeRe(a)}[- ]?(\\d+)$`, 'i')
  let max = 0
  for (const i of items || []) {
    if (i.course !== course) continue
    const m = i.contentId && pat.exec(String(i.contentId))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${a}-${String(max + 1).padStart(2, '0')}`
}

// Project/deadline IDs are {abbrev}{n} without padding (e.g. ASDfR1).
function nextProjectId(course, abbrev, code, items) {
  const a = idBase(course, abbrev, code)
  const pat = new RegExp(`^${escapeRe(a)}[- ]?(\\d+)$`, 'i')
  let max = 0
  for (const i of items || []) {
    if (i.course !== course) continue
    const m = i.contentId && pat.exec(String(i.contentId))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${a}${max + 1}`
}

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = String(d).split('-')
  return day && m && y ? `${day}/${m}/${y}` : d
}

function typeBadge(type) {
  const colors = {
    exam: 'bg-red-100 text-red-700',
    assignment: 'bg-orange-100 text-orange-700',
    project: 'bg-violet-100 text-violet-700',
    presentation: 'bg-fuchsia-100 text-fuchsia-700',
    tutorial: 'bg-sky-100 text-sky-700',
    lectorial: 'bg-teal-100 text-teal-700',
    practical: 'bg-cyan-100 text-cyan-700',
    selfstudy: 'bg-slate-100 text-slate-600',
    seminar: 'bg-emerald-100 text-emerald-700',
  }
  return colors[type] || 'bg-indigo-100 text-indigo-700'
}

export default function Syllabus({ course, abbrev, code }) {
  const { content, calendarEvents, addContentItem, updateContentItem, deleteContentItem } = useAppData()
  const [adding, setAdding] = useState(null)
  const [editing, setEditing] = useState(null)

  const items = useMemo(() => (content || []).filter(i => i.course === course), [content, course])
  const scheduled = items.filter(i => i.date && !i.deadline)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.start || '').localeCompare(b.start || ''))
  const deadlines = items.filter(i => i.deadline)
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))

  const courseEvents = useMemo(() =>
    (calendarEvents || []).filter(e => e.course === course)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || '')),
  [calendarEvents, course])

  const eventKey = e => `${e.date}|${e.startTime}`
  const eventLabel = e => `${fmtDate(e.date)} ${e.startTime || ''}${e.endTime ? `–${e.endTime}` : ''} · ${e.summary || ''}`

  function openAdd(mode) {
    setEditing(null)
    setAdding({
      mode,
      contentId: '',
      description: '',
      date: '',
      start: '',
      end: '',
      type: mode === 'lecture' ? 'lecture' : mode === 'project' ? 'project' : 'assignment',
    })
  }

  function submitAdd() {
    const a = adding
    const isLecture = a.mode === 'lecture'
    const id = a.contentId || (isLecture
      ? nextContentId(course, abbrev, code, content)
      : nextProjectId(course, abbrev, code, content))
    if (isLecture) {
      addContentItem({
        course,
        contentId: id,
        type: a.type || 'lecture',
        description: a.description || 'Lecture',
        date: a.date || null,
        start: a.start,
        end: a.end,
      })
    } else {
      addContentItem({
        course,
        contentId: id,
        type: a.type || 'assignment',
        description: a.description || (a.type || 'assignment'),
        deadline: a.date || null,
        end: a.end || '',
      })
    }
    setAdding(null)
  }

  function startEdit(item) {
    setAdding(null)
    setEditing({
      id: item.id,
      contentId: item.contentId || '',
      description: item.description || item.topic || '',
      type: item.type || 'other',
      date: item.date || item.deadline || '',
      start: item.start || '',
      end: item.end || '',
      linkKey: item.calId ? '' : (item.date ? `${item.date}|${item.start}` : ''),
    })
  }

  function saveEdit() {
    const e = editing
    const isScheduled = scheduled.some(s => s.id === e.id)
    const payload = { description: e.description, type: e.type, contentId: e.contentId || null }
    if (isScheduled) {
      payload.schedDate = e.date || null
      payload.start = e.start
      payload.end = e.end
    } else {
      payload.deadline = e.date || null
    }
    updateContentItem(e.id, payload)
    setEditing(null)
  }

  function linkEvent(key) {
    const ev = courseEvents.find(x => eventKey(x) === key)
    if (!ev) return
    const payload = { schedDate: ev.date, start: ev.startTime || '', end: ev.endTime || '', calId: ev.calId || null }
    updateContentItem(editing.id, payload)
    setEditing({ ...editing, date: ev.date, start: ev.startTime || '', end: ev.endTime || '', linkKey: key })
  }

  function Row({ item, isDeadline }) {
    const id = item.contentId || '—'
    const dateStr = isDeadline ? `due ${fmtDate(item.deadline)}` : `${fmtDate(item.date)}${item.start ? ` ${item.start}${item.end ? `–${item.end}` : ''}` : ''}`
    const isEditing = editing?.id === item.id
    if (isEditing) {
      return (
        <div className="flex flex-col gap-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50">
          <div className="flex items-center gap-1.5 flex-wrap">
            <input type="text" value={editing.contentId} onChange={e => setEditing(s => ({ ...s, contentId: e.target.value }))}
              placeholder="ID (e.g. AI4AR-03)"
              className="text-[10px] font-mono w-24 px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-600" />
            <select value={editing.type} onChange={e => setEditing(s => ({ ...s, type: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white">
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input type="date" value={editing.date} onChange={e => setEditing(s => ({ ...s, date: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
            {!isDeadline && (
              <>
                <input type="time" value={editing.start} onChange={e => setEditing(s => ({ ...s, start: e.target.value }))}
                  className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
                <input type="time" value={editing.end} onChange={e => setEditing(s => ({ ...s, end: e.target.value }))}
                  className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
              </>
            )}
          </div>
          {!isDeadline && courseEvents.length > 0 && (
            <select value={editing.linkKey || ''} onChange={e => e.target.value ? linkEvent(e.target.value) : null}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white w-full">
              <option value="">— link a calendar event (optional) —</option>
              {courseEvents.map(ev => <option key={eventKey(ev)} value={eventKey(ev)}>{eventLabel(ev)}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1.5">
            <input type="text" value={editing.description} onChange={e => setEditing(s => ({ ...s, description: e.target.value }))}
              className="flex-1 text-[11px] px-2 py-1 border border-slate-200 rounded bg-white" placeholder="Description" />
            <button onClick={saveEdit} className="text-[11px] px-2.5 py-1 bg-slate-700 text-white rounded cursor-pointer">Save</button>
            <button onClick={() => setEditing(null)} className="text-[11px] px-2 py-1 border border-slate-200 text-slate-500 rounded cursor-pointer">Esc</button>
          </div>
        </div>
      )
    }
    return (
      <div className="group flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0">{id}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${typeBadge(item.type)}`}>{TYPE_LABELS[item.type] || item.type}</span>
        <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">{dateStr}</span>
        <span className="text-[11px] text-slate-700 truncate">{item.description}</span>
        {item.calId && <span className="text-[9px] text-emerald-500 shrink-0">· Google</span>}
        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
          <button onClick={() => startEdit(item)} className="text-[10px] text-slate-400 hover:text-slate-700 cursor-pointer">Edit</button>
          <button onClick={() => { if (window.confirm(`Remove "${item.description}" from the syllabus?`)) deleteContentItem(item.id) }}
            className="text-[11px] text-red-400 hover:text-red-600 cursor-pointer">×</button>
        </div>
      </div>
    )
  }

  const AddForm = () => {
    if (!adding) return null
    return (
      <div className="flex flex-col gap-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50 mt-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <input type="text" value={adding.contentId} onChange={e => setAdding(a => ({ ...a, contentId: e.target.value }))}
            placeholder={adding.mode === 'lecture'
              ? nextContentId(course, abbrev, code, content)
              : nextProjectId(course, abbrev, code, content)}
            className="text-[10px] font-mono w-24 px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-600" />
          {adding.mode === 'lecture' ? (
            <select value={adding.type} onChange={e => setAdding(a => ({ ...a, type: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white">
              {SCHEDULED_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          ) : (
            <select value={adding.type} onChange={e => setAdding(a => ({ ...a, type: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white">
              <option value="project">Project</option>
              <option value="assignment">Assignment</option>
              <option value="exam">Exam</option>
              <option value="quiz">Quiz</option>
              <option value="presentation">Presentation</option>
              <option value="other">Other</option>
            </select>
          )}
          <input type="date" value={adding.date} onChange={e => setAdding(a => ({ ...a, date: e.target.value }))}
            className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
          {adding.mode === 'lecture' ? (
            <>
              <input type="time" value={adding.start} onChange={e => setAdding(a => ({ ...a, start: e.target.value }))}
                className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
              <input type="time" value={adding.end} onChange={e => setAdding(a => ({ ...a, end: e.target.value }))}
                className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
            </>
          ) : (
            <input type="time" value={adding.end} onChange={e => setAdding(a => ({ ...a, end: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" title="Due time (e.g. 17:00)" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <input type="text" value={adding.description} onChange={e => setAdding(a => ({ ...a, description: e.target.value }))}
            className="flex-1 text-[11px] px-2 py-1 border border-slate-200 rounded bg-white"
            placeholder={adding.mode === 'lecture' ? 'Description (e.g. Intro to X)' : 'Description (e.g. Report part 1)'} />
          <button onClick={submitAdd} className="text-[11px] px-2.5 py-1 bg-slate-700 text-white rounded cursor-pointer">Add</button>
          <button onClick={() => setAdding(null)} className="text-[11px] px-2 py-1 border border-slate-200 text-slate-500 rounded cursor-pointer">Esc</button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-slate-100 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Syllabus</p>
        <div className="flex items-center gap-1.5">
          <button onClick={() => openAdd('lecture')} className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">+ Lecture</button>
          <button onClick={() => openAdd('project')} className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">+ Project</button>
          <button onClick={() => openAdd('deadline')} className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">+ Deadline</button>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Scheduled</p>
        {scheduled.length === 0 && !adding && <p className="text-[11px] text-slate-300 italic">No classes yet — import your .ics files in the Calendar tab to auto-fill these.</p>}
        <div className="space-y-0.5">
          {scheduled.map(item => <Row key={item.id} item={item} isDeadline={false} />)}
        </div>
        {adding?.mode === 'lecture' && <AddForm />}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Deadlines</p>
        {deadlines.length === 0 && !adding && <p className="text-[11px] text-slate-300 italic">No deadlines yet — add projects or deadlines above. They'll appear Tomato-red in the calendar.</p>}
        <div className="space-y-0.5">
          {deadlines.map(item => <Row key={item.id} item={item} isDeadline={true} />)}
        </div>
        {(adding?.mode === 'project' || adding?.mode === 'deadline') && <AddForm />}
      </div>
    </div>
  )
}