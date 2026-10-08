const port = process.env.CDP_PORT || "9224";
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === "page" && item.url.includes("127.0.0.1:8091"));
if (!target) throw new Error("Schedule preview browser target was not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const waiting = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !waiting.has(message.id)) return;
  const { resolve, reject } = waiting.get(message.id);
  waiting.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}

async function evaluate(expression, awaitPromise = false) {
  const response = await command("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || "Browser evaluation failed");
  }
  return response.result.value;
}

await evaluate(`new Promise((resolve, reject) => {
  const started = Date.now();
  const timer = setInterval(() => {
    if (document.querySelectorAll(".event").length) {
      clearInterval(timer);
      resolve(true);
    } else if (Date.now() - started > 10000) {
      clearInterval(timer);
      reject(new Error("events did not render"));
    }
  }, 100);
})`, true);

const result = await evaluate(`(() => {
  const initial = document.querySelectorAll(".event").length;
  document.querySelector('[data-filter="open"]').click();
  const available = document.querySelectorAll(".event").length;
  const search = document.querySelector("#search");
  search.value = "no-such-session";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  const emptyState = document.querySelector(".state")?.textContent.includes("No sessions match");
  search.value = "";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('[data-filter="all"]').click();
  document.querySelector(".event").click();
  const dialogOpened = document.querySelector("#details").open;
  const bookingLink = document.querySelector("#book-link").href;
  document.querySelector("#close-dialog").click();
  return {
    initial,
    available,
    emptyState,
    dialogOpened,
    dialogClosed: !document.querySelector("#details").open,
    bookingLink,
    csvLink: document.querySelector("#download").href
  };
})()`);

socket.close();
console.log(JSON.stringify(result, null, 2));
if (
  result.initial !== 8 ||
  result.available !== 7 ||
  !result.emptyState ||
  !result.dialogOpened ||
  !result.dialogClosed ||
  !result.bookingLink.includes("acuityscheduling.com") ||
  !result.csvLink.includes("format=csv")
) {
  process.exitCode = 1;
}
