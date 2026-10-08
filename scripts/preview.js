import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const html = readFileSync(new URL("../ui/index.html", import.meta.url), "utf8");
const startDate = "2026-10-05";
const eventTimes = [
  ["2026-10-05", "13:20", 10],
  ["2026-10-05", "14:30", 3],
  ["2026-10-06", "06:00", 10],
  ["2026-10-06", "10:30", 8],
  ["2026-10-06", "15:10", 1],
  ["2026-10-08", "09:20", 7],
  ["2026-10-09", "17:40", 0],
  ["2026-10-11", "11:00", 6],
];
const events = eventTimes.map(([date, time, spots], index) => {
  const [hour, minute] = time.split(":").map(Number);
  const end = `${String((hour + 1) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    id: `preview-${index}`,
    title: "Stick & Puck Ice Time — Rink Side B",
    date,
    startTime: time,
    endTime: end,
    startLocal: `${date}T${time}:00-05:00`,
    endLocal: `${date}T${end}:00-05:00`,
    timeZone: "America/Chicago",
    durationMinutes: 60,
    availableSpots: spots,
    capacity: 10,
    price: { amount: "15.00", currency: "USD", symbol: "$" },
    category: "Stick and Puck",
    calendar: "Stick & Puck Side B",
    location: "",
    description: "One-hour open hockey session for players in full equipment to practice skating, shooting, passing, and other skills.",
    bookingUrl: "https://app.acuityscheduling.com/schedule/abdd2b57/appointment/14752819/calendar/7377344",
  };
});
const result = {
  generatedAt: new Date().toISOString(),
  range: { startDate, endDate: "2026-12-03", days: 60, timeZone: "America/Chicago" },
  rink: {
    name: "Rocket Ice Skating Rink",
    calendar: "Stick & Puck Side B",
    calendarId: 7377344,
    appointmentType: events[0].title,
    appointmentTypeId: 14752819,
  },
  eventCount: events.length,
  events,
};

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.searchParams.get("format") === "json") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
    return;
  }
  if (url.searchParams.get("format") === "csv") {
    response.writeHead(200, { "content-type": "text/csv" });
    response.end("preview only\n");
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});

const port = Number(process.env.PORT || 8091);
server.listen(port, "127.0.0.1", () => {
  console.log(`UI preview: http://127.0.0.1:${port}`);
});
