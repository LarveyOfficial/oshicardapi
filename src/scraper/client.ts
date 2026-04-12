const DELAY_MS = 500;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithDelay(url: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(DELAY_MS * Math.pow(2, attempt));
    } else {
      await sleep(DELAY_MS);
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": "OshiCardAPI/1.0 (card-database-bot)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`Failed to fetch ${url}: ${res.status} after ${MAX_RETRIES} retries`);
      }
      continue;
    }

    if (res.status === 404) {
      return ""; // Return empty string — caller decides how to handle
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`);
    }

    return res.text();
  }

  throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES} retries`);
}
