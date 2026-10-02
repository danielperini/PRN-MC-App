import * as XLSX from 'xlsx';

const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export const clean = value => value instanceof Date && !Number.isNaN(value.getTime())
  ? `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`
  : String(value ?? '').trim();

export function monthInfo(name = '') {
  const months = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const normalized = norm(name);
  let month = null;
  for (const [label, number] of Object.entries(months)) {
    if (normalized.includes(label)) { month = number; break; }
  }
  const yearMatch = normalized.match(/(20\d{2})/);
  let year = yearMatch ? Number(yearMatch[1]) : null;
  if (!year) {
    const shortYear = normalized.match(/(?:^|\D)(\d{2})(?:\D|$)/);
    if (shortYear) year = 2000 + Number(shortYear[1]);
  }
  return { month, year };
}

function calendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? date : null;
}

export function parseDate(value, sheet) {
  // A programação usa dias de calendário, não instantes. Meio-dia UTC mantém
  // o mesmo dia quando o app exibe as datas no fuso de Brasília (UTC-3).
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return calendarDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = XLSX.SSF.parse_date_code(value);
    if (date?.y && date?.m && date?.d) return calendarDate(date.y, date.m, date.d);
  }

  const text = clean(value);
  if (!text) return null;
  const { month, year } = monthInfo(sheet);

  let match = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})(?:$|T)/);
  if (match) return calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (match) {
    let fullYear = Number(match[3]);
    if (fullYear < 100) fullYear += 2000;
    return calendarDate(fullYear, Number(match[2]), Number(match[1]));
  }

  // Intervalos como "06/10 à 9/10" e qualificadores como "a partir de 13/10".
  match = text.match(/(\d{1,2})[\/.\-](\d{1,2})/);
  if (match && year) return calendarDate(year, Number(match[2]), Number(match[1]));

  match = text.match(/^(\d{1,2})$/);
  if (match && month && year) return calendarDate(year, month, Number(match[1]));
  return null;
}
