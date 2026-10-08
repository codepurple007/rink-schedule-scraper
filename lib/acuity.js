import { createHash } from "node:crypto";

import {
  dateInTimeZone,
  dateRange,
  localDateTime,
  monthStarts,
  normalizeOffset,
} from "./dates.js";
import { fetchJson, fetchText } from "./http.js";

export const DEFAULT_SCHEDULE_URL =
  "https://app.acuityscheduling.com/schedule/abdd2b57/appointment/14752819/calendar/7377344";

export async function scrapeSchedule({
  scheduleUrl = DEFAULT_SCHEDULE_URL,
  days = 60,
  now = new Date(),
  fetchImpl = globalThis.fetch,
  concurrency = 5,
} = {}) {
  validateDays(days);
  const ids = parseScheduleUrl(scheduleUrl);
  const html = await fetchText(scheduleUrl, { fetchImpl });
  const business = extractBusiness(html);
  const appointmentType = findById(business.appointmentTypes, ids.appointmentTypeId, "appointment type");
  const calendar = findById(business.calendars, ids.calendarId, "calendar");
  const timeZone = calendar.timezone || business.timezone;
  if (!timeZone) {
    throw new Error("The schedule did not provide a timezone");
  }

  const startDate = dateInTimeZone(now, timeZone);
  const dates = dateRange(startDate, days);
  const endDate = dates.at(-1);
  const apiBase = new URL("/api/scheduling/v1/availability/", scheduleUrl);
  const common = {
    owner: ids.owner,
    appointmentTypeId: String(ids.appointmentTypeId),
    calendarId: String(ids.calendarId),
    timezone: timeZone,
  };

  const monthlyResponses = await Promise.all(
    monthStarts(dates).map((month) =>
      fetchJson(endpoint(apiBase, "month", { ...common, month }), { fetchImpl }),
    ),
  );
  const availability = Object.assign({}, ...monthlyResponses);
  const availableDates = dates.filter((date) => availability[date] === true);
  const dailyResponses = await mapConcurrent(availableDates, concurrency, (date) =>
    fetchJson(endpoint(apiBase, "times", { ...common, startDate: date }), { fetchImpl }),
  );

  const events = dailyResponses
    .flatMap((response) => Object.values(response).flat())
    .map((slot) => makeEvent({
      slot,
      appointmentType,
      calendar,
      business,
      scheduleUrl,
      timeZone,
    }))
    .sort((left, right) => left.startUtc.localeCompare(right.startUtc));

  return {
    generatedAt: new Date().toISOString(),
    range: {
      startDate,
      endDate,
      days,
      timeZone,
    },
    rink: {
      name: business.name || null,
      calendar: calendar.name || null,
      calendarId: ids.calendarId,
      appointmentType: appointmentType.name,
      appointmentTypeId: ids.appointmentTypeId,
    },
    eventCount: events.length,
    events,
    source: scheduleUrl,
  };
}

export function parseScheduleUrl(scheduleUrl) {
  const url = new URL(scheduleUrl);
  if (url.protocol !== "https:" || url.hostname !== "app.acuityscheduling.com") {
    throw new TypeError("SCHEDULE_URL must be an HTTPS app.acuityscheduling.com URL");
  }
  const match = url.pathname.match(
    /^\/schedule\/([^/]+)\/appointment\/(\d+)\/calendar\/(\d+)\/?$/,
  );
  if (!match) {
    throw new TypeError("SCHEDULE_URL does not contain owner, appointment, and calendar IDs");
  }
  return {
    owner: match[1],
    appointmentTypeId: Number(match[2]),
    calendarId: Number(match[3]),
  };
}

export function extractBusiness(html) {
  const marker = /var\s+BUSINESS\s*=\s*/g;
  const match = marker.exec(html);
  if (!match) {
    throw new Error("Could not find Acuity schedule metadata");
  }
  const start = html.indexOf("{", match.index + match[0].length);
  if (start < 0) {
    throw new Error("Acuity schedule metadata is malformed");
  }
  const end = balancedObjectEnd(html, start);
  try {
    return JSON.parse(html.slice(start, end + 1));
  } catch (error) {
    throw new Error("Could not parse Acuity schedule metadata", { cause: error });
  }
}

function balancedObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return index;
  }
  throw new Error("Acuity schedule metadata is incomplete");
}

function findById(grouped, id, label) {
  const entries = Object.values(grouped || {}).flat();
  const match = entries.find((entry) => Number(entry.id) === Number(id));
  if (!match) {
    throw new Error(`Could not find ${label} ${id} in Acuity metadata`);
  }
  return match;
}

function endpoint(apiBase, resource, parameters) {
  const url = new URL(resource, apiBase);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function makeEvent({ slot, appointmentType, calendar, business, scheduleUrl, timeZone }) {
  if (!slot || typeof slot.time !== "string") {
    throw new Error("Acuity returned a time slot without a start time");
  }
  const start = new Date(normalizeOffset(slot.time));
  if (Number.isNaN(start.valueOf())) {
    throw new Error(`Acuity returned an invalid start time: ${slot.time}`);
  }
  const durationMinutes = Number(appointmentType.duration);
  const end = new Date(start.valueOf() + durationMinutes * 60_000);
  const startLocal = localDateTime(start, timeZone);
  const endLocal = localDateTime(end, timeZone);
  const identity = [
    appointmentType.id,
    calendar.id,
    start.toISOString(),
  ].join(":");
  return {
    id: createHash("sha256").update(identity).digest("hex").slice(0, 24),
    title: appointmentType.name,
    date: startLocal.slice(0, 10),
    startTime: startLocal.slice(11, 16),
    endTime: endLocal.slice(11, 16),
    startLocal,
    endLocal,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    timeZone,
    durationMinutes,
    availableSpots: numberOrNull(slot.slotsAvailable),
    capacity: numberOrNull(appointmentType.classSize),
    price: {
      amount: appointmentType.price ?? null,
      currency: business.currencyAbbreviation || null,
      symbol: business.currencySymbol || null,
    },
    category: appointmentType.category || null,
    calendar: calendar.name || null,
    location: calendar.location || null,
    description: appointmentType.description || null,
    bookingUrl: scheduleUrl,
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function mapConcurrent(values, concurrency, worker) {
  const results = new Array(values.length);
  let next = 0;
  async function run() {
    while (next < values.length) {
      const index = next++;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, run),
  );
  return results;
}

function validateDays(days) {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new RangeError("days must be a whole number between 1 and 90");
  }
}
