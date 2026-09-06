const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { getReportData } = require("./report");
const { buildReportHtml } = require("./html-report");

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage();
  const html = buildReportHtml(getReportData());
  await page.setContent(html, { waitUntil: "load" });
  const reportsDirectory = path.join(__dirname, "..", "reports");
  fs.mkdirSync(reportsDirectory, { recursive: true });
  await page.pdf({
    path: path.join(reportsDirectory, "test.pdf"),
    format: "A4",
    printBackground: true,
  });
  await browser.close();
  console.log("Created reports/test.pdf");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});