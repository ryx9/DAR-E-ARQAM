export const COLUMNS = ['Emp No.', 'AC-No.', 'No.', 'Name', 'Date', ...Array.from({ length: 5 }, (_, i) => [`Clock In ${i + 1}`, `Clock Out ${i + 1}`]).flat(), 'Total in time']

const key = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

function isoDate(value, date1904 = false) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && value > 0 && value < 100000) {
    const days = Math.floor(value)
    if (!date1904 && days === 60) return null // Excel's fictitious 1900-02-29
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, days < 60 ? 31 : 30)
    return new Date(epoch + days * 86400000).toISOString().slice(0, 10)
  }
  const text = String(value ?? '').trim()
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  if (!match) {
    const dmy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(text)
    if (dmy) match = [dmy[0], dmy[3], dmy[2], dmy[1]]
  }
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null
}

export function parseAttendance(matrix, period, date1904 = false) {
  if (!matrix.length) return { rows: [], errors: ['The file is empty.'] }
  const headers = matrix[0].map(key)
  const missing = COLUMNS.filter(column => !headers.includes(key(column)))
  if (missing.length) return { rows: [], errors: [`Missing columns: ${missing.join(', ')}`] }
  if (new Set(headers).size !== headers.length) return { rows: [], errors: ['The file contains duplicate column headers.'] }
  const rows = [], errors = [], seen = new Map()
  matrix.slice(1).forEach((cells, index) => {
    if (cells.every(value => value === null || value === undefined || String(value).trim() === '')) return
    const source = Object.fromEntries(COLUMNS.map(column => {
      const value = cells[headers.indexOf(key(column))] ?? ''
      return [column, value instanceof Date ? value.toISOString() : value]
    }))
    const biometric_id = String(source['Emp No.']).trim()
    const date = isoDate(cells[headers.indexOf(key('Date'))], date1904)
    if (!biometric_id) errors.push(`Row ${index + 2}: Emp No. is required.`)
    if (!date) errors.push(`Row ${index + 2}: invalid date; use YYYY-MM-DD or DD/MM/YYYY.`)
    else if (!date.startsWith(period + '-')) errors.push(`Row ${index + 2}: date is outside ${period}.`)
    if (biometric_id && date) {
      const identity = `${biometric_id}|${date}`
      if (seen.has(identity)) errors.push(`Row ${index + 2}: duplicate Emp No. and date (also row ${seen.get(identity)}).`)
      else seen.set(identity, index + 2)
    }
    rows.push({ biometric_id, date, source })
  })
  if (!rows.length) errors.push('The file contains no attendance rows.')
  return { rows, errors }
}
