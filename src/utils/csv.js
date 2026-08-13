function parseRows(text) {
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

export function parseCSVRows(rows) {
  if (!rows || rows.length === 0) return []
  const headers = rows[0].map(h => h.replace(/\s+/g, ' ').trim())
  return rows.slice(1).map(r => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = i < r.length ? r[i] : '' })
    return obj
  })
}

export function parseCSV(text) {
  return parseCSVRows(parseRows(text))
}

export function parseCSVRaw(text) {
  return parseRows(text)
}
