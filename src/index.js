const https = require("node:https");
const fs = require("node:fs/promises");
const path = require("node:path");
const cheerio = require("cheerio");
const { bookRecordSchema } = require("./schema");

const PAGE_URL = "https://books.toscrape.com/catalogue/page-1.html";
const CACHE_DIRECTORY = path.join(__dirname, "..", "cache");
const OUTPUT_DIRECTORY = path.join(__dirname, "..", "output");
const REQUEST_TIMEOUT_MS = 5000;
const REQUEST_DELAY_MS = 500;
const RETRY_DELAY_MS = 250;
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
          const error = new Error(`Fetch failed with HTTP ${response.statusCode}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      const error = new Error(`Fetch timed out after ${REQUEST_TIMEOUT_MS} ms`);
      error.code = "ETIMEDOUT";
      request.destroy(error);
    });
    request.on("error", reject);
  });
}

function shouldRetry(error) {
  return error.code === "ETIMEDOUT" || error.code === "ECONNRESET" ||
    (error.statusCode >= 500 && error.statusCode <= 599);
}

function cachePathFor(pageUrl) {
  const pathname = new URL(pageUrl).pathname;
  const relativePath = pathname.replace(/^\/catalogue\//, "");
  return path.join(CACHE_DIRECTORY, `catalogue-${relativePath.replace(/[^a-z0-9.-]/gi, "_")}`);
}

async function loadCataloguePage(pageUrl, report) {
  const cachePath = cachePathFor(pageUrl);

  try {
    const cachedPage = await fs.readFile(cachePath);
    const metadata = await fs.stat(cachePath);
    report.cache_hits += 1;
    return {
      html: cachedPage.toString("utf8"),
      fetchedAt: new Date(metadata.mtimeMs).toISOString(),
      fromCache: true,
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  let page;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      page = await fetchPage(pageUrl);
      break;
    } catch (error) {
      if (attempt === 0 && shouldRetry(error)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      throw error;
    }
  }
  await fs.mkdir(CACHE_DIRECTORY, { recursive: true });
  await fs.writeFile(cachePath, page);
  report.pages_fetched += 1;
  const metadata = await fs.stat(cachePath);
  return {
    html: page.toString("utf8"),
    fetchedAt: new Date(metadata.mtimeMs).toISOString(),
    fromCache: false,
  };
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

function extractBookDetails(html, productUrl, sourcePage, fetchedAt) {
  const document = cheerio.load(html);
  const productArea = document(".product_page .product_main");
  const description = productArea.closest(".product_page").find("#product_description").next("p").text().trim();

  return {
    title: productArea.find("h1").first().text().trim(),
    product_url: productUrl,
    price_text: productArea.find(".price_color").first().text().trim(),
    ptice_gbp: Number.parseFloat(
      productArea.find(".price_color").first().text().replace(/[^0-9.]/g, "")
    ),
    availability_text: productArea.find(".availability").first().text().replace(/\s+/g, " ").trim(),
    rating_text: productArea.find(".star-rating").first().attr("class")?.replace("star-rating", "").trim() ?? null,
    description: description || null,
    source_page: sourcePage,
    fetched_at: fetchedAt,
  };
}

async function writeValidatedRecords(records) {
  const books = [];
  const errors = [];
  const seenUrls = new Set();

  for (const record of records) {
    if (seenUrls.has(record.product_url)) {
      continue;
    }
    seenUrls.add(record.product_url);

    const result = bookRecordSchema.safeParse(record);
    if (result.success) {
      books.push(result.data);
    } else {
      errors.push({
        product_url: record.product_url,
        reason: result.error.issues.map((issue) => issue.message).join("; "),
        record,
      });
    }
  }

  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIRECTORY, "books.json"), `${JSON.stringify(books, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIRECTORY, "errors.json"), `${JSON.stringify(errors, null, 2)}\n`);
  return { books, errors };
}

async function discoverCatalogue() {
  const startedAt = Date.now();
  const report = {
    started_at: new Date(startedAt).toISOString(),
    duration_ms: 0,
    pages_fetched: 0,
    cache_hits: 0,
    valid_records: 0,
    invalid_records: 0,
    failed_pages: 0,
    failed_page_details: [],
  };
  const uniqueUrls = new Set();
  const sourcePages = new Map();
  let pageUrl = PAGE_URL;
  let cataloguePages = 0;
  let discoveredCount = 0;

  while (cataloguePages < 3 && pageUrl) {
    let page;
    try {
      page = await loadCataloguePage(pageUrl, report);
    } catch (error) {
      report.failed_pages += 1;
      report.failed_page_details.push({ page_url: pageUrl, reason: error.message });
      break;
    }
    const discovered = discoverPage(page.html, pageUrl);
    discoveredCount += discovered.bookUrls.length;
    discovered.bookUrls.forEach((bookUrl) => {
      uniqueUrls.add(bookUrl);
      sourcePages.set(bookUrl, pageUrl);
    });
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

  if (process.env.INJECT_FAKE_URL === "1") {
    uniqueUrls.add("https://invalid.example.invalid/made-up-book.html");
    sourcePages.set("https://invalid.example.invalid/made-up-book.html", PAGE_URL);
  }

  const records = [];
  let hadNetworkDetailRequest = false;
  for (const productUrl of uniqueUrls) {
    const cached = await isCached(productUrl);
    if (hadNetworkDetailRequest && !cached) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    let page;
    try {
      page = await loadCataloguePage(productUrl, report);
      records.push(
        extractBookDetails(
          page.html,
          productUrl,
          sourcePages.get(productUrl),
          page.fetchedAt
        )
      );
    } catch (error) {
      report.failed_pages += 1;
      report.failed_page_details.push({ page_url: productUrl, reason: error.message });
    }
    if (page) {
      hadNetworkDetailRequest = hadNetworkDetailRequest || !page.fromCache;
    }
  }

  const { books, errors } = await writeValidatedRecords(records);
  report.valid_records = books.length;
  report.invalid_records = errors.length;
  report.duration_ms = Date.now() - startedAt;
  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIRECTORY, "run-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(books[0] ?? records[0], null, 2));
  console.log(`catalogue_pages=${cataloguePages}`);
  console.log(`discovered=${discoveredCount}`);
  console.log(`unique_urls=${uniqueUrls.size}`);
  console.log(`detail_pages=${records.length}`);
  console.log(`valid_records=${books.length}`);
  console.log(`invalid_records=${errors.length}`);
}

discoverCatalogue().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
