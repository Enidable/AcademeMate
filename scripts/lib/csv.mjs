// Minimal CSV reader/writer for the migration and generation scripts.
// Mirrors src/utils/csv.js so script output and app parsing always agree.

export function parseCSVRaw(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field.trim())
        field = ''
      } else if (ch === '\n') {
        row.push(field.trim())
        field = ''
        if (row.length > 1 || row[0] !== '') rows.push(row)
        row = []
      } else if (ch === '\r') {
      } else {
        field += ch
      }
    }
  }
  if (field.trim() || row.length > 0) {
    row.push(field.trim())
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

export function writeCSV(rows) {
  return rows.map(row =>
    row.map(cell => {
      const s = cell == null ? '' : String(cell)
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
      return s
    }).join(',')
  ).join('\n') + '\n'
}

export function headerToKey(header) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}