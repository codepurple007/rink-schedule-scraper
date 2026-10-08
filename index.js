import { readFileSync } from "node:fs";

import { DEFAULT_SCHEDULE_URL, scrapeSchedule } from "./lib/acuity.js";
import { toCsv } from "./lib/output.js";

const INTERFACE_HTML = readFileSync(new URL("./ui/index.html", import.meta.url), "utf8");

export async function scrapeRinkSchedule(request, response) {
  if (request.method === "OPTIONS") {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "GET");
    response.set("Access-Control-Allow-Headers", "Content-Type");
    response.status(204).send("");
    return;
  }
  if (request.method !== "GET") {
    response.set("Allow", "GET");
    response.status(405).json({ error: "Use GET" });
    return;
  }

  try {
    const format = parseFormat(request.query?.format, request.headers?.accept);
    if (format === "html") {
      response.set("Content-Type", "text/html; charset=utf-8");
      response.set("Cache-Control", "public, max-age=300");
      response.status(200).send(INTERFACE_HTML);
      return;
    }
    const days = parseDays(request.query?.days);
    const result = await scrapeSchedule({
      scheduleUrl: process.env.SCHEDULE_URL || DEFAULT_SCHEDULE_URL,
      days,
    });
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Cache-Control", "public, max-age=300");
    if (format === "csv") {
      response.set("Content-Type", "text/csv; charset=utf-8");
      response.set(
        "Content-Disposition",
        `attachment; filename="rink-schedule-${result.range.startDate}-${result.range.endDate}.csv"`,
      );
      response.status(200).send(toCsv(result.events));
      return;
    }
    response.status(200).json(result);
  } catch (error) {
    console.error("Schedule scrape failed", error);
    const clientError = error instanceof RangeError || error instanceof TypeError;
    response.status(clientError ? 400 : 502).json({
      error: error instanceof Error ? error.message : "Schedule scrape failed",
    });
  }
}

function parseDays(raw) {
  if (raw === undefined || raw === "") return 60;
  if (Array.isArray(raw) || !/^\d+$/.test(String(raw))) {
    throw new RangeError("days must be a whole number between 1 and 90");
  }
  const days = Number(raw);
  if (days < 1 || days > 90) {
    throw new RangeError("days must be a whole number between 1 and 90");
  }
  return days;
}

function parseFormat(raw, accept = "") {
  if (raw === undefined || raw === "") {
    return String(accept).includes("text/html") ? "html" : "json";
  }
  if (raw !== "json" && raw !== "csv" && raw !== "html") {
    throw new RangeError("format must be json, csv, or html");
  }
  return raw;
}
