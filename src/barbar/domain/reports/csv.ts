/**
 * One CSV rule for every export. Values are quoted, inner quotes doubled, and a leading
 * spreadsheet formula character is kept but neutralised with a quote, so no value is lost.
 */
export const csvCell = (value: string | number | null | undefined) =>
  `"${String(value ?? '')
    .replace(/^[=+\-@\t\r]/, (character) => `'${character}`)
    .replaceAll('"', '""')}"`;

/** Rows joined with `;` and CRLF, the separator Excel expects for a Cyrillic locale. */
export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
