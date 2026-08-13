// Seeds a brand-new per-user spreadsheet with the bundled "Master Tracker" CSVs
// (the skeleton). Reuses the exact same files the offline fallback reads.

import { parseCSVRaw } from '../utils/csv'
import { ASSET_BASE, TAB_DAILY, TAB_INPUT_LOG, TAB_COURSES, TAB_GRADES, TAB_HOURS, TAB_DEADLINES } from '../config'

const TEMPLATE_FILES = {
  [TAB_INPUT_LOG]: `${ASSET_BASE}data/Master Tracker - INPUT_LOG.csv`,
  [TAB_COURSES]: `${ASSET_BASE}data/Master Tracker - Master Time Management.csv`,
  [TAB_GRADES]: `${ASSET_BASE}data/Master Tracker - Grade Computer.csv`,
  [TAB_HOURS]: `${ASSET_BASE}data/Master Tracker - Time structure and hours of study.csv`,
  [TAB_DEADLINES]: `${ASSET_BASE}data/Master Tracker - Deadlines and Lectures.csv`,
  [TAB_DAILY]: `${ASSET_BASE}data/Master Tracker - Daily.csv`,
}

export async function fetchTemplateRows() {
  const texts = await Promise.all(Object.values(TEMPLATE_FILES).map(url => fetch(url).then(r => r.text())))
  return Object.fromEntries(Object.keys(TEMPLATE_FILES).map((title, i) => [title, parseCSVRaw(texts[i])]))
}