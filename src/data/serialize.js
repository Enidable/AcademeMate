// Serializers: convert the app's in-memory objects back into the flat table
// rows each spreadsheet tab stores. They mirror the header names the parsers
// in loadData.js / parseDaily.js expect, so a read -> edit -> write cycle is
// lossless.

import { num, isoDateToDDMMYYYY } from './normalize.js'

export const STUDY_LOG_HEADER = 'id,date,start_time,end_time,duration_hours,duration_minutes,course_id,category,project,location,efficiency,wellbeing,lecture_id,transport_mode,commute_minutes,notes,plan_id,lecture_content_id'
export const COURSES_HEADER = 'id,course_id,name,code,abbrev,year,quartile,start,finish,ec,status,est_hours,notes,scope,color,order'
export const GRADE_COMPONENTS_HEADER = 'id,course_id,component,type,weight,grade,due_date,hours_spent,done,notes'
export const CONTENT_HEADER = 'id,course_id,course_2,content_id,type,topic,date,deadline,start,end,location,marker,hours_spent,material_hours,content,done,cal_id,prep,calendar_id'
export const DAILY_PLAN_HEADER = 'id,date,course_id,task,planned_hours,actual_hours,done,notes'
export const WEEKLY_TOTALS_HEADER = 'year,week,total_hours,notes'
export const CALENDAR_HEADER = 'id,date,start_time,end_time,all_day,summary,course_id,location,description,source,uid,status,lecture_id,cal_id,content_id'
export const ADDITIONAL_HEADER = 'id,date,category,task,hours,start_time,end_time,efficiency,wellbeing,location,notes,done'
export const ACADEMIC_YEAR_HEADER = 'year,period,label,start,finish'

const splitHeader = h => h.split(',')

// course_id columns store the university course CODE (stable, present in every
// .ics summary). Entries without a known code fall back to the course name.
function courseIdFor(codeMap, course) {
  if (!codeMap) return course || ''
  return codeMap.get(course) || course || ''
}

export function serializeStudyLog(entries, codeMap) {
  const rows = (entries || []).map(e => [
    e.id || '',
    isoDateToDDMMYYYY(e.date),
    e.startTime || '',
    e.endTime || '',
    num(e.durationHours, 3),
    num(e.durationMinutes),
    courseIdFor(codeMap, e.course),
    e.category || '',
    e.project || '',
    e.location || '',
    num(e.efficiency),
    num(e.wellbeing),
    e.lectureId || '',
    e.transportMode || '',
    num(e.commuteTime, 1),
    e.notes || '',
    e.planId || '',
    e.lectureContentId || '',
  ])
  return [splitHeader(STUDY_LOG_HEADER), ...rows]
}

export function serializeCourses(courses) {
  const rows = (courses || []).map(c => [
    c.id || '',
    c.id || c.code || c.course || '',
    c.course || '',
    c.code || '',
    c.abbrev || '',
    c.year || '',
    c.quartile || '',
    isoDateToDDMMYYYY(c.start),
    isoDateToDDMMYYYY(c.finish),
    num(c.ec, 2),
    c.status || '',
    num(c.estHours, 2),
    c.notes || c.comment || '',
    c.scope || '',
    c.color || '',
    num(c.order),
  ])
  return [splitHeader(COURSES_HEADER), ...rows]
}

export function serializeGradeComponents(groups, codeMap) {
  const rows = []
  for (const g of groups || []) {
    for (const c of g.components || []) {
      const hasData = c.name || c.id || c.weight != null || c.grade != null || c.dueDate || c.hoursSpent != null || c.done
      if (!hasData) continue
      rows.push([
        c.rowId || '',
        courseIdFor(codeMap, g.course),
        // The component column IS the project/component ID. The user's edited
        // id must win over the auto-assigned fallback name, otherwise an edited
        // id reverts to the stale generated one on the next load (#38).
        c.id || c.name || (c.type && c.type !== 'other' ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : ''),
        (c.type || 'other') === 'other' ? '' : c.type || '',
        num(c.weight, 2),
        num(c.grade, 2),
        isoDateToDDMMYYYY(c.dueDate),
        num(c.hoursSpent, 2),
        c.done || '',
        c.notes || '',
      ])
    }
  }
  return [splitHeader(GRADE_COMPONENTS_HEADER), ...rows]
}

export function serializeContent(items, codeMap) {
  const rows = (items || []).map(i => [
    i.id || '',
    courseIdFor(codeMap, i.course),
    i.course2 || '',
    i.contentId || i.lectureId || '',
    i.type === 'other' ? '' : i.type || '',
    i.topic || '',
    isoDateToDDMMYYYY(i.date),
    isoDateToDDMMYYYY(i.deadline),
    i.start || '',
    i.end || '',
    i.location || '',
    i.marker || '',
    num(i.hoursSpent != null ? i.hoursSpent : i.time, 2),
    num(i.materialHours, 2),
    i.content || '',
    i.done || '',
    i.calId || '',
    i.prep || '',
    i.calendarId || '',
  ])
  return [splitHeader(CONTENT_HEADER), ...rows]
}

export function serializeDailyPlan(rows, codeMap) {
  const out = (rows || []).map(r => [
    r.id || '',
    isoDateToDDMMYYYY(r.date),
    courseIdFor(codeMap, r.course),
    r.task || '',
    num(r.plannedHours, 2),
    num(r.actualHours, 2),
    r.done || '',
    r.notes || '',
  ])
  return [splitHeader(DAILY_PLAN_HEADER), ...out]
}

export function serializeWeeklyOverrides(overrides) {
  const rows = Object.values(overrides || {}).map(o => [
    o.year,
    o.week,
    num(o.total, 2),
    o.notes || '',
  ])
  return [splitHeader(WEEKLY_TOTALS_HEADER), ...rows]
}

export function serializeAdditionalLog(rows) {
  return [
    splitHeader(ADDITIONAL_HEADER),
    ...(rows || []).map(r => [
      r.id || '',
      isoDateToDDMMYYYY(r.date),
      r.category || '',
      r.task || '',
      num(r.hours, 2),
      r.startTime || '',
      r.endTime || '',
      num(r.efficiency),
      num(r.wellbeing),
      r.location || '',
      r.notes || '',
      r.done || '',
    ]),
  ]
}

export function serializeCalendar(events, codeMap) {
  const rows = (events || []).map(e => [
    e.id || '',
    isoDateToDDMMYYYY(e.date),
    e.startTime || '',
    e.endTime || '',
    e.allDay ? '1' : '',
    e.summary || '',
    courseIdFor(codeMap, e.course),
    e.location || '',
    e.description || '',
    e.source || '',
    e.uid || '',
    e.status || '',
    e.lectureId || '',
    e.calId || '',
    e.contentId || '',
  ])
  return [splitHeader(CALENDAR_HEADER), ...rows]
}

// Academic year structure: one row per period. period is Q1..Q4 or Holiday;
// holidays carry a label, quarters don't. Dates serialised as dd/mm/yyyy.
export function serializeAcademicYears(years) {
  const rows = []
  for (const y of years || []) {
    for (const [period, q] of Object.entries(y.quarters || {})) {
      rows.push([y.year, period, '', isoDateToDDMMYYYY(q?.start), isoDateToDDMMYYYY(q?.finish)])
    }
    for (const h of y.holidays || []) {
      rows.push([y.year, 'Holiday', h.label || '', isoDateToDDMMYYYY(h.start), isoDateToDDMMYYYY(h.finish)])
    }
  }
  return [splitHeader(ACADEMIC_YEAR_HEADER), ...rows]
}