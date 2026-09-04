const BASE_URL = "https://books.toscrape.com/catalogue";
const PAGE_COUNT = 3;
const PAGE_DELAY_MS = 1000;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function decodeHtml(value) {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseBooks(html) {
  const books = [];
  const bookPattern = /<article class="product_pod">([\s\S]*?)<\/article>/g;
  let match;

  while ((match = bookPattern.exec(html)) !== null) {
    const bookHtml = match[1];
    const title = decodeHtml(
      bookHtml.match(/<h3>[\s\S]*?<a[^>]*title="([^"]+)"/)?.[1] ?? ""
    );
    const price = bookHtml.match(/<p class="price_color">([^<]+)</)?.[1]?.trim() ?? "";
    const availability =
      bookHtml.match(/<p class="instock availability">\s*([\s\S]*?)\s*<\/p>/)?.[1]
        ?.replace(/<[^>]+>/g, "")
        .trim() ?? "";
    const rating = bookHtml.match(/<p class="star-rating ([^"]+)">/)?.[1] ?? "";
    const relativeUrl = bookHtml.match(/<h3>[\s\S]*?<a href="([^"]+)"/)?.[1] ?? "";

    books.push({
      title,
      price,
      availability,
      rating,
      url: new URL(relativeUrl, `${BASE_URL}/`).href,
    });
  }

  return books;
}

async function scrapePages() {
  const books = [];

  for (let page = 1; page <= PAGE_COUNT; page += 1) {
    const response = await fetch(`${BASE_URL}/page-${page}.html`, {
      headers: { "User-Agent": "PoliteScraper/1.0 (learning project)" },
    });

    if (!response.ok) {
      throw new Error(`Page ${page} returned HTTP ${response.status}`);
    }

    books.push(...parseBooks(await response.text()));

    if (page < PAGE_COUNT) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return books;
}

scrapePages()
  .then((books) => console.log(JSON.stringify(books, null, 2)))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
