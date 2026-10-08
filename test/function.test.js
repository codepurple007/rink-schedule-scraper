import assert from "node:assert/strict";
import test from "node:test";

import { scrapeRinkSchedule } from "../index.js";

test("serves the schedule interface to a browser without scraping first", async () => {
  const response = fakeResponse();
  await scrapeRinkSchedule(
    {
      method: "GET",
      query: {},
      headers: { accept: "text/html,application/xhtml+xml" },
    },
    response,
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(response.body, /Your next time on the ice/);
  assert.match(response.body, /Export CSV/);
});

test("format=html serves the interface explicitly", async () => {
  const response = fakeResponse();
  await scrapeRinkSchedule(
    { method: "GET", query: { format: "html" }, headers: {} },
    response,
  );
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Live rink availability/);
});

function fakeResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
