import { DEFAULT_SCHEDULE_URL, scrapeSchedule } from "../lib/acuity.js";

const days = Number(process.env.LIVE_TEST_DAYS || 2);
const result = await scrapeSchedule({
  scheduleUrl: process.env.SCHEDULE_URL || DEFAULT_SCHEDULE_URL,
  days,
});

console.log(JSON.stringify({
  rink: result.rink,
  range: result.range,
  eventCount: result.eventCount,
  firstEvent: result.events[0] || null,
}, null, 2));
