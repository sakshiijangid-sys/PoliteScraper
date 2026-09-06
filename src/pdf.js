const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { buildReportHtml } = require("./html-report");
const { getReportData } = require("./report");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function renderReportPdf(outputPath) {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    const page = await browser.newPage();
    await page.setContent(buildReportHtml(getReportData()), { waitUntil: "load" });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await page.pdf({ path: outputPath, format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}

module.exports = { renderReportPdf };