// Serializers: convert the app's in-memory objects back into the flat table
// rows each spreadsheet tab stores. They mirror the header names the parsers
// in loadData.js / parseDaily.js expect, so a read -> edit -> write cycle is
// lossless.

import { num, isoDateToDDMMYYYY } from './normalize.js'

export const STUDY_LOG_HEADER = 'date,start_time,end_time,duration_hours,duration_minutes,course_id,category,project,location,efficiency,wellbeing,lecture_id,transport_mode,commute_minutes,notes'
export const COURSES_HEADER = 'course_id,name,code,abbrev,year,quartile,start,finish,ec,status,est_hours,notes,scope,color,order'
export const GRADE_COMPONENTS_HEADER = 'course_id,component,type,weight,grade,due_date,hours_spent,done,notes'
export const CONTENT_HEADER = 'course_id,course_2,content_id,type,topic,date,deadline,start,end,location,marker,hours_spent,material_hours,content,done,cal_id'
export const DAILY_PLAN_HEADER = 'date,course_id,task,planned_hours,actual_hours,done,notes'
export const WEEKLY_TOTALS_HEADER = 'year,week,total_hours,notes'
export const CALENDAR_HEADER = 'date,start_time,end_time,all_day,summary,course_id,location,description,source,uid,status,lecture_id,cal_id'

const splitHeader = h => h.split(',')

// course_id columns store the university course CODE (stable, present in every
// .ics summary). Entries without a known code fall back to the course name.
function courseIdFor(codeMap, course) {
  if (!codeMap) return course || ''
  return codeMap.get(course) || course || ''
}

export function serializeStudyLog(entries, codeMap) {
  const rows = (entries || []).map(e => [
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
  ])
  return [splitHeader(STUDY_LOG_HEADER), ...rows]
}

export function serializeCourses(courses) {
  const rows = (courses || []).map(c => [
    c.code || c.course || '',
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
        courseIdFor(codeMap, g.course),
        c.name || c.id || (c.type && c.type !== 'other' ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : ''),
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
    courseIdFor(codeMap, i.course),
    i.course2 || '',
    i.contentId || i.lectureId || '',
    i.type === 'other' ? '' : i.type || '',
    i.topic || '',
    isoDateToDDMMYYYY(i.date),
    isoDateToDDMMYYYY(i.deadline),
    i.start || '',
    i.end || '',
    i.marker || '',
    i.location || '',
    num(i.hoursSpent != null ? i.hoursSpent : i.time, 2),
    num(i.materialHours, 2),
    i.content || '',
    i.done || '',
    i.calId || '',
  ])
  return [splitHeader(CONTENT_HEADER), ...rows]
}

export function serializeDailyPlan(rows, codeMap) {
  const out = (rows || []).map(r => [
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

export function serializeCalendar(events, codeMap) {
  const rows = (events || []).map(e => [
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
  ])
  return [splitHeader(CALENDAR_HEADER), ...rows]
}