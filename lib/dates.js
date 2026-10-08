const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

export function addDays(dateString, amount) {
  if (!DATE_RE.test(dateString)) {
    throw new TypeError(`Invalid date: ${dateString}`);
  }
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function dateRange(startDate, days) {
  return Array.from({ length: days }, (_, index) => addDays(startDate, index));
}

export function monthStarts(dates) {
  return [...new Set(dates.map((date) => `${date.slice(0, 7)}-01`))];
}

export function normalizeOffset(acuityDateTime) {
  return acuityDateTime.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
}

export function localDateTime(date, timeZone) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const zoneParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const zoneName = part(zoneParts, "timeZoneName");
  const offset = zoneName === "GMT" ? "+00:00" : zoneName.replace("GMT", "");
  return (
    `${part(dateParts, "year")}-${part(dateParts, "month")}-${part(dateParts, "day")}` +
    `T${part(dateParts, "hour")}:${part(dateParts, "minute")}:${part(dateParts, "second")}` +
    offset
  );
}

function part(parts, type) {
  const value = parts.find((entry) => entry.type === type)?.value;
  if (value === undefined) {
    throw new Error(`Intl did not return ${type}`);
  }
  return value;
}
