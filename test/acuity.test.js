import assert from "node:assert/strict";
import test from "node:test";

import {
  extractBusiness,
  parseScheduleUrl,
  scrapeSchedule,
} from "../lib/acuity.js";
import { toCsv } from "../lib/output.js";

const SCHEDULE_URL =
  "https://app.acuityscheduling.com/schedule/abdd2b57/appointment/14752819/calendar/7377344";

const BUSINESS = {
  name: "Rocket Ice Skating Rink",
  currencyAbbreviation: "USD",
  currencySymbol: "$",
  timezone: "America/Chicago",
  appointmentTypes: {
    "Stick and Puck": [
      {
        id: 14752819,
        name: "Stick & Puck Ice Time - Rink Side B",
        duration: 60,
        classSize: 10,
        price: "15.00",
        category: "Stick and Puck",
        description: "Practice session",
      },
    ],
  },
  calendars: {
    "": [
      {
        id: 7377344,
        name: "Stick & Puck Side B",
        timezone: "America/Chicago",
        location: "Rink Side B",
      },
    ],
  },
};

test("parses the configured Acuity URL", () => {
  assert.deepEqual(parseScheduleUrl(SCHEDULE_URL), {
    owner: "abdd2b57",
    appointmentTypeId: 14752819,
    calendarId: 7377344,
  });
  assert.throws(
    () => parseScheduleUrl("https://example.com/schedule/x"),
    /app\.acuityscheduling\.com/,
  );
});

test("extracts a balanced BUSINESS object from the page script", () => {
  const html = `<script>var OTHER = {};\nvar BUSINESS = ${JSON.stringify({
    ...BUSINESS,
    description: "A brace } and an escaped quote: \\\"",
  })};\nvar AFTER = true;</script>`;
  const parsed = extractBusiness(html);
  assert.equal(parsed.name, "Rocket Ice Skating Rink");
  assert.match(parsed.description, /brace \}/);
});

test("scrapes available events and computes local and UTC end times", async () => {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname.startsWith("/schedule/")) {
      return response(`<script>var BUSINESS = ${JSON.stringify(BUSINESS)};</script>`, "text/html");
    }
    if (url.pathname.endsWith("/month")) {
      assert.equal(url.searchParams.get("month"), "2026-10-01");
      return response({
        "2026-10-05": true,
        "2026-10-06": false,
        "2026-10-07": true,
      });
    }
    if (url.pathname.endsWith("/times")) {
      const date = url.searchParams.get("startDate");
      return response({
        [date]: [
          {
            time: `${date}T10:30:00-0500`,
            slotsAvailable: date === "2026-10-05" ? 8 : 10,
          },
        ],
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await scrapeSchedule({
    scheduleUrl: SCHEDULE_URL,
    days: 3,
    now: new Date("2026-10-05T12:00:00Z"),
    fetchImpl,
  });

  assert.equal(result.range.startDate, "2026-10-05");
  assert.equal(result.range.endDate, "2026-10-07");
  assert.equal(result.eventCount, 2);
  assert.equal(result.events[0].startLocal, "2026-10-05T10:30:00-05:00");
  assert.equal(result.events[0].endLocal, "2026-10-05T11:30:00-05:00");
  assert.equal(result.events[0].startUtc, "2026-10-05T15:30:00.000Z");
  assert.equal(result.events[0].availableSpots, 8);
  assert.equal(result.events[0].price.amount, "15.00");
  assert.equal(calls.filter((url) => url.pathname.endsWith("/times")).length, 2);
});

test("CSV output escapes descriptions and has spreadsheet-friendly columns", () => {
  const csv = toCsv([
    {
      id: "one",
      title: "Open Skate",
      date: "2026-10-05",
      startTime: "10:00",
      endTime: "11:00",
      timeZone: "America/Chicago",
      durationMinutes: 60,
      availableSpots: 5,
      capacity: 10,
      price: { amount: "15.00", currency: "USD" },
      category: "Public",
      calendar: "Main",
      location: "",
      description: 'Bring skates, helmets, and "passes".',
      bookingUrl: SCHEDULE_URL,
    },
  ]);
  assert.match(csv, /^id,title,date,start_time,end_time,/);
  assert.match(csv, /"Bring skates, helmets, and ""passes""\."/);
});

function response(body, contentType = "application/json") {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": contentType },
  });
}
