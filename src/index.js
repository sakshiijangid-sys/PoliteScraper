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
  const pathname = new URL(pageUrl).pathname;
  const relativePath = pathname.replace(/^\/catalogue\//, "");
  return path.join(CACHE_DIRECTORY, `catalogue-${relativePath.replace(/[^a-z0-9.-]/gi, "_")}`);
}

async function loadCataloguePage(pageUrl) {
  const cachePath = cachePathFor(pageUrl);

  try {
    const cachedPage = await fs.readFile(cachePath);
    const metadata = await fs.stat(cachePath);
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

  const page = await fetchPage(pageUrl);
  await fs.mkdir(CACHE_DIRECTORY, { recursive: true });
  await fs.writeFile(cachePath, page);
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
    availability_text: productArea.find(".availability").first().text().replace(/\s+/g, " ").trim(),
    rating_text: productArea.find(".star-rating").first().attr("class")?.replace("star-rating", "").trim() ?? null,
    description: description || null,
    source_page: sourcePage,
    fetched_at: fetchedAt,
  };
}

async function discoverCatalogue() {
  const uniqueUrls = new Set();
  const sourcePages = new Map();
  let pageUrl = PAGE_URL;
  let cataloguePages = 0;
  let discoveredCount = 0;

  while (cataloguePages < 3 && pageUrl) {
    const page = await loadCataloguePage(pageUrl);
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

  const records = [];
  let hadNetworkDetailRequest = false;
  for (const productUrl of uniqueUrls) {
    const cached = await isCached(productUrl);
    if (hadNetworkDetailRequest && !cached) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    const page = await loadCataloguePage(productUrl);
    records.push(
      extractBookDetails(
        page.html,
        productUrl,
        sourcePages.get(productUrl),
        page.fetchedAt
      )
    );
    hadNetworkDetailRequest = hadNetworkDetailRequest || !page.fromCache;
  }

  console.log(JSON.stringify(records[0], null, 2));
  console.log(`catalogue_pages=${cataloguePages}`);
  console.log(`discovered=${discoveredCount}`);
  console.log(`unique_urls=${uniqueUrls.size}`);
  console.log(`detail_pages=${records.length}`);
}

discoverCatalogue().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
