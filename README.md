# PoliteScraper

Polite scraping pipeline that turns HTML into JSON records while keeping the learning scope small and deliberate.

A small learning scraper for the Books section of the ToScrape Web Scraping Sandbox.

The requested `toscreape.com` address did not resolve. The related working site, `toscrape.com`, describes itself as a “Web Scraping Sandbox” and says its Books target is a fictional bookstore that wants to be scraped. It lists 1,000 items, pagination, up to 20 items per page, and no JavaScript requirement.

## Target classification

- **Which site:** `https://books.toscrape.com/`, the fictional bookstore in the ToScrape sandbox.
- **Why:** It is explicitly provided as a safe place for beginners to learn scraping and validate scraping tools.
- **How much:** Three catalogue pages, requested one at a time with a one-second delay between pages.
- **What data is collected:** Book title, price, availability, star-rating label, and product URL.
- **Why this is appropriate:** The site explicitly invites scraping for learning and testing, and this project keeps the request volume small and deliberate.

## Robots result

I requested `https://books.toscrape.com/robots.txt` once. The server returned **HTTP 404 Not Found** with an nginx 1.21.6 error page, so no robots directives were available: **no robots file found**.

I will not reuse this code on another site without checking its rules and terms first.

## Cached page fetch

`src/index.js` requests only `catalogue/page-1.html` when the local cache is missing. It identifies itself with a descriptive User-Agent, times out after five seconds, accepts only HTTP 200, and saves the response to `cache/catalogue-page-1.html`. Later runs read that saved copy and report `CACHE HIT` without contacting the site or printing the HTML. The cache is ignored by Git.

## Catalogue discovery

The stage 2 script parses each saved HTML page with Cheerio, follows the catalogue's own relative `next` link for exactly three pages, and resolves every book link with JavaScript `new URL(href, pageUrl)`. Duplicate absolute URLs are removed before the summary is printed. Cached pages require no delay; real requests are separated by at least 500 milliseconds.

## Detail extraction

The stage 3 script fetches and caches each of the 60 product pages with the same identifying User-Agent, five-second timeout, HTTP 200 check, and 500-millisecond minimum delay for real requests. It parses the product area only and prints one raw record containing `title`, `product_url`, `price_text`, `availability_text`, `rating_text`, `description`, `source_page`, and `fetched_at`. Missing descriptions are stored as `null`; detail caches are reused on later runs.

## Normalized records

Stage 4 keeps `price_text` and adds the numeric `ptice_gbp` value. The finished record is defined by `bookRecordSchema` in `src/schema.js` and validated with Zod before storage:

```text
title: string, required
product_url: URL string, required and canonical record identity
price_text: non-empty string, required
ptice_gbp: non-negative number, required
availability_text: non-empty string, required
rating_text: string or null, required
description: non-empty string, null, or omitted, optional
source_page: URL string, required
fetched_at: ISO datetime string, required
```

Valid records overwrite `output/books.json`; failed records are written with their validation reason to `output/errors.json` and never enter `books.json`. Repeated runs keep one record per absolute `product_url`.

## Run

Requires Node.js 18 or newer and the dependencies in `package.json`.

```bash
node src/index.js
```
