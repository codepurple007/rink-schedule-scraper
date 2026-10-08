const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchText(url, options = {}) {
  const response = await request(url, options);
  return response.text();
}

export async function fetchJson(url, options = {}) {
  const response = await request(url, options);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Expected JSON from ${publicUrl(url)}, received ${contentType || "unknown content type"}`);
  }
  return response.json();
}

async function request(url, {
  fetchImpl = globalThis.fetch,
  retries = 3,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "application/json,text/html;q=0.9,*/*;q=0.8",
          "user-agent": "rink-schedule-exporter/1.0",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      if (response.ok) {
        return response;
      }
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === retries) {
        throw new Error(`Request failed with HTTP ${response.status}: ${publicUrl(url)}`);
      }
      await sleep(retryDelay(response, attempt));
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableError(error)) {
        throw error;
      }
      await sleep(250 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error(`Request failed: ${publicUrl(url)}`);
}

function retryDelay(response, attempt) {
  const header = response.headers.get("retry-after");
  if (header && /^\d+$/.test(header)) {
    return Math.min(Number(header) * 1000, 30_000);
  }
  return 500 * 2 ** attempt;
}

function isRetryableError(error) {
  return error?.name === "AbortError" || error instanceof TypeError;
}

function publicUrl(url) {
  const parsed = new URL(url);
  parsed.search = "";
  return parsed.toString();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
