# Rocket Ice schedule scraper

A Node.js 22 Google HTTP Function that returns every available event for the
next 60 local calendar days from this Acuity Scheduling calendar:

<https://app.acuityscheduling.com/schedule/abdd2b57/appointment/14752819/calendar/7377344>

Opening the function in a browser shows a responsive agenda interface. API
clients receive JSON by default, and CSV is available with `?format=csv`.
CSV is included because the referenced example attachment was not available
in the workspace. Field mapping can be changed in `lib/output.js` when that
file is provided.

## How it works

The public booking page embeds the appointment metadata needed for the export:
name, duration, capacity, price, description, calendar, and timezone. The
calendar itself calls Acuity's public scheduling endpoints:

- `/api/scheduling/v1/availability/month`
- `/api/scheduling/v1/availability/times`

The scraper first requests the months covering the requested range. It then
requests times only for dates marked available, with at most five requests in
flight. HTTP 429 and 5xx responses are retried. No login, browser, API key, or
private customer data is used.

## Output

Each event includes:

- Stable ID derived from appointment type, calendar, and start time
- Title and category
- Local date, start, and end
- UTC start and end
- IANA timezone
- Duration, available spots, and capacity
- Price and currency
- Calendar, location, description, and booking URL

Example:

```json
{
  "range": {
    "startDate": "2026-10-05",
    "endDate": "2026-12-03",
    "days": 60,
    "timeZone": "America/Chicago"
  },
  "eventCount": 42,
  "events": [
    {
      "title": "Stick & Puck Ice Time - Rink Side B - One on One Private Lessons Allowed",
      "date": "2026-10-06",
      "startTime": "10:30",
      "endTime": "11:30",
      "availableSpots": 8,
      "capacity": 10
    }
  ]
}
```

## Local setup

Node 22 is the deployment target:

```bash
npm install
npm test
npm start
```

Then call:

```bash
open "http://localhost:8080"
curl "http://localhost:8080?format=json"
curl -OJ "http://localhost:8080?format=csv"
```

To inspect the interface with deterministic sample data:

```bash
npm run preview
```

`days` defaults to 60 and accepts 1–90:

```bash
curl "http://localhost:8080?days=60&format=json"
```

Run a small check against the live calendar:

```bash
LIVE_TEST_DAYS=2 npm run test:live
```

## Deploy to Google Cloud Functions

From this directory:

```bash
gcloud functions deploy scrapeRinkSchedule \
  --gen2 \
  --runtime=nodejs22 \
  --region=us-central1 \
  --source=. \
  --entry-point=scrapeRinkSchedule \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars="SCHEDULE_URL=https://app.acuityscheduling.com/schedule/abdd2b57/appointment/14752819/calendar/7377344"
```

Remove `--allow-unauthenticated` if the export should require Google IAM.

## Use another rink calendar

Set `SCHEDULE_URL` to another Acuity URL with this shape:

```text
https://app.acuityscheduling.com/schedule/OWNER/appointment/APPOINTMENT_ID/calendar/CALENDAR_ID
```

No code change is required when that rink uses the same Acuity page format.
Separate appointment/calendar URLs can be deployed as separate functions or
the code can be extended to aggregate a configured list.

## Operational notes

- Responses are cacheable for five minutes.
- The schedule's own timezone defines the 60-day range and local times.
- Event end times are calculated from Acuity's appointment duration.
- The endpoint is third-party and undocumented, so Acuity can change it.
  Automated tests cover the expected response shape; monitor deployed errors.
- Confirm that automated access complies with the rink's and Acuity's terms.
