const https = require("node:https");
const fs = require("node:fs/promises");
const path = require("node:path");

const PAGE_URL = "https://books.toscrape.com/catalogue/page-1.html";
const CACHE_PATH = path.join(__dirname, "..", "cache", "catalogue-page-1.html");
const REQUEST_TIMEOUT_MS = 5000;
const USER_AGENT =
  "PoliteScraper/1.0 (sakshiijangid-sys; https://github.com/sakshiijangid-sys/PoliteScraper)";

function fetchPage() {
  return new Promise((resolve, reject) => {
    const request = https.get(
      PAGE_URL,
      { headers: { "User-Agent": USER_AGENT } },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Fetch failed with HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Fetch timed out after ${REQUEST_TIMEOUT_MS} ms`));
    });
    request.on("error", reject);
  });
}

async function loadCataloguePage() {
  try {
    const cachedPage = await fs.readFile(CACHE_PATH);
    console.log(`CACHE HIT: ${cachedPage.length} bytes`);
    return cachedPage;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const page = await fetchPage();
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, page);
  console.log(`FETCH: ${page.length} bytes`);
  return page;
}

loadCataloguePage().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
