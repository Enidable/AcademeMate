import { useState, useEffect, useRef } from 'react'
import { getCourseStyle, isCourseActive } from '../utils/helpers'

// Custom course dropdown: each course shows its colour dot, active courses are
// listed first with a green "active" pill, and the currently selected course
// is highlighted. `onlyActive` restricts the list to active courses.
export default function CourseSelect({ value, onChange, courses, onlyActive = false, includeNone = false, placeholder = 'Select course…', size = 'md', extraOptions = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const all = (courses || []).filter(c => c?.course)
  const list = (onlyActive ? all.filter(c => isCourseActive(c, today)) : all)
    .sort((a, b) => (isCourseActive(b, today) - isCourseActive(a, today)) || a.course.localeCompare(b.course))
  const selected = all.find(c => c.course === value)
  const style = selected ? getCourseStyle(selected.course, selected.color) : null

  const triggerCls = size === 'sm'
    ? 'w-full flex items-center gap-1.5 text-[11px] border border-slate-300 rounded px-1.5 py-0.5 bg-white text-slate-700 text-left cursor-pointer'
    : 'w-full flex items-center gap-2 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 text-left cursor-pointer'
  const itemCls = size === 'sm'
    ? 'w-full flex items-center gap-1.5 px-1.5 py-1 text-[11px] hover:bg-slate-50 text-left cursor-pointer'
    : 'w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 text-left cursor-pointer'

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className={triggerCls}>
        {selected ? (
          <>
            <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} style={style.dotCss} />
            <span className="truncate">{selected.course}</span>
          </>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className={`ml-auto text-slate-400 shrink-0 ${size === 'sm' ? 'text-[9px]' : 'text-xs'}`}>▾</span>
      </button>
      {open && (
        <div className={`absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-y-auto ${size === 'sm' ? 'max-h-48' : 'max-h-56'}`}>
          {includeNone && (
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className={`${itemCls} text-slate-400`}>None</button>
          )}
          {list.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">No courses yet — add some in the Courses tab.</div>
          )}
          {list.map(c => {
            const st = getCourseStyle(c.course, c.color)
            const active = isCourseActive(c, today)
            return (
              <button key={c.course} type="button" onClick={() => { onChange(c.course); setOpen(false) }}
                className={`${itemCls} ${value === c.course ? 'bg-slate-100' : ''}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} style={st.dotCss} />
                <span className="truncate">{c.course}</span>
                {active && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">active</span>
                )}
              </button>
            )
          })}
          {extraOptions.length > 0 && (
            <div className="border-t border-slate-100 my-1" />
          )}
          {extraOptions.map(opt => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`${itemCls} ${value === opt.value ? 'bg-slate-100' : ''}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot || 'bg-slate-400'}`} />
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}