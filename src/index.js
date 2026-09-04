const https = require("node:https");
const fs = require("node:fs/promises");
const path = require("node:path");
const cheerio = require("cheerio");

const PAGE_URL = "https://books.toscrape.com/catalogue/page-1.html";
const CACHE_DIRECTORY = path.join(__dirname, "..", "cache");
const REQUEST_TIMEOUT_MS = 5000;
const REQUEST_DELAY_MS = 500;
const USER_AGENT =
  "PoliteScraper/1.0 (sakshiijangid-sys; https://github.com/sakshiijangid-sys/PoliteScraper)";

function fetchPage(pageUrl) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      pageUrl,
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

function cachePathFor(pageUrl) {
  const pageName = new URL(pageUrl).pathname.split("/").pop();
  return path.join(CACHE_DIRECTORY, `catalogue-${pageName}`);
}

async function loadCataloguePage(pageUrl) {
  const cachePath = cachePathFor(pageUrl);

  try {
    const cachedPage = await fs.readFile(cachePath);
    console.log(`CACHE HIT: ${cachedPage.length} bytes`);
    return { html: cachedPage.toString("utf8"), fromCache: true };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const page = await fetchPage(pageUrl);
  await fs.mkdir(CACHE_DIRECTORY, { recursive: true });
  await fs.writeFile(cachePath, page);
  console.log(`FETCH: ${page.length} bytes`);
  return { html: page.toString("utf8"), fromCache: false };
}

async function isCached(pageUrl) {
  try {
    await fs.access(cachePathFor(pageUrl));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function discoverPage(html, pageUrl) {
  const document = cheerio.load(html);
  const bookUrls = document("article.product_pod h3 a[href]")
    .map((_, link) => new URL(document(link).attr("href"), pageUrl).href)
    .get();
  const nextHref = document("li.next a[href]").attr("href");

  return { bookUrls, nextUrl: nextHref ? new URL(nextHref, pageUrl).href : null };
}

async function discoverCatalogue() {
  const uniqueUrls = new Set();
  let pageUrl = PAGE_URL;
  let cataloguePages = 0;
  let discoveredCount = 0;

  while (cataloguePages < 3 && pageUrl) {
    const page = await loadCataloguePage(pageUrl);
    const discovered = discoverPage(page.html, pageUrl);
    discoveredCount += discovered.bookUrls.length;
    discovered.bookUrls.forEach((bookUrl) => uniqueUrls.add(bookUrl));
    cataloguePages += 1;

    if (
      cataloguePages < 3 &&
      discovered.nextUrl &&
      !(await isCached(discovered.nextUrl))
    ) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }
    pageUrl = discovered.nextUrl;
  }

  console.log(`catalogue_pages=${cataloguePages}`);
  console.log(`discovered=${discoveredCount}`);
  console.log(`unique_urls=${uniqueUrls.size}`);
}

discoverCatalogue().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
