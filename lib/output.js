const CSV_COLUMNS = [
  ["id", (event) => event.id],
  ["title", (event) => event.title],
  ["date", (event) => event.date],
  ["start_time", (event) => event.startTime],
  ["end_time", (event) => event.endTime],
  ["timezone", (event) => event.timeZone],
  ["duration_minutes", (event) => event.durationMinutes],
  ["available_spots", (event) => event.availableSpots],
  ["capacity", (event) => event.capacity],
  ["price", (event) => event.price.amount],
  ["currency", (event) => event.price.currency],
  ["category", (event) => event.category],
  ["calendar", (event) => event.calendar],
  ["location", (event) => event.location],
  ["description", (event) => event.description],
  ["booking_url", (event) => event.bookingUrl],
];

export function toCsv(events) {
  const lines = [CSV_COLUMNS.map(([header]) => csvCell(header)).join(",")];
  for (const event of events) {
    lines.push(CSV_COLUMNS.map(([, value]) => csvCell(value(event))).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
