// Shared configuration for the Google Drive backend.
// The Client ID is NOT a secret — OAuth public client IDs are meant to be
// shipped in the browser bundle (you can read it from the built JS). It's baked
// in below so the app works on GitHub Pages too (the CI build has no .env.local).
// Set VITE_GOOGLE_CLIENT_ID in .env.local to override it locally if you change it.

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '455238936121-d13b35keplcp2sb083s91gdod0cibfru.apps.googleusercontent.com'

// Public assets live under the Vite base (/AcademeMate/) both in dev and in
// production — a root-relative path would break on GitHub Pages.
export const ASSET_BASE = import.meta.env.BASE_URL

// drive.file keeps the app scoped to spreadsheets it created (per-user isolation).
// spreadsheets lets us read/write cell values. drive.readonly lets the app read
// the user's "iCal" folder of downloaded university .ics files. calendar lets the
// app find/create the dedicated AcademeMate calendar (calendarList + calendars
// resources) and push events into it — note calendar.events alone does NOT cover
// the calendarList endpoint the app needs, so the broader calendar scope is used.
// openid/email/profile only give the display name/email.
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
  'profile',
]

export const APP_ID = 'academemate'
export const SPREADSHEET_NAME = 'AcademeMate Data'
export const DRIVE_FOLDER_NAME = 'AcademeMate - Study Tracking'
export const APP_PROP_KEY = 'academemate'
// Folder on the user's Drive where they drop downloaded university .ics files.
export const ICAL_FOLDER_NAME = 'iCal'

// Canonical tab titles inside the user's spreadsheet. Every tab is a single flat
// table (one header row), linked to others by course_id — the app's data layer
// keeps the GUI shapes while the spreadsheet stays database-shaped.
export const TAB_STUDY_LOG = 'Study Log'
export const TAB_COURSES = 'Courses'
export const TAB_GRADES = 'Grade Components'
export const TAB_CONTENT = 'Course Content'
export const TAB_DAILY = 'Daily Plan'
export const TAB_HOURS = 'Weekly Totals'
export const TAB_CALENDAR = 'Calendar'

// Content item types: lectures/lectorials/tutorials/practicals are *scheduled*
// (they have a `date`), assessments are *due* (they have a `deadline`).
export const CONTENT_TYPES = [
  'lecture',
  'lectorial',
  'tutorial',
  'practical',
  'project',
  'assignment',
  'exam',
  'quiz',
  'presentation',
  'q&a',
  'exam review',
  'self study',
  'resit',
  'other',
]

// Types that carry a due date instead of a scheduled date.
export const DEADLINE_TYPES = new Set([
  'project',
  'assignment',
  'exam',
  'quiz',
  'presentation',
])

export const SHEET_TABS = [TAB_STUDY_LOG, TAB_COURSES, TAB_GRADES, TAB_CONTENT, TAB_DAILY, TAB_HOURS, TAB_CALENDAR]

// Default pick-lists for the session logger. Users can extend/customise these
// in the "Manage options" panel of the session modal; overrides are kept in
// localStorage under the key below (see Modals.jsx).
export const DEFAULT_CATEGORIES = ['Studying', 'Lecture', 'Project Work', 'Group Work', 'Practical', 'Exam', 'Exam Prep', 'Exercise', 'Meeting', 'Presentation', 'Work', 'Other']
export const DEFAULT_LOCATIONS = ['Home', 'University', 'Parents', 'Home Office', 'HomeOffice', 'Elsewhere', 'Other', 'Work (Epe)']
export const DEFAULT_TRANSPORT = ['Bicycle', 'Public Transport', 'Car', 'Walk']
export const META_OPTIONS_KEY = 'am_meta_options'