import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { nextScheduledId, nextDeadlineId } from '../utils/ids'

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

function timeToMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim())
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

// "1h45", "45m" … from two calendar times (falls back to 1h when only a start
// time is known, mirroring how the timetable treats it).
function durationLabel(start, end) {
  const s = timeToMin(start)
  if (s == null) return null
  const e = timeToMin(end)
  const mins = e == null || e <= s ? 60 : e - s
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function hoursLabel(hours) {
  if (hours == null) return '—'
  const rounded = Math.round(hours * 100) / 100
  return `${rounded}h`
}

// Full editor shown while a row is being structurally edited (type, dates,
// times). Hoisted so it never remounts and drops focus mid-keystroke.
function EditPanel({ editing, setEditing, isDeadline, onSaveEdit }) {
  return (
    <div className="flex flex-col gap-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50">
      <div className="flex items-center gap-1.5 flex-wrap">
        <input type="text" value={editing.contentId} onChange={(e) => setEditing((s) => ({ ...s, contentId: e.target.value }))}
          placeholder={isDeadline ? 'ID (e.g. ML11, ML1E1)' : 'ID (e.g. ML1-L-01)'}
          className="text-[10px] font-mono w-24 px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-600" />
        <select value={editing.type} onChange={(e) => setEditing((s) => ({ ...s, type: e.target.value }))}
          className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white">
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="date" value={editing.date} onChange={(e) => setEditing((s) => ({ ...s, date: e.target.value }))}
          className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
        {!isDeadline && (
          <>
            <input type="time" value={editing.start} onChange={(e) => setEditing((s) => ({ ...s, start: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
            <input type="time" value={editing.end} onChange={(e) => setEditing((s) => ({ ...s, end: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input type="text" value={editing.description} onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))}
          className="flex-1 text-[11px] px-2 py-1 border border-slate-200 rounded bg-white" placeholder="Description" />
        <button onClick={onSaveEdit} className="text-[11px] px-2.5 py-1 bg-slate-700 text-white rounded cursor-pointer">Save</button>
        <button onClick={() => setEditing(null)} className="text-[11px] px-2 py-1 border border-slate-200 text-slate-500 rounded cursor-pointer">Esc</button>
      </div>
    </div>
  )
}

// A generated lecture / tutorial / practical row. The link to its calendar
// element stays invisible — double-click the ID to view or change it. The note
// is an inline auto-saving input. On the right: future items show the duration
// pulled from the calendar times, past items sum the session-logger hours that
// were logged against this ID.
function LectureRow({ item, today, loggedHours, loggedSessions, linkedEvent, isEditing, editing, setEditing, onStartEdit, onSaveEdit, onDelete, onSaveNote, onSaveLink }) {
  const id = item.contentId || '—'
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkVal, setLinkVal] = useState('')
  const future = item.date != null && item.date >= today
  const calDur = durationLabel(item.start, item.end)
  const timeLabel = future
    ? calDur || '—'
    : loggedSessions > 0
      ? `${hoursLabel(loggedHours)} · ${loggedSessions} sess`
      : '—'
  const timeTitle = future
    ? 'Scheduled duration (from the calendar)'
    : loggedSessions > 0
      ? `${loggedSessions} logged session${loggedSessions === 1 ? '' : 's'} connected to this ID`
      : 'No logged sessions for this ID yet — log one in the Time Log to fill this in.'

  if (isEditing) {
    return (
      <EditPanel editing={editing} setEditing={setEditing} isDeadline={false} onSaveEdit={onSaveEdit} />
    )
  }

  function openLink() {
    setLinkVal(item.calId || '')
    setLinkOpen(true)
  }

  function closeLink(save) {
    if (save) {
      const v = linkVal.trim()
      if ((v || '') !== (item.calId || '')) onSaveLink(item, v || null)
    }
    setLinkOpen(false)
  }

  const dateStr = `${fmtDate(item.date)}${item.start ? ` ${item.start}${item.end ? `–${item.end}` : ''}` : ''}`

  return (
    <div className="group flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50">
      {linkOpen ? (
        <span className="flex items-center gap-1.5 shrink-0">
          <input
            autoFocus
            type="text"
            value={linkVal}
            onChange={(e) => setLinkVal(e.target.value)}
            onBlur={() => closeLink(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') closeLink(false)
            }}
            placeholder="Google event id"
            className="text-[10px] font-mono w-36 px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-600" />
          <span className={`text-[9px] shrink-0 ${item.calId ? 'text-emerald-500' : 'text-slate-300'}`}>
            {item.calId ? 'linked' : 'unlinked'}
          </span>
          {linkedEvent && (
            <span className="text-[10px] text-slate-400 truncate max-w-[180px]" title={linkedEvent.summary}>
              → {linkedEvent.summary} · {fmtDate(linkedEvent.date)}
            </span>
          )}
        </span>
      ) : (
        <span
          title="Double-click to view / change the linked calendar element"
          onDoubleClick={openLink}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0 cursor-pointer hover:bg-slate-300">
          {id}
        </span>
      )}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${typeBadge(item.type)}`}>{TYPE_LABELS[item.type] || item.type}</span>
      <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">{dateStr}</span>
      <input
        key={item.id + '::note'}
        type="text"
        defaultValue={item.description || ''}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (item.description || '')) onSaveNote(item, v) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder="Lecture contents / notes…"
        title="Lecture contents (e.g. from the syllabus)"
        className="flex-1 min-w-0 text-[11px] px-1.5 py-0.5 rounded border border-transparent bg-transparent text-slate-700 placeholder-slate-300 focus:border-slate-300 focus:bg-white focus:outline-none" />
      <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap shrink-0" title={timeTitle}>{timeLabel}</span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
        <button onClick={() => onStartEdit(item)} className="text-[10px] text-slate-400 hover:text-slate-700 cursor-pointer">Edit</button>
        <button onClick={() => { if (window.confirm(`Remove "${item.description || item.contentId}" from the syllabus?`)) onDelete(item) }}
          className="text-[11px] text-red-400 hover:text-red-600 cursor-pointer">×</button>
      </div>
    </div>
  )
}

// A deadline / grade-component row. Inline note like lectures, but no calendar
// link or time column (deadlines are shown by their due date).
function DeadlineRow({ item, isEditing, editing, setEditing, onStartEdit, onSaveEdit, onDelete, onSaveNote }) {
  if (isEditing) {
    return (
      <EditPanel editing={editing} setEditing={setEditing} isDeadline={true} onSaveEdit={onSaveEdit} />
    )
  }
  const id = item.contentId || '—'
  const dueStr = `due ${fmtDate(item.deadline)}`
  return (
    <div className="group flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50">
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0">{id}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${typeBadge(item.type)}`}>{TYPE_LABELS[item.type] || item.type}</span>
      <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">{dueStr}</span>
      <input
        key={item.id + '::note'}
        type="text"
        defaultValue={item.description || ''}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (item.description || '')) onSaveNote(item, v) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder="Notes…"
        className="flex-1 min-w-0 text-[11px] px-1.5 py-0.5 rounded border border-transparent bg-transparent text-slate-700 placeholder-slate-300 focus:border-slate-300 focus:bg-white focus:outline-none" />
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
        <button onClick={() => onStartEdit(item)} className="text-[10px] text-slate-400 hover:text-slate-700 cursor-pointer">Edit</button>
        <button onClick={() => { if (window.confirm(`Remove "${item.description || item.contentId}" from the syllabus?`)) onDelete(item) }}
          className="text-[11px] text-red-400 hover:text-red-600 cursor-pointer">×</button>
      </div>
    </div>
  )
}

// The "add" form. Also hoisted so typing never loses focus.
function AddForm({ adding, setAdding, onSubmit, course, abbrev, code, content, gradeComponents }) {
  const combined = useMemo(() => [
    ...(content || []),
    ...(gradeComponents || []).flatMap((g) => (g.components || []).map((c) => ({ course: g.course, contentId: c.id }))),
  ], [content, gradeComponents])
  if (!adding) return null
  const isLecture = adding.mode === 'lecture'
  const placeholder = isLecture
    ? nextScheduledId(course, abbrev, code, combined, adding.type)
    : nextDeadlineId(course, abbrev, code, combined, adding.type)
  return (
    <div className="flex flex-col gap-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50 mt-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <input type="text" value={adding.contentId} onChange={(e) => setAdding((a) => ({ ...a, contentId: e.target.value }))}
          placeholder={placeholder}
          className="text-[10px] font-mono w-24 px-1.5 py-0.5 border border-slate-200 rounded bg-white text-slate-600" />
        {isLecture ? (
          <select value={adding.type} onChange={(e) => setAdding((a) => ({ ...a, type: e.target.value }))}
            className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white">
            {SCHEDULED_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        ) : (
          <select value={adding.type} onChange={(e) => setAdding((a) => ({ ...a, type: e.target.value }))}
            className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white">
            <option value="project">Project</option>
            <option value="assignment">Assignment</option>
            <option value="exam">Exam</option>
            <option value="quiz">Quiz</option>
            <option value="presentation">Presentation</option>
            <option value="other">Other</option>
          </select>
        )}
        <input type="date" value={adding.date} onChange={(e) => setAdding((a) => ({ ...a, date: e.target.value }))}
          className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
        {isLecture ? (
          <>
            <input type="time" value={adding.start} onChange={(e) => setAdding((a) => ({ ...a, start: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
            <input type="time" value={adding.end} onChange={(e) => setAdding((a) => ({ ...a, end: e.target.value }))}
              className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" />
          </>
        ) : (
          <input type="time" value={adding.end} onChange={(e) => setAdding((a) => ({ ...a, end: e.target.value }))}
            className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" title="Due time (e.g. 17:00)" />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input type="text" value={adding.description} onChange={(e) => setAdding((a) => ({ ...a, description: e.target.value }))}
          className="flex-1 text-[11px] px-2 py-1 border border-slate-200 rounded bg-white"
          placeholder={isLecture ? 'Description (e.g. Intro to X)' : 'Description (e.g. Report part 1)'} />
        <button onClick={onSubmit} className="text-[11px] px-2.5 py-1 bg-slate-700 text-white rounded cursor-pointer">Add</button>
        <button onClick={() => setAdding(null)} className="text-[11px] px-2 py-1 border border-slate-200 text-slate-500 rounded cursor-pointer">Esc</button>
      </div>
    </div>
  )
}

export default function Syllabus({ course, abbrev, code }) {
  const { content, gradeComponents, inputLog, calendarEvents, addContentItem, updateContentItem, deleteContentItem } = useAppData()
  const [adding, setAdding] = useState(null)
  const [editing, setEditing] = useState(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const items = useMemo(() => (content || []).filter((i) => i.course === course), [content, course])
  const scheduled = items.filter((i) => i.date && !i.deadline)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.start || '').localeCompare(b.start || ''))
  const deadlines = items.filter((i) => i.deadline)
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))

  // Sum of logged session hours per lecture/component ID for the time column.
  const loggedByLecture = useMemo(() => {
    const map = {}
    for (const e of inputLog || []) {
      if (!e.lectureId) continue
      const key = e.lectureId
      map[key] = map[key] || { hours: 0, sessions: 0 }
      map[key].hours += (parseFloat(e.durationHours) || 0)
      map[key].sessions += 1
    }
    return map
  }, [inputLog])

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
    const combined = [
      ...items,
      ...(gradeComponents || []).flatMap((g) => (g.components || []).map((c) => ({ course: g.course, contentId: c.id }))),
    ]
    const id = a.contentId || (isLecture
      ? nextScheduledId(course, abbrev, code, combined, a.type)
      : nextDeadlineId(course, abbrev, code, combined, a.type))
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
    })
  }

  function saveEdit() {
    const e = editing
    const isScheduled = scheduled.some((s) => s.id === e.id)
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

  const handleDelete = (item) => deleteContentItem(item.id)
  const handleSaveNote = (item, value) => updateContentItem(item.id, { description: value })
  const handleSaveLink = (item, calId) => updateContentItem(item.id, { calId })

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
          {scheduled.map((item) => {
            const log = loggedByLecture[item.contentId] || { hours: 0, sessions: 0 }
            const linkedEvent = item.calId
              ? (calendarEvents || []).find((e) => e.calId === item.calId)
              : null
            return (
              <LectureRow key={item.id} item={item} today={today}
                loggedHours={log.hours} loggedSessions={log.sessions} linkedEvent={linkedEvent}
                isEditing={editing?.id === item.id} editing={editing} setEditing={setEditing}
                onStartEdit={startEdit} onSaveEdit={saveEdit} onDelete={handleDelete}
                onSaveNote={handleSaveNote} onSaveLink={handleSaveLink} />
            )
          })}
        </div>
        {adding?.mode === 'lecture' && (
          <AddForm adding={adding} setAdding={setAdding} onSubmit={submitAdd}
            course={course} abbrev={abbrev} code={code} content={content} gradeComponents={gradeComponents} />
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Deadlines</p>
        {deadlines.length === 0 && !adding && <p className="text-[11px] text-slate-300 italic">No deadlines yet — add projects or deadlines above. They'll appear Tomato-red in the calendar.</p>}
        <div className="space-y-0.5">
          {deadlines.map((item) => (
            <DeadlineRow key={item.id} item={item}
              isEditing={editing?.id === item.id} editing={editing} setEditing={setEditing}
              onStartEdit={startEdit} onSaveEdit={saveEdit} onDelete={handleDelete}
              onSaveNote={handleSaveNote} />
          ))}
        </div>
        {(adding?.mode === 'project' || adding?.mode === 'deadline') && (
          <AddForm adding={adding} setAdding={setAdding} onSubmit={submitAdd}
            course={course} abbrev={abbrev} code={code} content={content} gradeComponents={gradeComponents} />
        )}
      </div>
    </div>
  )
}
