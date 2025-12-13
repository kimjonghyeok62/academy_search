export function csvToRows(csvText) {
  const lines = String(csvText).replace(/\r\n?|\n/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return [];
  const header = splitCsvLine(nonEmpty[0]);
  return nonEmpty.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => (row[h.trim()] = cols[i] ?? ""));
    return row;
  });
}

export function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (s) => {
    const t = String(s ?? "");
    if (/[\",\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  };
  const head = headers.map(esc).join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
  return head + "\n" + body;
}
