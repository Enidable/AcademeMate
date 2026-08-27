// Seeds a brand-new per-user spreadsheet with the bundled flat-table CSVs
// (the course backbone skeleton). Reuses the exact same files the offline
// fallback reads.

import { parseCSVRaw } from '../utils/csv'
import { ASSET_BASE, TAB_STUDY_LOG, TAB_COURSES, TAB_GRADES, TAB_CONTENT, TAB_DAILY, TAB_HOURS, TAB_CALENDAR, TAB_ACADEMIC_YEAR } from '../config'

const TEMPLATE_FILES = {
  [TAB_STUDY_LOG]: `${ASSET_BASE}data/AcademeMate - Study Log.csv`,
  [TAB_COURSES]: `${ASSET_BASE}data/AcademeMate - Courses.csv`,
  [TAB_GRADES]: `${ASSET_BASE}data/AcademeMate - Grade Components.csv`,
  [TAB_CONTENT]: `${ASSET_BASE}data/AcademeMate - Course Content.csv`,
  [TAB_DAILY]: `${ASSET_BASE}data/AcademeMate - Daily Plan.csv`,
  [TAB_HOURS]: `${ASSET_BASE}data/AcademeMate - Weekly Totals.csv`,
  [TAB_CALENDAR]: `${ASSET_BASE}data/AcademeMate - Calendar.csv`,
  [TAB_ACADEMIC_YEAR]: `${ASSET_BASE}data/AcademeMate - Academic Year.csv`,
}

export async function fetchTemplateRows() {
  const texts = await Promise.all(Object.values(TEMPLATE_FILES).map(url => fetch(url).then(r => r.text())))
  return Object.fromEntries(Object.keys(TEMPLATE_FILES).map((title, i) => [title, parseCSVRaw(texts[i])]))
}