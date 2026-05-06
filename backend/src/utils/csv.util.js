// Zero-dep CSV serializer + parser.
// - Serialize: array of objects -> CSV string (RFC 4180 quoting).
// - Parse: CSV string -> array of row objects keyed by header.

function escapeCell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // If contains quote, comma, newline, or CR -> wrap in quotes and double embedded quotes
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * @param {Array<Object>} rows
 * @param {Array<string>} columns  optional ordered column list; defaults to keys of first row
 * @returns {string}
 */
function toCsv(rows, columns) {
  if (!Array.isArray(rows)) rows = [];
  const cols = columns && columns.length
    ? columns
    : (rows.length ? Object.keys(rows[0]) : []);
  const header = cols.map(escapeCell).join(',');
  const body = rows.map(r => cols.map(c => escapeCell(r[c])).join(',')).join('\r\n');
  return body ? header + '\r\n' + body + '\r\n' : header + '\r\n';
}

/**
 * Parse RFC 4180 CSV text into array of objects.
 * @param {string} text
 * @returns {{headers: string[], rows: Array<Object>}}
 */
function parseCsv(text) {
  if (!text) return { headers: [], rows: [] };
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const records = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { cur.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') {
      cur.push(field); field = '';
      if (cur.length > 1 || cur[0] !== '') records.push(cur);
      cur = []; i++; continue;
    }
    field += ch; i++;
  }
  // Flush last field/record
  if (field !== '' || cur.length) {
    cur.push(field);
    if (cur.length > 1 || cur[0] !== '') records.push(cur);
  }
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].map(h => h.trim());
  const rows = records.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ''; });
    return obj;
  });
  return { headers, rows };
}

/**
 * Express helper: send rows as CSV attachment.
 */
function sendCsv(res, filenameBase, rows, columns) {
  const csv = toCsv(rows, columns);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}_${stamp}.csv"`);
  res.send('\uFEFF' + csv); // BOM for Excel compatibility
}

module.exports = { toCsv, parseCsv, sendCsv };
